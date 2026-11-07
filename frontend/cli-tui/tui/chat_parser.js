'use strict';

// Deterministic, no-network resolver for the dashboard's chat-style input box.
// Turns a typed line like "backend chart AAPL 1d" into the same {cmd,
// flagValues} shape the flag-grid panel already produces, so it can be handed
// straight to the existing buildArgv()/handleRun() path unchanged. Pure
// functions, no Ink/React/process dependencies, so this is unit-testable in
// isolation and the manifest/universes are injected rather than imported --
// callers (the dashboard, or a test) own where M/SYMBOL_UNIVERSE/
// STRATEGY_UNIVERSE come from.

const { defaultFlagValues, optionValue } = require('./dashboard_exec.js');

// Splits on whitespace but keeps "quoted substrings" together (for symbol
// lists or strategy paths that might contain spaces) -- same quoting idiom
// shells use, kept intentionally simple (no escaping support).
function tokenize(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

function allCommands(M) {
  const out = [];
  for (const cat of M || []) {
    for (const cmd of cat.cmds || []) {
      out.push(cmd);
    }
  }
  return out;
}

// Finds the best command match for the leading tokens. Prefers an exact,
// longest multi-word prefix match of cmd.id against the input (e.g. "backend
// chart" beats any single-word command when both "backend" and "chart" are
// typed); falls back to a substring/prefix match on the first token only
// when no exact id-word match exists. Returns null (no match), a single
// {cmd, consumed} (unambiguous match), or an array of candidate cmds
// (ambiguous -- caller decides what to do).
function resolveCommand(tokens, M) {
  const lower = tokens.map((t) => t.toLowerCase());
  const commands = allCommands(M);

  let best = null; // { cmd, consumed }
  for (const cmd of commands) {
    const idWords = String(cmd.id).toLowerCase().split(/\s+/);
    if (idWords.length > lower.length) continue;
    const isPrefix = idWords.every((w, i) => lower[i] === w);
    if (isPrefix && (!best || idWords.length > best.consumed)) {
      best = { cmd, consumed: idWords.length };
    }
  }
  if (best) return { cmd: best.cmd, remaining: tokens.slice(best.consumed) };

  // No exact multi-word match. Try the first token against id/label, but on
  // a trading platform a wrong silent match is much worse than a safe
  // "didn't understand" -- prefer a strict prefix match first (typo-
  // tolerant on the END of a word, e.g. "strat" -> "strategy", but never
  // matches a substring buried in the MIDDLE of an unrelated word). Loose
  // substring containment is only used as a last resort, and only for
  // tokens long enough (4+ chars) that a coincidental mid-word hit (e.g. the
  // 3-letter token "ate" matching inside "str-ATE-gy") is implausible.
  if (lower.length === 0) return null;
  const head = lower[0];

  const prefixCandidates = commands.filter((cmd) => {
    const id = String(cmd.id).toLowerCase();
    const label = String(cmd.label || '').toLowerCase();
    return id.startsWith(head) || label.startsWith(head);
  });
  if (prefixCandidates.length === 1) return { cmd: prefixCandidates[0], remaining: tokens.slice(1) };
  if (prefixCandidates.length > 1) return { ambiguous: true, candidates: prefixCandidates };

  if (head.length < 4) return null;
  const substringCandidates = commands.filter((cmd) => {
    const id = String(cmd.id).toLowerCase();
    const label = String(cmd.label || '').toLowerCase();
    return id.includes(head) || label.includes(head);
  });
  if (substringCandidates.length === 0) return null;
  if (substringCandidates.length === 1) return { cmd: substringCandidates[0], remaining: tokens.slice(1) };
  return { ambiguous: true, candidates: substringCandidates };
}

// Most blank-default text/picker flags are intentionally optional (the
// manifest documents the fallback right in the label, e.g. "blank = strategy
// universe", "blank = all in family") -- treating every blank default as
// "required" would block almost every real command. The manifest's actual
// authoring convention for a genuinely required flag is "(required)" in the
// label text (e.g. `backend chart`/`backend visualize`'s --symbol) -- use
// that explicit signal instead of guessing from the default value.
function isRequiredFlag(meta) {
  if (meta.t === 'yn') return false;
  return /\(required\)/i.test(meta.lbl || '');
}

// Matches a typed token against a {symbol,...}-shaped universe array (same
// shape SYMBOL_UNIVERSE/STRATEGY_UNIVERSE already use), preferring an exact
// case-insensitive match, then falling back to substring containment. If
// nothing matches, returns the token itself uppercased -- mirrors the
// existing "type a value not in the cached universe" precedent the picker
// overlay already allows (e.g. for `ingest`, which can fetch a brand-new
// symbol), so chat input is never more restrictive than the picker.
function matchUniverse(token, universe) {
  const needle = String(token || '').toLowerCase();
  if (!needle) return null;
  const list = universe || [];
  const exact = list.find((u) => String(u.symbol).toLowerCase() === needle);
  if (exact) return exact.symbol;
  const partial = list.find((u) => String(u.symbol).toLowerCase().includes(needle));
  if (partial) return partial.symbol;
  return token.toUpperCase();
}

function matchSelOption(token, meta) {
  const needle = String(token || '').toLowerCase();
  let rawOpts = meta.opts || meta.options;
  if (typeof rawOpts === 'function') {
    try { rawOpts = rawOpts(); } catch (e) { rawOpts = []; }
  }
  const opts = Array.isArray(rawOpts) ? rawOpts : [];
  const exact = opts.find((opt) => String(optionValue(opt)).toLowerCase() === needle);
  if (exact) return optionValue(exact);
  const partial = opts.find((opt) => String(optionValue(opt)).toLowerCase().includes(needle));
  if (partial) return optionValue(partial);
  return null;
}

// Assigns leftover tokens (after the command itself was consumed) to the
// command's flags: explicit "--flag value" pairs first, then any remaining
// bare tokens positionally, in manifest declaration order, to flags that
// still need a value -- skipping flags that already have a non-empty
// default (those are optional; chat input only needs to supply what the
// flag-grid panel would otherwise require you to fill in by hand).
function resolveFlags(cmd, tokens, universes = {}) {
  const { symbolUniverse = [], strategyUniverse = [] } = universes;
  const flagValues = defaultFlagValues(cmd);
  const flagKeys = Object.keys(cmd.flags || {});
  const assigned = new Set(); // keys explicitly set via "--flag value" in this parse
  const bare = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.startsWith('--')) {
      const key = flagKeys.find((k) => k.toLowerCase() === tok.toLowerCase());
      if (!key) continue; // unknown flag token -- ignore rather than fail the whole parse
      const meta = cmd.flags[key];
      if (meta.t === 'yn') {
        flagValues[key] = true;
        assigned.add(key);
        continue;
      }
      const valueTok = tokens[i + 1];
      if (valueTok === undefined || valueTok.startsWith('--')) continue;
      i += 1;
      flagValues[key] = meta.pickSymbol
        ? matchUniverse(valueTok, symbolUniverse)
        : meta.pickStrategy
          ? matchUniverse(valueTok, strategyUniverse)
          : meta.t === 'sel'
            ? (matchSelOption(valueTok, meta) || valueTok)
            : valueTok;
      assigned.add(key);
      continue;
    }
    bare.push(tok);
  }

  // Bare (non "--flag value") tokens fill remaining flags positionally, in
  // manifest order -- this is what lets "backend chart AAPL 1h" set both
  // --symbol and --timeframe without typing the flag names. Restricted to
  // flags with a recognizable domain: pickSymbol/pickStrategy (always
  // accept -- that's exactly what "type a symbol/strategy" means) or a
  // plain 'sel' flag IF the token actually matches one of its real options.
  // Plain free-text flags with no pickSymbol/pickStrategy marker (--interval,
  // --bars, --days, --width, etc.) are deliberately never positionally
  // filled -- "watch BTCUSDT 1d" must not let "BTCUSDT" land in --interval
  // just because it's an earlier unfilled txt flag; those still need
  // explicit "--flag value" syntax.
  let bareIdx = 0;
  for (const key of flagKeys) {
    if (bareIdx >= bare.length) break;
    const meta = cmd.flags[key];
    if (meta.t === 'yn' || assigned.has(key)) continue;
    if (meta.pickSymbol) {
      flagValues[key] = matchUniverse(bare[bareIdx], symbolUniverse);
      bareIdx += 1;
    } else if (meta.pickStrategy) {
      flagValues[key] = matchUniverse(bare[bareIdx], strategyUniverse);
      bareIdx += 1;
    } else if (meta.t === 'sel') {
      const match = matchSelOption(bare[bareIdx], meta);
      if (match !== null) {
        flagValues[key] = match;
        bareIdx += 1;
      }
      // no match: leave this sel flag at its default, don't consume the
      // token -- it may belong to a later flag instead.
    }
    // plain 'txt' flags with no pickSymbol/pickStrategy marker: never
    // positionally filled, intentionally skipped here.
  }

  const missing = flagKeys.filter((key) => {
    const meta = cmd.flags[key];
    if (!isRequiredFlag(meta)) return false;
    const v = flagValues[key];
    return v === undefined || v === null || String(v).trim() === '';
  });

  return { flagValues, missing };
}

