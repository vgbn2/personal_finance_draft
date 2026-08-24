'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  commandRiskCheck,
  parseRiskInputs,
} = require('../../../../backend/cli/commands/tools/risk.js');

function harness({ useNative, nativeResult }) {
  const payloads = [];
  const logs = [];
  let runs = 0;
  const bridge = {
    resolveEngineExecution() {
      return { useNative, engine: useNative ? 'native_cpp' : 'js_fallback' };
    },
    runBackendCommand() {
      runs += 1;
      return nativeResult;
    },
  };
  return {
    bridge,
    payloads,
    logs,
    runs: () => runs,
    options: {
      bridge,
      printPayload(payload) { payloads.push(payload); },
      log(message) { logs.push(message); },
    },
  };
}

function nativeDecision(approved, overrides = {}) {
  return {
    type: 'risk_decision',
    approved,
    halt_trading: !approved,
    observed_drawdown: approved ? 0.10 : 0.20,
    limit: 0.20,
    reason: approved ? 'approved' : 'rejected',
    exit_code: approved ? 0 : 2,
    ok: approved,
    ...overrides,
  };
}

test('native approval and rejection use approved as the authoritative contract', async () => {
  const approved = harness({ useNative: true, nativeResult: nativeDecision(true) });
  assert.equal(await commandRiskCheck([], approved.options), 0);
  assert.match(approved.logs[0], /PASSED/);

  const rejected = harness({ useNative: true, nativeResult: nativeDecision(false) });
  assert.equal(await commandRiskCheck(['--json'], rejected.options), 2);
  assert.equal(rejected.payloads[0].approved, false);
  assert.equal(rejected.payloads[0].ok, true);
  assert.equal('passed' in rejected.payloads[0], false);
  assert.equal(rejected.runs(), 1, 'native rejection must not fall through to JavaScript');
});

test('native protocol contradictions fail closed without JavaScript fallback', async () => {
  const contradictions = [
    nativeDecision(true, { exit_code: 2 }),
    nativeDecision(false, { exit_code: 0 }),
    { ...nativeDecision(true), type: 'other' },
    { ...nativeDecision(true), approved: undefined },
    { ok: false, error: 'Non-JSON output', exit_code: 0 },
  ];
  for (const nativeResult of contradictions) {
    const subject = harness({ useNative: true, nativeResult });
    assert.equal(await commandRiskCheck(['--json'], subject.options), 1);
    assert.equal(subject.payloads[0].type, 'risk_engine_error');
    assert.equal(subject.runs(), 1);
  }
});

test('JavaScript fallback matches native drawdown and concentration boundaries', async () => {
  const drawdown = harness({ useNative: false });
  assert.equal(await commandRiskCheck([
    '--drawdown', '0.15', '--max-drawdown', '0.15', '--json',
  ], drawdown.options), 2);
  assert.equal(drawdown.payloads[0].approved, false);
  assert.equal(drawdown.payloads[0].halt_trading, true);

  const exactConcentration = harness({ useNative: false });
  assert.equal(await commandRiskCheck([
    '--notional', '2.5e3', '--equity', '10000', '--json',
  ], exactConcentration.options), 0);
  assert.equal(exactConcentration.payloads[0].approved, true);

  const excessiveConcentration = harness({ useNative: false });
  assert.equal(await commandRiskCheck([
    '--notional', '2500.01', '--equity', '10000', '--json',
  ], excessiveConcentration.options), 2);
  assert.equal(excessiveConcentration.payloads[0].approved, false);
  assert.equal(excessiveConcentration.payloads[0].halt_trading, false);
});

test('strict risk parsing rejects malformed, missing, duplicate, and out-of-domain values', async () => {
  const invalidCases = [
    ['--notional'],
    ['--notional', ''],
    ['--notional', '1junk'],
    ['--notional', '0x10'],
    ['--notional', 'NaN'],
    ['--notional', 'Infinity'],
    ['--notional', '1e309'],
    ['--notional', '1', '--notional', '2'],
    ['--notional', '0'],
    ['--equity', '-1'],
    ['--drawdown', '-0.1'],
    ['--drawdown', '1.1'],
    ['--max-drawdown', '0'],
    ['--unknown', '1'],
    ['unexpected'],
  ];

  for (const args of invalidCases) {
    const subject = harness({ useNative: true, nativeResult: nativeDecision(true) });
    assert.equal(await commandRiskCheck([...args, '--json'], subject.options), 1, args.join(' '));
    assert.equal(subject.payloads[0].type, 'risk_input_error');
    assert.equal(subject.runs(), 0, `bridge must not execute for ${args.join(' ')}`);
  }
});

test('risk parser preserves documented defaults and optional check positional', () => {
  assert.deepEqual(parseRiskInputs(['check']).values, {
    notional: 100,
    equity: 10000,
    drawdown: 0.02,
    maxDrawdown: 0.15,
  });
  assert.equal(parseRiskInputs(['check']).ok, true);
});
