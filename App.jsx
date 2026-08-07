import { useState, useEffect, useRef, useCallback } from "react";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#060b10", surface: "#0b1520", surface2: "#0f1d2b",
  border: "#152030", borderLight: "#1e3045",
  cyan: "#00c8f0", cyanDim: "#00c8f012",
  amber: "#f0a500", amberDim: "#f0a50012",
  rose: "#f03060", roseDim: "#f0306012",
  green: "#00df7a", greenDim: "#00df7a12",
  muted: "#3d5a72", text: "#b0cce0", textBright: "#e8f4ff",
};

// ─── NSE Watchlist (Yahoo Finance uses SYMBOL.NS) ─────────────────────────────
const STOCKS = [
  "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","SBIN","BHARTIARTL",
  "ITC","KOTAKBANK","AXISBANK","LT","BAJFINANCE","HINDUNILVR","MARUTI",
  "TITAN","SUNPHARMA","WIPRO","HCLTECH","TATAMOTORS","TATASTEEL",
  "POWERGRID","NTPC","ONGC","ADANIPORTS","BAJAJFINSV","DRREDDY","CIPLA",
  "M%26M","NESTLEIND","ULTRACEMCO","TECHM","JSWSTEEL","HINDALCO",
  "COALINDIA","GRASIM","EICHERMOT","HEROMOTOCO","BRITANNIA","DIVISLAB","PIDILITIND",
];

// Yahoo Finance chart API — free, no key, CORS-friendly via allorigins proxy
const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
// We route through allorigins to bypass CORS
const proxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

// ─── EMA calculator ───────────────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return +ema.toFixed(2);
}