// Ranked command list for the chat bar's "/"-suggestion dropdown. Same
// prefix-then-substring preference as resolveCommand's single-best fallback,
// but returns up to `limit` candidates instead of collapsing to one -- the
// dropdown is a discoverability aid, not a parse, so ambiguity is fine here.
// An empty query returns the first `limit` manifest commands as-typed (lets
// a bare "/" show something useful instead of an empty list).
function suggestCommands(M, query, limit = 6) {
  const commands = allCommands(M);
  const needle = String(query || '').trim().toLowerCase();
  const toRow = (cmd) => ({ id: cmd.id, label: cmd.label, desc: cmd.desc });
  if (!needle) return commands.slice(0, limit).map(toRow);

  const prefix = [];
  const contains = [];
  for (const cmd of commands) {
    const id = String(cmd.id).toLowerCase();
    const label = String(cmd.label || '').toLowerCase();
    if (id.startsWith(needle) || label.startsWith(needle)) prefix.push(cmd);
    else if (id.includes(needle) || label.includes(needle)) contains.push(cmd);
  }
  return [...prefix, ...contains].slice(0, limit).map(toRow);
}

// Top-level entry point: text -> {ok, cmd, flagValues} | {ok:false, reason, candidates?, missing?}.
function parseChatInput(text, M, universes = {}) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { ok: false, reason: 'empty' };

  const resolved = resolveCommand(tokens, M);
  if (!resolved) return { ok: false, reason: 'no_match' };
  if (resolved.ambiguous) return { ok: false, reason: 'ambiguous', candidates: resolved.candidates };

  const { cmd, remaining } = resolved;
  const { flagValues, missing } = resolveFlags(cmd, remaining, universes);
  if (missing.length > 0) return { ok: false, reason: 'missing_flags', cmd, missing, flagValues };

  return { ok: true, cmd, flagValues };
}

module.exports = {
  tokenize, resolveCommand, resolveFlags, parseChatInput,
  allCommands, suggestCommands,
  // exported for chat_llm_fallback.js to reuse the same value-coercion
  // rules (never duplicate this logic between the deterministic and
  // LLM-assisted paths)
  matchUniverse, matchSelOption,
};
