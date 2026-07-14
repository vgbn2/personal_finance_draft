'use strict';

function splitWords(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean);
}

// The static dashboard manifest sometimes ships a single placeholder option
// (e.g. opts:['<registered strategies>']) for flags whose real choices are
// only known at runtime (registered strategies, etc). Treat those as free
// text rather than cycling through the literal placeholder string. Once
// loadStrategyOptions() resolves real entries, the manifest swaps the
// placeholder array for the real one and this never fires for --strategy
// again — it stays as a safety net for a genuinely empty registry.
function isPlaceholderSelect(meta) {
  return !!meta && meta.t === 'sel' && Array.isArray(meta.opts) &&
    meta.opts.length === 1 && /^</.test(meta.opts[0]);
}

function defaultFlagValues(cmd) {
  const values = {};
  for (const [key, meta] of Object.entries((cmd && cmd.flags) || {})) {
    values[key] = meta.def;
  }
  return values;
}

// 'sel' opts are either plain strings or { label, value } pairs (the latter
// for registry-backed flags where the stored/CLI value, e.g. a strategy file
// path, differs from what should be displayed).
function optionValue(opt) {
  return (opt && typeof opt === 'object') ? opt.value : opt;
}

function optionLabel(meta, value) {
  const opts = (meta && meta.opts) || [];
  const found = opts.find((opt) => optionValue(opt) === value);
  if (found && typeof found === 'object') return found.label;
  return value;
}

function cycleOption(meta, current, dir) {
  const opts = (meta && meta.opts) || [];
  if (opts.length === 0) return current;
  const values = opts.map(optionValue);
  let idx = values.indexOf(current);
  if (idx === -1) idx = 0;
  idx = ((idx + dir) % opts.length + opts.length) % opts.length;
  return values[idx];
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(str) {
  return String(str || '').replace(ANSI_PATTERN, '');
}

// Mirrors the legacy TUI's tui/manifest.js getRegisteredStrategies(): same
// canonical data source (commands/strategy/strategy.js), but the dashboard
// renders its own plain-text flag boxes (no ANSI passthrough), so the
// embedded [ON]/[OFF] color codes in registeredStrategyOptions()'s labels
// are stripped rather than reproduced.
function loadStrategyOptions() {
  try {
    const { registeredStrategyOptions } = require('../commands/strategy/strategy.js');
    return registeredStrategyOptions().map((opt) => ({ label: stripAnsi(opt.label), value: opt.value }));
  } catch {
    return [];
  }
}

// Boolean (yn) flags are presence-only switches (pushed bare when true,
// omitted when false); sel/txt flags pass `--flag value` when non-blank.
function buildArgv(cmd, flagValues) {
  const argv = splitWords(cmd.id);
  const values = flagValues || {};
  for (const [key, meta] of Object.entries((cmd && cmd.flags) || {})) {
    const value = values[key];
    if (meta.t === 'yn') {
      if (value) argv.push(key);
      continue;
    }
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str === '') continue;
    argv.push(key, str);
  }
  return argv;
}

// Maps a cockpit-model health state to a status-dot glyph + semantic tone.
// Presentation-agnostic on purpose (no color values) — the Ink renderer owns
// the palette; this just classifies the 4 states buildCockpitModel()'s
// status fields actually produce ('available'/'ok' -> good, 'warn' -> warn,
// anything else incl. 'unavailable' -> bad).
function healthDot(state) {
  if (state === 'available' || state === 'ok') return { tone: 'good', glyph: '●' };
  if (state === 'warn') return { tone: 'warn', glyph: '◐' };
  return { tone: 'bad', glyph: '●' };
}

// Lazy + memoized: requiring commands/operational/status.js pulls in the TUI
// prompt stack, which is only needed the first time the dashboard header
// actually asks for live health (tests that never call this never pay for it).
let _buildCockpitModel = null;

function loadDashboardHealth() {
  try {
    if (!_buildCockpitModel) {
      _buildCockpitModel = require('../commands/operational/status.js').buildCockpitModel;
    }
    const model = _buildCockpitModel();
    return { backend: model.status.backend, cache: model.status.cache, quote_provider: model.status.quote_provider };
  } catch {
    return { backend: 'unavailable', cache: 'warn', quote_provider: 'warn' };
  }
}

// Same data source the legacy TUI's pickAssets() wizard uses (parses
// config/markets/data_sources.yaml's universe_matrix grid + merges anything
// already in the backtest-history cache), carrying family/market/sector --
// the depth needed for the same category/sector grouping pickAssets() shows.
// That wizard is gated on isRichTerminal() and never fires against the
// dashboard's piped, non-TTY child spawns, so this powers the Ink dashboard's
// own modal picker overlay instead (see buildSymbolPickerRows below).
async function loadFullSymbolUniverse() {
  try {
    const { get_Full_Universe_Symbols } = require('../lib/utils.js');
    const universe = await get_Full_Universe_Symbols();
    return universe.map((u) => ({
      symbol: u.symbol,
      category: `${String(u.family || 'other').toUpperCase()}: ${u.market || 'GLOBAL'}`,
      sector: u.sector || u.family || 'Uncategorized',
    }));
  } catch {
    return [];
  }
}

