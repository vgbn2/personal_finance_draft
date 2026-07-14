'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { tokenize, resolveCommand, resolveFlags, parseChatInput } = require('../../../../backend/cli/tui/chat_parser.js');

// Small synthetic manifest -- deliberately decoupled from the real M in
// sovereign_dashboard.mjs so these unit tests stay stable across manifest
// edits. Real-manifest, end-to-end coverage lives in the Ink harness test
// (sovereign_dashboard.test.js) that drives the actual chat box.
const M = [
  {
    label: 'Backend',
    cmds: [
      {
        id: 'backend chart', label: 'backend chart', desc: '',
        flags: {
          '--symbol': { t: 'txt', def: '', lbl: 'Symbol to chart (required)', pickSymbol: 'single' },
          '--timeframe': { t: 'sel', opts: ['1d', '1h', '4h'], def: '1d', lbl: 'Timeframe' },
        },
      },
      { id: 'backend status', label: 'backend status', desc: '', flags: {} },
      { id: 'backend stats', label: 'backend stats', desc: '', flags: {} },
    ],
  },
  {
    label: 'Research',
    cmds: [
      {
        id: 'bt', label: 'bt', desc: '',
        flags: {
          '--strategy': { t: 'sel', opts: [], def: '', lbl: 'Strategy', pickStrategy: 'single' },
          '--symbol': { t: 'txt', def: '', lbl: 'Symbols comma-sep (blank = strategy universe)', pickSymbol: 'multi' },
          '--timeframe': { t: 'sel', opts: ['1d', '1h'], def: '1d', lbl: 'Timeframe' },
          '--allow-degraded': { t: 'yn', def: false, lbl: 'Allow degraded data?' },
        },
      },
    ],
  },
];

const universes = {
  symbolUniverse: [{ symbol: 'AAPL' }, { symbol: 'BTCUSDT' }],
  strategyUniverse: [{ symbol: 'low_prob_dip' }, { symbol: 'mean_revert' }],
};

test('tokenize splits on whitespace and keeps quoted substrings together', () => {
  assert.deepEqual(tokenize('backend chart AAPL 1d'), ['backend', 'chart', 'AAPL', '1d']);
  assert.deepEqual(tokenize('bt "low prob dip" AAPL'), ['bt', 'low prob dip', 'AAPL']);
  assert.deepEqual(tokenize(''), []);
});

test('resolveCommand prefers the longest exact multi-word id match', () => {
  const { cmd, remaining } = resolveCommand(['backend', 'chart', 'AAPL'], M);
  assert.equal(cmd.id, 'backend chart');
  assert.deepEqual(remaining, ['AAPL']);
});

test('resolveCommand is ambiguous when a single-word prefix matches multiple commands', () => {
  const result = resolveCommand(['backend', 'stat'], M);
  // "backend stat" isn't a real id, falls back to first-token substring match
  // against "backend" itself, which hits all 3 backend commands.
  assert.ok(result.ambiguous);
  assert.equal(result.candidates.length, 3);
});

test('resolveCommand returns null for unrecognizable input', () => {
  assert.equal(resolveCommand(['nonsense', 'gibberish'], M), null);
});

test('parseChatInput resolves a fully-specified phrase, including positional flag fill', () => {
  const result = parseChatInput('backend chart AAPL 1h', M, universes);
  assert.equal(result.ok, true);
  assert.equal(result.cmd.id, 'backend chart');
  assert.deepEqual(result.flagValues, { '--symbol': 'AAPL', '--timeframe': '1h' });
});

test('parseChatInput supports explicit --flag value syntax, overriding position', () => {
  const result = parseChatInput('backend chart --timeframe 4h --symbol AAPL', M, universes);
  assert.equal(result.ok, true);
  assert.deepEqual(result.flagValues, { '--symbol': 'AAPL', '--timeframe': '4h' });
});

test('parseChatInput matches a typed symbol against the real universe (case-insensitive)', () => {
  const result = parseChatInput('backend chart aapl', M, universes);
  assert.equal(result.ok, true);
  assert.equal(result.flagValues['--symbol'], 'AAPL');
});

test('parseChatInput accepts a symbol not in the universe (uppercased), mirroring the picker overlay\'s "custom row" behavior', () => {
  const result = parseChatInput('backend chart newcoin', M, universes);
  assert.equal(result.ok, true);
  assert.equal(result.flagValues['--symbol'], 'NEWCOIN');
});

test('parseChatInput leaves an optional blank-default flag blank when not supplied (not a failure)', () => {
  const result = parseChatInput('bt low_prob_dip', M, universes);
  assert.equal(result.ok, true);
  assert.equal(result.flagValues['--symbol'], '');
  assert.equal(result.flagValues['--strategy'], 'low_prob_dip');
});

test('parseChatInput blocks on a flag explicitly marked (required) in its label', () => {
  const result = parseChatInput('backend chart', M, universes);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_flags');
  assert.deepEqual(result.missing, ['--symbol']);
});

test('parseChatInput resolves a yn flag by bare presence of its --flag token', () => {
  const result = parseChatInput('bt low_prob_dip --allow-degraded', M, universes);
  assert.equal(result.ok, true);
  assert.equal(result.flagValues['--allow-degraded'], true);
});

test('resolveCommand never lets a short token coincidentally match mid-word (e.g. "ate" inside "strategy")', () => {
  // Regression: a loose substring-anywhere match on the first token alone
  // let garbled input like "ate widget" silently resolve to and run the
  // real "strategy" command (str-ATE-gy) -- a real safety risk on a trading
  // platform. Short tokens must require a prefix match, not bare containment.
  const strategyM = [{ label: 'Trade', cmds: [{ id: 'strategy', label: 'strategy', desc: '', flags: {} }] }];
  assert.equal(resolveCommand(['ate', 'widget'], strategyM), null);
  // A real prefix abbreviation of reasonable length should still resolve.
  assert.equal(resolveCommand(['strat'], strategyM).cmd.id, 'strategy');
});

test('parseChatInput returns no_match for unrecognizable input', () => {
  const result = parseChatInput('frobnicate the widget', M, universes);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_match');
});

test('parseChatInput returns empty for blank input', () => {
  const result = parseChatInput('   ', M, universes);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty');
});

test('resolveFlags matches a sel flag option case-insensitively', () => {
  const cmd = M[0].cmds[0];
  const { flagValues } = resolveFlags(cmd, ['AAPL', '4H'], universes);
  assert.equal(flagValues['--timeframe'], '4h');
});
