import { useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "./storage.js";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area } from "recharts";

// ─── FX (updated via API too) ─────────────────────────────────────────────────
const FX_DEFAULTS = { USD: 1/1.1615, SGD: 1/1.4840, EUR: 1.0 }; // EUR/USD 1.1615, EUR/SGD 1.4840 as of 22 May 2026
// Bump this when data model changes to bust stale storage
const STORAGE_VERSION = "v6";
const fmt  = (n) => "€" + Math.round(n).toLocaleString();
const fmtM = (n) => "€" + (Math.round(n) / 1e6).toFixed(2) + "M";

// ─── Instruments with live prices ────────────────────────────────────────────
const LIVE_INSTRUMENTS = [
  { id: "k401",       ticker: "MNBO",  exchange: "Fidelity", ccy: "USD", shares: 156572.48, label: "401(k) MRS" },
  { id: "ibkr_spyi",  ticker: "SPYI",  exchange: "XETRA",   ccy: "EUR", shares: 52500,      label: "SPYI" },
  { id: "ibkr_emim",  ticker: "EMIM",  exchange: "AEB",   ccy: "EUR", shares: 2800,   label: "EMIM" },
  { id: "ibkr_vwcg",  ticker: "VWCG",  exchange: "XETRA", ccy: "EUR", shares: 1320,   label: "VWCG" },
  { id: "bond_31ig",  ticker: "31IG",  exchange: "XETRA", ccy: "EUR", shares: 3000,   label: "31IG" },
  { id: "bond_32xg",  ticker: "32XG",  exchange: "XETRA", ccy: "EUR", shares: 3000,   label: "32XG" },
  { id: "bond_33gi",  ticker: "33GI",  exchange: "XETRA", ccy: "EUR", shares: 3600,   label: "33GI" },
  { id: "bond_34gi",  ticker: "34GI",  exchange: "XETRA", ccy: "EUR", shares: 4000,   label: "34GI" },
  { id: "bond_35ai",  ticker: "35AI",  exchange: "XETRA", ccy: "EUR", shares: 4000,   label: "35AI" },
  { id: "rsu_mar",    ticker: "MAR",   exchange: "NASDAQ",ccy: "USD", shares: 235,    label: "MAR" },
  { id: "srs_pimco",  ticker: "PIMCO GIS SGD-Hedged", exchange: "NAV (daily)", ccy: "SGD", shares: 0, label: "PIMCO GIS SGD-Hdg" },
  { id: "jtc_pimco",  ticker: "PIMCO GIS Global Bond EUR Inst", exchange: "NAV (daily)", ccy: "EUR", shares: 2947.292, label: "PIMCO GIS EUR Inst" },
];

// ─── Manual-only instruments ──────────────────────────────────────────────────
const MANUAL_DEFAULTS = {
  k401:       { native: 1121215.54, ccy: "USD" },
  ibkr_spyi:  { native: 570400,  ccy: "EUR" },
  ibkr_emim:  { native: 130900,  ccy: "EUR" },
  ibkr_vwcg:  { native: 74677,   ccy: "EUR" },
  ibkr_bonds: { native: 87594,   ccy: "EUR" },
  srs:        { native: 194961,  ccy: "SGD" }, // 16,246.763 units × S$12.00 — May 21 2026
  pension:    { native: 82524,   ccy: "EUR" }, // 857.513 + 2089.779 units × €28.00 — May 22 2026
  ssb:        { native: 74000,   ccy: "SGD" },
  land:       { native: 200000,  ccy: "EUR" },
  rsu:        { native: 82732,   ccy: "USD" },
};

const SRS_UNITS_DEFAULT = 16246.763;

// ─── Account display definitions ─────────────────────────────────────────────
const ACCOUNT_DEFS = [
  { id: "k401",      label: "401(k) / Fidelity",       ccy: "USD", type: "equity",      color: "#378ADD", contribCcy: "USD", liveId: null,
    geo: { "North America": 65, "Europe": 15, "Japan": 10, "Asia Pacific": 7, "Other": 3 },
    sector: { "Technology": 22, "Financials": 15, "Healthcare": 13, "Consumer Disc.": 11, "Industrials": 10, "Energy": 5, "Other": 24 },
    notes: "iShares World Equity Index USD Cl8 (MNBO) · 156,572.48 units @ $7.1610 · May 21 2026 · live price", contribNote: "Fixed — USD/mth" },
  { id: "ibkr_spyi", label: "IBKR — SPYI",             ccy: "EUR", type: "equity",      color: "#1D9E75", contribCcy: "EUR", liveId: "ibkr_spyi",
    geo: { "North America": 64, "Europe": 16, "Japan": 6, "Asia Pacific ex-Japan": 5, "Emerging Markets": 9 },
    sector: { "Technology": 24, "Financials": 16, "Healthcare": 11, "Consumer Disc.": 11, "Industrials": 10, "Energy": 4, "Other": 24 },
    notes: "iShares MSCI ACWI IMI UCITS ETF · 52,500 shares · live price", contribNote: "EUR/mth" },
  { id: "ibkr_emim", label: "IBKR — EMIM",             ccy: "EUR", type: "equity",      color: "#7F77DD", contribCcy: "EUR", liveId: "ibkr_emim",
    geo: { "China / Taiwan": 38, "India": 18, "South Korea": 12, "Brazil": 6, "Other EM": 26 },
    sector: { "Technology": 23, "Financials": 22, "Consumer Disc.": 14, "Energy": 9, "Materials": 8, "Other": 24 },
    notes: "iShares MSCI EM IMI · 2,800 shares · live price", contribNote: "EUR/mth" },
  { id: "ibkr_vwcg", label: "IBKR — VWCG",             ccy: "EUR", type: "equity",      color: "#5DCAA5", contribCcy: "EUR", liveId: "ibkr_vwcg",
    geo: { "UK": 22, "France": 15, "Switzerland": 14, "Germany": 13, "Netherlands": 7, "Other Europe": 29 },
    sector: { "Financials": 18, "Healthcare": 16, "Industrials": 15, "Consumer Staples": 12, "Technology": 8, "Energy": 7, "Other": 24 },
    notes: "Vanguard FTSE Developed Europe UCITS ETF · EUR Acc · 1,320 shares · pure European developed equity · live price", contribNote: "EUR/mth" },
  { id: "ibkr_bonds", label: "IBKR — iBonds (ladder)", ccy: "EUR", type: "bonds",       color: "#D85A30", contribCcy: "EUR", liveId: "ibkr_bonds_total",
    geo: { "Europe": 85, "North America": 10, "Other": 5 },
    sector: { "Government / IG Corp": 100 },
    notes: "31IG(3k) · 32XG(3k) · 33GI(3.6k) · 34GI(4k) · 35AI(4k) · live prices", contribNote: "Bond ladder — EUR/mth" },
  { id: "srs",       label: "SRS / Endowus",           ccy: "SGD", type: "bonds",       color: "#BA7517", contribCcy: "SGD", liveId: "srs_pimco",
    geo: { "Global (hedged SGD)": 100 },
    sector: { "Investment Grade": 55, "High Yield": 25, "EM Debt": 20 },
    notes: "PIMCO GIS Income Fund SGD-Hedged (IE00BMB3HX34) · 16,246.763 units @ S$12.00 · May 21 2026 · live NAV", contribNote: "SGD/mth (max SGD 35,700/yr)" },
  { id: "pension",   label: "JTC pension",              ccy: "EUR", type: "bonds",       color: "#B5D4F4", contribCcy: "EUR", liveId: null,
    geo: { "Global (hedged EUR)": 100 },
    sector: { "Investment Grade": 100 },
    notes: "PIMCO GIS Global Bond Inst Hdg Acc EUR · 857.513 + 2089.779 units = 2,947.292 total @ €28.00 · May 22 2026 · live NAV", contribNote: "No contributions" },
  { id: "ssb",       label: "Cash — SSBs",             ccy: "SGD", type: "cash",        color: "#B4B2A9", contribCcy: "SGD", liveId: null,
    geo: { "Singapore": 100 }, sector: { "Government": 100 },
    notes: "Singapore Savings Bonds · ~3% p.a. · manual update", contribNote: "SGD/mth" },
  { id: "rsu",       label: "RSU — Marriott (MAR)",    ccy: "USD", type: "equity",      color: "#AFA9EC", contribCcy: "USD", liveId: "rsu_mar",
    geo: { "North America": 100 }, sector: { "Consumer Disc. / Hospitality": 100 },
    notes: "235 unvested shares · live MAR price · excluded from projection (not guaranteed; treated as income on vest/sale)", contribNote: "No contributions — vesting is income not portfolio" },
  { id: "land",      label: "Land — Austria",          ccy: "EUR", type: "real_estate", color: "#FAC775", contribCcy: "EUR", liveId: null,
    geo: { "Austria": 100 }, sector: { "Real Estate": 100 },
    notes: "Housing-zoned land at cost · illiquid", illiquid: true, contribNote: "No contributions" },
];