// Flattens the universe into a renderable row list for the picker overlay:
// one header row per (category, sector) pair present in the filtered set,
// followed by its symbol rows -- mirrors the legacy buildHierarchy() +
// buildChoices() shape (engine/asset_picker.js), just pre-flattened for a
// React list instead of an ANSI-rendered one. A query filters by substring
// match against symbol/category/sector; when the query doesn't exactly
// match any known symbol, a leading "custom" row lets the user select the
// typed text itself (e.g. for `ingest`, which can fetch a symbol that isn't
// in the cache yet) -- the picker is an enhanced browser, not a restriction.
function buildSymbolPickerRows(universe, query) {
  const list = universe || [];
  const q = String(query || '').trim().toLowerCase();
  const filtered = !q
    ? list
    : list.filter((u) => (
        u.symbol.toLowerCase().includes(q) ||
        u.category.toLowerCase().includes(q) ||
        u.sector.toLowerCase().includes(q)
      ));

  const groups = new Map();
  for (const u of filtered) {
    const groupKey = `${u.category}::${u.sector}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { category: u.category, sector: u.sector, items: [] });
    groups.get(groupKey).items.push(u);
  }

  const rows = [];
  const trimmedQuery = String(query || '').trim();
  const exactMatch = q && list.some((u) => u.symbol.toLowerCase() === q);
  if (trimmedQuery && !exactMatch) {
    rows.push({ type: 'custom', value: trimmedQuery.toUpperCase(), groupKey: null });
  }
  [...groups.keys()].sort().forEach((groupKey) => {
    const { category, sector, items } = groups.get(groupKey);
    rows.push({ type: 'header', groupKey, label: `${category} — ${sector}` });
    items.slice().sort((a, b) => a.symbol.localeCompare(b.symbol))
      .forEach((u) => rows.push({ type: 'item', value: u.symbol, groupKey }));
  });
  return rows;
}

function groupValuesFor(rows, groupKey) {
  return rows.filter((r) => r.type === 'item' && r.groupKey === groupKey).map((r) => r.value);
}

// Tri-state toggle: if every value in `values` is already in `set`, removes
// them all (uncheck-all); otherwise adds every one that's missing (check the
// rest). Matches the legacy multi-select's sector-header / "select all"
// toggle semantics exactly.
function toggleSet(set, values) {
  const next = new Set(set);
  const allIn = values.length > 0 && values.every((v) => next.has(v));
  if (allIn) values.forEach((v) => next.delete(v));
  else values.forEach((v) => next.add(v));
  return next;
}

// Where the picker's highlight should land right after a query changes
// (typing or backspacing). Multi-select fields can land on a header (Space
// toggles the whole group), so 0 is always fine there. Single-select fields
// can't act on a header at all (Enter only commits an item/custom row), and
// a header is often literally the first row whenever the query exactly
// matches one symbol -- without this, typing a full ticker and pressing
// Enter would silently do nothing.
function firstSelectableIndex(rows, multi) {
  if (multi) return 0;
  const idx = rows.findIndex((r) => r.type !== 'header');
  return idx === -1 ? 0 : idx;
}

// Same matching rule the dashboard uses to decide between the in-pane spawn
// path and the unmount+inherit-TTY path: prefix match, not a whole-word
// match (e.g. an INTERACTIVE_CMDS entry of 'run' matches any cmdStr starting
// with "run"). Extracted so the AI-testable safety harness can exercise the
// exact same allowlist instead of re-deriving a second copy that could drift.
function isInteractiveCmd(cmdStr, interactiveCmds) {
  return Array.from(interactiveCmds).some((ic) => cmdStr.startsWith(ic) || cmdStr === ic);
}

// Reads backfill-daemon's status file and returns it ONLY when it describes
// a live, actively-progressing run -- regardless of whether the dashboard
// itself started that process (a separate terminal, or the Docker `backfill`
// service, write the exact same file). Returns null for: file missing/
// unparseable, the writer's PID no longer exists (process.kill(pid,0) is the
// standard cross-platform liveness probe -- it never actually signals
// anything when the signal number is 0, just checks permission/existence),
// or a status that isn't 'running'/'sleeping' (idle/stopped = nothing to show).
// Known limitation: if a process crashed without the SIGINT/SIGTERM handler
// running (so status stayed 'running') AND the OS later reuses that exact
// PID for an unrelated process before this is next read, this would show a
// stale phantom entry -- accepted as a low-probability, cosmetic-only risk
// (it only affects this read-only progress display, nothing it gates).
function readDaemonStatus(statusPath) {
  const fs = require('node:fs');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.pid !== 'number') return null;
  try {
    process.kill(parsed.pid, 0);
  } catch {
    return null;
  }
  if (parsed.status !== 'running' && parsed.status !== 'sleeping') return null;
  return parsed;
}

// Small fixed-width ASCII bar for the header strip -- e.g. renderProgressBar(3,10) -> '███░░░░░░░'.
function renderProgressBar(completed, total, width = 10) {
  if (!Number.isFinite(total) || total <= 0) return '░'.repeat(width);
  const ratio = Math.max(0, Math.min(1, completed / total));
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

module.exports = {
  splitWords, isPlaceholderSelect, defaultFlagValues, cycleOption, buildArgv,
  optionValue, optionLabel, stripAnsi, loadStrategyOptions, healthDot, loadDashboardHealth,
  isInteractiveCmd, loadFullSymbolUniverse, buildSymbolPickerRows, groupValuesFor, toggleSet,
  firstSelectableIndex, readDaemonStatus, renderProgressBar,
};
