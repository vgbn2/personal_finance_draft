import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput, useWindowSize } from 'ink';
import TextInput from 'ink-text-input';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CommandInput } from './tui/command_input.mjs';

const h = React.createElement;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require('#shared/runtime/env');
const {
  splitWords, isPlaceholderSelect, defaultFlagValues, cycleOption, buildArgv,
  optionLabel, loadStrategyOptions, healthDot, loadDashboardHealth, isInteractiveCmd,
  loadFullSymbolUniverse, buildSymbolPickerRows, groupValuesFor, toggleSet, firstSelectableIndex,
  readDaemonStatus, renderProgressBar,
} = require('./tui/dashboard_exec.js');
const { DAEMON_STATUS_PATH } = require('./commands/data/backfill_daemon.js');
const { parseChatInput, suggestCommands } = require('./tui/chat_parser.js');
const { resolveWithLLM } = require('./tui/chat_llm_fallback.js');
const { dashboardLayout, windowedRange } = require('./tui/dashboard_layout.js');

// Resolved once at module load (mirrors tui/manifest.js's static-per-process
// registry read); falls back to the manual-text-entry placeholder if the
// registry is empty or unreadable.
const STRATEGY_OPTIONS = loadStrategyOptions();
const STRATEGY_FLAG_OPTS = STRATEGY_OPTIONS.length > 0 ? STRATEGY_OPTIONS : ['<registered strategies>'];

// Reshaped into the same {symbol, category, sector} shape buildSymbolPickerRows
// expects, so `bt --strategy` can reuse the exact same picker overlay/keyboard
// handling as `pickSymbol` flags instead of a second hand-rolled UI (the
// strategy list is small and flat, so one synthetic category/sector is fine).
const STRATEGY_UNIVERSE = STRATEGY_OPTIONS.length > 0
  ? STRATEGY_OPTIONS.map((opt) => ({ symbol: opt.value, category: 'STRATEGY', sector: 'Registered' }))
  : [];

// Same family/market/sector-tagged universe the legacy TUI's pickAssets()
// wizard reads, resolved once at module load (top-level await -- a handful
// of fast local file reads, not network). That wizard is gated on
// isRichTerminal() and never fires against the dashboard's piped child
// spawns -- this powers a real in-dashboard picker overlay instead (see
// focus === 'symbolPicker' below): search-as-you-type, multi-select with
// per-symbol and per-category checkboxes, grouped by family/market/sector.
const SYMBOL_UNIVERSE = await loadFullSymbolUniverse();

const INTERACTIVE_CMDS = new Set([
  'cockpit',
  'polymarket markets',
  'polymarket derive-creds',
  'login',
  'register',
  'add-platform',
  'mt5',
  // 'trade favorites' / 'strategy' / 'prop-firms' / 'run' were here, but as
  // INTERACTIVE_CMDS they unmounted the whole Ink dashboard into the old
  // prompt-menu UI -- which read as "the trade section drops me into the
  // legacy interface". They each render a safe, read-only summary when run
  // non-interactively, so they now execute IN-PANE (output panel) like the
  // rest of the dashboard.
  // 'alpaca' was here too -- with no flags, it always hit commandTrade's
  // args.length===0 branch and fell into the multi-step interactive trade
  // wizard (action -> symbol -> qty -> order type -> live confirm), the
  // exact same "legacy" feel, just from a different code path. Now that the
  // manifest entry carries real --action/--symbol/--qty/--order-type/--live
  // flags (translated back to the wizard's own positional shape by
  // buildTradeArgsFromActionFlag in trade.js), it never reaches that branch
  // from here and runs in-pane like the rest of Trade. Only genuinely
  // input-driven entries (mt5, add-platform, login/register, the polymarket
  // wizards, cockpit) still take over the terminal.
]);
// 'bot' was previously blanket-listed here, forcing even cheap read-only
// subcommands through the slow unmount->spawnSync->remount round-trip.
// commandBot's only interactive picker (promptBotArgs) is gated on
// `args.length === 0`, and every dashboard `bot` subcmd entry always passes
// an explicit subcommand keyword -- so the picker is never reachable from
// here. Runs in-pane now; SOVEREIGN_NONINTERACTIVE is the backstop if that
// guard's assumption ever changes.

// ── Palette ──────────────────────────────────────────────────────────────
const CY  = '#4dd2d2';
const GN  = '#3fb950';
const AM  = '#d29922';
const RD  = '#f85149';
const YL  = '#e3b341';
const VAL = '#e6edf3';
const DIM = '#8b949e';
const MUT = '#6e7681';
const BDR = '#30363d';
const DOT_COLOR = { good: '#3fb950', warn: '#d29922', bad: '#f85149' }; // GN/AM/RD by tone