const DEFAULT_SHARES = Object.fromEntries(LIVE_INSTRUMENTS.map(i => [i.id, i.shares]));
DEFAULT_SHARES["srs_pimco"] = SRS_UNITS_DEFAULT;
const DEFAULT_CONTRIBS = {
  k401: 4300, ibkr_spyi: 0, ibkr_emim: 0, ibkr_vwcg: 0,
  ibkr_bonds: 4000, srs: Math.round(35700 / 12), pension: 0,
  ssb: 0, land: 0,
};

const ASSET_META = [
  { key: "equity",      label: "Equity",       color: "#378ADD" },
  { key: "bonds",       label: "Fixed income", color: "#1D9E75" },
  { key: "cash",        label: "Cash / SSBs",  color: "#D3D1C7" },
  { key: "real_estate", label: "Real estate",  color: "#FAC775" },
];
const GEO_COLORS    = ["#378ADD","#1D9E75","#7F77DD","#D85A30","#BA7517","#5DCAA5","#AFA9EC","#F0997B","#9FE1CB","#FAC775"];
const SECTOR_COLORS = ["#378ADD","#1D9E75","#7F77DD","#D85A30","#BA7517","#5DCAA5","#AFA9EC","#FAC775","#B5D4F4","#D3D1C7"];
const CCY_COLORS    = { USD: "#378ADD", EUR: "#1D9E75", SGD: "#FAC775" };

// ─── Fallback prices (used when live fetch unavailable) ──────────────────────
// Last updated: 26 May 2026
const FALLBACK_PRICES = {
  prices: {
    ibkr_spyi:  11.01,
    ibkr_emim:  47.04,
    ibkr_vwcg:  58.32,
    bond_31ig:  5.0276,
    bond_32xg:  4.9947,
    bond_33gi:  4.9675,
    bond_34gi:  4.9601,
    bond_35ai:  4.9567,
    rsu_mar:    369.92,
    k401_nav:   7.1610,
    srs_nav:    12.00,
    jtc_nav:    28.00,
  },
  fx: { USD: 1.1640, SGD: 1.4870 },
  timestamp: "2026-05-26T09:00:00.000Z",
};

// ─── Live price fetcher — Vercel serverless → Twelve Data (real-time) ─────────
async function fetchLivePrices() {
  const resp = await fetch('/api/prices');
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const live = await resp.json();
  if (live.error) throw new Error(live.error);
  // Merge: live prices override fallback; nulls (k401, srs, jtc) keep fallback
  const merged = { ...FALLBACK_PRICES.prices };
  for (const [k, v] of Object.entries(live.prices || {})) {
    if (v != null) merged[k] = v;
  }
  return {
    prices: merged,
    fx: {
      USD: live.fx?.USD ?? FALLBACK_PRICES.fx.USD,
      SGD: live.fx?.SGD ?? FALLBACK_PRICES.fx.SGD,
    },
    timestamp: live.timestamp || new Date().toISOString(),
  };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      {label && <div style={{ fontWeight: 500, marginBottom: 5, color: "var(--color-text-primary)" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill, flexShrink: 0 }} />
          <span>{p.name}:</span>
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
            {typeof p.value === "number" ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const ProjTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const rows = [
    { label: "401(k)",       val: p.k401,      color: "#378ADD" },
    { label: "IBKR equity",  val: p.ibkr_eq,   color: "#1D9E75" },
    { label: "IBKR bonds",   val: p.ibkr_bond, color: "#D85A30" },
    { label: "SRS",          val: p.srs,        color: "#BA7517" },
    { label: "JTC pension",  val: p.pension,    color: "#7EB8E8" },
    { label: "SSBs",         val: p.ssb,        color: "#B4B2A9" },
  ];
  return (
    <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)",
        borderRadius:10, padding:"12px 14px", fontSize:12, minWidth:200 }}>
      <div style={{ fontWeight:600, marginBottom:8, color:"var(--color-text-primary)" }}>{p.label}</div>
      {rows.map((r,i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            gap:16, marginBottom:4, color:"var(--color-text-secondary)" }}>
          <span style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:2, background:r.color, flexShrink:0 }}/>
            {r.label}
          </span>
          <span style={{ fontWeight:500, color:"var(--color-text-primary)" }}>{fmt(r.val)}</span>
        </div>
      ))}
      <div style={{ borderTop:"0.5px solid var(--color-border-tertiary)", marginTop:8, paddingTop:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:13 }}>
          <span style={{ color:"var(--color-text-primary)" }}>Total</span>
          <span style={{ color:"var(--color-text-primary)" }}>{fmtM(p.total)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginTop:4 }}>
          <span style={{ color:"var(--color-text-tertiary)" }}>SWR @ 3.3%</span>
          <span style={{ color:"var(--color-text-success)", fontWeight:500 }}>{fmt(p.total*0.033)}/yr</span>
        </div>
      </div>
    </div>
  );
};