// ─── Fetch daily OHLC for EMA + PDH/PDL (past 120 days) ─────────────────────
async function fetchDaily(symbol) {
  const url = `${YF_BASE}/${symbol}.NS?interval=1d&range=6mo`;
  const res = await fetch(proxy(url));
  if (!res.ok) throw new Error(`Daily fetch failed: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No data");
  const q = result.indicators.quote[0];
  const closes = q.close.filter(Boolean);
  const highs = q.high.filter(Boolean);
  const lows = q.low.filter(Boolean);
  const opens = q.open.filter(Boolean);
  const volumes = q.volume.filter(Boolean);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const n = closes.length;
  return {
    ema20, ema50,
    pdh: highs[n - 2],   // previous day high
    pdl: lows[n - 2],    // previous day low
    prevClose: closes[n - 2],
    lastClose: closes[n - 1],
    todayOpen: opens[n - 1],
    todayHigh: highs[n - 1],
    todayLow: lows[n - 1],
    volume: volumes[n - 1],
    dailyCloses: closes,
  };
}

// ─── Fetch today's 1-min candles ─────────────────────────────────────────────
async function fetchIntraday(symbol) {
  const url = `${YF_BASE}/${symbol}.NS?interval=1m&range=1d`;
  const res = await fetch(proxy(url));
  if (!res.ok) throw new Error(`Intraday fetch failed: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No intraday data");
  const q = result.indicators.quote[0];
  const rawCloses = q.close || [];
  const rawVolumes = q.volume || [];
  const timestamps = result.timestamp || [];
  const closes = [], volumes = [];
  for (let i = 0; i < rawCloses.length; i++) {
    if (rawCloses[i] != null) {
      closes.push(rawCloses[i]);
      volumes.push(rawVolumes[i] || 0);
    }
  }
  return { closes, volumes, timestamps };
}

// ─── Fetch today's 15-min candles (for 15m PDH/PDL crossover) ───────────────
async function fetch15m(symbol) {
  const url = `${YF_BASE}/${symbol}.NS?interval=15m&range=5d`;
  const res = await fetch(proxy(url));
  if (!res.ok) throw new Error(`15m fetch failed: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No 15m data");
  const q = result.indicators.quote[0];
  const closes = (q.close || []).filter(v => v != null);
  return { closes };
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return <div style={{ width: 80, height: 26 }} />;
  const w = 80, h = 26;
  const mn = Math.min(...data), mx = Math.max(...data);
  const r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / r) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Alert Toast ──────────────────────────────────────────────────────────────
function AlertToast({ alerts, onDismiss }) {
  if (!alerts.length) return null;
  return (
    <div style={{ position: "fixed", top: 68, right: 14, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 290 }}>
      {alerts.slice(0, 4).map((a, i) => (
        <div key={i} onClick={() => onDismiss(i)} style={{
          background: a.type === "PDH" ? "#1a1000" : "#160010",
          border: `1px solid ${a.type === "PDH" ? C.amber : C.rose}`,
          borderRadius: 8, padding: "9px 13px", cursor: "pointer",
          animation: "slideIn 0.25s ease",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: a.type === "PDH" ? C.amber : C.rose, fontWeight: 800, fontSize: 11 }}>
              {a.type === "PDH" ? "▲ PDH" : "▼ PDL"} · {a.tf === "15m" ? "15-MIN" : "1-MIN + VOL"}
            </span>
            <span style={{ color: C.muted, fontSize: 10 }}>{a.time}</span>
          </div>
          <div style={{ color: C.textBright, fontWeight: 700, fontSize: 15, fontFamily: "monospace", marginTop: 3 }}>{a.symbol}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            ₹{a.price?.toFixed(2)} · {a.type} ₹{a.level?.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks, setStocks] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("crossover15");
  const [sortDir, setSortDir] = useState("desc");
  const [phase, setPhase] = useState("idle"); // idle | loading | live | error
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Ready");
  const [loadedCount, setLoadedCount] = useState(0);
  const prevCrossRef = useRef({});
  const refreshTimer = useRef(null);

  // ── Load one stock ─────────────────────────────────────────────────────────
  const loadStock = useCallback(async (symbol) => {
    try {
      const daily = await fetchDaily(symbol);
      const { closes: intraCl, volumes: intraVol } = await fetchIntraday(symbol);
      const { closes: c15 } = await fetch15m(symbol);
      const lastIntra = intraCl[intraCl.length - 1] || daily.lastClose;
      const price = lastIntra;
      const change = daily.prevClose ? ((price - daily.prevClose) / daily.prevClose) * 100 : 0;
      const aboveEMA20 = daily.ema20 ? price > daily.ema20 : false;
      const aboveEMA50 = daily.ema50 ? price > daily.ema50 : false;
      const qualifies = aboveEMA20 && aboveEMA50;

      // 15-min candle crossing PDH/PDL
      const last15 = c15[c15.length - 1];
      const crossover15 = last15 != null
        ? (last15 > daily.pdh ? "PDH" : last15 < daily.pdl ? "PDL" : null)
        : null;

      // 1-min candle crossing PDH/PDL, confirmed by volume (vs avg of prior 20 1-min candles)
      const lastVol = intraVol[intraVol.length - 1] || 0;
      const priorVols = intraVol.slice(-21, -1);
      const avgVol = priorVols.length ? priorVols.reduce((a, b) => a + b, 0) / priorVols.length : 0;
      const volSpike = avgVol > 0 && lastVol > avgVol * 1.5;
      const rawCross1m = price > daily.pdh ? "PDH" : price < daily.pdl ? "PDL" : null;
      const crossover1mVol = rawCross1m && volSpike ? rawCross1m : null;

      const key15 = `${symbol}_15m`;
      const key1mVol = `${symbol}_1mvol`;
      const prev15 = prevCrossRef.current[key15];
      const prev1mVol = prevCrossRef.current[key1mVol];
      const nowStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (crossover15 && crossover15 !== prev15 && qualifies) {
        setAlerts(a => [{
          symbol, type: crossover15, tf: "15m", price,
          level: crossover15 === "PDH" ? daily.pdh : daily.pdl,
          time: nowStr,
        }, ...a].slice(0, 30));
      }
      if (crossover1mVol && crossover1mVol !== prev1mVol && qualifies) {
        setAlerts(a => [{
          symbol, type: crossover1mVol, tf: "1m+vol", price,
          level: crossover1mVol === "PDH" ? daily.pdh : daily.pdl,
          vol: lastVol, avgVol,
          time: nowStr,
        }, ...a].slice(0, 30));
      }
      prevCrossRef.current[key15] = crossover15;
      prevCrossRef.current[key1mVol] = crossover1mVol;

      return {
        symbol,
        price: +price.toFixed(2),
        ema20: daily.ema20,
        ema50: daily.ema50,
        pdh: +daily.pdh?.toFixed(2),
        pdl: +daily.pdl?.toFixed(2),
        prevClose: +daily.prevClose?.toFixed(2),
        change: +change.toFixed(2),
        volume: daily.volume,
        lastVol, avgVol, volSpike,
        aboveEMA20, aboveEMA50,
        crossover15,
        crossover1mVol,
        sparkline: intraCl.slice(-20),
        high: +daily.todayHigh?.toFixed(2),
        low: +daily.todayLow?.toFixed(2),
      };
    } catch (e) {
      return null;
    }
  }, []);

  // ── Full scan ──────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setPhase("loading");
    setProgress(0);
    setLoadedCount(0);
    setStatusMsg("Fetching NSE data from Yahoo Finance...");

    const result = {};
    for (let i = 0; i < STOCKS.length; i++) {
      const sym = decodeURIComponent(STOCKS[i]); // M&M fix
      setStatusMsg(`Loading ${sym}... (${i + 1}/${STOCKS.length})`);
      const data = await loadStock(sym);
      if (data) result[sym] = data;
      setLoadedCount(i + 1);
      setProgress(Math.round(((i + 1) / STOCKS.length) * 100));
      await new Promise(r => setTimeout(r, 350)); // gentle rate limit
    }

    setStocks(result);
    setPhase("live");
    setStatusMsg(`Scan complete · ${Object.keys(result).length} stocks loaded`);

    // Auto-refresh every 3 minutes
    refreshTimer.current = setTimeout(runScan, 3 * 60 * 1000);
  }, [loadStock]);

  useEffect(() => {
    return () => clearTimeout(refreshTimer.current);
  }, []);

  // ── Derived list ───────────────────────────────────────────────────────────
  const allList = Object.values(stocks);
  const aboveEMA = allList.filter(s => s.aboveEMA20 && s.aboveEMA50);
  const filtered = aboveEMA
    .filter(s => {
      if (filter === "15M") return !!s.crossover15;
      if (filter === "1MVOL") return !!s.crossover1mVol;
      if (filter === "CROSS") return !!s.crossover15 || !!s.crossover1mVol;
      return true;
    })
    .filter(s => !search || s.symbol.includes(search.toUpperCase()))
    .sort((a, b) => {
      let av = (sortKey === "crossover15" || sortKey === "crossover1mVol") ? (a[sortKey] ? 1 : 0) : a[sortKey];
      let bv = (sortKey === "crossover15" || sortKey === "crossover1mVol") ? (b[sortKey] ? 1 : 0) : b[sortKey];
      if (av == null) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv == null) bv = sortDir === "asc" ? Infinity : -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  const handleSort = k => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const break15Count = aboveEMA.filter(s => s.crossover15).length;
  const breakVolCount = aboveEMA.filter(s => s.crossover1mVol).length;

  const Arr = ({ k }) => sortKey === k
    ? <span style={{ color: C.cyan }}>{sortDir === "asc" ? " ↑" : " ↓"}</span>
    : <span style={{ color: C.muted }}> ↕</span>;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter','Segoe UI',sans-serif", color: C.text, paddingBottom: 60 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
        @keyframes slideIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .rh:hover{background:#0d1e2f!important}
        .th{cursor:pointer;user-select:none}.th:hover{color:${C.cyan}}
        .tab{border:none;cursor:pointer;border-radius:5px;padding:5px 11px;font-size:11px;font-weight:700;transition:all .15s}
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "11px 18px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 10,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{
            width: 34, height: 34, background: C.cyanDim, border: `1.5px solid ${C.cyan}`,
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
          }}>⚡</div>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: C.textBright, letterSpacing: "0.06em" }}>
              MARKET PULSE · NSE
            </div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.07em" }}>
              FREE · NO LOGIN · POWERED BY YAHOO FINANCE
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {statusMsg}
          </div>

          {phase === "loading" && (
            <div style={{ fontSize: 11, color: C.amber, fontFamily: "monospace" }}>
              {loadedCount}/{STOCKS.length}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: phase === "live" ? C.green : phase === "loading" ? C.amber : phase === "error" ? C.rose : C.muted,
              animation: phase === "loading" ? "pulse 1s infinite" : "none",
            }} />
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
              color: phase === "live" ? C.green : phase === "loading" ? C.amber : C.muted,
            }}>
              {phase === "live" ? "LIVE" : phase === "loading" ? "SCANNING" : "READY"}
            </span>
          </div>

          {phase !== "loading" && (
            <button onClick={runScan} style={{
              background: C.cyan, color: "#000", border: "none",
              borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.03em",
            }}>
              {phase === "live" ? "↺ Refresh" : "▶ Start Scan"}
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      {phase === "loading" && (
        <div style={{ height: 3, background: C.border }}>
          <div style={{ height: "100%", background: C.cyan, width: `${progress}%`, transition: "width 0.3s ease" }} />
        </div>
      )}

      {/* ── Landing / Start screen ── */}
      {phase === "idle" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center",
          }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>⚡</div>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: C.textBright, letterSpacing: "0.05em" }}>
              NSE STOCK SCANNER
            </div>
            <div style={{ color: C.muted, fontSize: 13, margin: "12px 0 32px", lineHeight: 1.8 }}>
              Scans <b style={{ color: C.text }}>Nifty 50 stocks</b> — filters those trading<br />
              above <b style={{ color: C.cyan }}>20 EMA & 50 EMA</b> (daily timeframe),<br />
              then flags <b style={{ color: C.amber }}>15-min</b> PDH/PDL crossovers and<br />
              <b style={{ color: C.rose }}>1-min</b> PDH/PDL crosses confirmed by <b style={{ color: C.text }}>volume</b>.<br />
              <span style={{ fontSize: 11, color: C.border }}>Free · No login · Yahoo Finance data</span>
            </div>
            <button onClick={runScan} style={{
              background: C.cyan, color: "#000", border: "none",
              borderRadius: 10, padding: "14px 40px", fontSize: 15, fontWeight: 800,
              cursor: "pointer", letterSpacing: "0.04em", width: "100%",
            }}>
              ▶ Start Scanning
            </button>
            <div style={{ marginTop: 20, fontSize: 11, color: C.muted }}>
              Scans ~40 stocks · takes ~20 seconds · auto-refreshes every 3 min
            </div>
          </div>
        </div>
      )}

      {/* ── Scanner UI ── */}
      {(phase === "loading" || phase === "live") && (
        <>
          {/* Stat cards */}
          <div style={{ display: "flex", gap: 10, padding: "14px 18px", flexWrap: "wrap" }}>
            {[
              { label: "Stocks Scanned", value: loadedCount, color: C.text, dim: C.surface2 },
              { label: "Above 20 & 50 EMA (Day)", value: aboveEMA.length, color: C.cyan, dim: C.cyanDim },
              { label: "15-min PDH/PDL Break", value: break15Count, color: C.amber, dim: C.amberDim },
              { label: "1-min + Volume Break", value: breakVolCount, color: C.rose, dim: C.roseDim },
            ].map(({ label, value, color, dim }) => (
              <div key={label} style={{
                flex: "1 1 120px", background: dim, border: `1px solid ${color}25`,
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", gap: 10, padding: "0 18px 12px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 140px", maxWidth: 190 }}>
              <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>🔍</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search symbol…"
                style={{
                  width: "100%", background: C.surface2, border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: "7px 10px 7px 28px", color: C.text,
                  fontSize: 12, outline: "none", fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, background: C.surface, padding: 4, borderRadius: 8, border: `1px solid ${C.border}` }}>
              {[
                { k: "ALL", lbl: "All EMA ↑", col: C.cyan },
                { k: "CROSS", lbl: "⚡ Any Signal", col: C.textBright },
                { k: "15M", lbl: "15m PDH/PDL", col: C.amber },
                { k: "1MVOL", lbl: "1m + Vol", col: C.rose },
              ].map(({ k, lbl, col }) => (
                <button key={k} className="tab" onClick={() => setFilter(k)} style={{
                  background: filter === k ? `${col}18` : "transparent",
                  color: filter === k ? col : C.muted,
                  border: filter === k ? `1px solid ${col}` : "1px solid transparent",
                }}>{lbl}</button>
              ))}
            </div>
          </div>

          {/* Info strip */}
          <div style={{
            margin: "0 18px 10px", background: C.surface2, borderRadius: 7,
            padding: "7px 13px", fontSize: 10, color: C.muted, display: "flex", gap: 18, flexWrap: "wrap",
          }}>
            <span>📊 EMA filter: price above daily 20 & 50 EMA</span>
            <span>⚡ 15m signal: 15-min candle crosses PDH/PDL</span>
            <span>📈 1m+Vol signal: 1-min candle crosses PDH/PDL on 1.5× avg volume</span>
            <span>🔄 Auto-refresh: every 3 minutes</span>
            <span>📡 Source: Yahoo Finance (.NS)</span>
          </div>

          {/* Table */}
          <div style={{ margin: "0 18px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: 10, letterSpacing: "0.07em" }}>
                  {[
                    ["symbol","SYMBOL"], ["price","CMP ₹"], ["change","CHG %"],
                    ["crossover15","SIGNAL (15m)"], ["crossover1mVol","SIGNAL (1m+Vol)"],
                    ["pdh","PDH"], ["pdl","PDL"],
                    ["ema20","20 EMA (D)"], ["ema50","50 EMA (D)"],
                    ["high","TODAY H/L"], ["volume","VOLUME"], ["_sp","TREND"],
                  ].map(([k, lbl]) => (
                    <th key={k}
                      className={k !== "_sp" ? "th" : ""}
                      onClick={k !== "_sp" ? () => handleSort(k) : undefined}
                      style={{ textAlign: "left", padding: "6px 8px", background: C.surface, fontWeight: 600 }}>
                      {lbl}{k !== "_sp" && <Arr k={k} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && phase === "loading" && (
                  <tr><td colSpan={12} style={{ padding: 50, textAlign: "center", color: C.muted }}>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 20 }}>⟳</span>
                    </div>
                    Loading data… {progress}% complete
                  </td></tr>
                )}
                {filtered.length === 0 && phase === "live" && (
                  <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: C.muted }}>
                    No stocks match current filter
                  </td></tr>
                )}
                {filtered.map(s => {
                  const up = s.change >= 0;
                  const is15PDH = s.crossover15 === "PDH";
                  const is15PDL = s.crossover15 === "PDL";
                  const isVolPDH = s.crossover1mVol === "PDH";
                  const isVolPDL = s.crossover1mVol === "PDL";
                  const isPDH = is15PDH || isVolPDH;
                  const isPDL = is15PDL || isVolPDL;
                  return (
                    <tr key={s.symbol} className="rh" style={{
                      background: isPDH ? "#150e00" : isPDL ? "#150009" : C.surface,
                      outline: isPDH ? `1px solid ${C.amber}28` : isPDL ? `1px solid ${C.rose}28` : "1px solid transparent",
                      borderRadius: 6,
                    }}>
                      <td style={{ padding: "9px 8px", borderRadius: "6px 0 0 6px" }}>
                        <div style={{ fontWeight: 800, color: C.textBright, fontFamily: "monospace", fontSize: 13 }}>{s.symbol}</div>
                        <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>NSE · EQ</div>
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", fontWeight: 700, color: C.textBright, fontSize: 13 }}>
                        {s.price ? s.price.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td style={{ padding: "9px 8px" }}>
                        <span style={{ color: up ? C.green : C.rose, fontWeight: 700, fontFamily: "monospace" }}>
                          {s.change != null ? `${up ? "+" : ""}${s.change.toFixed(2)}%` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 8px" }}>
                        {is15PDH && <span style={{ background: C.amberDim, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>▲ PDH</span>}
                        {is15PDL && <span style={{ background: C.roseDim, border: `1px solid ${C.rose}`, color: C.rose, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>▼ PDL</span>}
                        {!s.crossover15 && <span style={{ color: C.border, fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 8px" }}>
                        {isVolPDH && <span style={{ background: C.amberDim, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>▲ PDH+VOL</span>}
                        {isVolPDL && <span style={{ background: C.roseDim, border: `1px solid ${C.rose}`, color: C.rose, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>▼ PDL+VOL</span>}
                        {!s.crossover1mVol && <span style={{ color: C.border, fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", color: C.amber, fontSize: 11 }}>
                        {s.pdh ? s.pdh.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", color: C.rose, fontSize: 11 }}>
                        {s.pdl ? s.pdl.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", color: C.cyan, fontSize: 11 }}>
                        {s.ema20 ? s.ema20.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", color: "#6abaff", fontSize: 11 }}>
                        {s.ema50 ? s.ema50.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", fontSize: 11 }}>
                        <span style={{ color: C.green }}>{s.high?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "—"}</span>
                        <span style={{ color: C.muted }}> / </span>
                        <span style={{ color: C.rose }}>{s.low?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "—"}</span>
                      </td>
                      <td style={{ padding: "9px 8px", fontFamily: "monospace", color: C.muted, fontSize: 11 }}>
                        {s.volume ? (s.volume >= 1e7 ? (s.volume / 1e7).toFixed(1) + "Cr" : s.volume >= 1e5 ? (s.volume / 1e5).toFixed(1) + "L" : (s.volume / 1e3).toFixed(0) + "K") : "—"}
                      </td>
                      <td style={{ padding: "9px 8px", borderRadius: "0 6px 6px 0" }}>
                        <Sparkline data={s.sparkline} color={up ? C.green : C.rose} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Alert log */}
          {alerts.length > 0 && (
            <div style={{ margin: "18px 18px 0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div style={{
                padding: "9px 14px", borderBottom: `1px solid ${C.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontWeight: 700, color: C.textBright, fontSize: 12 }}>⚡ PDH/PDL Alerts ({alerts.length})</span>
                <button onClick={() => setAlerts([])} style={{
                  background: "none", border: `1px solid ${C.border}`, color: C.muted,
                  borderRadius: 4, padding: "3px 9px", fontSize: 10, cursor: "pointer",
                }}>Clear</button>
              </div>
              <div style={{ maxHeight: 190, overflowY: "auto" }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "7px 14px", borderBottom: `1px solid ${C.border}40`, fontSize: 11,
                  }}>
                    <span style={{ color: a.type === "PDH" ? C.amber : C.rose, fontWeight: 800, minWidth: 110, fontFamily: "monospace" }}>
                      {a.type === "PDH" ? "▲ PDH" : "▼ PDL"} · {a.tf === "15m" ? "15m" : "1m+Vol"}
                    </span>
                    <span style={{ color: C.textBright, fontWeight: 700, minWidth: 100, fontFamily: "monospace" }}>{a.symbol}</span>
                    <span style={{ color: C.muted }}>₹{a.price?.toFixed(2)}</span>
                    <span style={{ color: C.muted }}>· {a.type} ₹{a.level?.toFixed(2)}</span>
                    {a.tf === "1m+vol" && <span style={{ color: C.muted }}>· vol {a.vol?.toLocaleString("en-IN")} (avg {Math.round(a.avgVol || 0).toLocaleString("en-IN")})</span>}
                    <span style={{ marginLeft: "auto", color: C.muted, fontFamily: "monospace" }}>{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ margin: "14px 18px 0", fontSize: 10, color: C.border, textAlign: "center" }}>
            ⚠ Data via Yahoo Finance (15-min delayed during market hours). For real-time tick data, use a broker API.
          </div>
        </>
      )}

      <AlertToast alerts={alerts} onDismiss={i => setAlerts(a => a.filter((_, j) => j !== i))} />
    </div>
  );
}
