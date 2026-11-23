'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources: bars } = require('../../fixtures/real_bars_btc.json');
const { runBacktest } = require('../../../shared/lib/strategy/backtest');
const { createRuleFrame, simulateRuleTrades } = require('../../../shared/lib/strategy/strategy_rules');
const { writeTsIndex } = require('../../../shared/lib/market/validation');
const { deriveLiveStrategySignal } = require('../../../frontend/cli-tui/commands/strategies/strategy');
const { parseStrategyYaml } = require('../../../frontend/cli-tui/commands/strategies/strategy_presenter');
const { formatStrategyYaml } = require('../../../shared/lib/strategy/interval_discovery');

function specification() {
  return {
    version: 1,
    entry: { op: 'gt', left: { feature: 'close' }, right: 0 },
    exit: { op: 'lt', left: { feature: 'close' }, right: 0 },
    execution: {
      max_holding_bars: 5,
      stop_loss_pct: 0.03,
      take_profit_pct: 0.06,
      position_size_pct: 0.1,
    },
  };
}

test('recorded binary-store read produces the same rule decision as backtest', async () => {
  const directory = fs.mkdtempSync('/tmp/opencode/rule-store-');
  try {
    writeTsIndex(directory, { sources: bars });
    const strategy = { name: 'rule_seam', universe: ['BTCUSDT'], rules: specification() };
    const report = await deriveLiveStrategySignal({ strategy, timeframe: '1h', tsDir: directory });
    const backtest = runBacktest(createRuleFrame(bars), { rules: strategy.rules, timeframe: '1h', monteCarloRuns: 0 });
    assert.deepEqual(report.decisions.at(-1), backtest.decisions.at(-1));
    assert.equal(report.trades, 0, 'research decisions must never dispatch an entry');
    assert.equal(report.research_only, true);
    console.log(JSON.stringify({ seam: 'recorded_bars_binary_codec_latest_and_backtest', bars: bars.length, decision: report.decisions.at(-1), orders: 0 }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('YAML round-trip preserves executable rules and disables automation', () => {
  const rules = specification();
  const yaml = formatStrategyYaml({ name: 'rule_seam', timeframe: '1h', universe: ['BTCUSDT'], rules });
  const parsed = parseStrategyYaml(yaml);
  assert.deepEqual(parsed.rules, rules);
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.status, 'research_only');
  assert.throws(() => parseStrategyYaml('name: bad\nsections:\n  rules_json: not_json\n'), SyntaxError);
});

function row(index, values = {}) {
  return {
    key: 'SPY:1d', symbol: 'SPY', timeframe: '1d', provider: 'unit_fixture', family: 'equities',
    as_of: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: 100, high: 101, low: 99, close: 100,
    ...values,
  };
}

test('gap stops and ambiguous barriers are conservative; no same-bar re-entry', () => {
  const rules = specification();
  const ambiguous = simulateRuleTrades({ features: [row(0), row(1, { high: 110, low: 90 }), row(2)] }, { rules });
  assert.equal(ambiguous.trades[0].exit, 97);
  assert.equal(ambiguous.trades[0].exit_reason, 'stop_loss');
  assert.equal(ambiguous.open_positions.length, 0);
  const gap = simulateRuleTrades({ features: [row(0), row(1), row(2, { open: 90, high: 91, low: 89, close: 90 })] }, { rules });
  assert.equal(gap.trades[0].exit, 90);
  assert.equal(gap.trades[0].exit_reason, 'stop_gap');
});

test('rule exit and holding timeout execute at next open; end positions stay open', () => {
  const rules = specification();
  rules.exit = { op: 'gt', left: { feature: 'close' }, right: 100 };
  const exit = simulateRuleTrades({ features: [row(0), row(1, { close: 101 }), row(2, { open: 102, high: 103, close: 102 })] }, { rules });
  assert.equal(exit.trades[0].exit_reason, 'rule_exit');
  assert.equal(exit.trades[0].exit, 102);
  rules.exit = { op: 'lt', left: { feature: 'close' }, right: 0 };
  rules.execution.max_holding_bars = 1;
  const timeout = simulateRuleTrades({ features: [row(0), row(1), row(2)] }, { rules });
  assert.equal(timeout.trades[0].exit_reason, 'holding_timeout');
  assert.equal(timeout.trades[0].exit_time, row(2).as_of);
});

test('invalid costs, OHLC, duplicate timestamps and multi-series input reject', () => {
  const rules = specification();
  assert.throws(() => simulateRuleTrades({ features: [row(0)] }, { rules, costBps: -1 }), /cost/);
  assert.throws(() => simulateRuleTrades({ features: [row(0, { open: NaN })] }, { rules }), /OHLC/);
  assert.throws(() => simulateRuleTrades({ features: [row(0), row(0)] }, { rules }), /timestamp/);
  assert.throws(() => simulateRuleTrades({ features: [row(0), { ...row(1), key: 'QQQ:1d' }] }, { rules }), /one symbol/);
});
