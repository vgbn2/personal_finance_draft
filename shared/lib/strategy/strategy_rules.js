'use strict';

const { calculateRollingFeatureFrame, groupOhlcv } = require('../market/indicators');

const FEATURES = new Set([
  'close',
  'return_fast',
  'return_slow',
  'rsi',
  'macd',
  'atr',
  'volatility',
  'bollinger_upper',
  'bollinger_middle',
  'bollinger_lower',
]);
const OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'crosses_above', 'crosses_below']);

function exactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function validateRules(rules) {
  if (!exactKeys(rules, ['version', 'entry', 'exit', 'execution']) || rules.version !== 1) {
    throw new TypeError('Invalid rule specification version or fields');
  }
  let count = 0;
  function visit(node, depth) {
    count += 1;
    if (depth > 4 || count > 32) throw new RangeError('Rule complexity exceeded');
    for (const group of ['all', 'any']) {
      if (!exactKeys(node, [group])) continue;
      if (!Array.isArray(node[group]) || node[group].length < 1 || node[group].length > 8) {
        throw new TypeError('Rule group requires 1 to 8 children');
      }
      for (const child of node[group]) visit(child, depth + 1);
      return;
    }
    if (!exactKeys(node, ['op', 'left', 'right']) || !OPERATORS.has(node.op)) {
      throw new TypeError('Invalid rule operator or shape');
    }
    for (const operand of [node.left, node.right]) {
      if (typeof operand === 'number' && Number.isFinite(operand)) continue;
      if (exactKeys(operand, ['feature']) && FEATURES.has(operand.feature)) continue;
      throw new TypeError('Invalid rule operand');
    }
  }
  visit(rules.entry, 1);
  visit(rules.exit, 1);
  const execution = rules.execution;
  if (!exactKeys(execution, ['max_holding_bars', 'stop_loss_pct', 'take_profit_pct', 'position_size_pct'])
    || !Number.isInteger(execution.max_holding_bars)
    || execution.max_holding_bars < 1 || execution.max_holding_bars > 30) {
    throw new TypeError('Invalid rule execution contract');
  }
  for (const [key, ceiling] of [['stop_loss_pct', 0.05], ['take_profit_pct', 0.5], ['position_size_pct', 0.25]]) {
    if (!Number.isFinite(execution[key]) || execution[key] <= 0 || execution[key] > ceiling) {
      throw new TypeError(`Invalid rule execution ${key}`);
    }
  }
  if (execution.position_size_pct < 0.01) throw new TypeError('Rule position size below risk floor');
}

function evaluateRules(rules, current, previous = null) {
  validateRules(rules);
  function value(operand, row) {
    if (typeof operand === 'number') return operand;
    const result = row && Object.hasOwn(row, operand.feature) ? row[operand.feature] : null;
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  }
  function evaluate(node) {
    for (const group of ['all', 'any']) {
      if (!Object.hasOwn(node, group)) continue;
      const results = node[group].map(evaluate);
      if (results.includes(null)) return null;
      return group === 'all' ? results.every(Boolean) : results.some(Boolean);
    }
    const left = value(node.left, current);
    const right = value(node.right, current);
    if (left === null || right === null) return null;
    switch (node.op) {
      case 'gt': return left > right;
      case 'gte': return left >= right;
      case 'lt': return left < right;
      case 'lte': return left <= right;
      default: {
        const oldLeft = value(node.left, previous);
        const oldRight = value(node.right, previous);
        if (oldLeft === null || oldRight === null) return null;
        return node.op === 'crosses_above'
          ? oldLeft <= oldRight && left > right
          : oldLeft >= oldRight && left < right;
      }
    }
  }
  const entry = evaluate(rules.entry);
  const exit = evaluate(rules.exit);
  const ready = entry !== null && exit !== null;
  return {
    ready,
    entry: ready && entry,
    exit: ready && exit,
    reason: ready ? null : 'missing_or_nonfinite_feature',
  };
}

function createRuleFrame(bars, periods = {}) {
  if (!Array.isArray(bars)) throw new TypeError('Rule bars must be an array');
  for (const bar of bars) {
    if (!bar || !bar.symbol || !bar.timeframe || !bar.family
      || !Number.isFinite(Date.parse(bar.timestamp))
      || ![bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(value) && value > 0)
      || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      throw new TypeError('Invalid rule input OHLC or timestamp');
    }
  }
  for (const [key, value] of Object.entries(periods)) {
    if (!['return_fast', 'return_slow', 'returnFast', 'returnSlow', 'rsi', 'atr', 'bollinger', 'volatility'].includes(key)
      || !Number.isInteger(value) || value < 1 || value > 200) {
      throw new TypeError('Invalid rule indicator period');
    }
  }
  const frame = calculateRollingFeatureFrame(bars, 2, {
    ...periods,
    returnFast: periods.return_fast ?? periods.returnFast ?? 1,
    returnSlow: periods.return_slow ?? periods.returnSlow ?? 5,
  });
  const indexed = new Map();
  for (const [key, rows] of groupOhlcv(bars)) {
    for (const row of rows) {
      const id = `${key}:${row.timestamp}`;
      if (indexed.has(id)) throw new TypeError('Rule data contains duplicate bars');
      indexed.set(id, row);
    }
  }
  frame.features = frame.features.map(feature => {
    const bar = indexed.get(`${feature.key}:${feature.as_of}`);
    return {
      ...feature,
      open: bar.open,
      high: bar.high,
      low: bar.low,
    };
  });
  return frame;
}

