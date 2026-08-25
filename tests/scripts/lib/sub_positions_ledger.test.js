'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  generateOrderSignature,
  parseOrderSignature,
  loadSubPositionsLedger,
  saveSubPositionsLedger,
  recordSubPositionEntry,
  recordSubPositionExit,
  reconcilePositions
} = require('../../../shared/lib/runtime/sub_positions_ledger');

const getTempLedgerPath = () => path.join(os.tmpdir(), `test_sub_positions_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

test('generateOrderSignature and parseOrderSignature roundtrip bot signatures', () => {
  const ts = 1756148200000;
  const sig = generateOrderSignature({
    strategyId: 'trend_follow',
    timeframe: '5m',
    confidence: 0.85,
    source: 'bot',
    symbol: 'AAPL',
    timestamp: ts
  });

  assert.match(sig, /^strat_trend_follow_5m_1756148200000_[a-f0-9]{6}$/);

  const parsed = parseOrderSignature(sig);
  assert.equal(parsed.source, 'bot');
  assert.equal(parsed.strategy_id, 'trend_follow');
  assert.equal(parsed.timeframe, '5m');
  assert.equal(parsed.timestamp, ts);
  assert.equal(parsed.submitted_at, new Date(ts).toISOString());
});

test('generateOrderSignature and parseOrderSignature roundtrip manual signatures', () => {
  const ts = 1756148200000;
  const sig = generateOrderSignature({
    source: 'manual',
    symbol: 'TSLA',
    timestamp: ts
  });

  assert.match(sig, /^manual_cli_TSLA_1756148200000_[a-f0-9]{6}$/);

  const parsed = parseOrderSignature(sig);
  assert.equal(parsed.source, 'manual');
  assert.equal(parsed.strategy_id, 'manual');
  assert.equal(parsed.symbol, 'TSLA');
  assert.equal(parsed.timestamp, ts);
  assert.equal(parsed.submitted_at, new Date(ts).toISOString());
});

test('parseOrderSignature safely handles symbols with underscores and malformed input', () => {
  const ts = 1756148200000;
  const sig = `manual_cli_BTC_USDT_${ts}_abcdef`;
  const parsed = parseOrderSignature(sig);
  assert.equal(parsed.source, 'manual');
  assert.equal(parsed.symbol, 'BTC_USDT');
  assert.equal(parsed.timestamp, ts);

  assert.equal(parseOrderSignature(null), null);
  assert.equal(parseOrderSignature(''), null);
  assert.equal(parseOrderSignature('invalid_sig_format'), null);
  assert.equal(parseOrderSignature('manual_cli_AAPL_notanumber_abcdef').timestamp, null);
  assert.equal(parseOrderSignature('manual_cli_AAPL_notanumber_abcdef').submitted_at, null);
});

test('recordSubPositionEntry records new entries and saves atomically with lock', () => {
  const tempPath = getTempLedgerPath();
  try {
    const entry = recordSubPositionEntry({
      symbol: 'AAPL',
      strategyId: 'rsi_reversal',
      quantity: 10,
      entryPrice: 150,
      source: 'bot',
      timeframe: '15m',
      confidence: 0.9,
      orderId: 'ord_123'
    }, tempPath);

    assert.equal(entry.symbol, 'AAPL');
    assert.equal(entry.quantity, 10);
    assert.equal(entry.strategy_id, 'rsi_reversal');

    const ledger = loadSubPositionsLedger(tempPath);
    assert.equal(ledger.positions.AAPL.length, 1);
    assert.equal(ledger.positions.AAPL[0].quantity, 10);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(`${tempPath}.lock`)) fs.unlinkSync(`${tempPath}.lock`);
  }
});

test('recordSubPositionExit performs partial and full exits with history logging', () => {
  const tempPath = getTempLedgerPath();
  try {
    recordSubPositionEntry({
      symbol: 'MSFT',
      strategyId: 'macd_cross',
      quantity: 20,
      entryPrice: 300,
      source: 'bot'
    }, tempPath);

    // Partial exit of 8 shares
    const closedPart = recordSubPositionExit('MSFT', 'macd_cross', 8, { exitPrice: 310 }, tempPath);
    assert.equal(closedPart, 8);

    let ledger = loadSubPositionsLedger(tempPath);
    assert.equal(ledger.positions.MSFT[0].quantity, 12);
    assert.equal(ledger.history.length, 1);
    assert.equal(ledger.history[0].status, 'partially_closed');

    // Full exit of remaining 12 shares
    const closedRemaining = recordSubPositionExit('MSFT', 'macd_cross', 12, { exitPrice: 320 }, tempPath);
    assert.equal(closedRemaining, 12);

    ledger = loadSubPositionsLedger(tempPath);
    assert.equal(ledger.positions.MSFT, undefined);
    assert.equal(ledger.history.length, 2);
    assert.equal(ledger.history[1].status, 'closed');
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(`${tempPath}.lock`)) fs.unlinkSync(`${tempPath}.lock`);
  }
});

test('reconcilePositions attributes bot allocations and auto-computes manual residual', () => {
  const tempPath = getTempLedgerPath();
  try {
    recordSubPositionEntry({
      symbol: 'NVDA',
      strategyId: 'momentum_v1',
      quantity: 15,
      entryPrice: 100,
      source: 'bot'
    }, tempPath);

    // Broker has 25 total shares (15 bot + 10 manual residual)
    const brokerPositions = [{
      symbol: 'NVDA',
      quantity: 25,
      averagePrice: 105,
      marketValue: 2750, // $110 / share
      unrealizedPl: 125
    }];

    const reconciled = reconcilePositions(brokerPositions, tempPath);
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].quantity, 25);
    assert.equal(reconciled[0].subPositions.length, 2);

    const manualSub = reconciled[0].subPositions.find(s => s.source === 'manual');
    const botSub = reconciled[0].subPositions.find(s => s.source === 'bot');

    assert.ok(manualSub, 'Residual manual position should exist');
    assert.equal(manualSub.quantity, 10);
    assert.equal(manualSub.strategy_id, 'manual');

    assert.ok(botSub, 'Bot position should exist');
    assert.equal(botSub.quantity, 15);
    assert.equal(botSub.strategy_id, 'momentum_v1');
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(`${tempPath}.lock`)) fs.unlinkSync(`${tempPath}.lock`);
  }
});
