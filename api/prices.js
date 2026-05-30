// Vercel serverless function — fetches live prices from Twelve Data
// Free tier: 8 calls/min, 800 calls/day
// Module-level cache prevents hammering the API on rapid reloads

let cache = null;
let cacheTime = 0;
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  // Return cached result if fresh
  if (cache && Date.now() - cacheTime < CACHE_MS) {
    res.status(200).json({ ...cache, cached: true });
    return;
  }

  const API_KEY = process.env.TWELVE_DATA_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: 'TWELVE_DATA_KEY not configured' });
    return;
  }

  // Fetch in two batches to stay well under rate limits
  // Batch 1: ETFs (6 symbols)
  // Batch 2: iBonds + MAR + FX (6 symbols)
  const batch1 = ['SPYI:XETR','EMIM:AMS','VWCG:XETR','MAR:NASDAQ','EUR/USD:Forex','EUR/SGD:Forex'];
  const batch2 = ['31IG:XETR','32XG:XETR','33GI:XETR','34GI:XETR','35AI:XETR'];

  const fetchBatch = async (symbols) => {
    const url = `https://api.twelvedata.com/price?symbol=${symbols.join(',')}&apikey=${API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Twelve Data HTTP ${r.status}`);
    return r.json();
  };

  try {
    // Fetch both batches
    const [d1, d2] = await Promise.all([fetchBatch(batch1), fetchBatch(batch2)]);
    const data = { ...d1, ...d2 };

    const get = (key) => {
      const entry = data[key];
      if (!entry || entry.status === 'error' || entry.code) return null;
      const p = parseFloat(entry.price);
      return isNaN(p) ? null : p;
    };

    const prices = {
      ibkr_spyi:  get('SPYI:XETR'),
      ibkr_emim:  get('EMIM:AMS'),
      ibkr_vwcg:  get('VWCG:XETR'),
      bond_31ig:  get('31IG:XETR'),
      bond_32xg:  get('32XG:XETR'),
      bond_33gi:  get('33GI:XETR'),
      bond_34gi:  get('34GI:XETR'),
      bond_35ai:  get('35AI:XETR'),
      rsu_mar:    get('MAR:NASDAQ'),
      k401_nav:   null,
      srs_nav:    null,
      jtc_nav:    null,
    };

    const fx = {
      USD: get('EUR/USD:Forex'),
      SGD: get('EUR/SGD:Forex'),
    };

    const fetched = [...Object.values(prices), ...Object.values(fx)].filter(v => v !== null).length;
    const result = { prices, fx, timestamp: new Date().toISOString(), source: 'twelvedata', fetched };

    // Cache the result
    cache = result;
    cacheTime = Date.now();

    res.status(200).json(result);

  } catch (err) {
    // On error, return cache if available, otherwise error
    if (cache) {
      res.status(200).json({ ...cache, cached: true, warning: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
}