// ── Manifest (inlined from manifest.js) ─────────────────────────────────
const M = [
  {
    label: 'Operational', full: 'OPERATIONAL DASHBOARD & HEALTH',
    cmds: [
      { id: 'status',      label: 'status',      desc: 'System health snapshot',           flags: {} },
      { id: 'cockpit',     label: 'cockpit',      desc: 'Terminal dashboard', flags: {} },
      { id: 'watch',       label: 'watch',        desc: 'Live data feed, polls every N min',// took long to boot,require a press of the esc key to reveal,ruin the interface in here, can this be replace by charting? references for charting  C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\terminus,C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\_resources\lightweight-charts dev suggest -- RESOLVED: raw cursor-control output piped into the dashboard panel is now TTY-guarded (no more garbled output); added an optional --symbol live-chart mode reusing renderPriceChart() and narrowing ingest to just that symbol (much faster boot than the whole-family fetch). terminus/lightweight-charts had no reusable Node-TUI pattern. Pending user confirmation.
        flags: {
          '--family':    { t:'sel', opts:['all','crypto','fx','equities','indices','commodities'], lbl:'Data family', def:'all' },
          '--interval':  { t:'txt', lbl:'Poll interval (minutes)', def:'15' },
          '--symbol':    { t:'txt', lbl:'Symbol for live chart mode', def:'', pickSymbol:'single' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m','5m','1m'], lbl:'Timeframes', def:'1d' },
        },
      },
      { id: 'cache-clean', label: 'cache-clean',  desc: 'Quarantine rejected cache records',
        flags: {
          '--dry-run': { t:'yn', lbl:'Preview only? (no deletion)', def:true, warn:true },
        },
      },
      { id: 'kill-switch', label: 'kill-switch', desc: 'Safety kill switch (engage, disengage, status)',
        flags: {
          '--action': { t:'sel', opts:['status','engage','disengage'], lbl:'Action', def:'status' },
          '--reason': { t:'txt', lbl:'Reason', def:'manual_tui_trigger' },
        },
      },
    ],
  },
  {
    label: 'Data', full: 'DATA & BACKFILL',
    cmds: [
      { id: 'backend integrity', label: 'integrity', desc: 'Per-symbol freshness & coverage report',
        flags: {
          '--audit-vintages': { t:'yn', lbl:'Only show vintage anomalies?', def:false },
        },
      },
      { id: 'ingest', label: 'ingest', desc: 'Fetch latest market data',//load too long,require a press of the esc key to reveal, is this redundant?, dev question, 
        flags: {
          '--family':       { t:'sel', opts:['all','crypto','fx','equities','indices','commodities','macro','prediction_market'], lbl:'Data family', def:'all' },
          '--symbol':       { t:'txt', lbl:'Symbol filter (optional)', def:'', pickSymbol:'single' },
          '--timeframe':    { t:'sel', opts:['1w','1d','1h','15m'], lbl:'Timeframe', def:'1h' },
          '--history-days': { t:'txt', lbl:'History days (blank = latest only)', def:'' },
        },
      },
      { id: 'backfill-daemon', label: 'backfill-daemon', desc: 'Deep history backfill across all symbols',
        flags: {
          '--once':          { t:'yn',  lbl:'Run once (no daemon loop)?', def:true },
          '--deep-all':      { t:'yn',  lbl:'Full rebuild? (force, ignore freshness)', def:false },
          '--families':      { t:'txt', lbl:'Families comma-sep (blank = all)', def:'' },
          '--symbols':       { t:'txt', lbl:'Symbols comma-sep (blank = all in family)', def:'', pickSymbol:'multi' },
          '--concurrency':   { t:'txt', lbl:'Symbols in parallel per provider', def:'5' },
          '--interval-secs': { t:'txt', lbl:'Loop interval seconds (daemon mode only)', def:'1800' },
        },
      },
      { id: 'stop-backfill-daemon', label: 'stop-backfill-daemon', desc: 'Stop the background backfill daemon', flags: {} },
      { id: 'intraday-rollup', label: 'intraday-rollup', desc: 'Derive coarser bins from 1m/5m base',//same backgroud action like backfill-daemon, dev suggest -- RESOLVED: confirmed backfill_daemon.js calls rollupFromBase every cycle; this command stays as the manual/recovery path, not a duplicate. Desc updated 2026-06-22, pending user confirmation.
        flags: {
          '--family':     { t:'sel', opts:['all','crypto','equities'], lbl:'Family', def:'all' },
          '--symbols':    { t:'txt', lbl:'Symbol filter comma-sep (blank = all)', def:'' },
          '--timeframes': { t:'txt', lbl:'Target timeframes to derive', def:'15m,30m,1h,4h' },
        },
      },
      { id: 'clear-api-cache', label: 'clear-api-cache', desc: 'Delete provider API response cache',
        flags: {
          '--dry-run':   { t:'yn',  lbl:'Preview only (no deletion)?', def:true, warn:true },
          '--ts':        { t:'yn',  lbl:'Also delete ts/ candle bins?', def:false },
          '--symbol':    { t:'txt', lbl:'Symbol filter for ts/ bins', def:'', pickSymbol:'single' },
          '--timeframe': { t:'txt', lbl:'Timeframe filter for ts/ bins', def:'' },
        },
      },
    ],
  },
  {
    label: 'Backend', full: 'BACKEND TOOLS (C++)',
    cmds: [
      { id: 'backend status',      label: 'status',      desc: 'C++ backend health check', flags: {} },//is this redundant?, dev question -- RESOLVED: not redundant, status.js documents it as a separate complementary command to top-level `status` (different layer: C++ backend vs overall system). Pending user confirmation.
      { id: 'backend stats',       label: 'stats',       desc: 'Equity-curve stats from a CSV/backtest file', flags: {} },//is this redundant?, dev question -- RESOLVED: `bt` already prints Sharpe/vol/cum-return for its own run, so this is redundant for that common case; its real value is computing stats on an arbitrary external --equity curve, which `bt` can't do. Desc updated 2026-06-22, pending user confirmation.
      { id: 'backend correlation', label: 'correlation', desc: 'Correlation matrix → heatmap',
        flags: {
          '--symbols':          { t:'txt', lbl:'Symbols comma-sep, min 2 (blank = default equities)', def:'', pickSymbol:'multi' },
          '--timeframe':        { t:'sel', opts:['1d','1h','4h','15m','5m','1m'], lbl:'Timeframe', def:'1d' },
          '--max-bars':         { t:'txt', lbl:'Lookback period (bars)', def:'252' },
          '--method':           { t:'sel', opts:['auto','pearson-returns','fx-returns','pearson-levels'], lbl:'Correlation method', def:'auto' },
          '--drop-non-overlap': { t:'yn',  lbl:'Drop non-overlapping symbols auto?', def:false },
        },
      },
      { id: 'backend visualize', label: 'visualize', desc: 'Sigma band live view',//force ingest if lacking in bars, dev suggest -- RESOLVED: backend_visualize.js now runs one ingestMarketData() retry on insufficient bars before erroring. Pending user confirmation.
        flags: {
          '--symbol':    { t:'txt', lbl:'Symbol to visualize (required)', def:'', pickSymbol:'single' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m','5m'], lbl:'Timeframe', def:'1d' },
          '--window':    { t:'txt', lbl:'Rolling window (bars)', def:'20' },
          '--interval':  { t:'txt', lbl:'Poll interval (seconds)', def:'30' },
          '--no-poll':   { t:'yn',  lbl:'One-shot (no live poll)?', def:false },
        },
      },
      { id: 'backend universe', label: 'universe', desc: 'Cached symbol inventory (all families)', flags: {} },
      { id: 'risk', label: 'risk check', desc: 'Pre-trade risk limit check (C++ core)',
        flags: {
          '--notional':     { t:'txt', lbl:'Order Notional ($)', def:'100' },
          '--equity':       { t:'txt', lbl:'Account Equity ($)', def:'10000' },
          '--drawdown':     { t:'txt', lbl:'Current Drawdown (0.02 = 2%)', def:'0.02' },
          '--max-drawdown': { t:'txt', lbl:'Max Allowed Drawdown (0.15 = 15%)', def:'0.15' },
        },
      },
      // Appended after 'backend universe' deliberately, not next to 'backend
      // visualize' above -- sovereign_dashboard.test.js hardcodes initialCmdI:4
      // for 'backend universe' (its real, fast, deterministically-long output
      // is used to test panel scrolling); inserting earlier in this list would
      // have silently shifted that index and broken an unrelated test.
      { id: 'backend chart', label: 'chart', desc: 'OHLCV price chart',// type-to-edit + width auto-clamp fixed 2026-06-22. Candlestick/SMA/volume upgrade DONE 2026-06-22 (s55): --style candle renders OHLC body+wick, --sma/--volume add the overlay + subplot, all via renderCandlestickChart() (visualizations.js).
        flags: {
          '--symbol':    { t:'txt', lbl:'Symbol to chart (required)', def:'', pickSymbol:'single' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m','5m','1m'], lbl:'Timeframe', def:'1d' },
          '--style':     { t:'sel', opts:['line','candle'], lbl:'Chart style', def:'line' },
          '--sma':       { t:'txt', lbl:'SMA overlay period', def:'' },
          '--volume':    { t:'yn',  lbl:'Volume (candle only)' },
          '--bars':      { t:'txt', lbl:'Bars to show (most recent N)', def:'200' },
        },
      },
    ],
  },
  {
    label: 'Research', full: 'RESEARCH & BACKTESTING',
    cmds: [
      { id: 'features', label: 'features', desc: 'Compute rolling indicator feature frame',
        flags: {
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
        },
      },
      { id: 'bt', label: 'bt', desc: 'Backtest trust gate, prop-firm fit',
        flags: {
          '--strategy':       { t:'sel', opts:STRATEGY_FLAG_OPTS, lbl:'Strategy file', def:'', pickStrategy:'single' },//i want to be able to choose strategies like choosing sym,bols, dev review -- RESOLVED: added pickStrategy:'single', reuses the same symbol-picker overlay (STRATEGY_UNIVERSE). Pending user confirmation.
          '--symbol':         { t:'txt', lbl:'Symbols comma-sep (blank = strategy universe)', def:'', pickSymbol:'multi' },
          '--timeframe':      { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
          '--days':           { t:'txt', lbl:'History window (days)', def:'730' },
          '--allow-degraded': { t:'yn',  lbl:'Allow degraded data quality?', def:false },
        },
      },
      { id: 'mass-bt', label: 'mass-bt', desc: 'Mass Backtest Matrix (All Strategies x All TFs)',
        flags: {
          '--timeframes':        { t:'txt', lbl:'Timeframes filter', def:'5m,15m,30m,1h,4h,1d' },
          '--position-size-pct': { t:'txt', lbl:'Position allocation (0.01 - 1.0)', def:'0.1' },
          '--days':              { t:'txt', lbl:'History window (days, 0 = max)', def:'0' },
          '--allow-degraded':    { t:'yn',  lbl:'Allow degraded data?', def:true },
        },
      },
      { id: 'optimize', label: 'optimize', desc: 'Indicator period grid',
        flags: {
          '--strategy':  { t:'sel', opts:STRATEGY_FLAG_OPTS, lbl:'Strategy file', def:'' },
          '--symbol':    { t:'txt', lbl:'Symbols comma-sep (blank = strategy universe)', def:'', pickSymbol:'multi' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
        },
      },
      { id: 'sweep', label: 'sweep', desc: 'Research-only proxy sweep: validation selection + untouched holdout',
        flags: {
          '--symbols':    { t:'txt', lbl:'Symbols comma-sep or all', def:'all', pickSymbol:'multi' },
          '--timeframes': { t:'txt', lbl:'Timeframes comma-sep or all', def:'all' },
          '--top-k':      { t:'txt', lbl:'Leaderboard rows', def:'20' },
        },
      },
      { id: 'edge-decay', label: 'edge-decay', desc: 'Rolling window alpha decay check',
        flags: {
          '--strategy':  { t:'sel', opts:STRATEGY_FLAG_OPTS, lbl:'Strategy file', def:'' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
          '--symbol':    { t:'txt', lbl:'Symbol filter (optional)', def:'', pickSymbol:'single' },
        },
      },
      { id: 'bias', label: 'bias', desc: 'Multi-timeframe TA signal (VWAP, VP, HMM, Wyckoff)',
        flags: {
          '--symbol':       { t:'txt', lbl:'Symbol (default BTCUSDT)', def:'BTCUSDT', pickSymbol:'single' },
          '--no-backfill':  { t:'yn',  lbl:'Skip auto-backfill?', def:false },
        },
      },
      { id: 'scorecard', label: 'scorecard', desc: 'EdgeFinder-style ranked bias across all assets',
        flags: {
          '--schema':      { t:'sel', opts:['2','3'], lbl:'Schema (3 = research shadow)', def:'2' },
          '--fixture':     { t:'sel', opts:['','aapl-recorded','all-recorded'], lbl:'Schema 3 fixture', def:'' },
          '--symbol':      { t:'txt', lbl:'Schema 3 workbench symbol', def:'', pickSymbol:'single' },
          '--state':       { t:'sel', opts:['','eligible','degraded','excluded'], lbl:'Schema 3 decision state', def:'' },
          '--family':      { t:'sel', opts:['','crypto','equities','fx','indices','commodities'], lbl:'Family filter (blank = all)', def:'' },
          '--tf':          { t:'txt', lbl:'Timeframes comma-sep', def:'1h,4h,1d' },
          '--direction':   { t:'sel', opts:['','long','short','neutral'], lbl:'Direction filter (blank = all)', def:'' },
          '--min-conf':    { t:'txt', lbl:'Min confidence (0–1)', def:'0.3' },
          '--top':         { t:'txt', lbl:'Max rows', def:'50' },
          '--allow-degraded': { t:'yn', lbl:'Allow partial timeframe coverage?', def:false },
          '--no-backfill': { t:'yn',  lbl:'Skip auto-backfill?', def:true },
        },
      },
    ],
  },
  {
    label: 'AI', full: 'AI & MACHINE LEARNING',
    cmds: [
      { id: 'ml-predict', label: 'ml-predict', desc: 'ML ONNX Model Batch Inference (C++ core)',
        flags: {
          '--input': { t:'txt', lbl:'Feature frame CSV path (blank = default)', def:'' },
        },
      },
      { id: 'ml-compare', label: 'ml-compare', desc: 'ML Model Parity & Accuracy Compare',
        flags: {
          '--input': { t:'txt', lbl:'Feature frame CSV path (blank = default)', def:'' },
        },
      },
      { id: 'models', label: 'models', desc: 'Model comparison & quality gate',
        flags: {
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
        },
      },
      { id: 'agent', label: 'agent', desc: 'AI agent task runner (local Ollama)',
        flags: {
          '--query': { t:'txt', lbl:'Task for the agent', def:'' },
        },
      },
    ],
  },
  {
    label: 'Trade', full: 'EXECUTION & TRADING',
    cmds: [
      { id: 'alpaca',       label: 'alpaca',       desc: 'Alpaca REST broker (US equities & crypto)',
        flags: {
          '--action':     { t:'sel', opts:['balance','aggregate_portfolio','favorites','buy','sell'], lbl:'Action', def:'balance' },
          '--symbol':     { t:'txt', lbl:'Symbol (buy/sell)', def:'', pickSymbol:'single' },
          '--qty':        { t:'txt', lbl:'Quantity (buy/sell)', def:'1' },
          '--order-type': { t:'sel', opts:['market','limit'], lbl:'Order type (buy/sell)', def:'market' },
          '--price':      { t:'txt', lbl:'Limit price (order-type=limit)', def:'' },
          '--pin':        { t:'txt', lbl:'Trade PIN (if SOVEREIGN_TRADE_PIN is set)', def:'' },
          '--live':       { t:'yn',  lbl:'⚠ EXECUTE LIVE TRADE?', def:false, warn:true },
        },
      },
      { id: 'mt5',          label: 'mt5',          desc: 'MT5 / EA terminal (forex, CFDs, futures)', flags: {} },
      { id: 'add-platform', label: 'add-platform', desc: '+ Add broker / trading platform wizard', flags: {} },
      { id: 'trade favorites', label: 'favorites',    desc: 'View / manage favourite symbols', flags: {} },
      { id: 'auto-trade',   label: 'auto-trade',   desc: 'Automated strategy execution loop',
        flags: {
          '--interval': { t:'txt', lbl:'Interval (minutes)', def:'15' },
          '--live':     { t:'yn',  lbl:'⚠ EXECUTE LIVE TRADES?', def:false, warn:true },
        },
      },
      { id: 'auto-trade status', label: 'positions', desc: 'Open auto-trade positions, live P&L, recent exits',
        flags: {
          '--live': { t:'yn', lbl:'Query LIVE account (vs paper)?', def:false },
        },
      },
      { id: 'agent',      label: 'agent',      desc: 'AI agent task runner (local Ollama)',
        flags: {
          '--query': { t:'txt', lbl:'Task for the agent', def:'' },
        },
      },
      { id: 'strategy',   label: 'strategy',   desc: 'Strategy management', flags: {} },
      { id: 'prop-firms', label: 'prop-firms', desc: 'Prop firm profile management', flags: {} },
      { id: 'run',        label: 'run',        desc: 'Persistent runners (paper bot, backfill loop)', flags: {} },
    ],
  },
  {
    label: 'Polymarket', full: 'PREDICTION MARKETS',
    cmds: [
      { id: 'polymarket portfolio',    label: 'Portfolio',    desc: 'Live portfolio & pUSD balance', flags: {} },
      { id: 'polymarket markets',      label: 'Markets',      desc: 'Browse & trade active markets', flags: {} },
      { id: 'polymarket history',      label: 'History',      desc: 'Historical CLOB price data for an event',
        flags: {
          '--event':        { t:'txt', lbl:'Prediction event key', def:'fed_rate_cut_prob' },
          '--history-days': { t:'txt', lbl:'Historical days', def:'30' },
          '--timeframe':    { t:'sel', opts:['1d','1h','15m'], lbl:'Timeframe', def:'1h' },
        },
      },
      { id: 'polymarket backtest', label: 'bt', desc: 'Backtest',
        flags: {
          '--strategy':        { t:'sel', opts:['low_prob_dip','mean_revert'], lbl:'Strategy', def:'low_prob_dip' },
          '--tag-id':          { t:'txt', lbl:'Gamma tag ID (21 = crypto 2023+)', def:'21' },
          '--days':            { t:'txt', lbl:'Days back to scan', def:'365' },
          '--max-markets':     { t:'txt', lbl:'Max markets to test', def:'20' },
          '--entry-threshold': { t:'txt', lbl:'Max entry price (low_prob_dip)', def:'0.15' },
        },
      },
      { id: 'polymarket derive-creds', label: 'derive-creds', desc: 'Derive L2 API credentials from wallet', flags: {} },
      {
        id: 'bot',
        label: 'bot',
        desc: 'Bot control panel',
        subcmds: [
          { id: 'health',  label: 'Health Check', desc: 'Check credentials, API, and balance', cmdStr: 'bot health' },
          { id: 'status',  label: 'Status',             desc: 'Show bot run status', cmdStr: 'bot status' },
          { id: 'cycle',   label: 'Run Cycle (dry-run)', desc: 'Run a single dry-run iteration', cmdStr: 'bot cycle' },
          { id: 'run',     label: 'Start Loop',         desc: 'Start continuous trading loop', cmdStr: 'bot run' },
          { id: 'enable',  label: 'Enable Bot',         desc: 'Enable the bot in config', cmdStr: 'bot config --key enabled --value true' },
          { id: 'disable', label: 'Disable Bot',        desc: 'Disable the bot in config', cmdStr: 'bot config --key enabled --value false' },
          { id: 'config',  label: 'Config', desc: 'Edit bot parameters', cmdStr: 'bot config' },
          { id: 'back',    label: 'Back',               desc: 'Return to command list', cmdStr: '' }
        ]
      },
    ],
  },
  {
    label: 'Settings', full: 'SETTINGS & PREFERENCES',
    cmds: [
      { id: 'settings show',      label: 'Show',      desc: 'Show current config', flags: {} },
      { id: 'settings favorites', label: 'Favorites', desc: 'Manage favourite symbols',
        flags: {
          '--symbols': { t:'txt', lbl:'Comma-sep symbol list', def:'' },
        },
      },
      { id: 'settings timezone', label: 'Timezone', desc: 'Set display timezone',
        flags: {
          '--value': { t:'sel', opts:['UTC','Europe/London','Asia/Ho_Chi_Minh','Asia/Singapore','Asia/Tokyo','America/New_York','America/Los_Angeles'], lbl:'Timezone', def:'UTC' },
        },
      },
      { id: 'settings layout', label: 'Layout', desc: 'Set layout preset',
        flags: {
          '--preset': { t:'sel', opts:['default','compact','research','legacy'], lbl:'Layout preset ("legacy" exits this dashboard to the old prompt-based menu)', def:'default' },
        },
      },
      { id: 'settings params', label: 'Params', desc: 'Default trading parameters',
        flags: {
          '--position-size':    { t:'txt', lbl:'Position size (USDC)', def:'100' },
          '--stop-loss':        { t:'txt', lbl:'Stop loss %', def:'0.05' },
          '--take-profit':      { t:'txt', lbl:'Take profit %', def:'0.10' },
          '--min-edge':         { t:'txt', lbl:'Min edge threshold', def:'0.05' },
          '--max-positions':    { t:'txt', lbl:'Max open positions', def:'10' },
          '--polling-interval': { t:'txt', lbl:'Polling interval (seconds)', def:'60' },
        },
      },
      { id: 'settings flags', label: 'Flags', desc: 'Toggle features',
        flags: {
          '--flag':  { t:'sel', opts:['polymarket','bot_autopilot','ai_agent_trading','multi_agent_research','onchain_data','auto_backfill'], lbl:'Feature flag', def:'' },
          '--value': { t:'sel', opts:['true','false'], lbl:'Enable?', def:'false' },
        },
      },
      { id: 'settings alerts', label: 'Alerts', desc: 'Alert preferences',
        flags: {
          '--email': { t:'yn', lbl:'Email alerts?', def:true },
          '--push':  { t:'yn', lbl:'Push alerts?',  def:false },
        },
      },
      { id: 'settings reset', label: 'Reset', desc: 'Reset all to defaults', flags: {} },
    ],
  },
  {
    label: 'Account', full: 'ACCOUNT & AUTH (SUPABASE)',
    cmds: [
      { id: 'auth-status', label: 'auth-status', desc: 'Who am I / session expiry', flags: {} },
      { id: 'login',       label: 'login',       desc: 'Sign in',// feature request (still open): session persistence so re-login isn't needed every time, dev suggests
        flags: {
          '--email':    { t:'txt', lbl:'Email address', def:'' },
          '--password': { t:'txt', lbl:'Password (prompted if omitted)', def:'' },
        },
      },
      { id: 'register', label: 'register', desc: 'Create new account',
        flags: {
          '--email': { t:'txt', lbl:'Email address', def:'' },
        },
      },
      { id: 'logout', label: 'logout', desc: 'Sign out & clear local session', flags: {} },
    ],
  },
];

// ── App ──────────────────────────────────────────────────────────────────
const App = ({ initialCatI = 0, initialCmdI = -1, onRun, executeInPane }) => {
  const { exit } = useApp();
  const viewport = useWindowSize();
  const layout = dashboardLayout(viewport.columns, viewport.rows);
  const [catI,  setCatI]  = useState(initialCatI);
  const [cmdI,  setCmdI]  = useState(initialCmdI);
  const [subcmdI, setSubcmdI] = useState(-1);
  // Default boot (no explicit initial position) lands in the chat box, the
  // new primary entry point; an explicit initialCmdI (used after returning
  // from a spawned command, and by tests that target the grid directly)
  // still goes straight to 'cmd' as before.
  const [focus, setFocus] = useState(initialCmdI >= 0 ? 'cmd' : 'chat');
  const [flagI, setFlagI] = useState(-1);
  const [flagValues, setFlagValues] = useState({});
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const [pickerUniverse, setPickerUniverse] = useState(() => SYMBOL_UNIVERSE);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerSelected, setPickerSelected] = useState(() => new Set());
  const [pinBuffer, setPinBuffer] = useState('');
  const [pendingRun, setPendingRun] = useState(null); // { cmd, flagValues } awaiting PIN confirmation
  const [chatInput, setChatInput] = useState('');
  const [chatStatus, setChatStatus] = useState('');
  // "/"-prefixed chat input shows a live-filtered command dropdown (see
  // chatSuggestions below); suggestIndex is the highlighted row, reset to 0
  // whenever the input changes so it never points past a shrunk list.
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [pendingLlmConfirm, setPendingLlmConfirm] = useState(null); // { cmd, flagValues, argv } awaiting explicit confirm
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-GB'));
  const [health, setHealth] = useState(() => loadDashboardHealth());
  // backfill-daemon status, polled from disk regardless of who started that
  // process (this dashboard, a separate terminal, the Docker `backfill`
  // service) -- see readDaemonStatus for the liveness/staleness rules.
  const [daemonStatus, setDaemonStatus] = useState(() => readDaemonStatus(DAEMON_STATUS_PATH));
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [lastExecuted, setLastExecuted] = useState([]);
  // Output-panel scroll: the index of the first visible line. null means
  // "auto-follow the tail" (always show the latest output, like `tail -f`) --
  // the common case while a command streams. Once the user scrolls up it
  // becomes a concrete index that stays put as new lines arrive, until they
  // scroll back down to the bottom, which re-arms auto-follow.
  const [outputScrollTop, setOutputScrollTop] = useState(null);

  const childRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  // "/"-suggestion dropdown: derived every render from chatInput, not stored
  // as its own state, so it can never drift out of sync with what's typed.
  // The viewport policy caps how many rows may appear below the input -- this
  // exact count (not a guess) is what both the render below AND the cursor
  // effect use to keep the hardware cursor glued to the input row no matter
  // how many suggestion rows are currently showing.
  const chatSuggestions = (focus === 'chat' && !pendingLlmConfirm && !running && chatInput.startsWith('/'))
    ? suggestCommands(M, chatInput.slice(1), layout.suggestionLimit)
    : [];
  const showSuggestions = chatSuggestions.length > 0;
  const activeSuggestIndex = showSuggestions ? Math.min(suggestIndex, chatSuggestions.length - 1) : 0;
  // The number of extra rows the chat bar grows by right now -- the single
  // source of truth shared between the actual render (suggestionList below)
  // and the cursor-position math, so they can't independently drift.
  const suggestionRowCount = chatSuggestions.length;

  useEffect(() => {
    setSuggestIndex(0);
  }, [chatInput]);

  useEffect(() => {
    if (process.stdout.isTTY) process.stdout.write('\x1b[?25l');
    mountedRef.current = true;
    return () => {
      if (process.stdout.isTTY) process.stdout.write('\x1b[?25h');
      mountedRef.current = false;
      if (childRef.current) {
        try { childRef.current.kill('SIGINT'); } catch (e) {}
      }
    };
  }, []);

  const handleRun = async (argv, pin) => {
    onRun(argv, { catI, cmdI });

    // backfill-daemon's continuous loop (no --once) is a true background
    // daemon, not a bounded task -- spawn it fully detached+unref'd so it
    // keeps running no matter what the user does next in here, including
    // exiting the dashboard entirely (matches how it already behaves when
    // started from a separate terminal or the Docker `backfill` service).
    // Its progress surfaces via the header's status-file poller, not by
    // piping this child's stdout the way every other in-pane command does.
    if (argv[0] === 'backfill-daemon' && !argv.includes('--once')) {
      const child = spawn(process.execPath, [path.join(__dirname, 'sovereign_cli.js'), ...argv], {
        detached: true, stdio: 'ignore',
      });
      child.unref();
      if (mountedRef.current) {
        setOutput((c) => c + `\nStarted backfill-daemon in the background (pid ${child.pid}). It keeps running after you navigate away or exit the dashboard - watch the header indicator for progress. Stop it with: kill ${child.pid} (or its Docker/terminal equivalent if it's not this pid).\n`);
      }
      return;
    }

    if (argv[0] === 'stop-backfill-daemon') {
      const status = readDaemonStatus(DAEMON_STATUS_PATH);
      if (status && status.pid && status.status !== 'stopped') {
        try {
          process.kill(status.pid, 'SIGTERM');
          if (mountedRef.current) setOutput(`Sent SIGTERM to backfill-daemon (pid ${status.pid}).\n`);
        } catch (err) {
          if (mountedRef.current) setOutput(`Failed to kill daemon (pid ${status.pid}): ${err.message}\n`);
        }
      } else {
        if (mountedRef.current) setOutput('Daemon is not running or PID is unknown.\n');
      }
      return;
    }

    const cmdStr = argv.join(' ');
    const isInteractive = isInteractiveCmd(cmdStr, INTERACTIVE_CMDS);

    if (!isInteractive) {
      lastRunArgv = argv;
      if (mountedRef.current) {
        setRunning(true);
        setLastExecuted(argv);
        setOutput('Running...\n');
        setOutputScrollTop(null); // re-pin to the tail for the new run's output
      }
      await new Promise(resolve => setTimeout(resolve, 50));
      try {
        // This child's stdin is a piped, never-written, never-closed pipe (no
        // inherited TTY) -- tell the shared prompt stack (engine.js) to resolve
        // any reachable promptSelect/promptText/promptConfirm/promptMultiSelect
        // call instantly with its default instead of blocking on readline.
        const env = { ...process.env, FORCE_COLOR: '1', SOVEREIGN_NONINTERACTIVE: 'true' };
        if (pin) {
          env.SOVEREIGN_TRADE_PIN = pin;
        }
        if (executeInPane) {
          const result = await executeInPane(argv, { env });
          if (!result || !Number.isInteger(result.exitCode)) {
            throw new TypeError('executeInPane must resolve to { exitCode, stdout, stderr }');
          }
          const stdout = result.stdout == null ? '' : String(result.stdout);
          const stderr = result.stderr == null ? '' : String(result.stderr);
          if (mountedRef.current && (stdout || stderr)) {
            setOutput((c) => c + stdout + stderr);
          }
        } else {
          const child = spawn(process.execPath, [path.join(__dirname, 'sovereign_cli.js'), ...argv], {
            env,
            stdio: ['ignore', 'pipe', 'pipe']
          });
          childRef.current = child;

          child.stdout.on('data', (data) => {
            if (mountedRef.current) setOutput((c) => c + data.toString('utf8'));
          });
          child.stderr.on('data', (data) => {
            if (mountedRef.current) setOutput((c) => c + data.toString('utf8'));
          });

          await new Promise((resolve) => {
            child.on('close', (code) => {
              if (process.stdout.isTTY) process.stdout.write('\x1b[?25l');
              resolve(code);
            });
            child.on('error', (err) => {
              if (mountedRef.current) setOutput((c) => c + '\nError: ' + err.message);
              resolve(-1);
            });
          });
        }
      } catch (err) {
        if (mountedRef.current) setOutput('Error executing command: ' + err.message);
      } finally {
        childRef.current = null;
        if (mountedRef.current) {
          if (process.stdout.isTTY) process.stdout.write('\x1b[?25l');
          setRunning(false);
        }
      }
    }

    // "settings layout --preset legacy" just persisted to disk (the spawned
    // child above ran and exited) -- that's not a display preference inside
    // THIS dashboard, it's a request for the actual pre-Ink prompt-based menu
    // (tui/engine.js's runInteractiveMenu, the real "legacy TUI"). Log out of
    // this dashboard now so sovereign_cli.js's boot loop re-reads the setting
    // and launches the real legacy menu next, instead of leaving the user
    // looking at an unchanged grid.
    if (argv[0] === 'settings' && argv[1] === 'layout' && argv.includes('legacy')) {
      exit();
    }
  };

  // live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB')), 1000);
    return () => clearInterval(t);
  }, []);

  // header health dots (backend/cache/quotes) — local-disk reads only, no
  // network, so a 10s cadence is plenty fresh without adding render cost to
  // every keystroke-driven re-render.
  useEffect(() => {
    const t = setInterval(() => setHealth(loadDashboardHealth()), 10000);
    return () => clearInterval(t);
  }, []);

  // backfill-daemon status: a faster cadence than the health dots since this
  // is the whole point of the indicator (a moving progress bar) - cheap (one
  // small JSON read + a no-op signal-0 liveness probe), so 2s is fine.
  useEffect(() => {
    const t = setInterval(() => setDaemonStatus(readDaemonStatus(DAEMON_STATUS_PATH)), 2000);
    return () => clearInterval(t);
  }, []);

  // Normal-flow render (no alternate screen buffer) -- nothing to restore on exit.

  const cat   = M[catI];
  const cmd   = cmdI >= 0 ? cat.cmds[cmdI] : null;
  const fkeys = cmd ? Object.keys(cmd.flags || {}) : [];

  // reset flag editor whenever the selected command changes
  useEffect(() => {
    setFlagValues(cmd ? defaultFlagValues(cmd) : {});
    setFlagI(0);
    setEditing(false);
  }, [cmd && cmd.id]);

  // Symbol picker: the flag being edited (valid in both 'flags' and
  // 'symbolPicker' focus, since flagI doesn't change when the picker opens),
  // whether it wants the picker at all, and the live-filtered/grouped row
  // list for the current search query. Computed once per render so both the
  // keyboard handler and the flag panel's JSX agree on the same rows.
  const activeFlagKey  = ((focus === 'flags' || focus === 'symbolPicker') && flagI >= 0 && flagI < fkeys.length)
    ? fkeys[flagI] : null;
  const activeFlagMeta = activeFlagKey ? cmd.flags[activeFlagKey] : null;
  const pickerMulti = !!(activeFlagMeta && activeFlagMeta.pickSymbol === 'multi');
  const pickerRows = React.useMemo(() => {
    return focus === 'symbolPicker' ? buildSymbolPickerRows(pickerUniverse, pickerQuery) : [];
  }, [focus, pickerQuery, pickerUniverse]);

  function handleEditSubmit(value) {
    const fk = fkeys[flagI];
    setFlagValues(v => ({ ...v, [fk]: value }));
    setEditing(false);
  }

  function handlePinSubmit(pin) {
    const run = pendingRun || { cmd, flagValues };
    setFocus(cmd ? 'flags' : 'chat');
    setEditing(false);
    setPinBuffer('');
    setPendingRun(null);
    handleRun(buildArgv(run.cmd, run.flagValues), pin);
  }

  // The one and only place that decides whether a command needs the PIN
  // gate before running -- both the flags panel's "Run" row and the chat
  // box's Enter-to-run path must go through this, never call handleRun
  // directly, or a chat-resolved --live command would bypass the gate
  // entirely (the gate previously lived inline in the Run-row handler only,
  // coupled to the grid's own `cmd`/`flagValues` closure state).
  function runOrGatePin(runCmd, runFlagValues) {
    const isLive = runFlagValues['--live'] === true;
    const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
    if (isLive && expectedPin) {
      setPendingRun({ cmd: runCmd, flagValues: runFlagValues });
      setPinBuffer('');
      setFocus('pin');
      setEditing(true);
    } else {
      handleRun(buildArgv(runCmd, runFlagValues));
    }
  }

  // Resolve + run a typed chat line. Invoked by the chat-bar <TextInput>'s
  // onSubmit (Enter). Deterministic parse first; on a miss, fire the async local
  // LLM resolver which lands a confirm gate via state. (Logic moved verbatim out
  // of the old hand-rolled useInput chat handler so TextInput can own typing.)
  function submitChat(raw) {
    // A leading "/" is just the suggestion-dropdown trigger, not part of the
    // command itself -- strip it so "/chart AAPL 1d" (typed by hand or
    // Tab-completed from the dropdown) parses identically to "chart AAPL 1d".
    const text = (raw || '').trim().replace(/^\/+/, '');
    setChatInput('');
    if (!text) return;
    const universes = { symbolUniverse: SYMBOL_UNIVERSE, strategyUniverse: STRATEGY_UNIVERSE };
    const result = parseChatInput(text, M, universes);
    if (result.ok) {
      const argv = buildArgv(result.cmd, result.flagValues);
      setChatStatus('Running: sovereign ' + argv.join(' '));
      runOrGatePin(result.cmd, result.flagValues);
      return;
    }
    setChatStatus('Hmm, let me check that...');
    resolveWithLLM(text, M, universes).then((llmResult) => {
      if (!mountedRef.current) return;
      if (llmResult.ok) {
        const argv = buildArgv(llmResult.cmd, llmResult.flagValues);
        setPendingLlmConfirm({ cmd: llmResult.cmd, flagValues: llmResult.flagValues, argv });
        setChatStatus(`Run "sovereign ${argv.join(' ')}"? [Enter] confirm  [Esc] cancel`);
      } else {
        setChatStatus("Couldn't match that to a command. Try rephrasing.");
      }
    });
  }

  // keyboard
  useInput((input, key) => {
    // Output-panel scrolling: works in every focus mode (incl. while a
    // command is running) since the output panel is always visible
    // alongside whatever else is on screen, not something you "enter".
    const commandInputActive = focus === 'chat' && !pendingLlmConfirm && !running;
    if (key.pageUp || key.pageDown || ((key.home || key.end) && !commandInputActive)) {
      const lines = output ? output.split('\n') : [];
      const maxLines = layout.outputLines;
      const maxTop = Math.max(0, lines.length - maxLines);
      if (key.home) { setOutputScrollTop(maxTop === 0 ? null : 0); return; }
      if (key.end) { setOutputScrollTop(null); return; }
      setOutputScrollTop((top) => {
        const current = top === null ? maxTop : top;
        const next = key.pageUp ? current - maxLines : current + maxLines;
        const clamped = Math.max(0, Math.min(maxTop, next));
        return clamped >= maxTop ? null : clamped; // snap back to auto-follow at the bottom
      });
      return;
    }

    if (running) {
      if (key.escape || input === 'c') {
        if (childRef.current) {
          try { childRef.current.kill('SIGINT'); } catch (e) {}
          setOutput((c) => c + '\n\n[Command aborted by user]\n');
        }
        if (process.stdout.isTTY) process.stdout.write('\x1b[?25l');
        setRunning(false);
        return;
      }
      if (key.ctrl && input === 'c') {
        if (childRef.current) {
          try { childRef.current.kill('SIGINT'); } catch (e) {}
        }
        exit();
        return;
      }
      return;
    }

    if (focus === 'pin') {
      if (key.escape) {
        // Return to wherever this gate was triggered from: the grid's
        // flags panel (a real cmd selected there) or the chat box (a
        // chat-resolved --live command, which never touches cmdI).
        setFocus(cmd ? 'flags' : 'chat');
        setPinBuffer('');
        setEditing(false);
        setPendingRun(null);
      }
      return;
    }

    if (focus === 'symbolPicker') {
      // Hand-rolled (no ink-text-input) on purpose: TextInput's own internal
      // useInput hook would also try to act on every keystroke (incl. Space,
      // which here must always mean "toggle", never "type a space" -- search
      // queries are symbol/category text, never contain spaces), and two
      // independent hooks fighting over the same buffer is exactly the kind
      // of bug class this whole feature is supposed to avoid introducing.
      if (key.escape) { setFocus('flags'); return; }
      if (key.upArrow) {
        setPickerIndex((i) => {
          if (pickerRows.length === 0) return 0;
          let n = i;
          do { n = n > 0 ? n - 1 : pickerRows.length - 1; }
          while (pickerRows[n].type === 'header' && !pickerMulti && pickerRows.length > 1);
          return n;
        });
        return;
      }
      if (key.downArrow) {
        setPickerIndex((i) => {
          if (pickerRows.length === 0) return 0;
          let n = i;
          do { n = n < pickerRows.length - 1 ? n + 1 : 0; }
          while (pickerRows[n].type === 'header' && !pickerMulti && pickerRows.length > 1);
          return n;
        });
        return;
      }
      if (key.backspace || key.delete) {
        const newQuery = pickerQuery.slice(0, -1);
        setPickerQuery(newQuery);
        setPickerIndex(firstSelectableIndex(buildSymbolPickerRows(pickerUniverse, newQuery), pickerMulti));
        return;
      }
      if (input === ' ') {
        if (!pickerMulti) return;
        const row = pickerRows[pickerIndex];
        if (!row) return;
        if (row.type === 'header') {
          setPickerSelected((s) => toggleSet(s, groupValuesFor(pickerRows, row.groupKey)));
        } else {
          setPickerSelected((s) => toggleSet(s, [row.value]));
        }
        return;
      }
      if (key.return) {
        const row = pickerRows[pickerIndex];
        const fk = activeFlagKey;
        if (pickerMulti) {
          setFlagValues((v) => ({ ...v, [fk]: [...pickerSelected].join(',') }));
        } else if (row && row.type !== 'header') {
          setFlagValues((v) => ({ ...v, [fk]: row.value }));
        }
        setFocus('flags');
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        const newQuery = pickerQuery + input;
        setPickerQuery(newQuery);
        setPickerIndex(firstSelectableIndex(buildSymbolPickerRows(pickerUniverse, newQuery), pickerMulti));
        return;
      }
      return;
    }

    // Bare 'q' means quit in every read-only grid/picker mode, but the chat
    // box is free-text entry -- a typed word containing the letter "q"
    // (e.g. "equity", "quick") must not silently exit the whole dashboard
    // mid-sentence. Ctrl+C still quits everywhere, chat included.
    if ((input === 'q' && focus !== 'chat') || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    // Tab toggles between the chat box (new default entry point) and the
    // existing grid view, from anywhere in either -- except while the
    // "/"-suggestion dropdown is open, where Tab is repurposed below to
    // accept the highlighted suggestion instead of leaving the chat box.
    if (key.tab) {
      if (!(focus === 'chat' && showSuggestions)) {
        setFocus((f) => (f === 'chat' ? 'side' : 'chat'));
        return;
      }
    }
    if (focus === 'chat') {
      // A pending LLM-resolved command always blocks further typing until
      // explicitly confirmed or cancelled -- this is the mandatory confirm
      // gate; there is no other path from an LLM resolution to handleRun.
      if (pendingLlmConfirm) {
        if (key.return) {
          const { cmd: pCmd, flagValues: pFlags } = pendingLlmConfirm;
          setPendingLlmConfirm(null);
          runOrGatePin(pCmd, pFlags);
          return;
        }
        if (key.escape) {
          setPendingLlmConfirm(null);
          setChatStatus('Cancelled.');
          return;
        }
        return;
      }
      // "/"-suggestion dropdown navigation. Up/Down/Tab are all ignored by
      // CommandInput ignores Up/Down/Tab so handling
      // them here never double-fires against the same keystroke.
      if (showSuggestions) {
        if (key.upArrow) {
          setSuggestIndex((i) => (i - 1 + chatSuggestions.length) % chatSuggestions.length);
          return;
        }
        if (key.downArrow) {
          setSuggestIndex((i) => (i + 1) % chatSuggestions.length);
          return;
        }
        if (key.tab) {
          const picked = chatSuggestions[activeSuggestIndex];
          if (picked) setChatInput(picked.id + ' ');
          return;
        }
      }
      // Editing and Enter-to-submit are owned by CommandInput, which keeps one
      // logical cursor for text mutation and hardware placement. Nothing for
      // the global navigation handler to do in chat mode.
      return;
    }
    if (focus === 'side') {
      if (key.upArrow)                    { setCatI(i => (i - 1 + M.length) % M.length); setCmdI(-1); }
      if (key.downArrow)                  { setCatI(i => (i + 1) % M.length); setCmdI(-1); }
      if (key.return || key.rightArrow)   { setFocus('cmd'); setCmdI(0); }
    } else if (focus === 'cmd') {
      const len = M[catI].cmds.length;
      if (key.upArrow)                    { setCmdI(i => Math.max(0, i - 1)); }
      if (key.downArrow)                  { setCmdI(i => Math.min(len - 1, i + 1)); }
      if (key.escape || key.leftArrow)    { setFocus('side'); setCmdI(-1); }
      if (key.return || key.rightArrow) {
        const selectedCmd = M[catI].cmds[cmdI];
        if (!selectedCmd) return;
        if (selectedCmd.subcmds) {
          setFocus('subcmd');
          setSubcmdI(0);
        } else if (Object.keys(selectedCmd.flags || {}).length === 0) {
          handleRun(buildArgv(selectedCmd, {}));
        } else {
          setFocus('flags');
          setFlagI(0);
        }
      }
    } else if (focus === 'subcmd') {
      const selectedCmd = M[catI].cmds[cmdI];
      if (!selectedCmd || !selectedCmd.subcmds) return;
      const len = selectedCmd.subcmds.length;
      if (key.upArrow)                    { setSubcmdI(i => Math.max(0, i - 1)); }
      if (key.downArrow)                  { setSubcmdI(i => Math.min(len - 1, i + 1)); }
      if (key.escape || key.leftArrow || input === 'b') {
        setFocus('cmd');
        setSubcmdI(-1);
      }
      if (key.return) {
        const sub = selectedCmd.subcmds[subcmdI];
        if (!sub || sub.id === 'back') {
          setFocus('cmd');
          setSubcmdI(-1);
          return;
        }
        handleRun(splitWords(sub.cmdStr));
      }
    } else if (focus === 'flags') {
      const maxI = fkeys.length; // trailing index == the "Run" row
      if (key.escape) { setFocus('cmd'); setFlagI(-1); return; }
      if (key.upArrow)   { setFlagI(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setFlagI(i => Math.min(maxI, i + 1)); return; }
      if (flagI === maxI) {
        if (key.return) {
          runOrGatePin(cmd, flagValues);
        }
        return;
      }
      const fk = fkeys[flagI];
      const meta = cmd.flags[fk];
      const textLike = meta.t === 'txt' || isPlaceholderSelect(meta);
      if (key.leftArrow || key.rightArrow) {
        if (meta.t === 'yn') {
          setFlagValues(v => ({ ...v, [fk]: !v[fk] }));
        } else if (meta.t === 'sel' && !isPlaceholderSelect(meta)) {
          const dir = key.rightArrow ? 1 : -1;
          setFlagValues(v => ({ ...v, [fk]: cycleOption(meta, v[fk], dir) }));
        }
        return;
      }
      if (key.return) {
        if (meta.t === 'yn') {
          setFlagValues(v => ({ ...v, [fk]: !v[fk] }));
        } else if (meta.pickSymbol || meta.pickStrategy) {
          const universe = meta.pickStrategy ? STRATEGY_UNIVERSE : SYMBOL_UNIVERSE;
          const currentVal = String(flagValues[fk] ?? '');
          const multi = meta.pickSymbol === 'multi' || meta.pickStrategy === 'multi';
          setPickerUniverse(universe);
          setPickerQuery('');
          setPickerIndex(firstSelectableIndex(buildSymbolPickerRows(universe, ''), multi));
          setPickerSelected(new Set(multi
            ? currentVal.split(',').map((s) => s.trim()).filter(Boolean)
            : (currentVal ? [currentVal] : [])));
          setFocus('symbolPicker');
        } else if (textLike) {
          setEditBuffer(String(flagValues[fk] ?? ''));
          setEditing(true);
        } else {
          setFlagValues(v => ({ ...v, [fk]: cycleOption(meta, v[fk], 1) }));
        }
        return;
      }
      // Typing a printable character directly -- without pressing Enter
      // first to switch into edit/picker mode -- used to do nothing at all
      // while just browsing the flags panel, which read as a dead/broken
      // keyboard for any text or symbol-picker flag. Jump straight into the
      // right mode seeded with that keystroke, matching ordinary text-field
      // muscle memory.
      if ((textLike || meta.pickSymbol || meta.pickStrategy) && input && input.length === 1 && !key.ctrl && !key.meta) {
        if (meta.pickSymbol || meta.pickStrategy) {
          const universe = meta.pickStrategy ? STRATEGY_UNIVERSE : SYMBOL_UNIVERSE;
          const multi = meta.pickSymbol === 'multi' || meta.pickStrategy === 'multi';
          setPickerUniverse(universe);
          setPickerQuery(input);
          setPickerIndex(firstSelectableIndex(buildSymbolPickerRows(universe, input), multi));
          setPickerSelected(new Set());
          setFocus('symbolPicker');
        } else {
          setEditBuffer(input);
          setEditing(true);
        }
      }
    }
  }, { isActive: !editing || focus === 'pin' || focus === 'symbolPicker' });

  // ── Sidebar items ──────────────────────────────────────────────────────
  const sideWindow = windowedRange(M.length, catI, layout.sidebarItemRows);
  const visibleSideItems = M.slice(sideWindow.start, sideWindow.end).map((c, offset) => {
    const i = sideWindow.start + offset;
    const on = i === catI;
    return h(Text, { key: c.label, color: on ? (focus === 'side' ? CY : YL) : DIM },
      (on ? '▸ ' : '  ') + c.label
    );
  });
  const sideItems = [
    sideWindow.above > 0 && h(Text, { key: '_side_above', color: MUT }, `  ↑ ${sideWindow.above} more`),
    sideWindow.compact > 0 && h(Text, { key: '_side_more', color: MUT }, `  ↕ ${sideWindow.compact} more`),
    ...visibleSideItems,
    sideWindow.below > 0 && h(Text, { key: '_side_below', color: MUT }, `  ↓ ${sideWindow.below} more`),
  ].filter(Boolean);

  // ── Command rows ───────────────────────────────────────────────────────
  // Drilled into a command's flags/sub-options: collapse the list to just the
  // active row so the flag/sub-option panel below has room — showing the full
  // list AND a multi-flag panel at once can exceed terminal rows and corrupt
  // Ink's cursor-repositioning redraw (frames visually overlap).
  // 'pin' intentionally excluded -- it's now rendered as a standalone
  // top-level view (pinView below), not nested inside the grid, since a
  // chat-resolved --live command has no corresponding grid cmd/cmdI
  // selected (cmd would be null, which used to make the PIN gate silently
  // fail to render at all).
  const drilled = (focus === 'flags' || focus === 'subcmd' || focus === 'symbolPicker') && !!cmd;
  const commandWindow = windowedRange(cat.cmds.length, Math.max(0, cmdI), layout.commandItemRows);
  const visibleCommands = cat.cmds.slice(commandWindow.start, commandWindow.end);
  const cmdRows = drilled
    ? [
        h(Box, { key: cmd.id, height: 1, overflowY: 'hidden' },
          h(Text, { color: YL }, '▸ '),
          h(Box,  { width: 23 }, h(Text, { color: YL }, cmd.label)),
          h(Text, { color: VAL, wrap: 'truncate-end' }, cmd.desc),
        ),
      ]
    : [
        commandWindow.above > 0 && h(Text, { key: '_cmd_above', color: MUT }, `  ↑ ${commandWindow.above} more`),
        commandWindow.compact > 0 && h(Text, { key: '_cmd_more', color: MUT }, `  ↕ ${commandWindow.compact} more`),
        ...visibleCommands.map((c, offset) => {
        const i = commandWindow.start + offset;
        const on   = i === cmdI;
        const hasF = Object.keys(c.flags || {}).length > 0 || !!c.subcmds;
        return h(Box, { key: c.id, height: 1, overflowY: 'hidden' },
          h(Text, { color: on ? YL : BDR }, on ? '▸ ' : '  '),
          h(Box,  { width: 23 }, h(Text, { color: on ? YL : DIM }, c.label)),
          h(Text, { color: on ? VAL : MUT, wrap: 'truncate-end' }, c.desc),
          hasF && h(Text, { color: on ? AM : BDR }, '  ›'),
        );
      }),
        commandWindow.below > 0 && h(Text, { key: '_cmd_below', color: MUT }, `  ↓ ${commandWindow.below} more`),
      ].filter(Boolean);

  // ── Flag panel ─────────────────────────────────────────────────────────
  let flagPanel;
  if (!cmd) {
    flagPanel = h(Text, { color: MUT }, '  ⏎ or → to enter command list');
  } else if (focus === 'symbolPicker') {
    const maxVisible = layout.pickerRows;
    const pickerScroll = pickerIndex >= maxVisible ? pickerIndex - maxVisible + 1 : 0;
    const visibleRows = pickerRows.slice(pickerScroll, pickerScroll + maxVisible);
    const rowNodes = visibleRows.length === 0
      ? [h(Text, { key: '_empty', color: MUT }, '    (no matches — press Enter to use the typed text)')]
      : visibleRows.map((row, idx) => {
          const actualIdx = idx + pickerScroll;
          const active = actualIdx === pickerIndex;
          const arrow = active ? '▸ ' : '  ';
          if (row.type === 'header') {
            const groupVals = groupValuesFor(pickerRows, row.groupKey);
            const checkedCount = groupVals.filter((v) => pickerSelected.has(v)).length;
            const tag = pickerMulti ? ` [${checkedCount}/${groupVals.length}]` : '';
            return h(Text, { key: row.groupKey, color: active ? YL : CY, bold: true }, arrow + row.label + tag);
          }
          if (row.type === 'custom') {
            const checked = pickerMulti && pickerSelected.has(row.value);
            const box = pickerMulti ? (checked ? '[x] ' : '[ ] ') : '';
            return h(Text, { key: '_custom', color: active ? YL : AM }, arrow + box + `+ "${row.value}" (not cached)`);
          }
          const checked = pickerMulti && pickerSelected.has(row.value);
          const box = pickerMulti ? (checked ? '[x] ' : '[ ] ') : '';
          return h(Text, { key: row.value, color: active ? YL : VAL }, arrow + box + row.value);
        });
    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY, bold: true }, '  Select ' + (activeFlagMeta && activeFlagMeta.pickStrategy ? 'strategy' : 'symbol') + (pickerMulti ? 's' : '') + ' — ' + activeFlagKey),
      h(Box, {}, h(Text, { color: YL }, '  Search: '), h(Text, { color: VAL }, pickerQuery + '█')),
      h(Text, { color: BDR }, '  ' + '─'.repeat(70)),
      ...rowNodes,
      h(Text, { color: BDR }, '  ' + '─'.repeat(70)),
      pickerMulti
        ? h(Text, { color: GN }, '  Selected (' + pickerSelected.size + '): ' + ([...pickerSelected].join(', ') || '(none)'))
        : h(Text, { color: MUT }, '  ⏎ selects the highlighted row directly'),
    );
  } else if (cmd.subcmds) {
    const subRows = cmd.subcmds.map((s, idx) => {
      const active = focus === 'subcmd' && idx === subcmdI;
      return h(Box, { key: s.id, height: 1, overflowY: 'hidden' },
        h(Text, { color: active ? YL : BDR }, active ? '▸ ' : '  '),
        h(Box,  { width: 40 }, h(Text, { color: active ? YL : VAL }, s.label)),
        h(Text, { color: active ? VAL : MUT, wrap: 'truncate-end' }, s.desc),
      );
    });

    const activeSub = subcmdI >= 0 ? cmd.subcmds[subcmdI] : null;
    const cmdStr = activeSub ? activeSub.cmdStr : '';

    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY }, '  › ' + cmd.id + ' sub-options:'),
      ...subRows,
      h(Text, { color: BDR, wrap: 'truncate-end' }, '  sovereign ' + (cmdStr ? cmdStr : cmd.id)),
    );
  } else if (fkeys.length === 0) {
    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY },  '  › ' + cmd.id),
      h(Text, { color: MUT }, '    no configurable flags · ⏎ to run'),
      h(Text, { color: BDR, wrap: 'truncate-end' }, '  sovereign ' + cmd.id),
    );
  } else {
    const runActive = focus === 'flags' && flagI === fkeys.length;
    const flagRows = fkeys.map((f, idx) => {
      const m = cmd.flags[f];
      const active = focus === 'flags' && idx === flagI;
      const val = flagValues[f];
      const valueNode = (active && editing)
        ? h(TextInput, { value: editBuffer, onChange: setEditBuffer, onSubmit: handleEditSubmit })
        : h(Text, { color: m.warn ? RD : AM }, m.t === 'yn' ? (val ? '[Y]' : '[N]') : ('[' + (optionLabel(m, val) || '') + ']'));
      return h(Box, { key: f, height: 1, overflowY: 'hidden' },
        h(Text, { color: active ? YL : DIM }, active ? '▸ ' : '  '),
        h(Box,  { width: 22 }, h(Text, { color: active ? YL : VAL }, f)),
        h(Box,  { width: 15 }, valueNode),
        h(Text, { color: m.warn ? RD : MUT, wrap: 'truncate-end' }, m.lbl),
      );
    });
    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY }, '  › ' + cmd.id),
      ...flagRows,
      h(Box, {},
        h(Text, { color: runActive ? GN : BDR }, runActive ? '▸ ' : '  '),
        h(Text, { color: runActive ? GN : MUT, bold: runActive }, '▶ Run'),
      ),
      h(Text, { color: BDR, wrap: 'truncate-end' }, '  sovereign ' + buildArgv(cmd, flagValues).join(' ')),
    );
  }

  const footerHint = focus === 'chat'
    ? (showSuggestions
        ? '↑↓ select  Tab fill  type a command  ⏎ run  q quit'
        : 'type a command  ⏎ run  Tab menu  q quit')
    : focus === 'symbolPicker'
      ? (pickerMulti
          ? '↑↓ browse  Space toggle  ⏎ confirm  esc cancel  type to search'
          : '↑↓ browse  ⏎ select  esc cancel  type to search')
      : focus === 'flags'
        ? '↑↓ field  ←→ change  ⏎ edit/run  esc back  Tab chat  q quit'
        : focus === 'subcmd'
          ? '↑↓ option  ⏎ run  esc/← back  Tab chat  q quit'
          : '↑↓ category  ⏎/→ enter cmd  ↑↓ command  esc/← back  Tab chat  q quit';

  // Thin input bar, always visible underneath the grid -- not a separate
  // page/section. A single top rule (no full box), the prompt + typed text,
  // and one muted status line below for the last result/confirm prompt.
  // Tab (handled above) toggles whether this bar or the grid is receiving
  // keystrokes; the grid itself never gets hidden.
  //
  // TYPING-POSITIONING FIX (2026-06-22 s55): typed characters used to ghost into
  // the bottom-right corner on Windows conhost. A raw-mode probe proved the
  // terminal does NOT echo (raw mode works) -- the ghost was Ink MIS-POSITIONING
  // its render. Root cause: the dashboard used to force the ALTERNATE screen
  // buffer (\x1b[?1049h) AND a fullscreen height (height: process.stdout.rows);
  // on win32 that combination makes Ink's per-keystroke full-frame redraw place
  // the cursor wrong on conhost. The reference fix (how gemini-cli / Claude Code's
  // own CLI stay smooth on the same console): render in NORMAL terminal flow, not
  // fullscreen-in-alt-screen. So: no \x1b[?1049h, and a non-fullscreen height
  // (rows-2, see the render return) which keeps Ink off its win32 full-clear path
  // (node_modules/ink/build/ink.js:100, gated on height >= viewport rows).
  // See memory: reference-ink-windows-fullscreen-lag.
  // Full bordered box around the prompt so typed characters are visually
  // contained inside it (Gemini/Claude-CLI style) rather than floating under
  // a single top rule. Border brightens (cyan) when the chat bar has focus.
  //
  // CURSOR-ROBUSTNESS FIX (this session): two things used to break the
  // cursor-relocation math above once any "/"-suggestion-style feature got
  // added. (1) the input row had no height cap, so a typed line wider than
  // the terminal would let Ink's default text wrapping grow this row to 2+
  // lines, pushing the bottom border down and silently invalidating the
  // hardcoded "H-3" cursor row -- height:1 + overflowY:'hidden' clip any
  // overflow instead of letting it grow the box. (2) the suggestion list
  // itself is a genuinely variable-height block; suggestionRowCount (shared
  // with the cursor effect above) is the single source of truth for how many
  // rows it adds, so the two can never drift out of sync. Each suggestion
  // row also gets wrap:'truncate-end' for the same reason as (1) -- a long
  // command id/description must clip, never wrap.
  const inputRow = h(Box, { height: 1, overflowY: 'hidden' },
    h(Text, { color: focus === 'chat' ? CY : MUT }, '› '),
    (focus === 'chat' && !pendingLlmConfirm && !running)
      ? h(CommandInput, {
          value: chatInput,
          onChange: setChatInput,
          onSubmit: submitChat,
          active: true,
          cursorY: layout.height - 2 - (layout.showChatStatus ? 1 : 0) - suggestionRowCount,
        })
      : h(Text, { color: VAL, wrap: 'truncate-end' }, chatInput),
  );
  const suggestionList = showSuggestions
    ? h(Box, { flexDirection: 'column' },
        ...chatSuggestions.map((s, i) => h(Text, {
          key: s.id,
          color: i === activeSuggestIndex ? CY : MUT,
          bold: i === activeSuggestIndex,
          wrap: 'truncate-end',
        }, (i === activeSuggestIndex ? '› ' : '  ') + s.id + (s.desc ? '  — ' + s.desc : ''))),
      )
    : null;
  const chatBar = h(Box, { flexDirection: 'column', flexShrink: 0 },
    h(Box, { borderStyle: 'round', borderColor: focus === 'chat' ? CY : BDR, paddingX: 1, flexDirection: 'column' },
      inputRow,
      suggestionList,
    ),
    layout.showChatStatus && h(Box, { paddingX: 1, height: 1, overflowY: 'hidden' },
      h(Text, { color: MUT }, chatStatus || 'Tab to type a command, or "/" to browse (e.g. "backend chart AAPL 1d")')
    ),
  );

  // Standalone PIN-gate view, used for both the grid's "Run" row AND a
  // chat-resolved --live command -- reads from pendingRun (always set by
  // runOrGatePin right before this focus is entered) rather than the grid's
  // own cmd/cmdI selection, which a chat-resolved command never sets.
  const pinView = h(Box, { flexDirection: 'column', flexGrow: 1, borderStyle: 'single', borderColor: RD, paddingX: 1 },
    h(Text, { color: RD, bold: true }, '⚠ LIVE EXECUTION SECURITY GATE'),
    h(Text, { color: VAL }, 'Please enter your 4-digit Trade PIN to authorize live trades:'),
    pendingRun && h(Text, { color: MUT }, 'sovereign ' + buildArgv(pendingRun.cmd, pendingRun.flagValues).join(' ')),
    h(Box, { marginY: 1 },
      h(Text, { color: YL }, 'PIN: '),
      h(TextInput, { value: pinBuffer, onChange: setPinBuffer, onSubmit: handlePinSubmit, mask: '*' })
    ),
    h(Text, { color: MUT }, '(Press Escape to cancel execution)')
  );

  const maxLines = layout.outputLines;
  const outputLines = output ? output.split('\n') : [];
  const outputMaxTop = Math.max(0, outputLines.length - maxLines);
  const outputTop = outputScrollTop === null ? outputMaxTop : Math.min(outputScrollTop, outputMaxTop);
  const visibleLines = outputLines.slice(outputTop, outputTop + maxLines);
  const outputScrolledUp = outputTop < outputMaxTop;

  const backendDot = healthDot(health.backend);
  const cacheDot = healthDot(health.cache);
  const quoteDot = healthDot(health.quote_provider);
  const daemonBar = daemonStatus
    ? renderProgressBar(daemonStatus.completed_jobs || 0, daemonStatus.total_jobs || 0, 10)
    : null;

  const contentRuleWidth = Math.max(8,
    (layout.stacked ? layout.columns - layout.sidebarWidth : layout.contentWidth) - 4);
  const outputRuleWidth = Math.max(8,
    (layout.stacked ? layout.columns : layout.columns - layout.sidebarWidth - layout.contentWidth) - 4);
  const oneLine = { overflowY: 'hidden' };

  const sidebarPanel = h(Box, {
    width: layout.sidebarWidth,
    flexShrink: 0,
    borderStyle: 'single',
    borderColor: focus === 'side' ? CY : BDR,
    flexDirection: 'column',
    paddingX: 1,
    overflowY: 'hidden',
  },
    h(Text, { color: DIM, wrap: 'truncate-end' }, 'MENU'),
    h(Text, { color: BDR, wrap: 'truncate-end' }, '─'.repeat(Math.max(8, layout.sidebarWidth - 4))),
    ...sideItems,
  );

  const contentPanel = h(Box, {
    ...(layout.stacked ? { flexGrow: 1 } : { width: layout.contentWidth, flexShrink: 0 }),
    borderStyle: 'single',
    borderColor: (focus === 'cmd' || focus === 'subcmd' || focus === 'flags' || focus === 'symbolPicker') ? CY : BDR,
    flexDirection: 'column',
    paddingX: 1,
    overflowY: 'hidden',
  },
    h(Text, { color: YL, bold: true, wrap: 'truncate-end' }, cat.full),
    h(Text, { color: BDR, wrap: 'truncate-end' }, '─'.repeat(contentRuleWidth)),
    ...cmdRows,
    h(Text, { color: BDR, wrap: 'truncate-end' }, '─'.repeat(contentRuleWidth)),
    flagPanel,
  );

  const outputPanel = h(Box, {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: layout.stacked ? 5 : undefined,
    borderStyle: 'single',
    borderColor: BDR,
    flexDirection: 'column',
    paddingX: 1,
    overflowY: 'hidden',
  },
    h(Text, { color: CY, bold: true, wrap: 'truncate-end' }, 'COMMAND OUTPUT'),
    h(Text, { color: BDR, wrap: 'truncate-end' }, '─'.repeat(outputRuleWidth)),
    running
      ? h(Box, { flexDirection: 'column', overflowY: 'hidden' },
          h(Text, { color: YL, bold: true, wrap: 'truncate-end' }, `⌛ Running: sovereign ${lastExecuted.join(' ')}`),
          h(Text, { color: MUT, wrap: 'truncate-end' }, 'Please wait for execution to complete...'),
        )
      : output
        ? h(Box, { flexDirection: 'column', overflowY: 'hidden' },
            h(Text, { color: GN, bold: true, wrap: 'truncate-end' }, `$ sovereign ${lastExecuted.join(' ')}`),
            h(Text, { color: BDR, wrap: 'truncate-end' }, '─'.repeat(outputRuleWidth)),
            ...visibleLines.map((line, idx) => h(Text, { key: idx, color: VAL, wrap: 'truncate-end' }, line)),
            outputLines.length > maxLines
              ? h(Text, { color: outputScrolledUp ? YL : MUT, wrap: 'truncate-end' },
                  `[lines ${outputTop + 1}-${Math.min(outputTop + maxLines, outputLines.length)}/${outputLines.length}] ` +
                  (outputScrolledUp ? 'PgDn/End' : 'PgUp'))
              : null,
          )
        : h(Box, { flexDirection: 'column', overflowY: 'hidden' },
            h(Text, { color: MUT, wrap: 'truncate-end' }, 'No command executed yet.'),
            h(Text, { color: MUT, wrap: 'truncate-end' }, 'Select a command and choose Run to see output.'),
          ),
  );

  const dashboardBody = layout.stacked
    ? h(Box, { flexDirection: 'column', flexGrow: 1, overflowY: 'hidden' },
        h(Box, { flexDirection: 'row', height: layout.stackedTopRows, flexShrink: 0, overflowY: 'hidden' }, sidebarPanel, contentPanel),
        outputPanel,
      )
    : h(Box, { flexDirection: 'row', flexGrow: 1, overflowY: 'hidden' }, sidebarPanel, contentPanel, outputPanel);

  // Non-fullscreen normal-flow rendering avoids the Windows conhost redraw
  // failure while the viewport policy keeps every pane inside current bounds.
  return h(Box, { flexDirection: 'column', height: layout.height, overflowY: 'hidden' },
    layout.showHeader && h(Box, { borderStyle: 'round', borderColor: CY, paddingX: 1, flexShrink: 0, ...oneLine },
      h(Text, { color: CY, bold: true }, 'SOVEREIGN  '),
      h(Text, { color: DIM }, 'backend '), h(Text, { color: DOT_COLOR[backendDot.tone] }, backendDot.glyph),
      h(Text, { color: DIM }, '  cache '), h(Text, { color: DOT_COLOR[cacheDot.tone] }, cacheDot.glyph),
      h(Text, { color: DIM }, '  quotes '), h(Text, { color: DOT_COLOR[quoteDot.tone] }, quoteDot.glyph),
      daemonStatus && h(Text, { color: DIM }, '  '),
      daemonStatus && h(Text, { color: daemonStatus.status === 'sleeping' ? MUT : AM, wrap: 'truncate-end' },
        daemonStatus.status === 'sleeping' ? '⏾ backfill idle' : `⟳ backfill ${daemonBar} ${daemonStatus.completed_jobs || 0}/${daemonStatus.total_jobs || 0} ${daemonStatus.current_symbol || ''}`),
      h(Box, { flexGrow: 1 }),
      h(Text, { color: MUT }, clock),
    ),
    focus === 'pin' ? pinView : dashboardBody,
    layout.showFooter && h(Box, { borderStyle: 'single', borderColor: BDR, paddingX: 1, flexShrink: 0, ...oneLine },
      h(Text, { color: MUT, wrap: 'truncate-end' }, footerHint),
    ),
    focus !== 'pin' && chatBar,
  );
};