function simulateRuleTrades(frame, options) {
  validateRules(options.rules);
  const execution = options.rules.execution;
  const feeBps = options.feeBps ?? (options.costBps ?? 5) / 2;
  const slippageBps = options.slippageBps ?? (options.costBps ?? 5) / 2;
  if (![feeBps, slippageBps].every(value => Number.isFinite(value) && value >= 0 && value < 10000)) {
    throw new TypeError('Invalid rule trading costs');
  }
  const drag = (feeBps + slippageBps) / 10000;
  if (drag >= 1) throw new TypeError('Invalid combined rule trading costs');
  const groups = new Map();
  for (const row of frame.features) {
    if (!groups.has(row.key)) groups.set(row.key, []);
    groups.get(row.key).push(row);
  }
  // ponytail: one-series research simulation only; shared portfolio cash needs a chronological allocator.
  if (groups.size > 1) throw new TypeError('Rule research requires one symbol and timeframe');
  const trades = [];
  const decisions = [];
  const openPositions = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    let position = null;
    let previous = null;
    let pending = null;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const priceValues = [row.open, row.high, row.low, row.close];
      if (!priceValues.every(value => Number.isFinite(value) && value > 0)
        || row.low > Math.min(row.open, row.close) || row.high < Math.max(row.open, row.close)
        || !Number.isFinite(Date.parse(row.as_of))
        || (previous && Date.parse(previous.as_of) >= Date.parse(row.as_of))) {
        throw new TypeError('Invalid rule OHLC or timestamp');
      }
      let exitPrice = null;
      let exitReason = null;
      if (position) {
        if (row.open <= position.stop) {
          exitPrice = row.open;
          exitReason = 'stop_gap';
        } else if (pending?.type === 'exit') {
          exitPrice = row.open;
          exitReason = pending.reason;
        } else if (row.open >= position.target) {
          exitPrice = position.target;
          exitReason = 'take_profit_gap';
        }
      } else if (pending?.type === 'entry') {
        position = {
          row,
          index,
          signal_time: pending.signal_time,
          stop: row.open * (1 - execution.stop_loss_pct),
          target: row.open * (1 + execution.take_profit_pct),
        };
      }
      pending = null;
      if (position && exitPrice === null) {
        if (row.low <= position.stop) {
          exitPrice = position.stop;
          exitReason = 'stop_loss';
        } else if (row.high >= position.target) {
          exitPrice = position.target;
          exitReason = 'take_profit';
        }
      }
      const exited = exitPrice !== null;
      if (exited) {
        const grossReturn = exitPrice / position.row.open - 1;
        const instrumentReturn = exitPrice * (1 - drag) / (position.row.open * (1 + drag)) - 1;
        trades.push({
          strategy: options.strategy,
          model: 'structured_rules_v1',
          symbol: row.symbol,
          timeframe: row.timeframe,
          provider: row.provider,
          signal_time: position.signal_time,
          entry_time: position.row.as_of,
          exit_time: row.as_of,
          entry: position.row.open,
          exit: exitPrice,
          exit_reason: exitReason,
          position_size_pct: execution.position_size_pct,
          instrument_return: instrumentReturn,
          gross_return: grossReturn * execution.position_size_pct,
          net_return: instrumentReturn * execution.position_size_pct,
          round_trip_cost_bps: 2 * (feeBps + slippageBps),
          holding_period_bars: index - position.index + 1,
        });
        position = null;
      }
      const decision = evaluateRules(options.rules, row, previous);
      decisions.push({ symbol: row.symbol, as_of: row.as_of, decision });
      if (position) {
        const timedOut = index - position.index + 1 >= execution.max_holding_bars;
        if (timedOut || decision.exit) {
          pending = { type: 'exit', reason: timedOut ? 'holding_timeout' : 'rule_exit' };
        }
      } else if (!exited && decision.entry && !decision.exit) {
        pending = { type: 'entry', signal_time: row.as_of };
      }
      previous = row;
    }
    if (position) {
      openPositions.push({
        symbol: position.row.symbol,
        entry_time: position.row.as_of,
        entry: position.row.open,
        mark: rows.at(-1).close,
        unrealized_return: (rows.at(-1).close / position.row.open - 1) * execution.position_size_pct,
      });
    }
  }
  return { trades, decisions, open_positions: openPositions };
}

module.exports = {
  validateRules,
  evaluateRules,
  createRuleFrame,
  simulateRuleTrades,
};
