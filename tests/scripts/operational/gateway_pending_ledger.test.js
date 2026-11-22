'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ledger = require('../../../shared/lib/runtime/sub_positions_ledger');

test('pending receipts persist and apply only cumulative confirmed fills once', (t) => {
  const dir = fs.mkdtempSync('/tmp/opencode/pending-ledger-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'ledger.json');
  const order = {
    clientOrderId: 'buy-client',
    instrumentId: 'SPY',
    side: 'buy',
    quantity: 10,
    strategyId: 'fixture',
    providerPaper: true,
  };
  ledger.beginPendingOrder(order, file);
  ledger.attachPendingOrder(order.clientOrderId, 'buy-id', file);
  assert.deepEqual(ledger.loadSubPositionsLedger(file).positions, {});
  const receipt = {
    orderId: 'buy-id',
    symbol: 'SPY',
    side: 'buy',
    quantity: 10,
    filledQty: 2,
    filledAvgPrice: 100,
    status: 'partially_filled',
  };
  ledger.applyPendingOrderReceipt('buy-client', receipt, file);
  ledger.applyPendingOrderReceipt('buy-client', receipt, file);
  assert.equal(ledger.loadSubPositionsLedger(file).positions.SPY[0].quantity, 2);
  assert.throws(() => ledger.beginPendingOrder({ ...order, clientOrderId: 'duplicate' }, file), /pending/i);
  assert.throws(() => ledger.applyPendingOrderReceipt('buy-client', { ...receipt, orderId: 'wrong' }, file), /identity/i);
  assert.throws(() => ledger.applyPendingOrderReceipt('buy-client', { ...receipt, filledQty: 1 }, file), /regress/i);
  ledger.applyPendingOrderReceipt('buy-client', {
    ...receipt,
    filledQty: 4,
    filledAvgPrice: 105,
    status: 'canceled',
  }, file);
  let state = ledger.loadSubPositionsLedger(file);
  assert.equal(state.positions.SPY[0].quantity, 4);
  assert.equal(state.positions.SPY[0].entry_price, 105);
  assert.equal(state.pending_orders['buy-client'].terminal, true);

  ledger.beginPendingOrder({ ...order, clientOrderId: 'sell-client', side: 'sell', quantity: 4 }, file);
  ledger.attachPendingOrder('sell-client', 'sell-id', file);
  assert.equal(ledger.loadSubPositionsLedger(file).positions.SPY[0].quantity, 4);
  ledger.applyPendingOrderReceipt('sell-client', {
    ...receipt,
    orderId: 'sell-id',
    side: 'sell',
    quantity: 4,
    filledQty: 1,
    filledAvgPrice: 110,
  }, file);
  state = ledger.loadSubPositionsLedger(file);
  assert.equal(state.positions.SPY[0].quantity, 3);
  assert.equal(state.history.at(-1).exit_price, 110);
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => ledger.applyPendingOrderReceipt('sell-client', {
    ...receipt,
    orderId: 'sell-id',
    side: 'sell',
    quantity: 4,
    filledQty: 5,
  }, file), /receipt/i);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const exit = {
    ...receipt,
    orderId: 'sell-id',
    side: 'sell',
    quantity: 4,
    filledQty: 4,
    filledAvgPrice: 115,
    status: 'filled',
  };
  ledger.applyPendingOrderReceipt('sell-client', exit, file);
  ledger.applyPendingOrderReceipt('sell-client', exit, file);
  state = ledger.loadSubPositionsLedger(file);
  assert.deepEqual(state.positions, {});
  assert.equal(state.history.reduce((sum, item) => sum + item.quantity * item.exit_price, 0), 460);
});

test('unknown submissions and corrupt ledger fail closed across reloads', (t) => {
  const dir = fs.mkdtempSync('/tmp/opencode/pending-recovery-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'ledger.json');
  const order = { clientOrderId: 'unknown', instrumentId: 'SPY', side: 'buy', quantity: 1 };
  ledger.beginPendingOrder(order, file);
  assert.equal(ledger.loadSubPositionsLedger(file).pending_orders.unknown.order_id, null);
  assert.throws(() => ledger.beginPendingOrder({ ...order, clientOrderId: 'retry' }, file), /pending/i);
  fs.writeFileSync(file, '{');
  assert.throws(() => ledger.beginPendingOrder(order, file), /load/i);
  assert.equal(fs.readFileSync(file, 'utf8'), '{');
  fs.writeFileSync(file, JSON.stringify({ positions: {}, history: [], pending_orders: [] }));
  assert.throws(() => ledger.beginPendingOrder(order, file), /schema/i);
});

test('failed atomic receipt commit retains prior pending state for safe replay', (t) => {
  const dir = fs.mkdtempSync('/tmp/opencode/pending-commit-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'ledger.json');
  ledger.beginPendingOrder({ clientOrderId: 'commit', instrumentId: 'SPY', side: 'buy', quantity: 1 }, file);
  ledger.attachPendingOrder('commit', 'commit-id', file);
  const receipt = { orderId: 'commit-id', symbol: 'SPY', side: 'buy', quantity: 1, filledQty: 1, filledAvgPrice: 100, status: 'filled' };
  const before = fs.readFileSync(file, 'utf8');
  const rename = fs.renameSync;
  // Fault injection leaves the real serializer, lock, and disk writes intact.
  fs.renameSync = (from, to) => {
    if (to === file) throw new Error('injected atomic commit failure');
    return rename(from, to);
  };
  try {
    assert.throws(() => ledger.applyPendingOrderReceipt('commit', receipt, file), /commit failure/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  ledger.applyPendingOrderReceipt('commit', receipt, file);
  ledger.applyPendingOrderReceipt('commit', receipt, file);
  assert.equal(ledger.loadSubPositionsLedger(file).positions.SPY[0].quantity, 1);
});
