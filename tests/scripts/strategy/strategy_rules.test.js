'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources: bars } = require('../../fixtures/real_bars_btc.json');
const { generateCandidateSpec, evaluateStrategy, computeSpecChecksum, stageCandidate } = require('../../../shared/lib/strategy/interval_discovery');

function rules(op = 'gt') {
  return {
    version: 1,
    entry: { op, left: { feature: 'close' }, right: 0 },
    exit: { op: 'lt', left: { feature: 'close' }, right: 0 },
    execution: {
      max_holding_bars: 5,
      stop_loss_pct: 0.03,
      take_profit_pct: 0.06,
      position_size_pct: 0.1,
    },
  };
}

function spec(op) {
  return {
    ...generateCandidateSpec({ archetype: 'ema_macd_trend', seed: 'rule_regression' }),
    universe: ['BTCUSDT'],
    timeframe: '1h',
    rules: rules(op),
  };
}

test('real recorded bars: discovery executes structured rules instead of a model', async () => {
  const options = { fixtureBars: bars, universe: ['BTCUSDT'], engine: 'cpp_frame' };
  const enter = await evaluateStrategy(spec('gt'), options);
  const never = await evaluateStrategy(spec('lt'), options);
  assert.equal(never.trades, 0, 'close < 0 cannot enter on positive recorded prices');
  assert.ok(enter.trades > 0);
  assert.equal(enter.engine, 'sovereign_js_rules_v1');
  assert.notEqual(computeSpecChecksum(spec('gt')), computeSpecChecksum(spec('lt')));
  console.log(JSON.stringify({ provider: bars[0].provider, bars: bars.length, enter_trades: enter.trades, never_trades: never.trades, engine: enter.engine }));
});

test('malformed rules reject before native/model fallback and before staging', async () => {
  const invalid = { ...spec('gt'), rules: { ...rules(), entry: 'close > 0' } };
  await assert.rejects(evaluateStrategy(invalid, { fixtureBars: bars }), /rule/i);
  assert.throws(() => require('../../../shared/lib/strategy/backtest').runBacktest({ features: [] }, { rules: invalid.rules }), /rule/i);
  const decision = stageCandidate({ spec: spec('gt'), evaluation: { sharpe_ratio: 100, trades: 10000 } });
  assert.equal(decision.staged, false);
  assert.equal(decision.reason, 'rule_execution_research_only');
});

test('rule decisions are causal and fills use the following recorded open', () => {
  const { createRuleFrame, simulateRuleTrades, evaluateRules } = require('../../../shared/lib/strategy/strategy_rules');
  const frame = createRuleFrame(bars, {});
  const result = simulateRuleTrades(frame, { rules: rules(), costBps: 5 });
  assert.ok(result.trades.length > 0);
  const first = result.trades[0];
  const fillBar = bars.find(bar => bar.timestamp === first.entry_time);
  assert.equal(first.entry, fillBar.open);
  assert.ok(first.signal_time < first.entry_time);
  assert.equal(first.round_trip_cost_bps, 10);
  assert.ok(result.decisions.length > 0);
  const changed = bars.map((bar, index) => index === bars.length - 1 ? { ...bar, close: bar.close * 1.1, high: bar.high * 1.1 } : { ...bar });
  const before = createRuleFrame(bars.slice(0, 40), {});
  const after = createRuleFrame(changed.slice(0, 40), {});
  assert.deepEqual(before.features, after.features);
  const row = frame.features[30];
  assert.deepEqual(result.decisions[30].decision, evaluateRules(rules(), row, frame.features[29]));
  assert.equal(result.open_positions.length, 1, 'unfinished final position must not be fabricated into a closed trade');
});

test('unknown features/operators, nulls, deep trees and missing warm-up fail safely', () => {
  const { validateRules, evaluateRules } = require('../../../shared/lib/strategy/strategy_rules');
  for (const entry of [null, { op: 'eval', left: 1, right: 0 }, { op: 'gt', left: { feature: 'future_close' }, right: 0 }, { all: [] }]) {
    assert.throws(() => validateRules({ ...rules(), entry }), /rule/i);
  }
  let deep = rules().entry;
  for (let index = 0; index < 5; index += 1) deep = { all: [deep] };
  assert.throws(() => validateRules({ ...rules(), entry: deep }), /rule/i);
  const crossing = { ...rules(), entry: { op: 'crosses_above', left: { feature: 'rsi' }, right: 30 } };
  assert.equal(evaluateRules(crossing, { close: 1, rsi: 31 }).ready, false);
  assert.equal(evaluateRules(crossing, { close: 1, rsi: 31 }, { rsi: 30 }).entry, true);
  assert.equal(evaluateRules(crossing, { close: 1, rsi: null }, { rsi: 30 }).ready, false);
});
