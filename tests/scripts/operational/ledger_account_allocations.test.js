'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const ledger = require('../../../shared/lib/runtime/sub_positions_ledger');
const namespace = 'alpaca:paper:account-one';
const other = 'alpaca:paper:account-two';

function fixture(t) {
  const dir = fs.mkdtempSync('/tmp/opencode/account-ledger-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'ledger.json');
}

function order(client, side = 'buy', allocations = [{ strategyId: 'alpha', quantity: 2 }], account = namespace) {
  return {
    clientOrderId: client,
    accountNamespace: account,
    instrumentId: 'SPY',
    side,
    quantity: allocations.reduce((sum, item) => sum + item.quantity, 0),
    allocations,
  };
}

function receipt(input, filled, average = 100, status = 'filled') {
  return {
    accountNamespace: input.accountNamespace,
    orderId: `id-${input.clientOrderId}`,
    symbol: 'SPY',
    side: input.side,
    quantity: input.quantity,
    filledQty: filled,
    filledAvgPrice: average,
    status,
  };
}

function begin(input, file) {
  ledger.beginPendingOrder(input, file);
  ledger.attachPendingOrder(input.clientOrderId, `id-${input.clientOrderId}`, file, input.accountNamespace);
}

function apply(input, file, filled = input.quantity, average = 100, status = 'filled') {
  return ledger.applyPendingOrderReceipt(input.clientOrderId, receipt(input, filled, average, status), file, input.accountNamespace);
}

test('ordered multi-strategy fills, within-strategy newest lot, restart, replay and cancellation', (t) => {
  const file = fixture(t);
  const older = order('older');
  begin(older, file);
  apply(older, file);
  const newer = order('newer', 'buy', [{ strategyId: 'alpha', quantity: 1 }]);
  begin(newer, file);
  apply(newer, file, 1, 105);
  const beta = order('beta', 'buy', [{ strategyId: 'beta', quantity: 2 }]);
  begin(beta, file);
  apply(beta, file);
  const sell = order('exit', 'sell', [
    { strategyId: 'beta', quantity: 2 },
    { strategyId: 'alpha', quantity: 3 },
  ]);
  begin(sell, file);
  apply(sell, file, 0, null, 'accepted');
  let state = ledger.loadAccountLedger(file, namespace);
  assert.equal(state.positions.SPY.reduce((sum, row) => sum + row.quantity, 0), 5);
  assert.equal(state.history.length, 0);
  apply(sell, file, 1, 110, 'partially_filled');
  apply(sell, file, 1, 110, 'partially_filled');
  state = ledger.loadAccountLedger(file, namespace);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].strategy_id, 'beta');
  apply(sell, file, 3, 120, 'partially_filled');
  state = ledger.loadAccountLedger(file, namespace);
  assert.deepEqual(state.pending_orders.exit.allocations.map((row) => row.filled_qty), [2, 1]);
  assert.equal(state.history.at(-1).order_id, 'id-newer');
  assert.equal(state.history.at(-1).exit_price, 125);
  assert.deepEqual(state.positions.SPY.map((row) => [row.strategy_id, row.quantity]), [['alpha', 2]]);
  // A fresh module instance reloads committed state rather than retaining watermarks.
  delete require.cache[require.resolve('../../../shared/lib/runtime/sub_positions_ledger')];
  const restarted = require('../../../shared/lib/runtime/sub_positions_ledger');
  restarted.applyPendingOrderReceipt('exit', receipt(sell, 4, 125, 'canceled'), file, namespace);
  restarted.applyPendingOrderReceipt('exit', receipt(sell, 4, 125, 'canceled'), file, namespace);
  state = restarted.loadAccountLedger(file, namespace);
  assert.equal(state.positions.SPY[0].quantity, 1);
  assert.equal(state.pending_orders.exit.filled_notional, 500);
  assert.deepEqual(state.pending_orders.exit.allocations.map((row) => row.filled_qty), [2, 2]);
  assert.equal(state.history.reduce((sum, row) => sum + row.quantity * row.exit_price, 0), 500);
  assert.equal(state.pending_orders.exit.terminal, true);
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => apply(sell, file, 5, 125), /Terminal/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const processReplay = spawnSync(process.execPath, ['-e', `
    const l = require(process.argv[1]);
    l.applyPendingOrderReceipt('exit', JSON.parse(process.argv[4]), process.argv[2], process.argv[3]);
    process.stdout.write(JSON.stringify(l.loadAccountLedger(process.argv[2], process.argv[3])));
  `, require.resolve('../../../shared/lib/runtime/sub_positions_ledger'), file, namespace,
  JSON.stringify(receipt(sell, 4, 125, 'canceled'))], {
    env: { PATH: process.env.PATH, HOME: '/tmp/opencode' },
    encoding: 'utf8',
  });
  assert.equal(processReplay.status, 0, processReplay.stderr);
  assert.deepEqual(JSON.parse(processReplay.stdout), state);
});

