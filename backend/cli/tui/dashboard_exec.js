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

// Mirrors the legacy TUI's tui/manifest.js getCachedSymbols(): same cached-
// universe data source (storage/data/cache/backtest_history.json, falling
// back to config), used to power the dashboard's symbol-flag autocomplete
// suggestion list. The legacy readline TUI shows a full pickAssets() wizard
// for blank --symbol flags, but that's gated on isRichTerminal() and never
// fires against the dashboard's piped, non-TTY child spawns -- this gives
// the Ink dashboard its own lightweight, synchronous equivalent.
function loadSymbolUniverse() {
  try {
    const { getCachedSymbols } = require('./manifest.js');
    return getCachedSymbols();
  } catch {
    return [];
  }
}

// For a comma-separated (multi) buffer, only the segment after the last
// comma is "being typed" right now -- e.g. typing "AAPL,MS" should suggest
// matches for "MS", not the whole string. Single-value buffers use the
// whole buffer as the query.
function currentSuggestionQuery(buffer, multi) {
  const str = String(buffer || '');
  if (!multi) return str;
  const idx = str.lastIndexOf(',');
  return idx === -1 ? str : str.slice(idx + 1).trim();
}

// Case-insensitive substring match against a symbol's value/label/category,
// capped at `limit` results so the suggestion list stays on-screen. A blank
// query returns the first `limit` universe entries (browse-without-typing).
function filterSymbolSuggestions(universe, query, limit = 8) {
  const list = universe || [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  return list
    .filter((u) => (
      String(u.value || '').toLowerCase().includes(q) ||
      String(u.label || '').toLowerCase().includes(q) ||
      String(u.category || '').toLowerCase().includes(q)
    ))
    .slice(0, limit);
}

// Tab-autocomplete: single-value fields replace the whole buffer; comma-sep
// (multi) fields replace only the last (possibly partial) segment after the
// final comma, leaving prior selections intact -- e.g. "AAPL,MS" + Tab on
// "MSFT" -> "AAPL,MSFT".
function applySuggestionToBuffer(buffer, suggestionValue, multi) {
  if (!multi) return suggestionValue;
  const parts = String(buffer || '').split(',');
  parts[parts.length - 1] = suggestionValue;
  return parts.join(',');
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
  isInteractiveCmd, loadSymbolUniverse, currentSuggestionQuery, filterSymbolSuggestions,
  applySuggestionToBuffer, readDaemonStatus, renderProgressBar,
};
