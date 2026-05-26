// Vercel serverless function — fetches live prices from Twelve Data
// Free tier: 800 calls/day, real-time prices

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60'); // cache 1 min on Vercel edge

  const API_KEY = process.env.TWELVE_DATA_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: 'TWELVE_DATA_KEY not configured' });
    return;
  }

  // Twelve Data symbol format: SYMBOL/CURRENCY:EXCHANGE
  // Xetra ETFs need the EUR suffix and XETRA exchange
  const symbols = [
    'SPYI/EUR:XETRA',   // iShares MSCI ACWI IMI
    'EMIM/EUR:XETR',    // iShares MSCI EM IMI (Euronext Amsterdam)
    'VWCG/EUR:XETRA',   // Vanguard FTSE Developed Europe
    '31IG/EUR:XETRA',   // iBond 2031
    '32XG/EUR:XETRA',   // iBond 2032
    '33GI/EUR:XETRA',   // iBond 2033
    '34GI/EUR:XETRA',   // iBond 2034
    '35AI/EUR:XETRA',   // iBond 2035
    'MAR:NASDAQ',       // Marriott
    'EUR/USD:Forex',    // EUR/USD
    'EUR/SGD:Forex',    // EUR/SGD
  ];

  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Twelve Data returned ${response.status}`);
    const data = await response.json();

    // Helper to extract price, handling both single and batch responses
    const get = (key) => {
      const entry = data[key];
      if (!entry || entry.status === 'error') return null;
      const p = parseFloat(entry.price);
      return isNaN(p) ? null : p;
    };

    const prices = {
      ibkr_spyi:  get('SPYI/EUR:XETRA'),
      ibkr_emim:  get('EMIM/EUR:XETR'),
      ibkr_vwcg:  get('VWCG/EUR:XETRA'),
      bond_31ig:  get('31IG/EUR:XETRA'),
      bond_32xg:  get('32XG/EUR:XETRA'),
      bond_33gi:  get('33GI/EUR:XETRA'),
      bond_34gi:  get('34GI/EUR:XETRA'),
      bond_35ai:  get('35AI/EUR:XETRA'),
      rsu_mar:    get('MAR:NASDAQ'),
      k401_nav:   null,  // Fidelity — manual only
      srs_nav:    null,  // PIMCO SGD — manual only
      jtc_nav:    null,  // PIMCO EUR — manual only
    };

    const fx = {
      USD: get('EUR/USD:Forex'),
      SGD: get('EUR/SGD:Forex'),
    };

    // Count how many prices we actually got
    const fetched = Object.values(prices).filter(v => v !== null).length
      + Object.values(fx).filter(v => v !== null).length;

    res.status(200).json({
      prices,
      fx,
      timestamp: new Date().toISOString(),
      source: 'twelvedata',
      fetched,
      raw: data, // include raw for debugging
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
