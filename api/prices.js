// Vercel serverless function — proxies Yahoo Finance to avoid CORS
// Called by the app on load: GET /api/prices

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 mins on Vercel edge

  const tickers = [
    'SPYI.DE',   // SPYI Xetra
    'EMIM.AS',   // EMIM Euronext Amsterdam
    'VWCG.DE',   // VWCG Xetra
    '31IG.DE',   // iBond 2031
    '32XG.DE',   // iBond 2032
    '33GI.DE',   // iBond 2033
    '34GI.DE',   // iBond 2034
    '35AI.DE',   // iBond 2035
    'MAR',       // Marriott NASDAQ
    'EURUSD=X',  // EUR/USD
    'EURSGD=X',  // EUR/SGD
  ];

  const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${tickers.join(',')}&range=1d&interval=1d`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    });

    if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
    const data = await response.json();

    const spark = data?.spark?.result || [];
    const out = {};

    for (const item of spark) {
      const symbol = item.symbol;
      const closes = item.response?.[0]?.meta?.regularMarketPrice
        ?? item.response?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean)?.slice(-1)?.[0];
      if (closes != null) out[symbol] = closes;
    }

    // Map Yahoo symbols to our internal keys
    const prices = {
      ibkr_spyi:  out['SPYI.DE'],
      ibkr_emim:  out['EMIM.AS'],
      ibkr_vwcg:  out['VWCG.DE'],
      bond_31ig:  out['31IG.DE'],
      bond_32xg:  out['32XG.DE'],
      bond_33gi:  out['33GI.DE'],
      bond_34gi:  out['34GI.DE'],
      bond_35ai:  out['35AI.DE'],
      rsu_mar:    out['MAR'],
      k401_nav:   null,  // Fidelity — manual only
      srs_nav:    null,  // PIMCO SGD — manual only
      jtc_nav:    null,  // PIMCO EUR — manual only
    };

    const fx = {
      USD: out['EURUSD=X'] || null,
      SGD: out['EURSGD=X'] || null,
    };

    res.status(200).json({
      prices,
      fx,
      timestamp: new Date().toISOString(),
      source: 'yahoo',
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