test('multi-strategy buy retains cumulative basis and namespace-aware position reads', (t) => {
  const file = fixture(t);
  const buy = order('buy', 'buy', [
    { strategyId: 'beta', quantity: 1 },
    { strategyId: 'alpha', quantity: 2 },
  ]);
  begin(buy, file);
  apply(buy, file, 2, 100, 'partially_filled');
  apply(buy, file, 3, 110);
  const account = ledger.loadAccountLedger(file, namespace);
  assert.deepEqual(account.positions.SPY.map((row) => [row.strategy_id, row.quantity, row.entry_price]), [
    ['beta', 1, 100],
    ['alpha', 2, 115],
  ]);
  const broker = [{ symbol: 'SPY', quantity: 3, averagePrice: 110, marketValue: 330 }];
  assert.equal(ledger.reconcilePositions(broker, file, namespace)[0].subPositions.length, 2);
  assert.throws(() => ledger.reconcilePositions(broker, file), /namespace/);
});

test('wrong identity, bad plans, prototype keys and malformed account shapes fail without writes', (t) => {
  const file = fixture(t);
  const input = order('one');
  begin(input, file);
  const before = fs.readFileSync(file, 'utf8');
  for (const invalid of [undefined, {}, '__proto__', 'other:paper:abc', 'alpaca:wrong:abc', 'alpaca:paper:__proto__', 'alpaca:paper:constructor']) {
    assert.throws(() => ledger.loadAccountLedger(file, invalid), /namespace/);
  }
  for (const allocations of [[], [{ strategyId: '__proto__', quantity: 2 }], [{ strategyId: 'a', quantity: -2 }],
    [{ strategyId: 'a', quantity: 1 }], [{ strategyId: 'a', quantity: 1 }, { strategyId: 'a', quantity: 1 }],
    [null], [{ strategyId: 'a', quantity: Infinity }]]) {
    assert.throws(() => ledger.beginPendingOrder({ ...order('invalid', 'buy', []), quantity: 2, allocations }, file), /allocation/);
  }
  for (const changed of [{ accountNamespace: other }, { orderId: 'wrong' }, { symbol: 'QQQ' }, { side: 'sell' }, { quantity: 3 }]) {
    assert.throws(() => ledger.applyPendingOrderReceipt('one', { ...receipt(input, 2), ...changed }, file, namespace), /identity/);
  }
  assert.throws(() => ledger.beginPendingOrder({ ...order('duplicate'), providerPaper: false }, file), /pending/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  for (const changes of [{ filledQty: -1 }, { filledQty: 3 }, { filledQty: 2, filledAvgPrice: Infinity },
    { filledQty: 1, status: 'filled' }]) {
    assert.throws(() => ledger.applyPendingOrderReceipt('one', { ...receipt(input, 2), ...changes }, file, namespace), /receipt/);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  for (const accounts of [[], null, { [namespace]: { positions: [], history: [], pending_orders: {} } },
    JSON.parse('{"__proto__":{}}'), { [namespace]: { positions: { SPY: [{}] }, history: [], pending_orders: {} } }]) {
    fs.writeFileSync(file, JSON.stringify({ positions: {}, history: [], accounts }));
    const bytes = fs.readFileSync(file, 'utf8');
    assert.throws(() => ledger.loadAccountLedger(file, namespace), /schema|namespace/);
    assert.throws(() => ledger.beginPendingOrder(order('new'), file), /schema|namespace/);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});

test('legacy holdings, history and unknown orders quarantine byte-for-byte; no automatic mapping', (t) => {
  const file = fixture(t);
  for (const legacy of [
    { positions: { SPY: [{ quantity: 4 }] }, history: [] },
    { positions: {}, history: [{ order_id: 'old' }] },
    { positions: {}, history: [], pending_orders: { old: { order_id: null } } },
  ]) {
    const bytes = JSON.stringify(legacy, null, 3) + '\n';
    fs.writeFileSync(file, bytes);
    assert.throws(() => ledger.beginPendingOrder(order('new'), file), /quarantined/);
    assert.throws(() => ledger.loadAccountLedger(file, namespace), /quarantined/);
    assert.throws(() => ledger.recordSubPositionEntry({ symbol: 'SPY', quantity: 1, accountNamespace: namespace }, file), /quarantined/);
    assert.throws(() => ledger.recordSubPositionExit('SPY', 'alpha', 1, { accountNamespace: namespace }, file), /quarantined/);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
  assert.throws(() => ledger.beginPendingOrder({ ...order('legacy'), accountNamespace: undefined }, file), /allocation|namespace/);
});

test('failed atomic receipt rename leaves both allocation and holdings unchanged for replay', (t) => {
  const file = fixture(t);
  const input = order('atomic');
  begin(input, file);
  const before = fs.readFileSync(file, 'utf8');
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === file) throw new Error('injected atomic commit failure');
    return rename(from, to);
  };
  try {
    assert.throws(() => apply(input, file), /commit failure/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  apply(input, file);
  apply(input, file);
  const account = ledger.loadAccountLedger(file, namespace);
  assert.equal(account.positions.SPY[0].quantity, 2);
  assert.equal(account.pending_orders.atomic.allocations[0].filled_qty, 2);
});

test('independent processes serialize same-account symbol; different accounts remain isolated', async (t) => {
  const file = fixture(t);
  const modulePath = require.resolve('../../../shared/lib/runtime/sub_positions_ledger');
  const source = `const l=require(process.argv[1]);try{l.beginPendingOrder(JSON.parse(process.argv[3]),process.argv[2]);}catch(e){console.error(e.message);process.exitCode=2;}`;
  const run = async (input) => {
    const child = spawn(process.execPath, ['-e', source, modulePath, file, JSON.stringify(input)], {
      env: { PATH: process.env.PATH, HOME: '/tmp/opencode' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let error = '';
    child.stderr.on('data', (data) => { error += data; });
    const [code] = await once(child, 'exit');
    return { code, error };
  };
  const results = await Promise.all([run(order('race-one')), run(order('race-two'))]);
  assert.deepEqual(results.map((row) => row.code).sort(), [0, 2]);
  assert.match(results.find((row) => row.code === 2).error, /Existing pending/);
  assert.equal((await run(order('race-one', 'buy', [{ strategyId: 'alpha', quantity: 2 }], other))).code, 0);
  const state = ledger.loadSubPositionsLedger(file);
  assert.equal(Object.keys(state.accounts[namespace].pending_orders).length, 1);
  assert.equal(Object.keys(state.accounts[other].pending_orders).length, 1);
});

test('paper/live/account holdings isolate and full mixed-strategy exit clears only its partition', (t) => {
  const file = fixture(t);
  const namespaces = [namespace, other, 'alpaca:live:account-one'];
  for (const account of namespaces) {
    const buy = order('same-id', 'buy', [
      { strategyId: 'alpha', quantity: 2 },
      { strategyId: 'beta', quantity: 2 },
    ], account);
    begin(buy, file);
    apply(buy, file);
  }
  const untouched = namespaces.slice(1).map((account) => ledger.loadAccountLedger(file, account));
  const sell = order('full-exit', 'sell', [
    { strategyId: 'beta', quantity: 2 },
    { strategyId: 'alpha', quantity: 2 },
  ]);
  begin(sell, file);
  apply(sell, file, 4, 110);
  apply(sell, file, 4, 110);
  const account = ledger.loadAccountLedger(file, namespace);
  assert.deepEqual(account.positions, {});
  assert.deepEqual(account.history.map((row) => row.strategy_id), ['beta', 'alpha']);
  assert.equal(account.history.reduce((sum, row) => sum + row.quantity * row.exit_price, 0), 440);
  assert.deepEqual(namespaces.slice(1).map((key) => ledger.loadAccountLedger(file, key)), untouched);
});

test('actual process death before receipt rename preserves disk; stale-lock restart replays once', (t) => {
  const file = fixture(t);
  const input = order('crash');
  begin(input, file);
  const before = fs.readFileSync(file, 'utf8');
  const child = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const ledger = require(process.argv[1]);
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === process.argv[2]) process.exit(73);
      return rename(from, to);
    };
    ledger.applyPendingOrderReceipt('crash', JSON.parse(process.argv[4]), process.argv[2], process.argv[3]);
  `, require.resolve('../../../shared/lib/runtime/sub_positions_ledger'), file, namespace,
  JSON.stringify(receipt(input, 2))], {
    env: { PATH: process.env.PATH, HOME: '/tmp/opencode' },
    encoding: 'utf8',
  });
  assert.equal(child.status, 73, child.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.ok(fs.existsSync(`${file}.lock`));
  // Existing lock recovery waits for five minutes; age only this fixture's lock.
  const stale = new Date(Date.now() - 6 * 60_000);
  fs.utimesSync(`${file}.lock`, stale, stale);
  apply(input, file);
  apply(input, file);
  const account = ledger.loadAccountLedger(file, namespace);
  assert.equal(account.positions.SPY[0].quantity, 2);
  assert.equal(account.pending_orders.crash.filled_qty, 2);
  assert.equal(account.pending_orders.crash.allocations[0].filled_qty, 2);
});

test('corrupt pending plan/watermark and regressed receipts preserve file bytes', (t) => {
  const file = fixture(t);
  const input = order('watermark');
  begin(input, file);
  apply(input, file, 1, 100, 'partially_filled');
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => apply(input, file, 0, null, 'accepted'), /regressed/);
  assert.throws(() => apply(input, file, 1, 101, 'partially_filled'), /regressed/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const state = JSON.parse(before);
  state.accounts[namespace].pending_orders.watermark.allocations[0].filled_qty = 0;
  fs.writeFileSync(file, JSON.stringify(state));
  const corrupt = fs.readFileSync(file, 'utf8');
  assert.throws(() => apply(input, file, 2), /watermark/);
  assert.equal(fs.readFileSync(file, 'utf8'), corrupt);
});
