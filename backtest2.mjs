/**
 * Backtest v2: PDH/PDL breakout on 5m OR 15m timeframe, NO EMA trend filter
 *              required for entry (EMA values are still recorded on each
 *              trade for reference). Exit = 1m EMA50 crossover.
 *
 * Universe: full constituents of the major NSE sectoral indices (Auto, IT,
 * Bank, PSU Bank, Private Bank, Metal, Pharma, FMCG, Energy, Realty, Media,
 * Healthcare, Oil & Gas, Consumer Durables, Financial Services) instead of
 * a fixed 40-stock list — so results can be ranked by sector and by stock
 * to find the highest win-rate names.
 *
 * NOTE: sector constituents shift at NSE's semi-annual rebalancing
 * (Jan 31 / Jul 31 cutoff). Double-check against niftyindices.com if a
 * symbol looks stale — a couple of very recently renamed/demerged tickers
 * (e.g. Tata Motors' 2025 CV/PV split) were deliberately left out here
 * since their Yahoo ticker wasn't confirmed.
 *
 * Run:  node backtest2.mjs
 * Needs Node 18+ (built-in fetch). No npm install required.
 *
 * DATA LIMIT: Yahoo only serves 1-minute candles for ~the last 25-30 days
 * (this script stitches 7-day windows to cover DAYS_BACK days). Daily/5m/15m
 * data goes back much further, but trades outside the 1m window are skipped
 * since the exit logic depends on 1m bars.
 */

// ── Sectoral universe ────────────────────────────────────────────────────
const SECTORS = {
  NIFTY_AUTO: ["MARUTI","M&M","BAJAJ-AUTO","EICHERMOT","TVSMOTOR","TATAMOTORS","HEROMOTOCO","ASHOKLEY","BOSCHLTD","BHARATFORG","MOTHERSON","TIINDIA","UNOMINDA","BALKRISIND","MRF"],
  NIFTY_IT: ["TCS","INFY","HCLTECH","WIPRO","TECHM","LTIM","PERSISTENT","COFORGE","MPHASIS","OFSS"],
  NIFTY_BANK: ["HDFCBANK","ICICIBANK","SBIN","KOTAKBANK","AXISBANK","INDUSINDBK","FEDERALBNK","BANKBARODA","PNB","AUBANK","IDFCFIRSTB","BANDHANBNK"],
  NIFTY_PSU_BANK: ["SBIN","BANKBARODA","PNB","CANBK","UNIONBANK","INDIANB","BANKINDIA","MAHABANK","CENTRALBK","IOB","UCOBANK","PSB"],
  NIFTY_PVT_BANK: ["HDFCBANK","ICICIBANK","KOTAKBANK","AXISBANK","INDUSINDBK","FEDERALBNK","IDFCFIRSTB","AUBANK","RBLBANK","BANDHANBNK","YESBANK","CSBBANK"],
  NIFTY_METAL: ["TATASTEEL","HINDALCO","JSWSTEEL","ADANIENT","VEDL","JINDALSTEL","APLAPOLLO","NATIONALUM","HINDZINC","SAIL","NMDC","RATNAMANI","WELCORP","JSL"],
  NIFTY_PHARMA: ["SUNPHARMA","DIVISLAB","DRREDDY","TORNTPHARM","LAURUSLABS","AUROPHARMA","GLENMARK","ALKEM","CIPLA","LUPIN","ZYDUSLIFE","MANKIND","ABBOTINDIA","BIOCON"],
  NIFTY_FMCG: ["HINDUNILVR","ITC","NESTLEIND","TATACONSUM","BRITANNIA","VBL","MARICO","UNITDSPR","GODREJCP","DABUR","COLPAL","EMAMILTD"],
  NIFTY_ENERGY: ["RELIANCE","NTPC","POWERGRID","ONGC","COALINDIA","BPCL","IOC","GAIL","TATAPOWER","ADANIGREEN","ADANIENSOL","JSWENERGY","NHPC","SJVN"],
  NIFTY_REALTY: ["DLF","GODREJPROP","OBEROIRLTY","PRESTIGE","PHOENIXLTD","LODHA","BRIGADE","SOBHA","MAHLIFE","SUNTECK"],
  NIFTY_MEDIA: ["ZEEL","SUNTV","PVRINOX","NETWORK18","TV18BRDCST","NAZARA","SAREGAMA","DISHTV"],
  NIFTY_HEALTHCARE: ["APOLLOHOSP","MAXHEALTH","FORTIS","LALPATHLAB","METROPOLIS","GLENMARK","SYNGENE","KIMS"],
  NIFTY_OIL_AND_GAS: ["RELIANCE","ONGC","IOC","BPCL","GAIL","HINDPETRO","OIL","PETRONET","MGL","IGL","GUJGASLTD"],
  NIFTY_CONSR_DURBL: ["TITAN","HAVELLS","VOLTAS","CROMPTON","DIXON","VGUARD","WHIRLPOOL","BLUESTARCO","BATAINDIA","KAJARIACER","CERA"],
  NIFTY_FIN_SERVICE: ["HDFCBANK","ICICIBANK","SBIN","BAJFINANCE","KOTAKBANK","AXISBANK","BAJAJFINSV","SBILIFE","HDFCLIFE","SHRIRAMFIN","CHOLAFIN","PFC","RECLTD","ICICIGI","ICICIPRULI","MUTHOOTFIN"],
};

