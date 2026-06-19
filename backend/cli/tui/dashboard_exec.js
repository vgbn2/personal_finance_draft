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

// Same matching rule the dashboard uses to decide between the in-pane spawn
// path and the unmount+inherit-TTY path: prefix match, not a whole-word
// match (e.g. an INTERACTIVE_CMDS entry of 'run' matches any cmdStr starting
// with "run"). Extracted so the AI-testable safety harness can exercise the
// exact same allowlist instead of re-deriving a second copy that could drift.
function isInteractiveCmd(cmdStr, interactiveCmds) {
  return Array.from(interactiveCmds).some((ic) => cmdStr.startsWith(ic) || cmdStr === ic);
}

module.exports = {
  splitWords, isPlaceholderSelect, defaultFlagValues, cycleOption, buildArgv,
  optionValue, optionLabel, stripAnsi, loadStrategyOptions, healthDot, loadDashboardHealth,
  isInteractiveCmd,
};
