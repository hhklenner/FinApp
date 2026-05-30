// Vercel serverless function — proxies image to Anthropic API for price extraction
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }

  const { base64, mediaType } = req.body;
  if (!base64) { res.status(400).json({ error: 'Missing base64 image data' }); return; }

  const prompt = `This is a screenshot from a financial app (IBKR, Fidelity, or Endowus).
Extract ALL prices, share/unit counts, and FX rates visible. Return ONLY valid JSON, no markdown.

Return this exact structure (use null for fields not visible):
{
  "prices": {
    "ibkr_spyi": null, "ibkr_emim": null, "ibkr_vwcg": null,
    "bond_31ig": null, "bond_32xg": null, "bond_33gi": null, "bond_34gi": null, "bond_35ai": null,
    "rsu_mar": null, "k401_nav": null, "srs_nav": null, "jtc_nav": null
  },
  "shares": {
    "k401": null, "ibkr_spyi": null, "ibkr_emim": null, "ibkr_vwcg": null,
    "bond_31ig": null, "bond_32xg": null, "bond_33gi": null, "bond_34gi": null, "bond_35ai": null,
    "rsu_mar": null, "srs_pimco": null, "jtc_pimco": null
  },
  "fx": { "USD": null, "SGD": null },
  "notes": "brief description of what was found"
}

Instrument hints:
- SPYI = iShares MSCI ACWI IMI on Xetra (EUR)
- EMIM = iShares MSCI EM IMI on Euronext (EUR)
- VWCG = Vanguard FTSE Developed Europe (EUR)
- 31IG/32XG/33GI/34GI/35AI = iBonds on Xetra (EUR, price ~5)
- MAR = Marriott International (USD)
- k401_nav = MRS iShares World Eq Indx Fd USD Cl8 NAV per unit (USD)
- srs_nav = PIMCO GIS Income Fund SGD-Hedged NAV per unit (SGD)
- jtc_nav = PIMCO GIS Global Bond Inst Hdg Acc EUR NAV per unit (EUR)
- fx.USD = USD per 1 EUR (e.g. 1.16), fx.SGD = SGD per 1 EUR (e.g. 1.48)`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic ${response.status}: ${err.slice(0, 100)}`);
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
