import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const h = React.createElement;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  splitWords, isPlaceholderSelect, defaultFlagValues, cycleOption, buildArgv,
  optionLabel, loadStrategyOptions, healthDot, loadDashboardHealth, isInteractiveCmd,
  loadSymbolUniverse, currentSuggestionQuery, filterSymbolSuggestions, applySuggestionToBuffer,
} = require('./tui/dashboard_exec.js');

// Resolved once at module load (mirrors tui/manifest.js's static-per-process
// registry read); falls back to the manual-text-entry placeholder if the
// registry is empty or unreadable.
const STRATEGY_OPTIONS = loadStrategyOptions();
const STRATEGY_FLAG_OPTS = STRATEGY_OPTIONS.length > 0 ? STRATEGY_OPTIONS : ['<registered strategies>'];

// Same cached-symbol source the legacy TUI's pickAssets() wizard reads, but
// that wizard is gated on isRichTerminal() and never fires against the
// dashboard's piped child spawns -- this powers a lightweight autocomplete
// suggestion list on --symbol-style flags instead (see pickSymbol below).
const SYMBOL_UNIVERSE = loadSymbolUniverse();

const INTERACTIVE_CMDS = new Set([
  'cockpit',
  'polymarket markets',
  'polymarket derive-creds',
  'login',
  'register',
  'add-platform',
  'alpaca',
  'mt5',
  'trade favorites',
  'strategy',
  'prop-firms',
  'run',
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
      { id: 'cockpit',     label: 'cockpit',      desc: 'Terminal dashboard (cockpit model)', flags: {} },
      { id: 'watch',       label: 'watch',        desc: 'Live data feed, polls every N min',
        flags: {
          '--family':   { t:'sel', opts:['all','crypto','fx','equities','indices','commodities','macro'], lbl:'Data family', def:'all' },
          '--interval': { t:'txt', lbl:'Poll interval (minutes)', def:'15' },
        },
      },
      { id: 'cache-clean', label: 'cache-clean',  desc: 'Quarantine rejected cache records',
        flags: {
          '--dry-run': { t:'yn', lbl:'Preview only? (no deletion)', def:true, warn:true },
        },
      },
    ],
  },
  {
    label: 'Data', full: 'DATA & BACKFILL',
    cmds: [
      { id: 'backend integrity', label: 'backend integrity', desc: 'Per-symbol freshness & coverage report',
        flags: {
          '--audit-vintages': { t:'yn', lbl:'Only show vintage anomalies?', def:false },
        },
      },
      { id: 'ingest', label: 'ingest', desc: 'Fetch latest market data (all providers)',
        flags: {
          '--family':       { t:'sel', opts:['all','crypto','fx','equities','indices','commodities','macro','onchain','prediction_market'], lbl:'Data family', def:'all' },
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
          '--concurrency':   { t:'txt', lbl:'Symbols in parallel per provider', def:'5' },
          '--interval-secs': { t:'txt', lbl:'Loop interval seconds (daemon only)', def:'1800' },
        },
      },
      { id: 'intraday-rollup', label: 'intraday-rollup', desc: 'Derive coarser bins from 1m/5m base',
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
      { id: 'backend status',      label: 'backend status',      desc: 'C++ backend health check', flags: {} },
      { id: 'backend stats',       label: 'backend stats',       desc: 'Equity curve statistics from backtest', flags: {} },
      { id: 'backend correlation', label: 'backend correlation', desc: 'Pearson correlation matrix → heatmap',
        flags: {
          '--timeframe':        { t:'sel', opts:['1d','1h','4h','15m','5m','1m'], lbl:'Timeframe', def:'1d' },
          '--max-bars':         { t:'txt', lbl:'Lookback period (bars)', def:'252' },
          '--method':           { t:'sel', opts:['auto','pearson-returns','fx-returns','pearson-levels'], lbl:'Correlation method', def:'auto' },
          '--drop-non-overlap': { t:'yn',  lbl:'Drop non-overlapping symbols auto?', def:false },
        },
      },
      { id: 'backend visualize', label: 'backend visualize', desc: 'Sigma band live view (Bollinger)',
        flags: {
          '--symbol':    { t:'txt', lbl:'Symbol to visualize (required)', def:'', pickSymbol:'single' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m','5m'], lbl:'Timeframe', def:'1d' },
          '--window':    { t:'txt', lbl:'Rolling window (bars)', def:'20' },
          '--interval':  { t:'txt', lbl:'Poll interval (seconds)', def:'30' },
          '--no-poll':   { t:'yn',  lbl:'One-shot (no live poll)?', def:false },
        },
      },
      { id: 'backend universe', label: 'backend universe', desc: 'Cached symbol inventory (all families)', flags: {} },
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
      { id: 'models', label: 'models', desc: 'Model comparison & quality gate',
        flags: {
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
        },
      },
      { id: 'bt', label: 'bt', desc: 'Backtest — OOS split, trust gate, prop-firm fit',
        flags: {
          '--strategy':       { t:'sel', opts:STRATEGY_FLAG_OPTS, lbl:'Strategy file', def:'' },
          '--symbol':         { t:'txt', lbl:'Symbols comma-sep (blank = strategy universe)', def:'', pickSymbol:'multi' },
          '--timeframe':      { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
          '--days':           { t:'txt', lbl:'History window (days)', def:'730' },
          '--allow-degraded': { t:'yn',  lbl:'Allow degraded data quality?', def:false },
        },
      },
      { id: 'optimize', label: 'optimize', desc: 'Indicator period grid search (overfit-penalised)',
        flags: {
          '--strategy':  { t:'sel', opts:STRATEGY_FLAG_OPTS, lbl:'Strategy file', def:'' },
          '--symbol':    { t:'txt', lbl:'Symbols comma-sep (blank = strategy universe)', def:'', pickSymbol:'multi' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
        },
      },
      { id: 'edge-decay', label: 'edge-decay', desc: 'Rolling window alpha decay check',
        flags: {
          '--strategy':  { t:'sel', opts:STRATEGY_FLAG_OPTS, lbl:'Strategy file', def:'' },
          '--timeframe': { t:'sel', opts:['1d','1h','4h','15m'], lbl:'Timeframe', def:'1d' },
          '--symbol':    { t:'txt', lbl:'Symbol filter (optional)', def:'', pickSymbol:'single' },
        },
      },
    ],
  },
  {
    label: 'Trade', full: 'EXECUTION & TRADING',
    cmds: [
      { id: 'alpaca',       label: 'alpaca',       desc: 'Alpaca REST broker (US equities & crypto)', flags: {} },
      { id: 'mt5',          label: 'mt5',          desc: 'MT5 / EA terminal (forex, CFDs, futures)', flags: {} },
      { id: 'add-platform', label: 'add-platform', desc: '+ Add broker / trading platform wizard', flags: {} },
      { id: 'trade favorites', label: 'favorites',    desc: 'View / manage favourite symbols', flags: {} },
      { id: 'auto-trade',   label: 'auto-trade',   desc: 'Automated strategy execution loop',
        flags: {
          '--interval': { t:'txt', lbl:'Interval (minutes)', def:'15' },
          '--live':     { t:'yn',  lbl:'⚠ EXECUTE LIVE TRADES?', def:false, warn:true },
        },
      },
      { id: 'agent',      label: 'agent',      desc: 'AI agent task runner (local Ollama)',
        flags: {
          '--query': { t:'txt', lbl:'Task for the agent', def:'' },
        },
      },
      { id: 'strategy',   label: 'strategy',   desc: 'Strategy management (create/list/backtest/toggle)', flags: {} },
      { id: 'prop-firms', label: 'prop-firms', desc: 'Prop firm profile management', flags: {} },
      { id: 'run',        label: 'run',        desc: 'Persistent runners (paper bot, backfill loop)', flags: {} },
    ],
  },
  {
    label: 'Polymarket', full: 'PREDICTION MARKETS',
    cmds: [
      { id: 'polymarket portfolio',    label: 'polymarket portfolio',    desc: 'Live portfolio & pUSD balance', flags: {} },
      { id: 'polymarket markets',      label: 'polymarket markets',      desc: 'Browse & trade active markets (interactive)', flags: {} },
      { id: 'polymarket history',      label: 'polymarket history',      desc: 'Historical CLOB price data for an event',
        flags: {
          '--event':        { t:'txt', lbl:'Prediction event key', def:'fed_rate_cut_prob' },
          '--history-days': { t:'txt', lbl:'Historical days', def:'30' },
          '--timeframe':    { t:'sel', opts:['1d','1h','15m'], lbl:'Timeframe', def:'1h' },
        },
      },
      { id: 'polymarket backtest', label: 'polymarket backtest', desc: 'Resolved markets P&L backtest',
        flags: {
          '--strategy':        { t:'sel', opts:['low_prob_dip','mean_revert'], lbl:'Strategy', def:'low_prob_dip' },
          '--tag-id':          { t:'txt', lbl:'Gamma tag ID (21 = crypto 2023+)', def:'21' },
          '--days':            { t:'txt', lbl:'Days back to scan', def:'365' },
          '--max-markets':     { t:'txt', lbl:'Max markets to test', def:'20' },
          '--entry-threshold': { t:'txt', lbl:'Max entry price (low_prob_dip)', def:'0.15' },
        },
      },
      { id: 'polymarket derive-creds', label: 'polymarket derive-creds', desc: 'Derive L2 API credentials from wallet', flags: {} },
      {
        id: 'bot',
        label: 'bot',
        desc: 'Edge trader bot control panel',
        subcmds: [
          { id: 'health',  label: 'Health Check (credentials, API, balance)', desc: 'Check credentials, API, and balance', cmdStr: 'bot health' },
          { id: 'status',  label: 'Status',             desc: 'Show bot run status', cmdStr: 'bot status' },
          { id: 'cycle',   label: 'Run Cycle (dry-run)', desc: 'Run a single dry-run iteration', cmdStr: 'bot cycle' },
          { id: 'run',     label: 'Start Loop',         desc: 'Start continuous trading loop', cmdStr: 'bot run' },
          { id: 'enable',  label: 'Enable Bot',         desc: 'Enable the bot in config', cmdStr: 'bot config --key enabled --value true' },
          { id: 'disable', label: 'Disable Bot',        desc: 'Disable the bot in config', cmdStr: 'bot config --key enabled --value false' },
          { id: 'config',  label: 'View / Edit Config', desc: 'Edit bot parameters', cmdStr: 'bot config' },
          { id: 'back',    label: 'Back',               desc: 'Return to command list', cmdStr: '' }
        ]
      },
    ],
  },
  {
    label: 'Settings', full: 'SETTINGS & PREFERENCES',
    cmds: [
      { id: 'settings show',      label: 'settings show',      desc: 'Show current config (all settings)', flags: {} },
      { id: 'settings favorites', label: 'settings favorites', desc: 'Manage favourite symbols list',
        flags: {
          '--symbols': { t:'txt', lbl:'Comma-sep symbol list', def:'' },
        },
      },
      { id: 'settings timezone', label: 'settings timezone', desc: 'Set display timezone',
        flags: {
          '--value': { t:'sel', opts:['UTC','Europe/London','Asia/Ho_Chi_Minh','Asia/Singapore','Asia/Tokyo','America/New_York','America/Los_Angeles'], lbl:'Timezone', def:'UTC' },
        },
      },
      { id: 'settings layout', label: 'settings layout', desc: 'Set layout preset',
        flags: {
          '--preset': { t:'sel', opts:['default','compact','research'], lbl:'Layout preset', def:'default' },
        },
      },
      { id: 'settings params', label: 'settings params', desc: 'Default trading parameters',
        flags: {
          '--position-size':    { t:'txt', lbl:'Position size (USDC)', def:'100' },
          '--stop-loss':        { t:'txt', lbl:'Stop loss %', def:'0.05' },
          '--take-profit':      { t:'txt', lbl:'Take profit %', def:'0.10' },
          '--min-edge':         { t:'txt', lbl:'Min edge threshold', def:'0.05' },
          '--max-positions':    { t:'txt', lbl:'Max open positions', def:'10' },
          '--polling-interval': { t:'txt', lbl:'Polling interval (seconds)', def:'60' },
        },
      },
      { id: 'settings flags', label: 'settings flags', desc: 'Toggle feature flags (gates)',
        flags: {
          '--flag':  { t:'sel', opts:['polymarket','bot_autopilot','ai_agent_trading','multi_agent_research','onchain_data','auto_backfill'], lbl:'Feature flag', def:'' },
          '--value': { t:'sel', opts:['true','false'], lbl:'Enable?', def:'false' },
        },
      },
      { id: 'settings alerts', label: 'settings alerts', desc: 'Alert delivery preferences',
        flags: {
          '--email': { t:'yn', lbl:'Email alerts?', def:true },
          '--push':  { t:'yn', lbl:'Push alerts?',  def:false },
        },
      },
      { id: 'settings reset', label: 'settings reset', desc: 'Reset all settings to defaults', flags: {} },
    ],
  },
  {
    label: 'Account', full: 'ACCOUNT & AUTH (SUPABASE)',
    cmds: [
      { id: 'auth-status', label: 'auth-status', desc: 'Who am I / session expiry', flags: {} },
      { id: 'login',       label: 'login',       desc: 'Sign in (Supabase email + password)',
        flags: {
          '--email':    { t:'txt', lbl:'Email address', def:'' },
          '--password': { t:'txt', lbl:'Password (prompted if omitted)', def:'' },
        },
      },
      { id: 'register', label: 'register', desc: 'Create new account (email confirmation)',
        flags: {
          '--email': { t:'txt', lbl:'Email address', def:'' },
        },
      },
      { id: 'logout', label: 'logout', desc: 'Sign out & clear local session', flags: {} },
    ],
  },
];

// ── App ──────────────────────────────────────────────────────────────────
const App = ({ initialCatI = 0, initialCmdI = -1, onRun }) => {
  const { exit } = useApp();
  const [catI,  setCatI]  = useState(initialCatI);
  const [cmdI,  setCmdI]  = useState(initialCmdI);
  const [subcmdI, setSubcmdI] = useState(-1);
  const [focus, setFocus] = useState(initialCmdI >= 0 ? 'cmd' : 'side');
  const [flagI, setFlagI] = useState(-1);
  const [flagValues, setFlagValues] = useState({});
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [pinBuffer, setPinBuffer] = useState('');
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-GB'));
  const [health, setHealth] = useState(() => loadDashboardHealth());
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [lastExecuted, setLastExecuted] = useState([]);

  const childRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (childRef.current) {
        try { childRef.current.kill('SIGINT'); } catch (e) {}
      }
    };
  }, []);

  const handleRun = async (argv, pin) => {
    onRun(argv, { catI, cmdI });

    const cmdStr = argv.join(' ');
    const isInteractive = isInteractiveCmd(cmdStr, INTERACTIVE_CMDS);

    if (!isInteractive) {
      if (mountedRef.current) {
        setRunning(true);
        setLastExecuted(argv);
        setOutput('Running...\n');
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
        const child = spawn(process.execPath, [path.join(__dirname, 'sovereign_cli.js'), ...argv], {
          env
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
            resolve(code);
          });
          child.on('error', (err) => {
            if (mountedRef.current) setOutput((c) => c + '\nError: ' + err.message);
            resolve(-1);
          });
        });
      } catch (err) {
        if (mountedRef.current) setOutput('Error executing command: ' + err.message);
      } finally {
        childRef.current = null;
        if (mountedRef.current) setRunning(false);
      }
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

  // restore terminal on any exit
  useEffect(() => () => process.stdout.write('\x1b[?1049l'), []);

  const cat   = M[catI];
  const cmd   = cmdI >= 0 ? cat.cmds[cmdI] : null;
  const fkeys = cmd ? Object.keys(cmd.flags || {}) : [];

  // reset flag editor whenever the selected command changes
  useEffect(() => {
    setFlagValues(cmd ? defaultFlagValues(cmd) : {});
    setFlagI(0);
    setEditing(false);
  }, [cmd && cmd.id]);

  // Symbol-flag autocomplete: the active flag being edited (if any), whether
  // it's marked for symbol suggestions, and the live-filtered candidate list
  // for whatever's currently being typed (just the last comma-segment for
  // multi-value fields). Computed once per render so both the keyboard
  // handler and the flag panel's JSX agree on the same list.
  const activeFlagKey  = (focus === 'flags' && flagI >= 0 && flagI < fkeys.length) ? fkeys[flagI] : null;
  const activeFlagMeta = activeFlagKey ? cmd.flags[activeFlagKey] : null;
  const hasSymbolSuggestions = !!(activeFlagMeta && activeFlagMeta.pickSymbol);
  const suggestMulti = activeFlagMeta && activeFlagMeta.pickSymbol === 'multi';
  const suggestions = hasSymbolSuggestions
    ? filterSymbolSuggestions(SYMBOL_UNIVERSE, currentSuggestionQuery(editBuffer, suggestMulti))
    : [];

  function handleEditChange(value) {
    setEditBuffer(value);
    setSuggestIndex(0);
  }

  function handleEditSubmit(value) {
    const fk = fkeys[flagI];
    setFlagValues(v => ({ ...v, [fk]: value }));
    setEditing(false);
  }

  function handlePinSubmit(pin) {
    setFocus('flags');
    setEditing(false);
    setPinBuffer('');
    handleRun(buildArgv(cmd, flagValues), pin);
  }

  // keyboard
  useInput((input, key) => {
    if (running) {
      if (key.escape || input === 'c') {
        if (childRef.current) {
          try { childRef.current.kill('SIGINT'); } catch (e) {}
          setOutput((c) => c + '\n\n[Command aborted by user]\n');
        }
        setRunning(false);
        return;
      }
      if (key.ctrl && input === 'c') {
        if (childRef.current) {
          try { childRef.current.kill('SIGINT'); } catch (e) {}
        }
        process.stdout.write('\x1b[?1049l');
        exit();
        return;
      }
      return;
    }

    if (focus === 'pin') {
      if (key.escape) {
        setFocus('flags');
        setPinBuffer('');
        setEditing(false);
      }
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      process.stdout.write('\x1b[?1049l');
      exit();
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
      if (editing) {
        // Symbol-flag autocomplete: ↑↓ browse the live suggestion list, Tab
        // accepts the highlighted one into editBuffer. Everything else
        // (character typing, backspace, Enter-to-submit) is left to
        // TextInput's own hook -- this branch must not fall through to the
        // flagI-navigation logic below, which would hijack ↑↓ into moving
        // the selected flag instead of the suggestion highlight.
        if (hasSymbolSuggestions) {
          if (key.upArrow)   { setSuggestIndex(i => Math.max(0, i - 1)); return; }
          if (key.downArrow) { setSuggestIndex(i => Math.min(Math.max(suggestions.length - 1, 0), i + 1)); return; }
          if (key.tab && suggestions[suggestIndex]) {
            setEditBuffer((buf) => applySuggestionToBuffer(buf, suggestions[suggestIndex].value, suggestMulti));
            setSuggestIndex(0);
            return;
          }
        }
        return;
      }
      const maxI = fkeys.length; // trailing index == the "Run" row
      if (key.escape) { setFocus('cmd'); setFlagI(-1); return; }
      if (key.upArrow)   { setFlagI(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setFlagI(i => Math.min(maxI, i + 1)); return; }
      if (flagI === maxI) {
        if (key.return) {
          const isLive = flagValues['--live'] === true;
          const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
          if (isLive && expectedPin) {
            setPinBuffer('');
            setFocus('pin');
            setEditing(true);
          } else {
            handleRun(buildArgv(cmd, flagValues));
          }
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
        } else if (textLike) {
          setEditBuffer(String(flagValues[fk] ?? ''));
          setEditing(true);
        } else {
          setFlagValues(v => ({ ...v, [fk]: cycleOption(meta, v[fk], 1) }));
        }
      }
    }
  }, { isActive: !editing || focus === 'pin' || hasSymbolSuggestions });

  // ── Sidebar items ──────────────────────────────────────────────────────
  const sideItems = M.map((c, i) => {
    const on = i === catI;
    return h(Text, { key: c.label, color: on ? (focus === 'side' ? CY : YL) : DIM },
      (on ? '▸ ' : '  ') + c.label
    );
  });

  // ── Command rows ───────────────────────────────────────────────────────
  // Drilled into a command's flags/sub-options: collapse the list to just the
  // active row so the flag/sub-option panel below has room — showing the full
  // list AND a multi-flag panel at once can exceed terminal rows and corrupt
  // Ink's cursor-repositioning redraw (frames visually overlap).
  const drilled = (focus === 'flags' || focus === 'subcmd' || focus === 'pin') && !!cmd;
  const cmdRows = drilled
    ? [
        h(Box, { key: cmd.id },
          h(Text, { color: YL }, '▸ '),
          h(Box,  { width: 23 }, h(Text, { color: YL }, cmd.label)),
          h(Text, { color: VAL }, cmd.desc),
        ),
      ]
    : cat.cmds.map((c, i) => {
        const on   = i === cmdI;
        const hasF = Object.keys(c.flags || {}).length > 0 || !!c.subcmds;
        return h(Box, { key: c.id },
          h(Text, { color: on ? YL : BDR }, on ? '▸ ' : '  '),
          h(Box,  { width: 23 }, h(Text, { color: on ? YL : DIM }, c.label)),
          h(Text, { color: on ? VAL : MUT }, c.desc),
          hasF && h(Text, { color: on ? AM : BDR }, '  ›'),
        );
      });

  // ── Flag panel ─────────────────────────────────────────────────────────
  let flagPanel;
  if (!cmd) {
    flagPanel = h(Text, { color: MUT }, '  ⏎ or → to enter command list');
  } else if (focus === 'pin') {
    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: RD, bold: true }, '  ⚠ LIVE EXECUTION SECURITY GATE'),
      h(Text, { color: VAL }, '    Please enter your 4-digit Trade PIN to authorize live trades:'),
      h(Box, { marginY: 1 },
        h(Text, { color: YL }, '    PIN: '),
        h(TextInput, { value: pinBuffer, onChange: setPinBuffer, onSubmit: handlePinSubmit, mask: '*' })
      ),
      h(Text, { color: MUT }, '    (Press Escape to cancel execution)')
    );
  } else if (cmd.subcmds) {
    const subRows = cmd.subcmds.map((s, idx) => {
      const active = focus === 'subcmd' && idx === subcmdI;
      return h(Box, { key: s.id },
        h(Text, { color: active ? YL : BDR }, active ? '▸ ' : '  '),
        h(Box,  { width: 40 }, h(Text, { color: active ? YL : VAL }, s.label)),
        h(Text, { color: active ? VAL : MUT }, s.desc),
      );
    });

    const activeSub = subcmdI >= 0 ? cmd.subcmds[subcmdI] : null;
    const cmdStr = activeSub ? activeSub.cmdStr : '';

    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY }, '  › ' + cmd.id + ' sub-options:'),
      ...subRows,
      h(Text, { color: BDR, wrap: 'none' }, '  sovereign ' + (cmdStr ? cmdStr : cmd.id)),
    );
  } else if (fkeys.length === 0) {
    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY },  '  › ' + cmd.id),
      h(Text, { color: MUT }, '    no configurable flags · ⏎ to run'),
      h(Text, { color: BDR, wrap: 'none' }, '  sovereign ' + cmd.id),
    );
  } else {
    const runActive = focus === 'flags' && flagI === fkeys.length;
    const flagRows = fkeys.map((f, idx) => {
      const m = cmd.flags[f];
      const active = focus === 'flags' && idx === flagI;
      const val = flagValues[f];
      const valueNode = (active && editing)
        ? h(TextInput, { value: editBuffer, onChange: handleEditChange, onSubmit: handleEditSubmit })
        : h(Text, { color: m.warn ? RD : AM }, m.t === 'yn' ? (val ? '[Y]' : '[N]') : ('[' + (optionLabel(m, val) || '') + ']'));
      return h(Box, { key: f },
        h(Text, { color: active ? YL : DIM }, active ? '▸ ' : '  '),
        h(Box,  { width: 22 }, h(Text, { color: active ? YL : VAL }, f)),
        h(Box,  { width: 15 }, valueNode),
        h(Text, { color: m.warn ? RD : MUT }, m.lbl),
      );
    });
    // Symbol-flag autocomplete: a live suggestion list under the active row
    // while editing a --symbol/--symbols-style flag, drawn from the real
    // cached symbol universe (no network, no fresh fetch).
    const suggestionRows = (editing && hasSymbolSuggestions)
      ? [
          h(Text, { key: '_hint', color: MUT },
            suggestions.length > 0 ? '    ↑↓ browse · Tab autocomplete' : '    (no cached symbols match)'),
          ...suggestions.map((s, i2) => h(Text, {
            key: s.value,
            color: i2 === suggestIndex ? YL : DIM,
          }, (i2 === suggestIndex ? '    → ' : '      ') + s.value + (s.category ? '  (' + s.category + ')' : ''))),
        ]
      : [];
    flagPanel = h(Box, { flexDirection: 'column' },
      h(Text, { color: CY }, '  › ' + cmd.id),
      ...flagRows,
      ...suggestionRows,
      h(Box, {},
        h(Text, { color: runActive ? GN : BDR }, runActive ? '▸ ' : '  '),
        h(Text, { color: runActive ? GN : MUT, bold: runActive }, '▶ Run'),
      ),
      h(Text, { color: BDR, wrap: 'none' }, '  sovereign ' + buildArgv(cmd, flagValues).join(' ')),
    );
  }

  const footerHint = (editing && hasSymbolSuggestions)
    ? '↑↓ browse suggestions  Tab autocomplete  ⏎ commit typed text  q quit'
    : focus === 'flags'
      ? '↑↓ field  ←→ change  ⏎ edit/run  esc back  q quit'
      : focus === 'subcmd'
        ? '↑↓ option  ⏎ run  esc/← back  q quit'
        : '↑↓ category  ⏎/→ enter cmd  ↑↓ command  esc/← back  q quit';

  const maxLines = Math.max(5, (process.stdout.rows || 24) - 10);
  const outputLines = output ? output.split('\n') : [];
  const visibleLines = outputLines.slice(-maxLines);

  const backendDot = healthDot(health.backend);
  const cacheDot = healthDot(health.cache);
  const quoteDot = healthDot(health.quote_provider);

  // ── Render ─────────────────────────────────────────────────────────────
  return h(Box, { flexDirection: 'column', height: process.stdout.rows },

    // Header
    h(Box, { borderStyle: 'round', borderColor: CY, paddingX: 1 },
      h(Text, { color: CY, bold: true }, 'SOVEREIGN  '),
      h(Text, { color: DIM }, 'backend '), h(Text, { color: DOT_COLOR[backendDot.tone] }, backendDot.glyph),
      h(Text, { color: DIM }, '  cache '), h(Text, { color: DOT_COLOR[cacheDot.tone] }, cacheDot.glyph),
      h(Text, { color: DIM }, '  quotes '), h(Text, { color: DOT_COLOR[quoteDot.tone] }, quoteDot.glyph),
      h(Box,  { flexGrow: 1 }),
      h(Text, { color: MUT }, clock),
    ),

    // Body
    h(Box, { flexDirection: 'row', flexGrow: 1 },

      // Sidebar
      h(Box, {
        width: 20,
        flexShrink: 0,
        borderStyle: 'single',
        borderColor: focus === 'side' ? CY : BDR,
        flexDirection: 'column',
        paddingX: 1,
      },
        h(Text, { color: DIM }, 'MENU'),
        h(Text, { color: BDR }, '──────────────'),
        ...sideItems,
      ),

      // Content
      h(Box, {
        width: 76,
        flexShrink: 0,
        borderStyle: 'single',
        borderColor: (focus === 'cmd' || focus === 'subcmd' || focus === 'flags') ? CY : BDR,
        flexDirection: 'column',
        paddingX: 1,
      },
        h(Text, { color: YL, bold: true }, cat.full),
        h(Text, { color: BDR }, '─'.repeat(72)),
        ...cmdRows,
        h(Text, { color: BDR }, '─'.repeat(72)),
        flagPanel,
      ),

      // Output
      h(Box, {
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: BDR,
        flexDirection: 'column',
        paddingX: 1,
      },
        h(Text, { color: CY, bold: true }, 'COMMAND OUTPUT'),
        h(Text, { color: BDR }, '─'.repeat(40)),
        running
          ? h(Box, { flexDirection: 'column' },
              h(Text, { color: YL, bold: true }, `⌛ Running: sovereign ${lastExecuted.join(' ')}`),
              h(Text, { color: MUT }, 'Please wait for execution to complete...'),
            )
          : output
            ? h(Box, { flexDirection: 'column' },
                h(Text, { color: GN, bold: true }, `$ sovereign ${lastExecuted.join(' ')}`),
                h(Text, { color: BDR }, '─'.repeat(40)),
                ...visibleLines.map((line, idx) => h(Text, { key: idx, color: VAL }, line))
              )
            : h(Box, { flexDirection: 'column' },
                h(Text, { color: MUT }, 'No command executed yet.'),
                h(Text, { color: MUT }, 'Select a command and choose Run to see output.')
              )
      ),
    ),

    // Footer
    h(Box, { borderStyle: 'single', borderColor: BDR, paddingX: 1 },
      h(Text, { color: MUT }, footerHint),
    ),
  );
};

// ── Command execution ───────────────────────────────────────────────────
// Runs the built argv as a real `sovereign_cli.js` child process (inherited
// stdio) so existing auth/confirm gates inside command handlers (readline
// prompts, requireAuth/PIN) behave exactly as they do outside the dashboard.
// Ink owns raw mode while mounted, so it's unmounted first and remounted
// after the child exits and the user acknowledges the output.
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
    dashboard.unmount();
    dashboard = null;
  }
  console.log('\n$ sovereign ' + argv.join(' ') + '\n');
  spawnSync(process.execPath, [path.join(__dirname, 'sovereign_cli.js'), ...argv], { stdio: 'inherit' });
  console.log('\n— press any key to return to dashboard —');
  await waitForKeypress();
  mountDashboard(returnState);
}

function mountDashboard(initial) {
  process.stdout.write('\x1b[?1049h');
  dashboard = render(h(App, {
    initialCatI: initial ? initial.catI : 0,
    initialCmdI: initial ? initial.cmdI : -1,
    onRun: runExternal,
  }));
}

// Guarded so this file can be imported (e.g. by tests) without launching the
// real dashboard against the live process.stdin/stdout.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mountDashboard();
}

export { App, M, INTERACTIVE_CMDS };
