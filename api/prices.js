// Vercel serverless function — fetches live prices from Twelve Data
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const API_KEY = process.env.TWELVE_DATA_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: 'TWELVE_DATA_KEY not configured' });
    return;
  }

  // Twelve Data format: SYMBOL:EXCHANGE
  // Xetra exchange code is XETR, Euronext Amsterdam is AMS
  const symbols = [
    'SPYI:XETR',    // iShares MSCI ACWI IMI — Xetra
    'EMIM:AMS',     // iShares MSCI EM IMI — Euronext Amsterdam
    'VWCG:XETR',    // Vanguard FTSE Developed Europe — Xetra
    '31IG:XETR',    // iBond 2031 — Xetra
    '32XG:XETR',    // iBond 2032 — Xetra
    '33GI:XETR',    // iBond 2033 — Xetra
    '34GI:XETR',    // iBond 2034 — Xetra
    '35AI:XETR',    // iBond 2035 — Xetra
    'MAR:NASDAQ',   // Marriott
    'EUR/USD:Forex',
    'EUR/SGD:Forex',
  ];

  const url = `https://api.twelvedata.com/price?symbol=${symbols.join(',')}&apikey=${API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
    const data = await response.json();

    // data is a flat object keyed by symbol when multiple symbols are requested
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

    // If nothing came back, expose raw data for debugging
    if (fetched === 0) {
      res.status(200).json({ error: 'No prices returned', raw: data });
      return;
    }

    res.status(200).json({ prices, fx, timestamp: new Date().toISOString(), source: 'twelvedata', fetched });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
