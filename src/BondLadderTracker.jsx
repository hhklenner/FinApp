import { useState, useEffect, useMemo } from "react";
import { storage } from "./storage.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const FI_RATE     = 0.035;
const INFLATION   = 0.02;
const BASE_PAYOUT = 96000;
const MONTHLY_BUDGET = 4000;

const INITIAL_RUNGS = [
  { id: "31IG", maturityYear: 2031, drawYear: 2032, color: "#1D9E75" },
  { id: "32XG", maturityYear: 2032, drawYear: 2033, color: "#378ADD" },
  { id: "33GI", maturityYear: 2033, drawYear: 2034, color: "#7F77DD" },
  { id: "34GI", maturityYear: 2034, drawYear: 2035, color: "#D85A30" },
  { id: "35AI", maturityYear: 2035, drawYear: 2036, color: "#BA7517" },
];

// Seeded from Oct 2025 IBKR screenshot — Position = shares, Last = price
const SEED_SHARES = { "31IG": 3000, "32XG": 3000, "33GI": 3600, "34GI": 4000, "35AI": 4000 };
const SEED_PRICES = { "31IG": 5.0276, "32XG": 4.9947, "33GI": 4.9675, "34GI": 4.9601, "35AI": 4.9567 };

// JTC pension: €83,143 total across two PIMCO GIS Global Bond tranches
// Expected payout Q1 2026, to be deployed into the bond ladder
const JTC_PENSION_EUR = 83143;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function targetPayout(idx) {
  return Math.round(BASE_PAYOUT * Math.pow(1 + INFLATION, idx));
}
function pvNeeded(idx, maturityYear, asOfYear) {
  return Math.round(targetPayout(idx) / Math.pow(1 + FI_RATE, Math.max(0, maturityYear - asOfYear)));
}

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 72, h = 26;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function ProgressBar({ pct, color, targetVal, currentVal, shares }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const over = pct >= 100;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11,
          color: "var(--color-text-tertiary)", marginBottom: 4 }}>
        <span>{shares.toLocaleString()} shares · €{Math.round(currentVal).toLocaleString()}</span>
        <span style={{ fontWeight: 500, color: over ? "var(--color-text-success)" : pct > 60 ? "var(--color-text-primary)" : "var(--color-text-warning)" }}>
          {Math.round(pct)}%{over ? " ✓" : ""}
        </span>
        <span>PV target €{Math.round(targetVal).toLocaleString()}</span>
      </div>
      <div style={{ height: 8, background: "var(--color-background-secondary)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${clamped}%`,
            background: over ? "#1D9E75" : color, borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

export default function BondLadderTracker() {
  const [tab, setTab]         = useState("ladder");
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);

  const [shares, setShares]   = useState(SEED_SHARES);
  const [prices, setPrices]   = useState(SEED_PRICES);
  const [history, setHistory] = useState([]);
  const [notes, setNotes]     = useState([]);

  const today = new Date();
  const [snapMonth, setSnapMonth] = useState(today.getMonth());
  const [snapYear,  setSnapYear]  = useState(today.getFullYear());

  const [logType,   setLogType]   = useState("buy");
  const [logRung,   setLogRung]   = useState("31IG");
  const [logShares, setLogShares] = useState("");
  const [logPrice,  setLogPrice]  = useState("");
  const [logEUR,    setLogEUR]    = useState("");
  const [logNote,   setLogNote]   = useState("");
  const [logDrop,   setLogDrop]   = useState("");
  const [priceEdits, setPriceEdits] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const s = await storage.get("bl_shares");  if (s) setShares(JSON.parse(s.value));
        const p = await storage.get("bl_prices");  if (p) setPrices(JSON.parse(p.value));
        const h = await storage.get("bl_history"); if (h) setHistory(JSON.parse(h.value));
        const n = await storage.get("bl_notes");   if (n) setNotes(JSON.parse(n.value));
      } catch (_) {}
      setLoading(false);
    }
    load();
  }, []);

  async function persist(sh, pr, hi, no) {
    setSaving(true);
    try {
      await storage.set("bl_shares",  JSON.stringify(sh));
      await storage.set("bl_prices",  JSON.stringify(pr));
      await storage.set("bl_history", JSON.stringify(hi));
      await storage.set("bl_notes",   JSON.stringify(no));
    } catch (_) {}
    setSaving(false);
  }

  const asOfYear = snapYear + snapMonth / 12;

  const rungs = INITIAL_RUNGS.map((r, i) => {
    const sh  = shares[r.id] || 0;
    const pr  = prices[r.id] || 0;
    const val = sh * pr;
    const pv  = pvNeeded(i, r.maturityYear, asOfYear);
    const tp  = targetPayout(i);
    const pct = pv > 0 ? (val / pv) * 100 : 0;
    const shortfall = Math.max(0, pv - val);
    const mths = Math.max(0, (r.maturityYear - asOfYear) * 12);
    const monthlyNeeded  = shortfall > 0 && mths > 0 ? Math.round(shortfall / mths) : 0;
    const sharesNeeded   = pr > 0 ? Math.ceil(shortfall / pr) : 0;
    return { ...r, i, sh, pr, val, pv, tp, pct, shortfall, mths: Math.round(mths), monthlyNeeded, sharesNeeded };
  });

  const totalPV    = rungs.reduce((s, r) => s + r.pv,  0);
  const totalVal   = rungs.reduce((s, r) => s + r.val, 0);
  const totalShort = rungs.reduce((s, r) => s + r.shortfall, 0);
  const monthsLeft = Math.round((2032 - asOfYear) * 12);
  const jtcFuture  = asOfYear < 2026.5 ? JTC_PENSION_EUR : 0;
  const netPos     = totalVal + monthsLeft * MONTHLY_BUDGET + jtcFuture - totalPV;
  const onTrack    = netPos >= 0;

  function shareHistory(id) {
    const sorted = [...history].filter(h => h.sharesAfter?.[id] !== undefined).reverse();
    return [SEED_SHARES[id], ...sorted.map(h => h.sharesAfter[id])].slice(-12);
  }

  function logBuy() {
    const sh = parseFloat(logShares), pr = parseFloat(logPrice);
    if (isNaN(sh) || sh <= 0 || isNaN(pr) || pr <= 0) return;
    const newShares = { ...shares, [logRung]: (shares[logRung] || 0) + sh };
    const newPrices = { ...prices, [logRung]: pr };
    const hi = [{ date: new Date().toISOString(), type: "buy", rung: logRung,
      shares: sh, price: pr, total: Math.round(sh * pr), note: logNote,
      sharesAfter: { ...newShares }, pricesAfter: { ...newPrices } }, ...history];
    setShares(newShares); setPrices(newPrices); setHistory(hi);
    persist(newShares, newPrices, hi, notes);
    setLogShares(""); setLogPrice(""); setLogNote("");
  }

  function logWindfall() {
    const eur = parseFloat(logEUR), pr = parseFloat(logPrice);
    if (isNaN(eur) || isNaN(pr) || pr <= 0) return;
    const sh = Math.floor(eur / pr);
    const newShares = { ...shares, [logRung]: (shares[logRung] || 0) + sh };
    const newPrices = { ...prices, [logRung]: pr };
    const hi = [{ date: new Date().toISOString(), type: "windfall", rung: logRung,
      shares: sh, price: pr, total: Math.round(sh * pr), note: logNote,
      sharesAfter: { ...newShares }, pricesAfter: { ...newPrices } }, ...history];
    setShares(newShares); setPrices(newPrices); setHistory(hi);
    persist(newShares, newPrices, hi, notes);
    setLogEUR(""); setLogPrice(""); setLogNote("");
  }

  function logMarketDrop() {
    const drop = parseFloat(logDrop);
    if (isNaN(drop) || drop <= 0) return;
    const newPrices = {};
    Object.keys(prices).forEach(k => { newPrices[k] = +(prices[k] * (1 - drop / 100)).toFixed(4); });
    const hi = [{ date: new Date().toISOString(), type: "market-drop", rung: "ALL",
      dropPct: drop, note: logNote,
      sharesAfter: { ...shares }, pricesAfter: { ...newPrices } }, ...history];
    setPrices(newPrices); setHistory(hi);
    persist(shares, newPrices, hi, notes);
    setLogDrop(""); setLogNote("");
  }

  function saveNote() {
    if (!logNote.trim()) return;
    const no = [{ date: new Date().toISOString(), text: logNote, tag: "note" }, ...notes];
    setNotes(no); persist(shares, prices, history, no); setLogNote("");
  }

  function savePrices() {
    const newPrices = { ...prices };
    let changed = false;
    Object.keys(priceEdits).forEach(k => {
      const v = parseFloat(priceEdits[k]);
      if (!isNaN(v) && v > 0) { newPrices[k] = v; changed = true; }
    });
    if (!changed) { setPriceEdits({}); return; }
    const hi = [{ date: new Date().toISOString(), type: "price-update", rung: "ALL",
      note: `Monthly price update — ${MONTHS[snapMonth]} ${snapYear}`,
      sharesAfter: { ...shares }, pricesAfter: { ...newPrices } }, ...history];
    setPrices(newPrices); setHistory(hi);
    persist(shares, newPrices, hi, notes);
    setPriceEdits({});
  }


  // ── Progress chart ──────────────────────────────────────────────────────
  const progressData = useMemo(() => {
    const START = 2025 + 9/12; // Oct 2025
    const seedVal = Object.entries(SEED_SHARES).reduce((s,[id,sh]) => s + sh*(SEED_PRICES[id]||0), 0);
    const events = [...history]
      .filter(h => h.pricesAfter && h.sharesAfter)
      .sort((a,b) => new Date(a.date)-new Date(b.date));
    const totalMonths = Math.round((2032 - START) * 12);
    let expectedVal = seedVal;
    const out = [];
    for (let m = 0; m <= totalMonths; m++) {
      const y  = START + m/12;
      const dt = new Date(2025, 9+m, 1);
      const label = dt.toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
      if (m > 0) {
        expectedVal = expectedVal*(1+FI_RATE/12) + MONTHLY_BUDGET;
        if (m === 5) expectedVal += JTC_PENSION_EUR; // JTC Mar 2026
      }
      const eventsBefore = events.filter(e => new Date(e.date) <= dt);
      let actualVal = null;
      if (eventsBefore.length > 0) {
        const latest = eventsBefore[eventsBefore.length-1];
        actualVal = Object.entries(latest.sharesAfter||{}).reduce((s,[id,sh]) =>
          s + sh*(latest.pricesAfter?.[id]||SEED_PRICES[id]||0), 0);
      } else if (m === 0) {
        actualVal = seedVal;
      }
      const targetVal = INITIAL_RUNGS.reduce((s,r,i) => s+pvNeeded(i,r.maturityYear,y), 0);
      out.push({ label, y, expected:Math.round(expectedVal), actual:actualVal!=null?Math.round(actualVal):null, target:Math.round(targetVal), isJTC:m===5 });
    }
    return out;
  }, [history]);

  const rungProgress = useMemo(() => {
    return INITIAL_RUNGS.map((r,ri) => {
      const evts = [...history]
        .filter(h => h.sharesAfter?.[r.id]!==undefined && h.pricesAfter?.[r.id]!==undefined)
        .sort((a,b)=>new Date(a.date)-new Date(b.date));
      const pts = [
        {label:"Oct 25", val:Math.round((SEED_SHARES[r.id]||0)*(SEED_PRICES[r.id]||0))},
        ...evts.map(e=>({
          label:new Date(e.date).toLocaleDateString("en-GB",{month:"short",year:"2-digit"}),
          val:Math.round((e.sharesAfter[r.id]||0)*(e.pricesAfter[r.id]||0)),
        })),
      ];
      const seen={};
      pts.forEach(p=>{seen[p.label]=p.val;});
      return {...r, ri, pts:Object.entries(seen).map(([label,val])=>({label,val}))};
    });
  }, [history]);

  const priority = rungs.filter(r => r.shortfall > 0).sort((a, b) => a.maturityYear - b.maturityYear);

  if (loading) return <div style={{ padding: "2rem", fontSize: 14, color: "var(--color-text-secondary)" }}>Loading…</div>;

  const tabStyle = (id) => ({
    fontSize: 12, padding: "5px 12px", borderRadius: "var(--border-radius-md)", cursor: "pointer",
    border: tab === id ? "none" : "0.5px solid var(--color-border-secondary)",
    background: tab === id ? "var(--color-background-info)" : "transparent",
    color: tab === id ? "var(--color-text-info)" : "var(--color-text-secondary)",
    fontWeight: tab === id ? 500 : 400,
  });

  const inputStyle = { width: "100%", fontSize: 12, padding: "6px 10px" };
  const labelStyle = { fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 };
  const cardStyle  = { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" };

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "1rem 0", maxWidth: 680 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>Bond ladder tracker</div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
            Heinz · 5-rung iBonds ladder · retirement Apr 2032
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>saving…</span>}
          <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20,
              background: "var(--color-background-secondary)", color: "var(--color-text-tertiary)" }}>
            {MONTHS[snapMonth]} {snapYear}
          </span>
        </div>
      </div>

      {/* Snapshot selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, fontSize: 12,
          alignItems: "center", color: "var(--color-text-secondary)" }}>
        <span>Snapshot:</span>
        <select value={snapMonth} onChange={e => setSnapMonth(+e.target.value)} style={{ fontSize: 12 }}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={snapYear} onChange={e => setSnapYear(+e.target.value)} style={{ fontSize: 12 }}>
          {[2025,2026,2027,2028,2029,2030,2031].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
        {[
          { label: "Market value",   value: "€" + Math.round(totalVal).toLocaleString(), sub: `of €${Math.round(totalPV).toLocaleString()} PV needed` },
          { label: "Funded",         value: Math.round(totalVal / totalPV * 100) + "%",  sub: `€${Math.round(totalShort).toLocaleString()} shortfall` },
          { label: "Months to retirement", value: monthsLeft, sub: `€${(monthsLeft * MONTHLY_BUDGET).toLocaleString()} budget left` },
          { label: "On track?",      value: onTrack ? "Yes ✓" : "Gap ✗",
            sub: onTrack ? `€${Math.round(netPos).toLocaleString()} surplus` : `€${Math.round(-netPos).toLocaleString()} behind`,
            color: onTrack ? "var(--color-text-success)" : "var(--color-text-warning)" },
        ].map((m, i) => (
          <div key={i} style={{ background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)", padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.1,
                color: m.color || "var(--color-text-primary)" }}>{m.value}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {[["ladder","Ladder"],["log","Log entry"],["prices","Update prices"],["history","History"],["progress","Progress"],["plan","Plan"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={tabStyle(id)}>{label}</button>
        ))}
      </div>

      {/* ── LADDER ── */}
      {tab === "ladder" && (
        <div>
          {rungs.map(r => (
            <div key={r.id} style={{ ...cardStyle, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, display: "inline-block" }} />
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>{r.id}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
                        background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                      matures {r.maturityYear} · draws {r.drawYear}
                    </span>
                    {r.pct >= 100 && (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
                          background: "var(--color-background-success)", color: "var(--color-text-success)" }}>
                        Fully funded ✓
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                    Target payout €{r.tp.toLocaleString()} · price €{r.pr.toFixed(4)}/share · {r.mths} months to maturity
                  </div>
                </div>
                <Sparkline data={shareHistory(r.id)} color={r.color} />
              </div>

              <ProgressBar pct={r.pct} color={r.color} targetVal={r.pv} currentVal={r.val} shares={r.sh} />

              {r.shortfall > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap",
                    gap: "4px 20px", fontSize: 11, color: "var(--color-text-secondary)" }}>
                  <span>Shortfall: <strong style={{ color: "var(--color-text-warning)" }}>€{Math.round(r.shortfall).toLocaleString()}</strong></span>
                  <span>≈ <strong style={{ color: "var(--color-text-primary)" }}>{r.sharesNeeded.toLocaleString()} more shares</strong> at current price</span>
                  <span>Monthly pace: <strong>€{r.monthlyNeeded.toLocaleString()}/mth</strong></span>
                  <span style={{ color: r.monthlyNeeded <= MONTHLY_BUDGET ? "var(--color-text-success)" : "var(--color-text-warning)" }}>
                    {r.monthlyNeeded <= MONTHLY_BUDGET ? "within budget ✓" : "needs extra funding"}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Recommendation */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>This month — recommended allocation</div>
            {priority.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-text-success)" }}>
                All rungs fully funded — redirect €{MONTHLY_BUDGET.toLocaleString()} to IBKR equity (SPYI / EMIM / VWCG)
              </div>
            ) : (() => {
              let left = MONTHLY_BUDGET;
              return (
                <>
                  {priority.map(r => {
                    if (left <= 0) return null;
                    const eur = Math.min(r.shortfall, left);
                    const sh  = r.pr > 0 ? Math.floor(eur / r.pr) : 0;
                    left -= eur;
                    return (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", padding: "6px 0",
                          borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block" }} />
                          {r.id} <span style={{ color: "var(--color-text-tertiary)" }}>matures {r.maturityYear}</span>
                        </span>
                        <span>
                          <strong>{sh.toLocaleString()} shares</strong>
                          <span style={{ color: "var(--color-text-tertiary)", marginLeft: 6 }}>
                            ≈ €{Math.round(sh * r.pr).toLocaleString()} at €{r.pr.toFixed(4)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  {left > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between",
                        fontSize: 12, padding: "6px 0", color: "var(--color-text-success)" }}>
                      <span>Surplus → IBKR equity</span>
                      <span style={{ fontWeight: 500 }}>€{Math.round(left).toLocaleString()}</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── LOG ENTRY ── */}
      {tab === "log" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Log a portfolio event</div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Event type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[["buy","Buy shares"],["windfall","Windfall (€ amount)"],["market-drop","Market drop"],["note","Journal note"]].map(([v, l]) => (
                <button key={v} onClick={() => setLogType(v)} style={{
                  fontSize: 12, padding: "5px 12px", cursor: "pointer", borderRadius: "var(--border-radius-md)",
                  border: logType === v ? "none" : "0.5px solid var(--color-border-secondary)",
                  background: logType === v ? "var(--color-background-info)" : "transparent",
                  color: logType === v ? "var(--color-text-info)" : "var(--color-text-secondary)",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {(logType === "buy" || logType === "windfall") && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Rung</div>
              <select value={logRung} onChange={e => setLogRung(e.target.value)} style={{ width: "100%", fontSize: 12 }}>
                {INITIAL_RUNGS.map((r, i) => (
                  <option key={r.id} value={r.id}>{r.id} · matures {r.maturityYear} · target payout €{targetPayout(i).toLocaleString()}</option>
                ))}
              </select>
            </div>
          )}

          {logType === "buy" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Number of shares</div>
                  <input type="number" value={logShares} onChange={e => setLogShares(e.target.value)}
                    placeholder="e.g. 800" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Price per share (€)</div>
                  <input type="number" step="0.0001" value={logPrice} onChange={e => setLogPrice(e.target.value)}
                    placeholder="e.g. 5.0276" style={inputStyle} />
                </div>
              </div>
              {logShares && logPrice && +logShares > 0 && +logPrice > 0 && (
                <div style={{ fontSize: 12, background: "var(--color-background-secondary)",
                    padding: "8px 12px", borderRadius: "var(--border-radius-md)", marginBottom: 12 }}>
                  Cost: <strong>€{Math.round(+logShares * +logPrice).toLocaleString()}</strong>
                  {" · "}New total: <strong>{((shares[logRung] || 0) + +logShares).toLocaleString()} shares</strong>
                  {" · "}New value: <strong>€{Math.round(((shares[logRung] || 0) + +logShares) * +logPrice).toLocaleString()}</strong>
                </div>
              )}
            </>
          )}

          {logType === "windfall" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>EUR amount to deploy</div>
                  <input type="number" value={logEUR} onChange={e => setLogEUR(e.target.value)}
                    placeholder="e.g. 20000" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Price per share (€)</div>
                  <input type="number" step="0.0001" value={logPrice} onChange={e => setLogPrice(e.target.value)}
                    placeholder="e.g. 5.0276" style={inputStyle} />
                </div>
              </div>
              {logEUR && logPrice && +logPrice > 0 && (
                <div style={{ fontSize: 12, background: "var(--color-background-secondary)",
                    padding: "8px 12px", borderRadius: "var(--border-radius-md)", marginBottom: 12 }}>
                  Buys <strong>{Math.floor(+logEUR / +logPrice).toLocaleString()} shares</strong>
                  {" · "}Cost: <strong>€{Math.round(Math.floor(+logEUR / +logPrice) * +logPrice).toLocaleString()}</strong>
                </div>
              )}
              <div style={{ fontSize: 11, background: "var(--color-background-info)",
                  color: "var(--color-text-info)", padding: "8px 12px",
                  borderRadius: "var(--border-radius-md)", marginBottom: 12 }}>
                Tip: deploy windfall to the most underfunded rung first (earliest maturity date).
              </div>
            </>
          )}

          {logType === "market-drop" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Price drop % (all rungs)</div>
                <input type="number" value={logDrop} onChange={e => setLogDrop(e.target.value)}
                  placeholder="e.g. 15" style={inputStyle} />
              </div>
              <div style={{ fontSize: 11, background: "var(--color-background-warning)",
                  color: "var(--color-text-warning)", padding: "8px 12px",
                  borderRadius: "var(--border-radius-md)", marginBottom: 12 }}>
                IPS rule: pause new rung purchases until markets recover. Your 5-year buffer absorbs the wait.
              </div>
            </>
          )}

          {logType !== "note" && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Note (optional)</div>
              <input type="text" value={logNote} onChange={e => setLogNote(e.target.value)}
                placeholder="e.g. monthly top-up, year-end bonus…" style={inputStyle} />
            </div>
          )}

          {logType === "note" && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Note</div>
              <input type="text" value={logNote} onChange={e => setLogNote(e.target.value)}
                placeholder="e.g. Pausing — markets volatile" style={inputStyle} />
            </div>
          )}

          <button onClick={
            logType === "buy" ? logBuy :
            logType === "windfall" ? logWindfall :
            logType === "market-drop" ? logMarketDrop : saveNote
          } style={{ fontSize: 12, padding: "7px 18px", fontWeight: 500, cursor: "pointer" }}>
            {logType === "note" ? "Save note" : "Log event"} ↗
          </button>
        </div>
      )}

      {/* ── UPDATE PRICES ── */}
      {tab === "prices" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Monthly price update</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            Open IBKR, check the "Last" column for each ETF, enter below. Share counts stay the same.
          </div>
          {INITIAL_RUNGS.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 44 }}>{r.id}</span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flex: 1 }}>
                {(shares[r.id] || 0).toLocaleString()} shares · €{(prices[r.id] || 0).toFixed(4)} · = €{Math.round((shares[r.id] || 0) * (prices[r.id] || 0)).toLocaleString()}
              </span>
              <input type="number" step="0.0001"
                placeholder={`€${(prices[r.id] || 0).toFixed(4)}`}
                value={priceEdits[r.id] || ""}
                onChange={e => setPriceEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                style={{ width: 100, fontSize: 12, padding: "5px 8px" }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={savePrices} style={{ fontSize: 12, padding: "7px 18px", fontWeight: 500, cursor: "pointer" }}>
              Save prices ↗
            </button>
            <button onClick={() => setPriceEdits({})}
              style={{ fontSize: 12, padding: "7px 14px", cursor: "pointer", color: "var(--color-text-secondary)" }}>
              Clear
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-tertiary)" }}>
            You can also paste your IBKR screenshot into chat and ask me to read the prices for you.
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab === "history" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Event log</div>
          {history.length === 0 && notes.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "1rem 0", textAlign: "center" }}>
              No events yet. Log your first purchase in the Log entry tab.
            </div>
          ) : (
            [...history, ...notes.map(n => ({ ...n, type: "note" }))]
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((e, i) => {
                const d = new Date(e.date);
                const colors = {
                  "buy":          ["var(--color-background-success)", "var(--color-text-success)"],
                  "windfall":     ["var(--color-background-info)",    "var(--color-text-info)"],
                  "market-drop":  ["var(--color-background-warning)", "var(--color-text-warning)"],
                  "price-update": ["var(--color-background-secondary)","var(--color-text-secondary)"],
                  "note":         ["var(--color-background-secondary)","var(--color-text-secondary)"],
                };
                const [bg, col] = colors[e.type] || colors["note"];
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0",
                      borderBottom: "0.5px solid var(--color-border-tertiary)", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", minWidth: 72 }}>
                      {MONTHS[d.getMonth()]} {d.getFullYear()}<br />
                      <span style={{ fontSize: 10 }}>{d.toLocaleDateString()}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20,
                            background: bg, color: col, fontWeight: 500 }}>{e.type}</span>
                        {e.rung && e.rung !== "ALL" && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{e.rung}</span>}
                        {e.rung === "ALL" && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>all rungs</span>}
                        {e.shares > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-success)" }}>
                            +{e.shares.toLocaleString()} shares @ €{e.price?.toFixed(4)} = €{e.total?.toLocaleString()}
                          </span>
                        )}
                        {e.type === "market-drop" && (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-warning)" }}>−{e.dropPct}%</span>
                        )}
                      </div>
                      {e.note && <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{e.note}</div>}
                      {e.text && <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{e.text}</div>}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ── PLAN ── */}
      {tab === "plan" && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Year-by-year funding plan</div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Year","Budget","Extra","Priority rung","PV target","On track?"].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)",
                      textAlign: "left", paddingBottom: 6, borderBottom: "0.5px solid var(--color-border-tertiary)",
                      textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[2026,2027,2028,2029,2030,2031].map(year => {
                  const yr = year + 5/12;
                  const p = INITIAL_RUNGS.map((r, ri) => ({
                    ...r, pv: pvNeeded(ri, r.maturityYear, yr),
                    val: (shares[r.id] || 0) * (prices[r.id] || 0),
                  })).find(r => r.val < r.pv);
                  return (
                    <tr key={year}>
                      <td style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 500 }}>{year}</td>
                      <td style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>€{(MONTHLY_BUDGET * 12).toLocaleString()}</td>
                      <td style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        {year === 2026 ? (
                          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20,
                              background: "var(--color-background-info)", color: "var(--color-text-info)", whiteSpace: "nowrap" }}>
                            +€{JTC_PENSION_EUR.toLocaleString()} JTC ↓
                          </span>
                        ) : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                        {p ? p.id : <span style={{ color: "var(--color-text-success)" }}>ladder complete</span>}
                      </td>
                      <td style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                        {p ? `€${Math.round(p.pv).toLocaleString()}` : "—"}
                      </td>
                      <td style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20,
                            background: onTrack ? "var(--color-background-success)" : "var(--color-background-warning)",
                            color: onTrack ? "var(--color-text-success)" : "var(--color-text-warning)" }}>
                          {onTrack ? "on track ✓" : "behind ✗"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Rolling ladder rules (post-retirement 2032)</div>
            {[
              ["Every year",       "Sell equity to fund a new 5-year-out rung. 2032 → fund 2037. 2033 → fund 2038. Perpetual."],
              ["Market down >15%", "Pause new rung. Draw existing ladder. 5-year buffer = up to 5 years without selling equity at a loss."],
              ["Windfall",         "Pre-fund the next year's rung early. Reduces future equity-sale pressure."],
              ["Rung matures",     "Full payout Dec of maturity year — primary income for the following calendar year."],
              ["Equity",           "Grows untouched during bond-covered years. Sell only to fund the new annual rung or cover shortfall."],
              ["JTC pension",      "€83,143 from old employer pension expected Q1 2026. Deploy into most underfunded rungs first — likely accelerates 33GI, 34GI, 35AI to near-full funding."],
            ].map(([title, desc], i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0",
                  borderBottom: i < 5 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                <div style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20,
                    background: "var(--color-background-secondary)", color: "var(--color-text-secondary)",
                    height: "fit-content", whiteSpace: "nowrap", marginTop: 1 }}>{title}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROGRESS TAB */}
      {tab === "progress" && (
        <div>
          <div style={{...cardStyle, marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",marginBottom:4}}>Ladder value over time</div>
            <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:12}}>
              Actual (from logged entries) · Expected (€4k/mth + growth + JTC Mar 2026) · Target PV required
            </div>
            <div style={{height:220}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressData} margin={{left:10,right:10,top:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.1)"/>
                  <XAxis dataKey="label" tick={{fontSize:9,fill:"var(--color-text-secondary)"}}
                    axisLine={false} tickLine={false} interval={Math.floor(progressData.length/8)}/>
                  <YAxis tickFormatter={v=>"€"+Math.round(v/1000)+"k"}
                    tick={{fontSize:10,fill:"var(--color-text-secondary)"}}
                    axisLine={false} tickLine={false} width={48}/>
                  <Tooltip content={({active,payload,label})=>{
                    if (!active||!payload?.length) return null;
                    const d = progressData.find(p=>p.label===label);
                    const actual = payload.find(p=>p.dataKey==="actual");
                    const expected = payload.find(p=>p.dataKey==="expected");
                    const diff = (actual?.value!=null&&expected?.value!=null) ? actual.value-expected.value : null;
                    return (
                      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"10px 14px",fontSize:12}}>
                        <div style={{fontWeight:500,marginBottom:6}}>{label}{d?.isJTC?" 📌 JTC payout":""}</div>
                        {payload.map((p,i)=>p.value!=null&&(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,color:"var(--color-text-secondary)"}}>
                            <span style={{width:8,height:8,borderRadius:2,background:p.color,flexShrink:0}}/>
                            <span>{p.name}:</span>
                            <span style={{fontWeight:500,color:"var(--color-text-primary)"}}>€{Math.round(p.value).toLocaleString()}</span>
                          </div>
                        ))}
                        {diff!=null&&(
                          <div style={{marginTop:6,paddingTop:6,borderTop:"0.5px solid var(--color-border-tertiary)",fontSize:11}}>
                            {diff>=0
                              ?<span style={{color:"var(--color-text-success)"}}>▲ ahead by €{diff.toLocaleString()}</span>
                              :<span style={{color:"var(--color-text-warning)"}}>▼ behind by €{Math.abs(diff).toLocaleString()}</span>
                            }
                          </div>
                        )}
                      </div>
                    );
                  }}/>
                  <Line type="monotone" dataKey="target"   name="Target PV"  stroke="#D3D1C7" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
                  <Line type="monotone" dataKey="expected" name="Expected"   stroke="#1D9E75" strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
                  <Line type="monotone" dataKey="actual"   name="Actual"     stroke="#378ADD" strokeWidth={2.5}
                    dot={(props)=>{
                      const {cx,cy,payload}=props;
                      if (payload.actual==null) return null;
                      if (payload.isJTC) return <circle key={cx+cy} cx={cx} cy={cy} r={6} fill="#BA7517" stroke="white" strokeWidth={1.5}/>;
                      return <circle key={cx+cy} cx={cx} cy={cy} r={3.5} fill="#378ADD" stroke="white" strokeWidth={1.5}/>;
                    }}
                    connectNulls={false}/>
                  <ReferenceLine x={progressData.find(d=>d.isJTC)?.label} stroke="#BA7517"
                    strokeDasharray="3 3"
                    label={{value:"JTC",position:"insideTopRight",fontSize:10,fill:"#BA7517"}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px 16px",marginTop:10}}>
              {[{color:"#378ADD",label:"Actual",solid:true},{color:"#1D9E75",label:"Expected (€4k/mth + JTC)",solid:false},{color:"#D3D1C7",label:"Target PV",solid:false}].map((x,i)=>(
                <span key={i} style={{fontSize:11,display:"flex",alignItems:"center",gap:5,color:"var(--color-text-secondary)"}}>
                  <svg width={20} height={10}>
                    {x.solid
                      ?<line x1="0" y1="5" x2="20" y2="5" stroke={x.color} strokeWidth="2.5"/>
                      :<line x1="0" y1="5" x2="20" y2="5" stroke={x.color} strokeWidth="1.5" strokeDasharray="5 3"/>
                    }
                  </svg>
                  {x.label}
                </span>
              ))}
            </div>
            <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:8}}>
              Actual line builds as you log buys each month. Orange dot marks the JTC pension arrival. Hover for ahead/behind detail.
            </div>
          </div>

          {/* Per-rung glide path */}
          <div style={{...cardStyle, marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>Rung-by-rung glide path</div>
            <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:14}}>
              Coloured bar = actual funding · thin line = where you should be · target = full PV
            </div>
            {rungs.map(r=>{
              const START = 2025+9/12;
              const totalMths = (r.maturityYear-START)*12;
              const elapsed = Math.max(0,(asOfYear-START)*12);
              const seedV = (SEED_SHARES[r.id]||0)*(SEED_PRICES[r.id]||0);
              const requiredNow = Math.round(seedV + (r.pv-seedV)*Math.min(1,elapsed/totalMths));
              const glidePct = Math.min(100, Math.round(requiredNow/r.pv*100));
              const onRungTrack = r.val >= requiredNow;
              return (
                <div key={r.id} style={{marginBottom:18}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:9,height:9,borderRadius:2,background:r.color}}/>
                      <span style={{fontSize:13,fontWeight:500}}>{r.id}</span>
                      <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>matures {r.maturityYear} · draws {r.drawYear}</span>
                    </span>
                    <span style={{fontSize:12,fontWeight:500,color:onRungTrack?"var(--color-text-success)":"var(--color-text-warning)"}}>
                      {onRungTrack?"on track ✓":`behind €${Math.round(requiredNow-r.val).toLocaleString()}`}
                    </span>
                  </div>
                  <div style={{position:"relative",height:14,background:"var(--color-background-secondary)",borderRadius:6,overflow:"visible"}}>
                    {/* Actual */}
                    <div style={{position:"absolute",left:0,top:0,height:"100%",
                      width:`${Math.min(100,r.pct)}%`,
                      background:r.pct>=100?"#1D9E75":r.color,
                      borderRadius:6,transition:"width 0.4s"}}/>
                    {/* Glide marker */}
                    {glidePct < 100 && (
                      <div style={{position:"absolute",top:-4,bottom:-4,
                        left:`calc(${glidePct}% - 1.5px)`,
                        width:3,background:"var(--color-text-primary)",borderRadius:2,opacity:0.4}}/>
                    )}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--color-text-tertiary)",marginTop:3}}>
                    <span>{r.sh.toLocaleString()} shares · €{Math.round(r.val).toLocaleString()} · {Math.round(r.pct)}% of PV</span>
                    <span>should be {glidePct}% (€{requiredNow.toLocaleString()}) · full PV €{Math.round(r.pv).toLocaleString()}</span>
                  </div>
                  {/* Sparkline from history */}
                  {rungProgress.find(d=>d.id===r.id)?.pts.length>1&&(()=>{
                    const pts=rungProgress.find(d=>d.id===r.id).pts;
                    const w=220,h=26;
                    const vals=pts.map(p=>p.val);
                    const min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
                    const points=pts.map((p,i)=>`${(i/(pts.length-1))*w},${h-((p.val-min)/range)*(h-4)-2}`).join(" ");
                    return (
                      <svg key={r.id} width={w} height={h} style={{display:"block",marginTop:4,opacity:0.65}}>
                        <polyline points={points} fill="none" stroke={r.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
                      </svg>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Activity log table */}
          {history.filter(h=>["buy","windfall","price-update","market-drop"].includes(h.type)).length>0&&(
            <div style={cardStyle}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:12}}>Monthly activity log</div>
              <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                <thead>
                  <tr>{["Date","Type","Rung","Shares","Invested","Ladder total","Note"].map(h=>(
                    <th key={h} style={{fontSize:10,fontWeight:500,color:"var(--color-text-tertiary)",textAlign:"left",
                      paddingBottom:6,borderBottom:"0.5px solid var(--color-border-tertiary)",
                      textTransform:"uppercase",letterSpacing:".04em"}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[...history]
                    .filter(h=>["buy","windfall","price-update","market-drop"].includes(h.type))
                    .sort((a,b)=>new Date(b.date)-new Date(a.date))
                    .slice(0,24)
                    .map((e,i)=>{
                      const ladderVal=e.sharesAfter&&e.pricesAfter
                        ?Object.entries(e.sharesAfter).reduce((s,[id,sh])=>s+sh*(e.pricesAfter[id]||0),0)
                        :null;
                      const tColors={"buy":"#1D9E75","windfall":"#378ADD","market-drop":"#D85A30","price-update":"#888"};
                      return (
                        <tr key={i}>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",color:"var(--color-text-secondary)",fontSize:11}}>
                            {new Date(e.date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"})}
                          </td>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                            <span style={{fontSize:10,padding:"2px 6px",borderRadius:20,background:tColors[e.type]+"22",color:tColors[e.type],fontWeight:500}}>{e.type}</span>
                          </td>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",color:"var(--color-text-secondary)"}}>{e.rung||"—"}</td>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                            {e.shares?<span style={{color:"var(--color-text-success)"}}>+{Number(e.shares).toLocaleString()}</span>:"—"}
                          </td>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontWeight:500}}>
                            {e.total?`€${e.total.toLocaleString()}`:e.dropPct?<span style={{color:"#D85A30"}}>-{e.dropPct}%</span>:"—"}
                          </td>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                            {ladderVal!=null?`€${Math.round(ladderVal).toLocaleString()}`:"—"}
                          </td>
                          <td style={{padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",color:"var(--color-text-tertiary)",fontSize:11}}>{e.note||"—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      )}
    </div>
  );
}