// Build a flat unique symbol list + symbol -> [sectors] map
const symbolSectors = {};
for (const [sector, syms] of Object.entries(SECTORS)) {
  for (const s of syms) (symbolSectors[s] ||= []).push(sector);
}
const STOCKS = Object.keys(symbolSectors);

const DAYS_BACK = 28;
const EMA_1M_PERIOD = 50;
const BATCH_SIZE = 5; // keep modest — ~145 symbols x 3 endpoints each strains Yahoo/rate limits

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// ── Fetch helpers ────────────────────────────────────────────────────────
async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.json();
}

async function fetchDaily(symbol) {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}.NS?interval=1d&range=1y`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("no daily data");
  const ts = result.timestamp || [];
  const q = result.indicators.quote[0];
  const days = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] == null) continue;
    days.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), high: q.high[i], low: q.low[i], close: q.close[i] });
  }
  return days;
}

async function fetchIntradayTF(symbol, interval, range) {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}.NS?interval=${interval}&range=${range}`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const ts = result.timestamp || [];
  const q = result.indicators.quote[0];
  return ts.map((t, i) => ({ time: t, close: q.close[i] })).filter(b => b.close != null);
}

async function fetch1mHistory(symbol, daysBack) {
  const bars = [];
  const now = Math.floor(Date.now() / 1000);
  const chunkSecs = 7 * 24 * 60 * 60;
  let windowEnd = now, daysCovered = 0;
  while (daysCovered < daysBack) {
    const windowStart = windowEnd - chunkSecs;
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}.NS?interval=1m&period1=${windowStart}&period2=${windowEnd}`;
    try {
      const json = await fetchJson(url);
      const result = json?.chart?.result?.[0];
      if (result) {
        const ts = result.timestamp || [];
        const q = result.indicators.quote[0];
        for (let i = 0; i < ts.length; i++) if (q.close[i] != null) bars.push({ time: ts[i], close: q.close[i] });
      }
    } catch { break; }
    windowEnd = windowStart;
    daysCovered += 7;
  }
  bars.sort((a, b) => a.time - b.time);
  return bars;
}

function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) { ema = values[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}

function groupByISTDate(bars) {
  const byDate = {};
  for (const b of bars) {
    const d = new Date(b.time * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    (byDate[d] ||= []).push(b);
  }
  for (const d in byDate) byDate[d].sort((a, b) => a.time - b.time);
  return byDate;
}

// ── Backtest one symbol across both timeframes ──────────────────────────
async function backtestSymbol(symbol) {
  const [daily, bars5m, bars15m, bars1m] = await Promise.all([
    fetchDaily(symbol),
    fetchIntradayTF(symbol, "5m", "60d"),
    fetchIntradayTF(symbol, "15m", "60d"),
    fetch1mHistory(symbol, DAYS_BACK),
  ]);
  if (daily.length < 25 || bars1m.length === 0) return [];

  const closes = daily.map(d => d.close);
  const ema20Series = emaSeries(closes, 20);
  const ema50Series = emaSeries(closes, 50);
  const dateIndex = {};
  daily.forEach((d, i) => (dateIndex[d.date] = i));

  const bars1mByDate = groupByISTDate(bars1m);
  const bars5mByDate = groupByISTDate(bars5m);
  const bars15mByDate = groupByISTDate(bars15m);
  const earliestDateWith1m = Object.keys(bars1mByDate).sort()[0];
  if (!earliestDateWith1m) return [];

  const trades = [];

  function findEntry(dayBars, pdh, pdl) {
    for (const b of dayBars) {
      if (b.close > pdh) return { dir: "LONG", time: b.time, price: b.close };
      if (b.close < pdl) return { dir: "SHORT", time: b.time, price: b.close };
    }
    return null;
  }

  function simulateExit(dayBars1m, entry) {
    const closes1m = dayBars1m.map(b => b.close);
    const ema1m = emaSeries(closes1m, EMA_1M_PERIOD);
    const entryIdx = dayBars1m.findIndex(b => b.time >= entry.time);
    if (entryIdx === -1) return null;
    for (let j = entryIdx + 1; j < dayBars1m.length; j++) {
      const emaVal = ema1m[j];
      if (emaVal == null) continue;
      const price = dayBars1m[j].close;
      if (entry.dir === "LONG" && price < emaVal) return { time: dayBars1m[j].time, price, reason: "EMA cross" };
      if (entry.dir === "SHORT" && price > emaVal) return { time: dayBars1m[j].time, price, reason: "EMA cross" };
    }
    const last = dayBars1m[dayBars1m.length - 1];
    return { time: last.time, price: last.close, reason: "EOD" };
  }

  for (let i = 1; i < daily.length; i++) {
    const prevDay = daily[i - 1];
    const today = daily[i];
    if (today.date < earliestDateWith1m) continue;
    if (!bars1mByDate[today.date]) continue;

    const pdh = prevDay.high, pdl = prevDay.low;
    const ema20 = ema20Series[i - 1], ema50 = ema50Series[i - 1]; // recorded for reference only, not a filter

    for (const [tf, byDate] of [["5m", bars5mByDate], ["15m", bars15mByDate]]) {
      const dayBars = byDate[today.date];
      if (!dayBars || dayBars.length === 0) continue;
      const entry = findEntry(dayBars, pdh, pdl);
      if (!entry) continue;

      const dayBars1m = bars1mByDate[today.date];
      if (dayBars1m.length < EMA_1M_PERIOD + 1) continue;
      const exit = simulateExit(dayBars1m, entry);
      if (!exit) continue;

      const pnlPct = entry.dir === "LONG"
        ? ((exit.price - entry.price) / entry.price) * 100
        : ((entry.price - exit.price) / entry.price) * 100;

      trades.push({
        symbol, sectors: symbolSectors[symbol].join("|"), date: today.date, tf, dir: entry.dir,
        entryTime: new Date(entry.time * 1000).toISOString(), entryPrice: +entry.price.toFixed(2),
        exitTime: new Date(exit.time * 1000).toISOString(), exitPrice: +exit.price.toFixed(2),
        exitReason: exit.reason, pnlPct: +pnlPct.toFixed(2),
        ema20: ema20 ? +ema20.toFixed(2) : null, ema50: ema50 ? +ema50.toFixed(2) : null,
      });
    }
  }
  return trades;
}

// ── Run + rank ───────────────────────────────────────────────────────────
async function run() {
  console.log(`Backtesting ${STOCKS.length} unique stocks across ${Object.keys(SECTORS).length} sectors...\n`);
  const allTrades = [];
  for (let i = 0; i < STOCKS.length; i += BATCH_SIZE) {
    const batch = STOCKS.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async sym => {
      try { return await backtestSymbol(sym); }
      catch (e) { console.error(`  ✗ ${sym}: ${e.message}`); return []; }
    }));
    results.forEach((trades, idx) => {
      console.log(`  ✓ ${batch[idx]}: ${trades.length} trades`);
      allTrades.push(...trades);
    });
  }

  // ── Rank by symbol ──────────────────────────────────────────────────
  const bySymbol = {};
  for (const t of allTrades) (bySymbol[t.symbol] ||= []).push(t);
  const symbolStats = Object.entries(bySymbol).map(([symbol, trades]) => {
    const wins = trades.filter(t => t.pnlPct > 0).length;
    const totalPnl = trades.reduce((a, t) => a + t.pnlPct, 0);
    return {
      symbol, sectors: symbolSectors[symbol].join("|"), trades: trades.length,
      winRate: +((wins / trades.length) * 100).toFixed(1),
      avgPnl: +(totalPnl / trades.length).toFixed(2),
      totalPnl: +totalPnl.toFixed(2),
    };
  }).filter(s => s.trades >= 3) // ignore symbols with too few trades to be meaningful
    .sort((a, b) => b.winRate - a.winRate || b.avgPnl - a.avgPnl);

  console.log("\n─── Top 15 stocks by win rate (min 3 trades) ───────────────");
  symbolStats.slice(0, 15).forEach(s =>
    console.log(`${s.symbol.padEnd(14)} ${String(s.trades).padStart(3)} trades  winRate ${String(s.winRate).padStart(5)}%  avgPnl ${s.avgPnl >= 0 ? "+" : ""}${s.avgPnl}%  [${s.sectors}]`)
  );

  // ── Rank by sector (average across its member stocks' trades) ──────
  const bySector = {};
  for (const t of allTrades) {
    for (const sec of t.sectors.split("|")) (bySector[sec] ||= []).push(t);
  }
  const sectorStats = Object.entries(bySector).map(([sector, trades]) => {
    const wins = trades.filter(t => t.pnlPct > 0).length;
    return {
      sector, trades: trades.length,
      winRate: +((wins / trades.length) * 100).toFixed(1),
      avgPnl: +(trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length).toFixed(2),
    };
  }).sort((a, b) => b.winRate - a.winRate);

  console.log("\n─── Sectors ranked by win rate ──────────────────────────────");
  sectorStats.forEach(s =>
    console.log(`${s.sector.padEnd(20)} ${String(s.trades).padStart(4)} trades  winRate ${String(s.winRate).padStart(5)}%  avgPnl ${s.avgPnl >= 0 ? "+" : ""}${s.avgPnl}%`)
  );

  // ── Overall + save ───────────────────────────────────────────────────
  const wins = allTrades.filter(t => t.pnlPct > 0).length;
  console.log("\n─── Overall ─────────────────────────────────────────────────");
  console.log(`Total trades: ${allTrades.length}  |  Win rate: ${allTrades.length ? ((wins / allTrades.length) * 100).toFixed(1) : 0}%`);

  const fs = await import("fs");
  fs.writeFileSync("backtest2_trades.json", JSON.stringify(allTrades, null, 2));
  fs.writeFileSync("backtest2_symbol_ranking.json", JSON.stringify(symbolStats, null, 2));
  fs.writeFileSync("backtest2_sector_ranking.json", JSON.stringify(sectorStats, null, 2));
  const csvHeader = "symbol,sectors,date,tf,dir,entryTime,entryPrice,exitTime,exitPrice,exitReason,pnlPct,ema20,ema50\n";
  const csvRows = allTrades.map(t => [t.symbol, t.sectors, t.date, t.tf, t.dir, t.entryTime, t.entryPrice, t.exitTime, t.exitPrice, t.exitReason, t.pnlPct, t.ema20, t.ema50].join(",")).join("\n");
  fs.writeFileSync("backtest2_trades.csv", csvHeader + csvRows);
  console.log("\nSaved: backtest2_trades.json/.csv, backtest2_symbol_ranking.json, backtest2_sector_ranking.json");
}

run();
