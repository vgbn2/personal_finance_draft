export const MKTS = [
  {n:"BTC above $100k by Dec 2025?",cat:"BTC",  y:72.4,vol:88,liq:"$2.1M", sig:"BUY YES",sc:"sb",bs:0.681,kelly:0.048},
  {n:"Fed cuts rates Sept 2025?",   cat:"Macro", y:58.1,vol:61,liq:"$890K", sig:"HOLD",   sc:"sh",bs:0.601,kelly:0.021},
  {n:"Elon tweets about DOGE today?",cat:"Tweet",y:33.2,vol:44,liq:"$412K", sig:"BUY NO", sc:"ss",bs:0.288,kelly:0.031},
  {n:"ETH flippening BTC in 2025?", cat:"BTC",  y:11.7,vol:28,liq:"$210K", sig:"BUY NO", sc:"ss",bs:0.094,kelly:0.015},
  {n:"BTC above $80k month end?",   cat:"BTC",  y:49.9,vol:55,liq:"$1.4M", sig:"HOLD",   sc:"sh",bs:0.512,kelly:0.009},
  {n:"US recession Q1 2026?",       cat:"Macro", y:18.4,vol:32,liq:"$330K", sig:"BUY YES",sc:"sb",bs:0.241,kelly:0.027},
  {n:"Trump tweets 3x in one day?", cat:"Tweet", y:61.0,vol:70,liq:"$550K", sig:"BUY YES",sc:"sb",bs:0.648,kelly:0.035},
  {n:"S&P 500 new ATH in 2025?",    cat:"Macro", y:44.2,vol:50,liq:"$780K", sig:"HOLD",   sc:"sh",bs:0.438,kelly:0.011},
];

export let curFilter = "All";
export function setCurFilter(v) { curFilter = v; }
export let selMkt = null;
export function setSelMkt(m) { selMkt = m; }

export let mcN = 200;
export function setMcN(v) { mcN = v; }
export let mcVol = 30;
export function setMcVol(v) { mcVol = v; }
export let mcDays = 30;
export function setMcDays(v) { mcDays = v; }
export let shockActive = false;
export function setShockActive(v) { shockActive = v; }

export let portSize = 10000;
export function setPortSize(v) { portSize = v; }

export let btResults = null;
export function setBtResults(v) { btResults = v; }

export let logRunning = false;
export function setLogRunning(v) { logRunning = v; }
export let logIdx = 0;
export function incrementLogIdx() { logIdx++; }

export let syncCount = 0;
export function incrementSyncCount() { syncCount++; }

export let currentMode = "paper";
export function setCurrentMode(m) { currentMode = m; }
export let apiKey = null;
export function setApiKey(k) { apiKey = k; }
export let backoffMs = 50;
export function setBackoffMs(v) { backoffMs = v; }
export let retries = 0;
export function setRetries(v) { retries = v; }
export function incrementRetries() { retries++; }

export const bgBase = {d:.621,g:.0082,t:-14.32,v:42.1};

export let sessionPnL = 0;
export function updateSessionPnL(v) { sessionPnL += v; }

export const POSITIONS = [
  {mkt:'BTC above $100k Dec 2025', side:'YES', size:500, entry:0.668, cur:0.724, dte:284, kelly:0.048},
  {mkt:'Trump tweets 3x today',    side:'YES', size:200, entry:0.591, cur:0.610, dte:1,   kelly:0.035},
  {mkt:'Fed cuts rates Sept 25',   side:'NO',  size:300, entry:0.428, cur:0.419, dte:167, kelly:0.021},
  {mkt:'US recession Q1 2026',     side:'YES', size:150, entry:0.175, cur:0.184, dte:312, kelly:0.027},
  {mkt:'S&P 500 new ATH 2025',     side:'NO',  size:250, entry:0.568, cur:0.558, dte:284, kelly:0.011},
];

export const AUDIT_DATA = [
  {ts:'14:22:01', mkt:'BTC $100K YES',   bs:'0.681', mp:'0.724', edge:'+0.057', sp:'0.006', gA:'17.4%', gB:'8.2%',  gC:'5.0%', dec:'TAKER',  reason:'Edge ≥ taker threshold'},
  {ts:'14:21:44', mkt:'ETH Flip NO',     bs:'0.906', mp:'0.883', edge:'+0.023', sp:'0.008', gA:'17.4%', gB:'8.2%',  gC:'1.5%', dec:'MAKER',  reason:'Edge > buffer, post-only'},
  {ts:'14:20:11', mkt:'Fed Cuts YES',    bs:'0.601', mp:'0.581', edge:'+0.020', sp:'0.007', gA:'17.4%', gB:'14.8%', gC:'3.0%', dec:'GATED',  reason:'Gate B at 98.7% capacity'},
  {ts:'14:18:55', mkt:'S&P ATH YES',     bs:'0.438', mp:'0.499', edge:'-0.061', sp:'0.005', gA:'14.1%', gB:'6.1%',  gC:'3.0%', dec:'REJECT', reason:'Negative edge — market overpriced'},
  {ts:'14:17:30', mkt:'Trump Tweet YES', bs:'0.648', mp:'0.610', edge:'+0.038', sp:'0.009', gA:'14.1%', gB:'6.1%',  gC:'3.0%', dec:'TAKER',  reason:'Edge ≥ taker threshold'},
  {ts:'14:15:02', mkt:'Recession YES',   bs:'0.241', mp:'0.184', edge:'+0.057', sp:'0.012', gA:'11.2%', gB:'4.0%',  gC:'1.5%', dec:'MAKER',  reason:'High spread — maker only'},
  {ts:'14:12:18', mkt:'BTC $80K YES',    bs:'0.512', mp:'0.499', edge:'+0.013', sp:'0.006', gA:'11.2%', gB:'11.1%', gC:'3.0%', dec:'GATED',  reason:'Gate B temporal limit near'},
  {ts:'14:09:44', mkt:'Fed Cuts NO',     bs:'0.399', mp:'0.419', edge:'-0.020', sp:'0.007', gA:'9.8%',  gB:'9.8%',  gC:'3.0%', dec:'REJECT', reason:'Negative edge'},
];

export let auditFilter = 'ALL';
export function setAuditFilter(v) { auditFilter = v; }

export let stExecMode = 'AUTO';
export function setStExecMode(v) { stExecMode = v; }

export const LOG_MSGS = [
  ['INFO','Polymarket CLOB snapshot OK — depth <b>8 levels</b>'],['OK','Signal: <b>BUY YES</b> on BTC $100K market'],
  ['INFO','Binance WS heartbeat — latency <b>12ms</b>'],['WARN','Deribit lag <b>210ms</b> — above threshold'],
  ['INFO','MarketState aggregated — stale guard <b>PASS</b>'],['OK','MongoDB write OK — <b>txn_00441</b>'],
  ['INFO','Rate limiter: <b>42/100</b> req (Polymarket)'],['WARN','Orderbook skew on <b>ETH flip market</b>'],
  ['INFO','Greeks recalc — Δ=<b>0.621</b> Γ=<b>0.0082</b>'],['ERR','Alpha Vantage timeout — backoff <b>2s</b>'],
  ['OK','Retry OK — Fed Watch ingested'],['INFO','VPN bind confirmed: <b>0.0.0.0:8000</b>'],
  ['OK','WS reconnected — STATE_SYNC received <b>12 fields</b>'],['INFO','Strategy loop tick — <b>8 markets</b> evaluated'],
];
