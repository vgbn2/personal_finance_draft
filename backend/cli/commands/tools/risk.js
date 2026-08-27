'use strict';

const defaultBridge = require('../../../../shared/lib/runtime/backend_bridge');
const { printPayload: defaultPrintPayload } = require('../../lib/utils.js');

const NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseStrictNumber(str) {
  if (typeof str !== 'string' || !str.trim()) return null;
  const trimmed = str.trim();
  if (!NUMBER_REGEX.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return num;
}

function parseRiskInputs(args = []) {
  const seenFlags = new Set();
  let notional = 100;
  let equity = 10000;
  let drawdown = 0.02;
  let maxDrawdown = 0.15;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'check') {
      continue;
    }
    if (arg === '--json') {
      if (seenFlags.has('--json')) {
        return { ok: false, error: 'Duplicate flag: --json' };
      }
      seenFlags.add('--json');
      json = true;
      continue;
    }
    if (arg === '--notional') {
      if (seenFlags.has('--notional')) return { ok: false, error: 'Duplicate flag: --notional' };
      seenFlags.add('--notional');
      const valStr = args[++i];
      const val = parseStrictNumber(valStr);
      if (val === null || val <= 0) return { ok: false, error: 'Invalid --notional: must be a positive number' };
      notional = val;
      continue;
    }
    if (arg === '--equity') {
      if (seenFlags.has('--equity')) return { ok: false, error: 'Duplicate flag: --equity' };
      seenFlags.add('--equity');
      const valStr = args[++i];
      const val = parseStrictNumber(valStr);
      if (val === null || val <= 0) return { ok: false, error: 'Invalid --equity: must be a positive number' };
      equity = val;
      continue;
    }
    if (arg === '--drawdown') {
      if (seenFlags.has('--drawdown')) return { ok: false, error: 'Duplicate flag: --drawdown' };
      seenFlags.add('--drawdown');
      const valStr = args[++i];
      const val = parseStrictNumber(valStr);
      if (val === null || val < 0 || val > 1.0) return { ok: false, error: 'Invalid --drawdown: must be between 0.0 and 1.0' };
      drawdown = val;
      continue;
    }
    if (arg === '--max-drawdown') {
      if (seenFlags.has('--max-drawdown')) return { ok: false, error: 'Duplicate flag: --max-drawdown' };
      seenFlags.add('--max-drawdown');
      const valStr = args[++i];
      const val = parseStrictNumber(valStr);
      if (val === null || val <= 0 || val > 1.0) return { ok: false, error: 'Invalid --max-drawdown: must be between >0.0 and 1.0' };
      maxDrawdown = val;
      continue;
    }
    return { ok: false, error: `Unknown or unexpected argument: ${arg}` };
  }

  return {
    ok: true,
    values: {
      notional,
      equity,
      drawdown,
      maxDrawdown,
    },
    json,
  };
}

/**
 * CLI command handler for pre-trade risk limit validation.
 * Exposes C++ sovereign_wealth risk check (--notional, --equity, --drawdown, --max-drawdown).
 */
async function commandRiskCheck(args = [], options = {}) {
  const bridge = options.bridge || defaultBridge;
  const print = options.printPayload || defaultPrintPayload;
  const log = options.log || console.log;

  const parsed = parseRiskInputs(args);
  if (!parsed.ok) {
    const errorPayload = {
      type: 'risk_input_error',
      error: parsed.error,
      ok: false,
    };
    print(errorPayload, args);
    return 1;
  }

  const { notional, equity, drawdown, maxDrawdown } = parsed.values;
  const isJson = parsed.json;
  const engineInfo = bridge.resolveEngineExecution('risk check', { silent: isJson });

  if (engineInfo.useNative) {
    const cppArgs = [
      'risk', 'check',
      '--notional', String(notional),
      '--equity', String(equity),
      '--drawdown', String(drawdown),
      '--max-drawdown', String(maxDrawdown),
    ];
    if (isJson) cppArgs.push('--json');

    const res = bridge.runBackendCommand(cppArgs);
    const isContradiction = !res ||
      res.type !== 'risk_decision' ||
      typeof res.approved !== 'boolean' ||
      (res.approved === true && res.exit_code !== 0) ||
      (res.approved === false && res.exit_code !== 2);

    if (isContradiction) {
      const errorPayload = {
        type: 'risk_engine_error',
        error: res?.error || 'Native risk engine returned invalid protocol response',
        ok: false,
      };
      print(errorPayload, args);
      return 1;
    }

    const payload = {
      ...res,
      ok: true,
      engine: engineInfo.engine,
    };

    if (isJson) {
      print(payload, args);
    } else {
      log(`[RISK CHECK] Result: ${res.approved ? 'PASSED' : 'REJECTED'} | Engine: ${engineInfo.engine}`);
      if (res.reason) log(`  Reason: ${res.reason}`);
    }
    return res.approved ? 0 : 2;
  }

  // JS Fallback implementation
  const notionalPct = notional / equity;
  let approved = true;
  let haltTrading = false;
  let reason = 'Order passes risk limits';

  if (drawdown >= maxDrawdown) {
    approved = false;
    haltTrading = true;
    reason = `Current drawdown (${(drawdown * 100).toFixed(1)}%) reaches or exceeds max allowed drawdown (${(maxDrawdown * 100).toFixed(1)}%)`;
  } else if (notionalPct > 0.25) {
    approved = false;
    haltTrading = false;
    reason = `Order notional (${notional}) exceeds 25% of total equity (${equity})`;
  }

  const payload = {
    type: 'risk_decision',
    approved,
    halt_trading: haltTrading,
    observed_drawdown: drawdown,
    limit: maxDrawdown,
    reason,
    notional,
    equity,
    engine: engineInfo.engine,
    ok: true,
    exit_code: approved ? 0 : 2,
  };

  if (isJson) {
    print(payload, args);
  } else {
    log(`[RISK CHECK] Result: ${approved ? 'PASSED' : 'REJECTED'} | Engine: ${engineInfo.engine}`);
    if (reason) log(`  Reason: ${reason}`);
  }
  return approved ? 0 : 2;
}

module.exports = {
  commandRiskCheck,
  parseRiskInputs,
};
