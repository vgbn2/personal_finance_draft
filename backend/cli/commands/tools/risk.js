'use strict';

const bridge = require('../../../../shared/lib/runtime/backend_bridge');
const { hasFlag, numericOption, printPayload } = require('../../lib/utils.js');

/**
 * CLI command handler for pre-trade risk limit validation.
 * Exposes C++ sovereign_wealth risk check (--notional, --equity, --drawdown, --max-drawdown).
 */
async function commandRiskCheck(args = []) {
  const engineInfo = bridge.resolveEngineExecution('risk check', { silent: hasFlag(args, '--json') });
  const notional = numericOption(args, '--notional', 100);
  const equity = numericOption(args, '--equity', 10000);
  const drawdown = numericOption(args, '--drawdown', 0.02);
  const maxDrawdown = numericOption(args, '--max-drawdown', 0.15);

  if (engineInfo.useNative) {
    const cppArgs = [
      'risk', 'check',
      '--notional', String(notional),
      '--equity', String(equity),
      '--drawdown', String(drawdown),
      '--max-drawdown', String(maxDrawdown),
    ];
    if (hasFlag(args, '--json')) cppArgs.push('--json');
    const res = bridge.runBackendCommand(cppArgs);
    if (res && res.ok !== false) {
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ...res, engine: engineInfo.engine }, null, 2));
      } else {
        console.log(`[RISK CHECK] Result: ${res.passed ? 'PASSED' : 'REJECTED'} | Engine: ${engineInfo.engine}`);
        if (res.reason) console.log(`  Reason: ${res.reason}`);
      }
      return 0;
    }
  }

  // JS Fallback implementation
  const notionalPct = notional / equity;
  let passed = true;
  let reason = 'Order passes risk limits';

  if (drawdown > maxDrawdown) {
    passed = false;
    reason = `Current drawdown (${(drawdown * 100).toFixed(1)}%) exceeds max allowed drawdown (${(maxDrawdown * 100).toFixed(1)}%)`;
  } else if (notionalPct > 0.25) {
    passed = false;
    reason = `Order notional (${notional}) exceeds 25% of total equity (${equity})`;
  }

  const payload = {
    type: 'risk_check_result',
    passed,
    reason,
    notional,
    equity,
    drawdown,
    max_drawdown: maxDrawdown,
    engine: engineInfo.engine,
  };

  printPayload(payload, args);
  return passed ? 0 : 1;
}

module.exports = {
  commandRiskCheck,
};
