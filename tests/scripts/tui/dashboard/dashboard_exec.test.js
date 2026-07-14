const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  loadFullSymbolUniverse,
  buildSymbolPickerRows,
  groupValuesFor,
  toggleSet,
  readDaemonStatus,
  renderProgressBar,
} = require('../../../../backend/cli/tui/dashboard_exec.js');

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
  const { registeredStrategyOptions } = require('../../../../backend/cli/commands/strategy/strategy.js');
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

test('loadFullSymbolUniverse mirrors the real family/market/sector-tagged universe used by the legacy pickAssets() wizard', async () => {
  const { get_Full_Universe_Symbols } = require('../../../../backend/cli/lib/utils.js');
  const raw = await get_Full_Universe_Symbols();
  const got = await loadFullSymbolUniverse();
  assert.equal(got.length, raw.length);
  assert.ok(got.length > 0, 'the repo config is expected to define a real tradeable universe');
  for (const entry of got) {
    assert.ok(entry.symbol, 'every entry must carry a usable symbol');
    assert.match(entry.category, /^[A-Z_]+: /, 'category is "FAMILY: MARKET", matching the legacy hierarchy shape');
    assert.ok(entry.sector, 'every entry must carry a sector (falls back to family when the source has none)');
  }
});

test('buildSymbolPickerRows groups filtered symbols under category/sector headers, sorted, with a leading "custom" row when the query has no exact match', () => {
  const universe = [
    { symbol: 'BTCUSDT', category: 'CRYPTO: GLOBAL', sector: 'layer1' },
    { symbol: 'ETHUSDT', category: 'CRYPTO: GLOBAL', sector: 'layer1' },
    { symbol: 'AAPL', category: 'EQUITIES: USA', sector: 'technology' },
  ];
  const blank = buildSymbolPickerRows(universe, '');
  assert.deepEqual(blank.map((r) => r.type), ['header', 'item', 'item', 'header', 'item']);
  assert.equal(blank[0].label, 'CRYPTO: GLOBAL — layer1', 'categories sort before EQUITIES alphabetically');
  assert.deepEqual(blank.filter((r) => r.type === 'item').map((r) => r.value), ['BTCUSDT', 'ETHUSDT', 'AAPL'],
    'symbols sort alphabetically within their group');

  const exact = buildSymbolPickerRows(universe, 'btcusdt');
  assert.equal(exact[0].type, 'header', 'an exact match never gets a redundant "custom" row');
  assert.deepEqual(exact.filter((r) => r.type === 'item').map((r) => r.value), ['BTCUSDT']);

  const partial = buildSymbolPickerRows(universe, 'eth');
  assert.equal(partial[0].type, 'custom', '"eth" itself is not a real symbol -- offered as a literal custom row');
  assert.equal(partial[0].value, 'ETH');
  assert.ok(partial.some((r) => r.type === 'item' && r.value === 'ETHUSDT'), 'still surfaces the real match too');

  assert.deepEqual(buildSymbolPickerRows(universe, 'zz-nonexistent').map((r) => r.type), ['custom'],
    'a query matching nothing still offers itself as a selectable custom row, never an empty/stuck state');
});

test('groupValuesFor returns just the symbol values belonging to one header\'s group', () => {
  const rows = buildSymbolPickerRows([
    { symbol: 'BTCUSDT', category: 'CRYPTO: GLOBAL', sector: 'layer1' },
    { symbol: 'ETHUSDT', category: 'CRYPTO: GLOBAL', sector: 'layer1' },
    { symbol: 'AAPL', category: 'EQUITIES: USA', sector: 'technology' },
  ], '');
  const cryptoHeader = rows.find((r) => r.type === 'header' && r.label.startsWith('CRYPTO'));
  assert.deepEqual(groupValuesFor(rows, cryptoHeader.groupKey), ['BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(groupValuesFor(rows, 'no-such-group'), []);
});

test('toggleSet is a tri-state check-all/uncheck-all toggle: adds whatever is missing unless everything is already present', () => {
  assert.deepEqual([...toggleSet(new Set(['AAPL']), ['MSFT', 'NVDA'])].sort(), ['AAPL', 'MSFT', 'NVDA']);
  assert.deepEqual([...toggleSet(new Set(['AAPL', 'MSFT']), ['AAPL', 'MSFT'])], [], 'all already in -> removes all');
  assert.deepEqual([...toggleSet(new Set(['AAPL', 'MSFT']), ['MSFT', 'NVDA'])].sort(), ['AAPL', 'MSFT', 'NVDA'],
    'partial overlap counts as "not all in" -> adds the missing ones, keeps the rest');
  assert.deepEqual([...toggleSet(new Set(), [])], [], 'an empty group toggles to nothing, not an error');
});

test('renderProgressBar fills proportionally to completed/total and handles edge inputs', () => {
  assert.equal(renderProgressBar(0, 10, 10), '░░░░░░░░░░');
  assert.equal(renderProgressBar(5, 10, 10), '█████░░░░░');
  assert.equal(renderProgressBar(10, 10, 10), '██████████');
  assert.equal(renderProgressBar(0, 0, 10), '░░░░░░░░░░', 'zero total -> empty bar, not NaN/crash');
  assert.equal(renderProgressBar(7, 5, 10), '██████████', 'over-100% clamps instead of overflowing');
});

test('readDaemonStatus only returns a status whose writer PID is alive AND whose status is running/sleeping', () => {
  const statusPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-status-')), 'status.json');

  // Missing file -> null, not a throw.
  assert.equal(readDaemonStatus(statusPath), null);

  fs.writeFileSync(statusPath, 'not json');
  assert.equal(readDaemonStatus(statusPath), null, 'unparseable file -> null');

  // This test process's own PID is guaranteed alive for the duration of the test.
  const live = { pid: process.pid, status: 'running', completed_jobs: 3, total_jobs: 10, current_symbol: 'BTCUSDT' };
  fs.writeFileSync(statusPath, JSON.stringify(live));
  assert.deepEqual(readDaemonStatus(statusPath), live);

  fs.writeFileSync(statusPath, JSON.stringify({ ...live, status: 'sleeping' }));
  assert.ok(readDaemonStatus(statusPath), 'sleeping (between continuous-loop cycles) still counts as live');

  fs.writeFileSync(statusPath, JSON.stringify({ ...live, status: 'idle' }));
  assert.equal(readDaemonStatus(statusPath), null, 'idle (a finished --once run) -> nothing to show');

  fs.writeFileSync(statusPath, JSON.stringify({ ...live, status: 'stopped' }));
  assert.equal(readDaemonStatus(statusPath), null, 'stopped -> nothing to show');

  // A PID essentially guaranteed not to exist (PIDs this large aren't issued).
  fs.writeFileSync(statusPath, JSON.stringify({ ...live, pid: 999999 }));
  assert.equal(readDaemonStatus(statusPath), null, 'dead PID -> null even if status says running (stale file)');
});