const Card = ({ children, style }) => (
  <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 12, padding: "1rem 1.25rem", ...style }}>{children}</div>
);
const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{children}</div>
    {sub && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{sub}</div>}
  </div>
);
const Pill = ({ label, value, sub, color }) => (
  <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "11px 13px" }}>
    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.1, color: color || "var(--color-text-primary)" }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>{sub}</div>}
  </div>
);
const HBar = ({ label, pct, val, color, max = 100 }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{fmt(val)} <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>({pct}%)</span></span>
    </div>
    <div style={{ height: 6, background: "var(--color-background-secondary)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct / max * 100)}%`, background: color, borderRadius: 3, transition: "width .4s" }} />
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const [tab, setTab]           = useState("overview");
  const [projView, setProjView] = useState("stacked");
  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);

  const [prices, setPrices]       = useState({});
  const [fx, setFx]               = useState(FX_DEFAULTS);
  const [priceStatus, setPriceStatus] = useState("idle");
  const [priceTime, setPriceTime] = useState(null);
  const [priceError, setPriceError] = useState(null);

  const [shareCount, setShareCount] = useState(DEFAULT_SHARES);
  const [manualVals, setManualVals] = useState(
    Object.fromEntries(Object.entries(MANUAL_DEFAULTS).map(([id, d]) => [id, d.native]))
  );
  const [contribs, setContribs]     = useState(DEFAULT_CONTRIBS);

  const [contribDraft, setContribDraft]   = useState({});
  const [snapshots, setSnapshots]         = useState([]);
  const [snapNote, setSnapNote]           = useState("");
  const [perfView, setPerfView]           = useState("total");
  const [editingContrib, setEditingContrib] = useState(null);
  const [manualDraft, setManualDraft]     = useState({});
  const [editingManual, setEditingManual] = useState(null);
  const [sharesDraft, setSharesDraft]     = useState({});
  const [editingShares, setEditingShares] = useState(null);

  // iBonds ladder shares + prices loaded from bond ladder tracker storage
  const BL_SEED_SHARES = { "31IG": 3000, "32XG": 3000, "33GI": 3600, "34GI": 4000, "35AI": 4000 };
  const BL_SEED_PRICES = { "31IG": 5.0276, "32XG": 4.9947, "33GI": 4.9675, "34GI": 4.9601, "35AI": 4.9567 };
  const BL_RUNGS = [
    { id: "31IG", maturityYear: 2031 },
    { id: "32XG", maturityYear: 2032 },
    { id: "33GI", maturityYear: 2033 },
    { id: "34GI", maturityYear: 2034 },
    { id: "35AI", maturityYear: 2035 },
  ];
  const [blShares, setBlShares] = useState(BL_SEED_SHARES);
  const [blPrices, setBlPrices] = useState(BL_SEED_PRICES);

  // ── Storage — uses localStorage directly for reliability ─────────────────
  useEffect(() => {
    function lsGet(key) {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function lsSet(key, val) {
      try { localStorage.setItem(key, val); } catch (_) {}
    }

    // Version check
    const ver = lsGet("pf2_version");
    if (ver !== STORAGE_VERSION) {
      localStorage.removeItem("pf2_shares");
      localStorage.removeItem("pf2_manual");
      localStorage.removeItem("pf2_contribs");
      lsSet("pf2_version", STORAGE_VERSION);
    } else {
      try { const v = lsGet("pf2_shares");    if (v) setShareCount(JSON.parse(v)); } catch (_) {}
      try { const v = lsGet("pf2_manual");    if (v) setManualVals(JSON.parse(v)); } catch (_) {}
      try { const v = lsGet("pf2_contribs");  if (v) setContribs(JSON.parse(v));   } catch (_) {}
      try { const v = lsGet("pf2_snapshots"); if (v) setSnapshots(JSON.parse(v));  } catch (_) {}
      try { const v = lsGet("bl_shares");     if (v) setBlShares({...BL_SEED_SHARES, ...JSON.parse(v)}); } catch (_) {}
      try { const v = lsGet("bl_prices");     if (v) setBlPrices({...BL_SEED_PRICES, ...JSON.parse(v)}); } catch (_) {}
    }
    setLoading(false);
  }, []);

  async function persistAll(sc, mv, co) {
    setSaving(true);
    try { localStorage.setItem("pf2_shares",   JSON.stringify(sc)); } catch (_) {}
    try { localStorage.setItem("pf2_manual",   JSON.stringify(mv)); } catch (_) {}
    try { localStorage.setItem("pf2_contribs", JSON.stringify(co)); } catch (_) {}
    setSaving(false);
  }

  // ── Live price fetch ───────────────────────────────────────────────────────
  const refreshPrices = useCallback(async () => {
    setPriceStatus("fetching");
    setPriceError(null);
    try {
      const result = await fetchLivePrices();
      setPrices(result.prices || {});
      if (result.fx) {
        setFx({
          USD: result.fx.USD ? 1 / result.fx.USD : FX_DEFAULTS.USD,
          SGD: result.fx.SGD ? 1 / result.fx.SGD : FX_DEFAULTS.SGD,
          EUR: 1,
        });
      }
      setPriceTime(result.timestamp || new Date().toISOString());
      setPriceStatus("ok");
      // Note: prices are not cached to storage — they come from LATEST_PRICES constant
    } catch (e) {
      setPriceStatus("error");
      setPriceError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!loading && priceStatus === "idle") refreshPrices();
  }, [loading]);

  // ── Compute EUR values from shares × price ────────────────────────────────
  const liveValues = useMemo(() => {
    const out = {};
    for (const inst of LIVE_INSTRUMENTS) {
      const priceKey = inst.id === "k401"      ? "k401_nav"
        : inst.id === "srs_pimco" ? "srs_nav"
        : inst.id === "jtc_pimco" ? "jtc_nav"
        : inst.id;
      const price = prices[priceKey];
      const sh    = shareCount[inst.id] || 0;
      if (price && sh) {
        const native = sh * price;
        const fxRate = inst.ccy === "EUR" ? 1 : (fx[inst.ccy] || FX_DEFAULTS[inst.ccy]);
        out[inst.id] = { native, eur: Math.round(native * fxRate), price, shares: sh, ccy: inst.ccy };
      }
    }
    return out;
  }, [prices, shareCount, fx]);

  const bondTotal = useMemo(() => {
    const ids = ["bond_31ig","bond_32xg","bond_33gi","bond_34gi","bond_35ai"];
    return ids.reduce((s, id) => s + (liveValues[id]?.eur || 0), 0);
  }, [liveValues]);

  function getEurVal(def) {
    // k401: use live units × price when available
    if (def.id === "k401") {
      if (liveValues["k401"]?.eur > 0) return liveValues["k401"].eur;
    }
    if (def.id === "pension") {
      if (liveValues["jtc_pimco"]?.eur > 0) return liveValues["jtc_pimco"].eur;
    }
    if (def.id === "ibkr_bonds") {
      return bondTotal > 0 ? bondTotal : (manualVals["ibkr_bonds"] || 87594);
    }
    if (def.liveId || def.id === "rsu" || def.id === "srs") {
      const liveKey = def.id === "rsu" ? "rsu_mar" : def.id === "srs" ? "srs_pimco" : def.liveId;
      if (liveValues[liveKey]?.eur > 0) return liveValues[liveKey].eur;
    }
    const mv = manualVals[def.id];
    if (mv !== undefined) return Math.round(mv * (fx[def.ccy] || FX_DEFAULTS[def.ccy] || 1));
    return 0;
  }

  const toEUR = (val, ccy) => Math.round(val * (fx[ccy] || FX_DEFAULTS[ccy] || 1));

  const accounts = useMemo(() => ACCOUNT_DEFS.map(def => {
    const eurVal = getEurVal(def);
    const isLive = def.liveId !== null || def.id === "rsu" || def.id === "k401" || def.id === "pension";
    return {
      ...def,
      eurVal,
      isLive,
      monthlyContrib: contribs[def.id] || 0,
      contribEUR: toEUR(contribs[def.id] || 0, def.contribCcy),
    };
  }), [liveValues, manualVals, contribs, fx, bondTotal]);

  const totalEUR        = useMemo(() => accounts.reduce((s, a) => s + a.eurVal, 0), [accounts]);
  const liquidEUR       = useMemo(() => accounts.filter(a => !a.illiquid).reduce((s, a) => s + a.eurVal, 0), [accounts]);
  const totalContribEUR = useMemo(() => accounts.reduce((s, a) => s + a.contribEUR, 0), [accounts]);
  const sumType = (type) => accounts.filter(a => a.type === type).reduce((s, a) => s + a.eurVal, 0);

  const assetData = useMemo(() => ASSET_META.map(m => {
    const val = sumType(m.key);
    return { ...m, value: val, pct: Math.round(val / totalEUR * 100) };
  }), [accounts]);

  const geoData = useMemo(() => {
    const map = {};
    accounts.filter(a => a.type === "equity" || a.type === "bonds").forEach(a => {
      Object.entries(a.geo).forEach(([r, p]) => { map[r] = (map[r] || 0) + a.eurVal * p / 100; });
    });
    const tot = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).map(([region, val]) => ({
      region, val: Math.round(val), pct: Math.round(val / tot * 100),
    })).sort((a, b) => b.val - a.val);
  }, [accounts]);

  const sectorData = useMemo(() => {
    const map = {};
    accounts.filter(a => a.type === "equity").forEach(a => {
      Object.entries(a.sector).forEach(([s, p]) => { map[s] = (map[s] || 0) + a.eurVal * p / 100; });
    });
    const tot = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).map(([sector, val]) => ({
      sector, val: Math.round(val), pct: Math.round(val / tot * 100),
    })).sort((a, b) => b.val - a.val);
  }, [accounts]);

  const ccyData = useMemo(() => {
    const map = {};
    accounts.forEach(a => { map[a.ccy] = (map[a.ccy] || 0) + a.eurVal; });
    return Object.entries(map).map(([ccy, val]) => ({
      ccy, val, pct: Math.round(val / totalEUR * 100),
    })).sort((a, b) => b.val - a.val);
  }, [accounts]);

  // ── Projection ─────────────────────────────────────────────────────────────
  // Equity: 3% real growth. SRS/pension: 1.5% real.
  // iBonds: accretion model — shares × price moving linearly to €5 par by maturity.
  //         New monthly budget buys additional shares at interpolated price each year.
  // RSU excluded — unvested, not guaranteed; treat as income when they vest/sell.
  const projection = useMemo(() => {
    const years = [2025,2026,2027,2028,2029,2030,2031,2032];
    const EQ_R=0.03, FI_R=0.015;
    const PAR = 5.0; // iBonds mature at €5 face value
    const BASE_YEAR = 2025;

    const getVal = (id) => accounts.find(a=>a.id===id)?.eurVal || 0;

    let a_k401      = getVal("k401");
    let a_ibkr_eq   = getVal("ibkr_spyi") + getVal("ibkr_emim") + getVal("ibkr_vwcg");
    let a_srs       = getVal("srs");
    let a_pension   = getVal("pension");
    const a_ssb     = getVal("ssb"); // flat buffer

    // iBonds: per-rung share counts (mutable as we add new shares)
    const rungShares = {};
    BL_RUNGS.forEach(r => { rungShares[r.id] = blShares[r.id] || BL_SEED_SHARES[r.id] || 0; });

    // Helper: interpolated price for a rung at a given year (linear accretion to par)
    function rungPrice(rung, atYear) {
      const currentPrice = blPrices[rung.id] || BL_SEED_PRICES[rung.id] || PAR;
      if (atYear >= rung.maturityYear) return PAR;
      const yearsLeft = rung.maturityYear - BASE_YEAR;
      const elapsed   = atYear - BASE_YEAR;
      if (yearsLeft <= 0) return PAR;
      return currentPrice + (PAR - currentPrice) * (elapsed / yearsLeft);
    }

    function ibondTotal(atYear) {
      return BL_RUNGS.reduce((s, r) => s + rungShares[r.id] * rungPrice(r, atYear), 0);
    }

    const k401Ann   = toEUR(contribs.k401||0,"USD")*12;
    const ibkrEqAnn = (toEUR(contribs.ibkr_spyi||0,"EUR") + toEUR(contribs.ibkr_emim||0,"EUR") + toEUR(contribs.ibkr_vwcg||0,"EUR"))*12;
    const bondBudget = (contribs.ibkr_bonds||0); // EUR/month — buys shares at current price
    const srsAnn    = toEUR(contribs.srs||0,"SGD")*12;

    return years.map((y,i) => {
      const ibkr_bond = Math.round(ibondTotal(y));

      const snap = {
        year:y,
        label: y===2025 ? "Dec 2025" : y===2032 ? "Apr 2032" : `Dec ${y}`,
        k401:      Math.round(a_k401),
        ibkr_eq:   Math.round(a_ibkr_eq),
        ibkr_bond,
        ibkr:      Math.round(a_ibkr_eq + ibkr_bond),
        srs:       Math.round(a_srs),
        pension:   Math.round(a_pension),
        ssb:       Math.round(a_ssb),
        equity:    Math.round(a_k401 + a_ibkr_eq),
        bonds:     Math.round(ibkr_bond + a_srs + a_pension),
        cash:      Math.round(a_ssb),
        total:     Math.round(a_k401 + a_ibkr_eq + ibkr_bond + a_srs + a_pension + a_ssb),
      };

      if (i < years.length - 1) {
        const nextY = years[i+1];
        const frac  = nextY===2032 ? 4/12 : 1;
        a_k401    = a_k401   * (1 + EQ_R*frac) + k401Ann*frac;
        a_ibkr_eq = a_ibkr_eq* (1 + EQ_R*frac) + ibkrEqAnn*frac;
        a_srs     = a_srs    * (1 + FI_R*frac) + (nextY<=2030 ? srsAnn*frac : 0);
        a_pension = a_pension * (1 + FI_R*frac);
        // iBonds: buy additional shares with monthly budget at next-year interpolated price
        BL_RUNGS.forEach(r => {
          if (nextY <= r.maturityYear) {
            const buyPrice = rungPrice(r, nextY);
            if (buyPrice > 0) {
              // allocate bond budget proportionally to underfunded rungs, or evenly
              const newShares = Math.floor((bondBudget * 12 * frac) / (BL_RUNGS.filter(rr=>nextY<=rr.maturityYear).length * buyPrice));
              rungShares[r.id] += newShares;
            }
          }
        });
      }
      return snap;
    });
  }, [accounts, contribs, fx, blShares, blPrices]);

  // ── Performance chart data ─────────────────────────────────────────────────
  const perfChartData = useMemo(() => {
    if (snapshots.length < 2) return [];
    const sorted = [...snapshots].sort((a,b) => new Date(a.date)-new Date(b.date));
    const first = sorted[0];
    const firstLiquid = first.liquid;
    return sorted.map(s => {
      const monthsIn = Math.round((new Date(s.date)-new Date(first.date))/(1000*60*60*24*30.44));
      const conservative = Math.round(firstLiquid * Math.pow(1.03, monthsIn/12));
      const msci         = Math.round(firstLiquid * Math.pow(1.09, monthsIn/12));
      return {
        label: new Date(s.date).toLocaleDateString("en-GB",{month:"short",year:"2-digit"}),
        actual: s.liquid,
        total: s.total,
        conservative,
        msci,
      };
    });
  }, [snapshots]);

  // ── Save helpers ───────────────────────────────────────────────────────────
  function saveContrib(id) {
    const n = parseFloat(contribDraft[id]);
    if (isNaN(n) || n < 0) return;
    const next = { ...contribs, [id]: n };
    setContribs(next); persistAll(shareCount, manualVals, next);
    setEditingContrib(null); setContribDraft({});
  }
  function saveManual(id) {
    const n = parseFloat(manualDraft[id]);
    if (isNaN(n) || n < 0) return;
    const next = { ...manualVals, [id]: n };
    setManualVals(next); persistAll(shareCount, next, contribs);
    setEditingManual(null); setManualDraft({});
  }
  function saveShares(id) {
    const n = parseFloat(sharesDraft[id]);
    if (isNaN(n) || n < 0) return;
    const next = { ...shareCount, [id]: n };
    setShareCount(next); persistAll(next, manualVals, contribs);
    setEditingShares(null); setSharesDraft({});
  }
  function saveSnapshot() {
    const snap = {
      date: new Date().toISOString(),
      total: totalEUR,
      liquid: liquidEUR,
      note: snapNote,
      breakdown: {
        equity: sumType("equity"),
        bonds:  sumType("bonds"),
        cash:   sumType("cash"),
      }
    };
    const next = [...snapshots, snap];
    setSnapshots(next);
    setSnapNote("");
    try { localStorage.setItem("pf2_snapshots", JSON.stringify(next)); } catch(_) {}
  }
  function deleteSnapshot(idx) {
    const next = snapshots.filter((_,i) => i !== idx);
    setSnapshots(next);
    try { localStorage.setItem("pf2_snapshots", JSON.stringify(next)); } catch(_) {}
  }

  const tabStyle = (id) => ({
    fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
    border: tab===id ? "none" : "0.5px solid var(--color-border-secondary)",
    background: tab===id ? "var(--color-background-info)" : "transparent",
    color: tab===id ? "var(--color-text-info)" : "var(--color-text-secondary)",
    fontWeight: tab===id ? 500 : 400,
  });

  if (loading) return <div style={{padding:"2rem",fontSize:14,color:"var(--color-text-secondary)"}}>Loading…</div>;

  const priceAge = priceTime ? Math.round((Date.now() - new Date(priceTime).getTime()) / 60000) : null;

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "1rem 0", maxWidth: 700 }}>

      {/* ── HEADER ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:500, color:"var(--color-text-primary)", letterSpacing:"-.01em" }}>Portfolio</div>
          <div style={{ fontSize:11, color:"var(--color-text-tertiary)", marginTop:2 }}>Heinz Klenner · retirement Apr 2032</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:22, fontWeight:500, color:"var(--color-text-primary)" }}>{fmtM(totalEUR)}</div>
          <div style={{ fontSize:11, color:"var(--color-text-tertiary)" }}>{fmtM(liquidEUR)} liquid</div>
          {saving && <div style={{ fontSize:10, color:"var(--color-text-tertiary)" }}>saving…</div>}
        </div>
      </div>

      {/* ── PRICE STATUS BAR ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, padding:"8px 12px",
          borderRadius:8, background:"var(--color-background-secondary)",
          border:"0.5px solid var(--color-border-tertiary)" }}>
        <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
          background: priceStatus==="ok" ? "#1D9E75" : priceStatus==="fetching" ? "#BA7517" : priceStatus==="error" ? "#D85A30" : "#888" }} />
        <div style={{ flex:1, fontSize:11, color:"var(--color-text-secondary)" }}>
          {priceStatus==="fetching" && "Fetching live prices from Twelve Data…"}
          {priceStatus==="ok"       && `Live · ${priceTime ? new Date(priceTime).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) + " " + new Date(priceTime).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : ""} · 1 EUR = ${(1/fx.USD).toFixed(4)} USD = ${(1/fx.SGD).toFixed(4)} SGD`}
          {priceStatus==="error"    && `Fallback prices shown · live fetch failed (${priceError})`}
          {priceStatus==="idle"     && "Prices not yet loaded"}
        </div>
        <button onClick={refreshPrices} disabled={priceStatus==="fetching"}
          style={{ fontSize:11, padding:"4px 10px", cursor:"pointer", borderRadius:6,
            border:"0.5px solid var(--color-border-secondary)", background:"transparent",
            color:"var(--color-text-secondary)", opacity: priceStatus==="fetching" ? 0.5 : 1 }}>
          {priceStatus==="fetching" ? "…" : "Apply prices ↻"}
        </button>
      </div>

      {/* ── METRIC STRIP ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(115px,1fr))", gap:8, marginBottom:14 }}>
        <Pill label="Equity"       value={fmt(sumType("equity"))} sub={`${Math.round(sumType("equity")/liquidEUR*100)}% liquid`} color="#378ADD" />
        <Pill label="Fixed income" value={fmt(sumType("bonds"))}  sub={`${Math.round(sumType("bonds")/liquidEUR*100)}% liquid`}  color="#1D9E75" />
        <Pill label="Cash"         value={fmt(sumType("cash"))}   sub={`${Math.round(sumType("cash")/liquidEUR*100)}% liquid`}   color="#888780" />
        <Pill label="Monthly in"   value={fmt(totalContribEUR)}   sub="EUR equiv."  color="var(--color-text-success)" />
        <Pill label="SWR @ 3.3%"   value={fmt(liquidEUR*0.033)}  sub="EUR/year now" />
      </div>

      {/* ── TABS ── */}
      <div style={{ display:"flex", gap:4, marginBottom:14, flexWrap:"wrap" }}>
        {[["overview","Overview"],["contributions","Contributions"],["prices","Live prices"],["geography","Geography"],["sectors","Sectors"],["projection","Projection"],["performance","Performance"]].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={tabStyle(id)}>{label}</button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {tab==="overview" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <Card>
              <SectionTitle>Asset class</SectionTitle>
              <div style={{ height:150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assetData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={2}>
                      {assetData.map((e,i)=><Cell key={i} fill={e.color} stroke="none"/>)}
                    </Pie>
                    <Tooltip content={<ChartTip/>}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {assetData.map((d,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:9,height:9,borderRadius:2,background:d.color }}/>
                    <span style={{ color:"var(--color-text-secondary)" }}>{d.label}</span>
                  </span>
                  <span style={{ fontWeight:500 }}>{d.pct}% · {fmt(d.value)}</span>
                </div>
              ))}
            </Card>
            <Card>
              <SectionTitle>Currency exposure</SectionTitle>
              <div style={{ height:150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ccyData} dataKey="val" cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={2}>
                      {ccyData.map((c,i)=><Cell key={i} fill={CCY_COLORS[c.ccy]||"#888"} stroke="none"/>)}
                    </Pie>
                    <Tooltip content={<ChartTip/>}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {ccyData.map((c,i)=>(
                <div key={i} style={{ marginBottom:7 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                    <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:9,height:9,borderRadius:2,background:CCY_COLORS[c.ccy]||"#888" }}/>
                      <span style={{ fontWeight:500 }}>{c.ccy}</span>
                    </span>
                    <span style={{ color:"var(--color-text-secondary)" }}>{c.pct}% · {fmt(c.val)}</span>
                  </div>
                  <div style={{ height:4,background:"var(--color-background-secondary)",borderRadius:2,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${c.pct}%`,background:CCY_COLORS[c.ccy]||"#888",borderRadius:2 }}/>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          <Card>
            <SectionTitle sub="click to inspect geo + sector">All accounts</SectionTitle>
            {accounts.map(a => {
              const pct = Math.round(a.eurVal/totalEUR*100);
              const isActive = activeId===a.id;
              return (
                <div key={a.id}>
                  <div onClick={()=>setActiveId(isActive?null:a.id)}
                    style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                      padding:"7px 10px", borderRadius:8, cursor:"pointer", marginBottom:2,
                      border: isActive ? `1.5px solid ${a.color}` : "0.5px solid transparent",
                      background: isActive ? "var(--color-background-secondary)" : "transparent" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <span style={{ width:9,height:9,borderRadius:2,background:a.color,flexShrink:0 }}/>
                      <span style={{ fontSize:12, fontWeight: isActive?500:400 }}>{a.label}</span>
                      {a.illiquid  && <span style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>illiquid</span>}
                      {a.isLive    && <span style={{ fontSize:10,padding:"1px 5px",borderRadius:20,background:"var(--color-background-success)",color:"var(--color-text-success)" }}>live</span>}
                      {a.contribEUR>0 && <span style={{ fontSize:10,padding:"1px 5px",borderRadius:20,background:"var(--color-background-info)",color:"var(--color-text-info)" }}>+{fmt(a.contribEUR)}/mth</span>}
                    </span>
                    <span style={{ fontSize:12,fontWeight:500 }}>{fmt(a.eurVal)} <span style={{ color:"var(--color-text-tertiary)",fontWeight:400 }}>{pct}%</span></span>
                  </div>
                  <div style={{ height:3,marginBottom:3,background:"var(--color-background-secondary)",borderRadius:2,overflow:"hidden",marginLeft:10,marginRight:10 }}>
                    <div style={{ height:"100%",width:`${pct*2}%`,background:a.color,borderRadius:2 }}/>
                  </div>
                  {isActive && (
                    <div style={{ margin:"4px 4px 8px",padding:"12px",borderRadius:8,
                        background:"var(--color-background-secondary)",border:`0.5px solid ${a.color}44` }}>
                      <div style={{ fontSize:11,color:"var(--color-text-tertiary)",marginBottom:10 }}>{a.notes}</div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                        <div>
                          <div style={{ fontSize:10,fontWeight:500,textTransform:"uppercase",letterSpacing:".05em",color:"var(--color-text-tertiary)",marginBottom:5 }}>Geography</div>
                          {Object.entries(a.geo).map(([r,p],i)=>(
                            <HBar key={i} label={r} pct={p} val={a.eurVal*p/100} color={GEO_COLORS[i%GEO_COLORS.length]} max={Math.max(...Object.values(a.geo))}/>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontSize:10,fontWeight:500,textTransform:"uppercase",letterSpacing:".05em",color:"var(--color-text-tertiary)",marginBottom:5 }}>Sector</div>
                          {Object.entries(a.sector).map(([s,p],i)=>(
                            <HBar key={i} label={s} pct={p} val={a.eurVal*p/100} color={SECTOR_COLORS[i%SECTOR_COLORS.length]} max={Math.max(...Object.values(a.sector))}/>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* ══ LIVE PRICES ══ */}
      {tab==="prices" && (
        <div>
          <Card style={{ marginBottom:12 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
              <SectionTitle sub="auto-fetched from Yahoo Finance on load · PIMCO NAVs updated manually · click Refresh to update now">Instrument prices</SectionTitle>
              <button onClick={refreshPrices} disabled={priceStatus==="fetching"}
                style={{ fontSize:12,padding:"6px 14px",cursor:"pointer",fontWeight:500,borderRadius:8,
                  border:"0.5px solid var(--color-border-secondary)",background:"transparent",
                  color: priceStatus==="fetching" ? "var(--color-text-tertiary)" : "var(--color-text-primary)" }}>
                {priceStatus==="fetching" ? "Fetching…" : "Refresh prices ↻"}
              </button>
            </div>
            <table style={{ width:"100%",fontSize:12,borderCollapse:"collapse" }}>
              <thead>
                <tr>{["Instrument","Exchange","Shares","Last price","Market value","Status"].map(h=>(
                  <th key={h} style={{ fontSize:10,fontWeight:500,color:"var(--color-text-tertiary)",textAlign:"left",
                      paddingBottom:6,borderBottom:"0.5px solid var(--color-border-tertiary)",
                      textTransform:"uppercase",letterSpacing:".04em" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {LIVE_INSTRUMENTS.map(inst => {
                  const lv   = liveValues[inst.id];
                  const sh   = shareCount[inst.id] || 0;
                  const isEd = editingShares===inst.id;
                  return (
                    <tr key={inst.id}>
                      <td style={{ padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontWeight:500 }}>
                        {inst.label}
                        <div style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>{inst.exchange} · {inst.ccy}</div>
                      </td>
                      <td style={{ padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",color:"var(--color-text-secondary)",fontSize:11 }}>{inst.exchange}</td>
                      <td style={{ padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                        {isEd ? (
                          <div style={{ display:"flex",gap:4 }}>
                            <input type="number" value={sharesDraft[inst.id]??""} onChange={e=>setSharesDraft(p=>({...p,[inst.id]:e.target.value}))}
                              onKeyDown={e=>{if(e.key==="Enter")saveShares(inst.id);if(e.key==="Escape"){setEditingShares(null);setSharesDraft({});}}}
                              style={{ width:80,fontSize:12,padding:"3px 6px" }} autoFocus/>
                            <button onClick={()=>saveShares(inst.id)} style={{ fontSize:11,padding:"3px 8px",cursor:"pointer" }}>✓</button>
                          </div>
                        ) : (
                          <span onClick={()=>{setEditingShares(inst.id);setSharesDraft({[inst.id]:sh});}} style={{ cursor:"pointer",borderBottom:"1px dashed var(--color-border-secondary)" }}>
                            {sh.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td style={{ padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                        {lv ? <span style={{ fontWeight:500 }}>{inst.ccy==="EUR"?"€":inst.ccy==="USD"?"$":"S$"}{lv.price.toFixed(4)}</span>
                             : <span style={{ color:"var(--color-text-tertiary)",fontSize:11 }}>—</span>}
                      </td>
                      <td style={{ padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontWeight:500 }}>
                        {lv ? fmt(lv.eur) : <span style={{ color:"var(--color-text-tertiary)" }}>—</span>}
                      </td>
                      <td style={{ padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                        <span style={{ fontSize:10,padding:"2px 7px",borderRadius:20,
                          background: lv?"var(--color-background-success)":"var(--color-background-secondary)",
                          color: lv?"var(--color-text-success)":"var(--color-text-tertiary)" }}>
                          {lv?"live":"pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize:11,color:"var(--color-text-tertiary)",marginTop:8 }}>
              ETF prices auto-fetch from Yahoo Finance on load. PIMCO NAVs (SRS, JTC) are manual — update from Endowus/JTC statement.
            </div>
          </Card>

          <Card>
            <SectionTitle sub="update manually from Fidelity / Endowus screens">Manual positions</SectionTitle>
            {Object.entries(MANUAL_DEFAULTS).map(([id, def]) => {
              const acc  = ACCOUNT_DEFS.find(a=>a.id===id);
              const curr = manualVals[id] || 0;
              const isEd = editingManual===id;
              return (
                <div key={id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,
                    marginBottom:4,border:"0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ width:9,height:9,borderRadius:2,background:acc?.color||"#888",flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12,fontWeight:500 }}>{acc?.label||id}</div>
                    <div style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>{acc?.notes}</div>
                  </div>
                  {isEd ? (
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <input type="number" value={manualDraft[id]??""} onChange={e=>setManualDraft(p=>({...p,[id]:e.target.value}))}
                        onKeyDown={e=>{if(e.key==="Enter")saveManual(id);if(e.key==="Escape"){setEditingManual(null);setManualDraft({});}}}
                        style={{ width:110,fontSize:12,padding:"4px 8px" }} autoFocus/>
                      <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>{def.ccy}</span>
                      <button onClick={()=>saveManual(id)} style={{ fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:500 }}>Save</button>
                      <button onClick={()=>{setEditingManual(null);setManualDraft({});}} style={{ fontSize:11,padding:"4px 8px",cursor:"pointer",color:"var(--color-text-secondary)" }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:13,fontWeight:500 }}>{curr.toLocaleString()} {def.ccy}</div>
                        <div style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>{fmt(toEUR(curr,def.ccy))}</div>
                      </div>
                      <button onClick={()=>{setEditingManual(id);setManualDraft({[id]:curr});}}
                        style={{ fontSize:11,padding:"4px 10px",cursor:"pointer",borderRadius:6,
                          border:"0.5px solid var(--color-border-secondary)",background:"transparent",color:"var(--color-text-secondary)" }}>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* ══ CONTRIBUTIONS ══ */}
      {tab==="contributions" && (
        <div>
          <Card style={{ marginBottom:12 }}>
            <SectionTitle sub="edit any field — projection updates instantly">Monthly contributions</SectionTitle>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(115px,1fr))",gap:8,marginBottom:14 }}>
              <Pill label="Total monthly" value={fmt(totalContribEUR)} sub="EUR equiv." color="var(--color-text-success)"/>
              <Pill label="Annual pace"   value={fmt(totalContribEUR*12)} sub="EUR/year"/>
              <Pill label="Months left"   value={Math.round((2032-(new Date().getFullYear()+new Date().getMonth()/12))*12)} sub="to retirement"/>
              <Pill label="Total remaining" value={fmt(totalContribEUR*Math.round((2032-(new Date().getFullYear()+new Date().getMonth()/12))*12))} sub="projected"/>
            </div>
            {accounts.filter(a=>!a.illiquid).map(a => {
              const curr  = contribs[a.id]||0;
              const isEd  = editingContrib===a.id;
              return (
                <div key={a.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                    borderRadius:8,marginBottom:5,
                    border: isEd ? `0.5px solid ${a.color}` : "0.5px solid var(--color-border-tertiary)",
                    background: isEd ? "var(--color-background-secondary)" : "transparent" }}>
                  <span style={{ width:9,height:9,borderRadius:2,background:a.color,flexShrink:0 }}/>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{a.label}</div>
                    <div style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>{a.contribNote}</div>
                  </div>
                  {isEd ? (
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <input type="number" min="0" step="100" value={contribDraft[a.id]??""}
                        onChange={e=>setContribDraft(p=>({...p,[a.id]:e.target.value}))}
                        onKeyDown={e=>{if(e.key==="Enter")saveContrib(a.id);if(e.key==="Escape"){setEditingContrib(null);setContribDraft({});}}}
                        style={{ width:90,fontSize:12,padding:"4px 8px" }} autoFocus/>
                      <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>{a.contribCcy}/mth</span>
                      <button onClick={()=>saveContrib(a.id)} style={{ fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:500 }}>Save</button>
                      <button onClick={()=>{setEditingContrib(null);setContribDraft({});}} style={{ fontSize:11,padding:"4px 8px",cursor:"pointer",color:"var(--color-text-secondary)" }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:13,fontWeight:500,color:curr>0?"var(--color-text-success)":"var(--color-text-tertiary)" }}>
                          {curr>0?`+${curr.toLocaleString()} ${a.contribCcy}`:"—"}
                        </div>
                        {curr>0 && a.contribCcy!=="EUR" && <div style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>≈{fmt(a.contribEUR)}</div>}
                      </div>
                      <button onClick={()=>{setEditingContrib(a.id);setContribDraft({[a.id]:curr||""});}}
                        style={{ fontSize:11,padding:"4px 10px",cursor:"pointer",borderRadius:6,
                          border:"0.5px solid var(--color-border-secondary)",background:"transparent",color:"var(--color-text-secondary)" }}>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
          <Card>
            <SectionTitle sub="EUR equivalent monthly">Where the money goes</SectionTitle>
            <div style={{ height:170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accounts.filter(a=>a.contribEUR>0).map(a=>({
                    name:a.label.replace("IBKR — ","").replace(" / Fidelity","").replace(" — Marriott (MAR)",""),
                    value:a.contribEUR, color:a.color }))}
                  margin={{ left:0,right:10,top:4,bottom:40 }}>
                  <XAxis dataKey="name" tick={{ fontSize:10,fill:"var(--color-text-secondary)" }}
                    axisLine={false} tickLine={false} angle={-20} textAnchor="end" interval={0}/>
                  <YAxis hide/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="value" name="Monthly EUR" radius={[3,3,0,0]}>
                    {accounts.filter(a=>a.contribEUR>0).map((a,i)=><Cell key={i} fill={a.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* ══ GEOGRAPHY ══ */}
      {tab==="geography" && (
        <div>
          <Card style={{ marginBottom:12 }}>
            <SectionTitle sub="equity + fixed income weighted">Geographic exposure</SectionTitle>
            <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:12 }}>
              {geoData.map((g,i)=>(
                <div key={i} style={{ borderRadius:8,padding:"8px 10px",
                    background:GEO_COLORS[i%GEO_COLORS.length]+"22",
                    border:`0.5px solid ${GEO_COLORS[i%GEO_COLORS.length]}55`,
                    flex:`${g.pct} 0 ${Math.max(60,g.pct*3)}px` }}>
                  <div style={{ fontSize:11,fontWeight:500,color:GEO_COLORS[i%GEO_COLORS.length] }}>{g.region}</div>
                  <div style={{ fontSize:14,fontWeight:500,color:"var(--color-text-primary)" }}>{g.pct}%</div>
                  <div style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>{fmt(g.val)}</div>
                </div>
              ))}
            </div>
            <div style={{ height:155 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={geoData} layout="vertical" margin={{ left:0,right:10,top:0,bottom:0 }}>
                  <XAxis type="number" hide/>
                  <YAxis type="category" dataKey="region" width={140} tick={{ fontSize:11,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="val" name="Value" radius={[0,3,3,0]}>
                    {geoData.map((g,i)=><Cell key={i} fill={GEO_COLORS[i%GEO_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <SectionTitle sub="per account breakdown">Geo by account</SectionTitle>
            {accounts.filter(a=>a.type==="equity"||a.type==="bonds").map(a=>(
              <div key={a.id} style={{ marginBottom:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}>
                  <span style={{ width:9,height:9,borderRadius:2,background:a.color }}/>
                  <span style={{ fontSize:12,fontWeight:500 }}>{a.label}</span>
                  <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>{fmt(a.eurVal)}</span>
                </div>
                <div style={{ display:"flex",gap:2,height:9,borderRadius:5,overflow:"hidden" }}>
                  {Object.entries(a.geo).map(([r,p],i)=>(
                    <div key={i} title={`${r}: ${p}%`} style={{ flex:p,background:GEO_COLORS[i%GEO_COLORS.length],minWidth:p>3?2:0 }}/>
                  ))}
                </div>
                <div style={{ display:"flex",flexWrap:"wrap",gap:"2px 10px",marginTop:3 }}>
                  {Object.entries(a.geo).map(([r,p],i)=>(
                    <span key={i} style={{ fontSize:10,color:"var(--color-text-tertiary)",display:"flex",alignItems:"center",gap:3 }}>
                      <span style={{ width:6,height:6,borderRadius:1,background:GEO_COLORS[i%GEO_COLORS.length] }}/>{r} {p}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ══ SECTORS ══ */}
      {tab==="sectors" && (
        <div>
          <Card style={{ marginBottom:12 }}>
            <SectionTitle sub="equity only — 401k + SPYI + EMIM + VWCG + RSU">Sector exposure</SectionTitle>
            <div style={{ height:185 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} margin={{ left:0,right:10,top:4,bottom:44 }}>
                  <XAxis dataKey="sector" tick={{ fontSize:10,fill:"var(--color-text-secondary)" }}
                    axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0}/>
                  <YAxis hide/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="val" name="Value" radius={[3,3,0,0]}>
                    {sectorData.map((s,i)=><Cell key={i} fill={SECTOR_COLORS[i%SECTOR_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:"4px 14px",marginTop:4 }}>
              {sectorData.map((s,i)=>(
                <span key={i} style={{ fontSize:11,display:"flex",alignItems:"center",gap:4,color:"var(--color-text-secondary)" }}>
                  <span style={{ width:8,height:8,borderRadius:2,background:SECTOR_COLORS[i%SECTOR_COLORS.length] }}/>{s.sector} {s.pct}%
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle sub="per account">Sector by account</SectionTitle>
            {accounts.filter(a=>a.type==="equity").map(a=>(
              <div key={a.id} style={{ marginBottom:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}>
                  <span style={{ width:9,height:9,borderRadius:2,background:a.color }}/>
                  <span style={{ fontSize:12,fontWeight:500 }}>{a.label}</span>
                  <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>{fmt(a.eurVal)}</span>
                </div>
                <div style={{ display:"flex",gap:2,height:9,borderRadius:5,overflow:"hidden" }}>
                  {Object.entries(a.sector).map(([s,p],i)=>(
                    <div key={i} title={`${s}: ${p}%`} style={{ flex:p,background:SECTOR_COLORS[i%SECTOR_COLORS.length],minWidth:p>3?2:0 }}/>
                  ))}
                </div>
                <div style={{ display:"flex",flexWrap:"wrap",gap:"2px 10px",marginTop:3 }}>
                  {Object.entries(a.sector).map(([s,p],i)=>(
                    <span key={i} style={{ fontSize:10,color:"var(--color-text-tertiary)",display:"flex",alignItems:"center",gap:3 }}>
                      <span style={{ width:6,height:6,borderRadius:1,background:SECTOR_COLORS[i%SECTOR_COLORS.length] }}/>{s} {p}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ══ PROJECTION ══ */}
      {tab==="projection" && (
        <div>
          <Card style={{ marginBottom:12 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <SectionTitle sub="3% equity / 1.5% bonds real (inflation-adjusted) · cash held flat"/>
              <div style={{ display:"flex",gap:4 }}>
                {[["stacked","Stacked"],["line","Total"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setProjView(v)} style={{
                    fontSize:11,padding:"4px 10px",borderRadius:6,cursor:"pointer",
                    border:projView===v?"none":"0.5px solid var(--color-border-secondary)",
                    background:projView===v?"var(--color-background-info)":"transparent",
                    color:projView===v?"var(--color-text-info)":"var(--color-text-secondary)" }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ height:200 }}>
              <ResponsiveContainer width="100%" height="100%">
                {projView==="stacked" ? (
                  <AreaChart data={projection} margin={{ left:10,right:10,top:4,bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.1)"/>
                    <XAxis dataKey="label" tick={{ fontSize:11,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>"€"+(v/1e6).toFixed(1)+"M"} tick={{ fontSize:10,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ProjTooltip/>}/>
                    <Area type="monotone" dataKey="cash"   name="Cash"         stackId="1" stroke="none" fill="#D3D1C7"/>
                    <Area type="monotone" dataKey="bonds"  name="Fixed income" stackId="1" stroke="none" fill="#1D9E75" fillOpacity={0.85}/>
                    <Area type="monotone" dataKey="equity" name="Equity"       stackId="1" stroke="none" fill="#378ADD" fillOpacity={0.9}/>
                  </AreaChart>
                ) : (
                  <LineChart data={projection} margin={{ left:10,right:10,top:4,bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.1)"/>
                    <XAxis dataKey="label" tick={{ fontSize:11,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>"€"+(v/1e6).toFixed(1)+"M"} tick={{ fontSize:10,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ProjTooltip/>}/>
                    <Line type="monotone" dataKey="total"  name="Total"        stroke="#378ADD" strokeWidth={2.5} dot={{ r:4,fill:"#378ADD" }}/>
                    <Line type="monotone" dataKey="equity" name="Equity"       stroke="#378ADD" strokeDasharray="4 3" strokeWidth={1.5} dot={false} strokeOpacity={0.5}/>
                    <Line type="monotone" dataKey="bonds"  name="Fixed income" stroke="#1D9E75" strokeDasharray="4 3" strokeWidth={1.5} dot={false} strokeOpacity={0.5}/>
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:"5px 14px",marginTop:8 }}>
              {[{color:"#378ADD",l:"Equity"},{color:"#1D9E75",l:"Fixed income"},{color:"#D3D1C7",l:"Cash"}].map((x,i)=>(
                <span key={i} style={{ fontSize:11,display:"flex",alignItems:"center",gap:4,color:"var(--color-text-secondary)" }}>
                  <span style={{ width:8,height:8,borderRadius:2,background:x.color }}/>{x.l}
                </span>
              ))}
              <span style={{ fontSize:11,color:"var(--color-text-tertiary)",marginLeft:"auto" }}>
                2032: {fmtM(projection[projection.length-1].total)}
              </span>
            </div>
          </Card>
          <Card>
            <SectionTitle sub="year-by-year equity/bond ratio shift">Asset mix drift</SectionTitle>
            <div style={{ height:155 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projection} layout="vertical" margin={{ left:10,right:10,top:4,bottom:0 }}>
                  <XAxis type="number" domain={[0,100]} tickFormatter={v=>v+"%"}
                    tick={{ fontSize:10,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="label" width={52} tick={{ fontSize:11,fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false}/>
                  <Tooltip formatter={(v,n,p)=>[Math.round(v/p.payload.total*100)+"% · "+fmt(v),n]}/>
                  <Bar dataKey="equity" name="Equity"       stackId="a" fill="#378ADD"/>
                  <Bar dataKey="bonds"  name="Fixed income" stackId="a" fill="#1D9E75"/>
                  <Bar dataKey="cash"   name="Cash"         stackId="a" fill="#D3D1C7" radius={[0,3,3,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <SectionTitle sub="projected value by account at end of each period · 3% eq / 1.5% bonds real growth">Year-end totals by account</SectionTitle>
            <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse", minWidth:640 }}>
              <thead>
                <tr>
                  {[
                    {label:"Period",       color:null},
                    {label:"401(k)",       color:"#378ADD"},
                    {label:"IBKR equity",  color:"#1D9E75"},
                    {label:"IBKR bonds",   color:"#D85A30"},
                    {label:"SRS",          color:"#BA7517"},
                    {label:"JTC pension",  color:"#B5D4F4"},
                    {label:"SSBs",         color:"#B4B2A9"},
                    {label:"Total",        color:null},
                    {label:"SWR 3.3%",     color:null},
                  ].map(h=>(
                    <th key={h.label} style={{ fontSize:10, fontWeight:500, textAlign:"left",
                        paddingBottom:6, paddingRight:10, borderBottom:"0.5px solid var(--color-border-tertiary)",
                        textTransform:"uppercase", letterSpacing:".04em",
                        color: h.color || "var(--color-text-tertiary)" }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projection.map((p,i)=>{
                  const isRetirement = p.year===2032;
                  const isNow = p.year===2025;
                  const td = (val, color, bold) => (
                    <td style={{ padding:"7px 10px 7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)",
                        color: color||"var(--color-text-secondary)", fontWeight: bold?600:400 }}>{val}</td>
                  );
                  return (
                    <tr key={i} style={{ background: isRetirement ? "var(--color-background-info)" : "transparent" }}>
                      <td style={{ padding:"7px 10px 7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)",
                          fontWeight: isRetirement?600:isNow?500:400,
                          color: isRetirement?"var(--color-text-info)":"var(--color-text-primary)", whiteSpace:"nowrap" }}>
                        {p.label}
                        {isRetirement && <span style={{ fontSize:9, marginLeft:5, padding:"1px 5px", borderRadius:20,
                            background:"var(--color-background-info)", color:"var(--color-text-info)" }}>retire</span>}
                      </td>
                      {td(fmt(p.k401),     "#378ADD")}
                      {td(fmt(p.ibkr_eq),  "#1D9E75")}
                      {td(fmt(p.ibkr_bond),"#D85A30")}
                      {td(fmt(p.srs),      "#BA7517")}
                      {td(fmt(p.pension),  "#7EB8E8")}
                      {td(fmt(p.ssb),      "var(--color-text-tertiary)")}
                      <td style={{ padding:"7px 10px 7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)",
                          fontWeight:700, fontSize: isRetirement?13:12,
                          color: isRetirement?"var(--color-text-info)":"var(--color-text-primary)" }}>
                        {fmtM(p.total)}
                      </td>
                      <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)",
                          color: isRetirement?"var(--color-text-success)":"var(--color-text-tertiary)",
                          fontWeight: isRetirement?600:400, whiteSpace:"nowrap" }}>
                        {fmt(p.total*0.033)}/yr
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div style={{ fontSize:11, color:"var(--color-text-tertiary)", marginTop:8 }}>
              401(k) + IBKR equity @ 3% real · IBKR bonds = accretion to par · SRS + pension @ 1.5% real · SSBs flat · 2032 = 4 months (Jan–Apr) · RSU excluded (income on vest)
            </div>
          </Card>
        </div>
      )}

      {/* ══ PERFORMANCE ══ */}
      {tab==="performance" && (
        <div>
          <Card style={{ marginBottom:12 }}>
            <SectionTitle sub="record today's portfolio value to build the performance chart over time">Save monthly snapshot</SectionTitle>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(115px,1fr))", gap:8, marginBottom:14 }}>
              <Pill label="Total (today)"  value={fmtM(totalEUR)}  color="var(--color-text-primary)" />
              <Pill label="Liquid (today)" value={fmtM(liquidEUR)} color="#378ADD" />
              <Pill label="Snapshots logged" value={snapshots.length} sub="months of history" />
              {snapshots.length > 1 && (() => {
                const sorted = [...snapshots].sort((a,b) => new Date(a.date)-new Date(b.date));
                const first = sorted[0].liquid, last = sorted[sorted.length-1].liquid;
                const months = Math.max(1, Math.round((new Date(sorted[sorted.length-1].date)-new Date(sorted[0].date))/(1000*60*60*24*30.44)));
                const totalReturn = ((last-first)/first*100).toFixed(1);
                const ann = ((Math.pow(last/first, 12/months)-1)*100).toFixed(1);
                return <Pill label="Return (liquid)" value={`${totalReturn>0?"+":""}${totalReturn}%`} sub={`${ann}% annualised`} color={totalReturn>0?"var(--color-text-success)":"var(--color-text-warning)"} />;
              })()}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input type="text" value={snapNote} onChange={e=>setSnapNote(e.target.value)}
                placeholder="Optional note — e.g. 'market crash', 'after JTC payout'…"
                style={{ flex:1, fontSize:12, padding:"7px 10px" }}
                onKeyDown={e=>e.key==="Enter"&&saveSnapshot()} />
              <button onClick={saveSnapshot}
                style={{ fontSize:12, padding:"7px 16px", fontWeight:500, cursor:"pointer", whiteSpace:"nowrap" }}>
                Save snapshot ↗
              </button>
            </div>
            <div style={{ fontSize:11, color:"var(--color-text-tertiary)", marginTop:8 }}>
              Do this once a month after updating prices. Builds your real performance record over time.
            </div>
          </Card>

          {perfChartData.length < 2 ? (
            <Card style={{ textAlign:"center", padding:"2.5rem 1.25rem" }}>
              <div style={{ fontSize:14, fontWeight:500, color:"var(--color-text-primary)", marginBottom:8 }}>Not enough data yet</div>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)" }}>
                Save at least 2 monthly snapshots to see the performance chart.<br/>
                Come back next month after updating prices and saving another snapshot.
              </div>
            </Card>
          ) : (
            <Card style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <SectionTitle sub="liquid portfolio · actual vs 3% real projection vs MSCI World benchmark" />
                <div style={{ display:"flex", gap:4 }}>
                  {[["total","Total"],["liquid","Liquid"],["vs-msci","vs MSCI"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setPerfView(v)} style={{
                      fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer",
                      border: perfView===v?"none":"0.5px solid var(--color-border-secondary)",
                      background: perfView===v?"var(--color-background-info)":"transparent",
                      color: perfView===v?"var(--color-text-info)":"var(--color-text-secondary)" }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ height:240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={perfChartData} margin={{ left:10, right:10, top:8, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.1)" />
                    <XAxis dataKey="label" tick={{ fontSize:10, fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v=>"€"+(v/1e6).toFixed(2)+"M"} tick={{ fontSize:10, fill:"var(--color-text-secondary)" }} axisLine={false} tickLine={false} width={58} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const snap = snapshots.find(s => new Date(s.date).toLocaleDateString("en-GB",{month:"short",year:"2-digit"})===label);
                      return (
                        <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8, padding:"10px 14px", fontSize:12 }}>
                          <div style={{ fontWeight:500, marginBottom:6 }}>{label}</div>
                          {payload.map((p,i)=>(
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2, color:"var(--color-text-secondary)" }}>
                              <span style={{ width:8, height:8, borderRadius:2, background:p.color, flexShrink:0 }} />
                              <span>{p.name}:</span>
                              <span style={{ fontWeight:500, color:"var(--color-text-primary)" }}>{fmt(p.value)}</span>
                            </div>
                          ))}
                          {snap?.note && <div style={{ marginTop:6, fontSize:11, color:"var(--color-text-info)", borderTop:"0.5px solid var(--color-border-tertiary)", paddingTop:4 }}>📌 {snap.note}</div>}
                        </div>
                      );
                    }} />
                    {(perfView==="total"||perfView==="liquid") && (
                      <Line type="monotone"
                        dataKey={perfView==="total"?"total":"actual"}
                        name="Your portfolio"
                        stroke="#378ADD" strokeWidth={2.5}
                        dot={{ r:4, fill:"#378ADD", strokeWidth:0 }}
                        activeDot={{ r:6 }} />
                    )}
                    {perfView==="vs-msci" && <>
                      <Line type="monotone" dataKey="actual"       name="Your portfolio"   stroke="#378ADD" strokeWidth={2.5} dot={{ r:4, fill:"#378ADD", strokeWidth:0 }} activeDot={{ r:6 }} />
                      <Line type="monotone" dataKey="conservative" name="Conservative (3% real)" stroke="#1D9E75" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                      <Line type="monotone" dataKey="msci"         name="MSCI World (~9%)" stroke="#D85A30" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                    </>}
                    {perfView!=="vs-msci" && <>
                      <Line type="monotone" dataKey="conservative" name="Conservative (3% real)" stroke="#1D9E75" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                      <Line type="monotone" dataKey="msci"         name="MSCI World (~9%)" stroke="#D85A30" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                    </>}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 16px", marginTop:10 }}>
                {[
                  { color:"#378ADD", label:"Your portfolio (liquid)", solid:true },
                  { color:"#1D9E75", label:"Conservative projection (3% eq / 1.5% FI, real)", solid:false },
                  { color:"#D85A30", label:"MSCI World benchmark (~9% p.a.)", solid:false },
                ].map((x,i)=>(
                  <span key={i} style={{ fontSize:11, display:"flex", alignItems:"center", gap:5, color:"var(--color-text-secondary)" }}>
                    <svg width={20} height={10}>
                      {x.solid
                        ? <line x1="0" y1="5" x2="20" y2="5" stroke={x.color} strokeWidth="2.5" />
                        : <line x1="0" y1="5" x2="20" y2="5" stroke={x.color} strokeWidth="1.5" strokeDasharray="5 3" />}
                    </svg>
                    {x.label}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {snapshots.length > 0 && (
            <Card>
              <SectionTitle sub="all recorded snapshots">Snapshot history</SectionTitle>
              <table style={{ width:"100%", fontSize:12, borderCollapse:"collapse" }}>
                <thead>
                  <tr>{["Date","Total","Liquid","Equity","Bonds","Cash","Note",""].map(h=>(
                    <th key={h} style={{ fontSize:10, fontWeight:500, color:"var(--color-text-tertiary)", textAlign:"left",
                        paddingBottom:6, borderBottom:"0.5px solid var(--color-border-tertiary)",
                        textTransform:"uppercase", letterSpacing:".04em" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[...snapshots].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((s,i) => {
                    const prev = [...snapshots].sort((a,b)=>new Date(a.date)-new Date(b.date));
                    const idx  = prev.findIndex(p=>p.date===s.date);
                    const delta = idx > 0 ? s.liquid - prev[idx-1].liquid : null;
                    return (
                      <tr key={i}>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)", color:"var(--color-text-secondary)" }}>
                          {new Date(s.date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
                        </td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)", fontWeight:500 }}>{fmtM(s.total)}</td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                          {fmtM(s.liquid)}
                          {delta !== null && (
                            <span style={{ fontSize:10, marginLeft:5, color: delta>=0?"var(--color-text-success)":"var(--color-text-warning)" }}>
                              {delta>=0?"+":""}{fmt(delta)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)", color:"var(--color-text-secondary)" }}>{s.breakdown?.equity ? fmt(s.breakdown.equity) : "—"}</td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)", color:"var(--color-text-secondary)" }}>{s.breakdown?.bonds  ? fmt(s.breakdown.bonds)  : "—"}</td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)", color:"var(--color-text-secondary)" }}>{s.breakdown?.cash   ? fmt(s.breakdown.cash)   : "—"}</td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)", color:"var(--color-text-tertiary)", fontSize:11 }}>{s.note || "—"}</td>
                        <td style={{ padding:"7px 0", borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                          <button onClick={()=>deleteSnapshot(snapshots.indexOf(s))}
                            style={{ fontSize:10, padding:"2px 7px", cursor:"pointer", color:"var(--color-text-tertiary)",
                              border:"0.5px solid var(--color-border-tertiary)", borderRadius:4, background:"transparent" }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
