const assert = require('node:assert/strict');
const test = require('node:test');

const {
  splitWords,
  isPlaceholderSelect,
  defaultFlagValues,
  cycleOption,
  buildArgv,
  optionValue,
  optionLabel,
  stripAnsi,
  loadStrategyOptions,
} = require('../../../backend/cli/tui/dashboard_exec.js');

test('splitWords splits multi-word command ids and bot sub-command strings', () => {
  assert.deepEqual(splitWords('status'), ['status']);
  assert.deepEqual(splitWords('backend integrity'), ['backend', 'integrity']);
  assert.deepEqual(splitWords('bot config --key enabled --value true'),
    ['bot', 'config', '--key', 'enabled', '--value', 'true']);
  assert.deepEqual(splitWords('  spaced   out  '), ['spaced', 'out']);
  assert.deepEqual(splitWords(''), []);
});

test('isPlaceholderSelect flags only single placeholder-shaped option lists', () => {
  assert.equal(isPlaceholderSelect({ t: 'sel', opts: ['<registered strategies>'] }), true);
  assert.equal(isPlaceholderSelect({ t: 'sel', opts: ['all', 'crypto'] }), false);
  assert.equal(isPlaceholderSelect({ t: 'txt', opts: ['<x>'] }), false);
  assert.equal(isPlaceholderSelect({ t: 'sel', opts: ['<a>', '<b>'] }), false);
  assert.equal(isPlaceholderSelect(null), false);
});

test('defaultFlagValues seeds one value per flag from its def', () => {
  const cmd = {
    id: 'watch',
    flags: {
      '--family': { t: 'sel', opts: ['all', 'crypto'], def: 'all' },
      '--interval': { t: 'txt', def: '15' },
    },
  };
  assert.deepEqual(defaultFlagValues(cmd), { '--family': 'all', '--interval': '15' });
  assert.deepEqual(defaultFlagValues({ id: 'status', flags: {} }), {});
});

test('cycleOption wraps forward and backward through the option list', () => {
  const meta = { t: 'sel', opts: ['a', 'b', 'c'] };
  assert.equal(cycleOption(meta, 'a', 1), 'b');
  assert.equal(cycleOption(meta, 'c', 1), 'a');
  assert.equal(cycleOption(meta, 'a', -1), 'c');
  assert.equal(cycleOption(meta, 'unknown', 1), 'b');
  assert.equal(cycleOption({ t: 'sel', opts: [] }, 'x', 1), 'x');
});

test('optionValue/optionLabel/cycleOption handle {label,value} option pairs (registry-backed selects)', () => {
  const meta = {
    t: 'sel',
    opts: [
      { label: '[ON] alpha (A / 9)', value: 'config/strategies/alpha.yaml' },
      { label: '[OFF] beta (F / 0)', value: 'config/strategies/beta.yaml' },
    ],
  };
  assert.equal(optionValue(meta.opts[0]), 'config/strategies/alpha.yaml');
  assert.equal(optionValue('plain-string'), 'plain-string');
  assert.equal(optionLabel(meta, 'config/strategies/beta.yaml'), '[OFF] beta (F / 0)');
  assert.equal(optionLabel(meta, 'config/strategies/alpha.yaml'), '[ON] alpha (A / 9)');
  // unresolvable / plain-string values fall back to the raw value itself,
  // so optionLabel is safe to call unconditionally on non-registry selects.
  assert.equal(optionLabel(meta, 'config/strategies/unknown.yaml'), 'config/strategies/unknown.yaml');
  assert.equal(optionLabel({ t: 'sel', opts: ['all', 'crypto'] }, 'crypto'), 'crypto');
  // cycling stores/returns the bare value, not the {label,value} pair, and a
  // current value not in the list (e.g. the blank '' default) snaps to the
  // first real entry rather than throwing or sticking on an invalid index.
  assert.equal(cycleOption(meta, '', 1), 'config/strategies/beta.yaml');
  assert.equal(cycleOption(meta, 'config/strategies/alpha.yaml', 1), 'config/strategies/beta.yaml');
  assert.equal(cycleOption(meta, 'config/strategies/beta.yaml', 1), 'config/strategies/alpha.yaml');
});

test('stripAnsi removes color escape codes, leaving plain text untouched', () => {
  assert.equal(stripAnsi('[\x1b[32mON\x1b[0m] alpha (A / 9)'), '[ON] alpha (A / 9)');
  assert.equal(stripAnsi('plain text'), 'plain text');
  assert.equal(stripAnsi(''), '');
  assert.equal(stripAnsi(null), '');
});

test('loadStrategyOptions mirrors the real strategy registry with ANSI stripped from labels', () => {
  const { registeredStrategyOptions } = require('../../../backend/cli/commands/strategy/strategy.js');
  const expected = registeredStrategyOptions();
  const got = loadStrategyOptions();
  assert.equal(got.length, expected.length);
  assert.ok(got.length > 0, 'the repo registry is expected to have real registered strategies');
  for (let i = 0; i < expected.length; i++) {
    assert.equal(got[i].value, expected[i].value);
    assert.equal(got[i].label, stripAnsi(expected[i].label));
    assert.doesNotMatch(got[i].label, /\x1b\[/, 'dashboard labels must not carry raw ANSI codes');
  }
});

test('buildArgv pushes bare flags for true yn values and omits false/blank ones', () => {
  const cmd = {
    id: 'cache-clean',
    flags: {
      '--dry-run': { t: 'yn', def: true },
    },
  };
  assert.deepEqual(buildArgv(cmd, { '--dry-run': true }), ['cache-clean', '--dry-run']);
  assert.deepEqual(buildArgv(cmd, { '--dry-run': false }), ['cache-clean']);
});

test('buildArgv pushes "--flag value" for non-blank sel/txt values and omits blank ones', () => {
  const cmd = {
    id: 'ingest',
    flags: {
      '--family': { t: 'sel', opts: ['all', 'crypto'], def: 'all' },
      '--symbol': { t: 'txt', def: '' },
      '--history-days': { t: 'txt', def: '' },
    },
  };
  assert.deepEqual(
    buildArgv(cmd, { '--family': 'crypto', '--symbol': '', '--history-days': '90' }),
    ['ingest', '--family', 'crypto', '--history-days', '90'],
  );
});

test('buildArgv splits multi-word command ids into separate argv entries', () => {
  const cmd = { id: 'backend integrity', flags: { '--audit-vintages': { t: 'yn', def: false } } };
  assert.deepEqual(buildArgv(cmd, { '--audit-vintages': true }),
    ['backend', 'integrity', '--audit-vintages']);
  assert.deepEqual(buildArgv(cmd, {}), ['backend', 'integrity']);
});