// ── Command execution ───────────────────────────────────────────────────
// Runs the built argv as a real `sovereign_cli.js` child process (inherited
// stdio) so existing auth/confirm gates inside command handlers (readline
// prompts, requireAuth/PIN) behave exactly as they do outside the dashboard.
// Ink owns raw mode while mounted, so it's unmounted first and remounted
// after the child exits and the user acknowledges the output.
// The long-standing cockpit/polymarket/trade "crashes" reports (see the
// //crashes notes in M) have never left a stack trace -- the dashboard owns
// the terminal, so a throw during the unmount->spawn->remount cycle scrolls
// away or is masked by a redraw. Record the failing argv + full stack to
// workspace/dashboard_crash.log so one live repro is enough to root-cause.
let lastRunArgv = null;
function logDashboardCrash(kind, err) {
  try {
    const fs = require('node:fs');
    const logPath = path.join(__dirname, '..', '..', 'workspace', 'dashboard_crash.log');
    const stack = (err && err.stack) || String(err);
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${kind} | argv=[${(lastRunArgv || []).join(' ')}]\n${stack}\n\n`);
    return logPath;
  } catch { return null; }
}

let dashboard = null;

function waitForKeypress() {
  return new Promise((resolve) => {
    const { stdin } = process;
    const wasRaw = !!stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.once('data', () => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve();
    });
  });
}

async function runExternal(argv, returnState) {
  lastRunArgv = argv;
  const cmdStr = argv.join(' ');
  const isInteractive = Array.from(INTERACTIVE_CMDS).some(ic => cmdStr.startsWith(ic) || cmdStr === ic);
  if (!isInteractive) {
    return;
  }
  // handleRun calls onRun (this function) fire-and-forget from inside an Ink
  // useInput keypress handler, so the synchronous part of this async function
  // still runs INSIDE that handler's call stack, before Ink has finished
  // dispatching the keypress. Unmounting here used to happen before this
  // await, tearing down Ink's stdin/raw-mode ownership mid-dispatch - the
  // root cause of intermittent crashes on login/register/mt5/etc (every
  // INTERACTIVE_CMDS entry). Wait for a fresh tick FIRST so the unmount
  // always happens after the current keypress is fully handled.
  await new Promise((resolve) => setImmediate(resolve));
  if (dashboard) {
    try {
      dashboard.unmount();
    } catch (err) {
      console.log('\n(dashboard unmount warning: ' + (err && err.message ? err.message : err) + ')\n');
    }
    dashboard = null;
  }
  // The dev-review crash reports for cockpit/polymarket markets/derive-creds/
  // login all trace to THIS shared launch path, not the commands themselves
  // (each one runs clean standalone via `sovereign <cmd>` directly) -- so a
  // single try/catch here, rather than four per-command fixes, is the actual
  // fix. Any failure (spawn error, a remount throwing on corrupted Ink state)
  // is reported and the loop still falls through to remounting instead of
  // letting an uncaught exception kill the whole TUI process.
  // dashboard.unmount() above restores cooked terminal mode (Ink no longer
  // owns raw mode / its own SIGINT handling once unmounted). With raw mode
  // off, a Ctrl+C typed while the child runs is a real console Ctrl+C event,
  // not just a keypress byte -- and on Windows that event is broadcast to
  // EVERY process attached to the console, including this parent. Node's
  // default behavior for an unhandled SIGINT is immediate, silent process
  // termination (no exception, so the try/catch below can never see it --
  // this is what was actually causing the reported crashes, not a thrown
  // error). A temporary no-op listener for the duration of the child's run
  // absorbs that signal in the parent; the child (which owns its own
  // readline/raw-mode handling) still sees and can act on it normally.
  const sigintGuard = () => {};
  process.on('SIGINT', sigintGuard);
  try {
    console.log('\n$ sovereign ' + argv.join(' ') + '\n');
    spawnSync(process.execPath, [path.join(__dirname, 'sovereign_cli.js'), ...argv], { stdio: 'inherit' });
    console.log('\n— press any key to return to dashboard —');
    await waitForKeypress();
  } catch (err) {
    console.log('\nError running command: ' + (err && err.message ? err.message : err) + '\n');
  } finally {
    process.removeListener('SIGINT', sigintGuard);
  }
  try {
    mountDashboard(returnState);
  } catch (err) {
    console.log('\nFailed to restore dashboard: ' + (err && err.message ? err.message : err) + '\n');
    process.exitCode = 1;
  }
}

function mountDashboard(initial) {
  // Normal terminal flow -- no alternate screen buffer (\x1b[?1049h). Forcing
  // alt-screen + fullscreen made Ink mis-position the cursor on win32 conhost
  // (typed chars ghosted into the bottom-right corner). gemini-cli / Claude
  // Code render in normal flow on the same console; matching that fixes it.
  // One-time clear (screen + scrollback + cursor home) so the inline frame
  // starts on a blank slate -- without alt-screen, prior terminal content (a
  // shell prompt, earlier typing) would otherwise linger on rows the
  // non-fullscreen frame doesn't paint over. One-shot at mount, never per
  // keystroke, so it doesn't reintroduce redraw flicker.
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  dashboard = render(h(App, {
    initialCatI: initial ? initial.catI : 0,
    initialCmdI: initial ? initial.cmdI : -1,
    onRun: runExternal,
  }));
}

// Guarded so this file can be imported (e.g. by tests) without launching the
// real dashboard against the live process.stdin/stdout.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Installed only on the real launch (not when tests import this module) so a
  // crash during the interactive spawn cycle is recorded with its stack +
  // failing command instead of vanishing. Also resets the cursor/colors so a
  // crash doesn't leave the terminal in raw/hidden-cursor state.
  process.on('uncaughtException', (err) => {
    const p = logDashboardCrash('uncaughtException', err);
    try { if (process.stdout.isTTY) process.stdout.write('\x1b[?25h\x1b[0m\n'); } catch { /* ignore */ }
    console.error(`\n✖ Dashboard crashed (uncaughtException)${p ? ` — stack saved to ${p}` : ''}:\n${(err && err.stack) || err}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    const p = logDashboardCrash('unhandledRejection', err);
    console.error(`\n✖ Dashboard unhandled rejection${p ? ` — saved to ${p}` : ''}:\n${(err && err.stack) || err}\n`);
  });
  mountDashboard();
}

export { App, M, INTERACTIVE_CMDS };
