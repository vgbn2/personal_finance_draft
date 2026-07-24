'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  policyFingerprint,
  resolveRuntimePolicy,
} = require('../../../../shared/lib/settings/runtime_policy');
const { canLiveExecute } = require('../../../../shared/lib/brokers/capabilities');

const POISONED_LIVE_ENV = {
  LIVE_TRADING: 'true',
  SOVEREIGN_EXECUTION_AUTHORIZED: 'true',
};

for (const profile of ['private-paper', 'cloud-compute', 'test']) {
  test(`${profile} remains non-executing under poisoned live inputs`, () => {
    const policy = resolveRuntimePolicy({
      env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: profile },
      args: ['--live'],
      broker: 'polymarket',
      brokerLiveSupported: true,
      killSwitchActive: false,
      nativeRiskRequired: true,
      nativeRiskAvailable: true,
      now: '2026-07-24T00:00:00.000Z',
    });

    assert.equal(policy.can_execute, false);
    assert.equal(policy.paper, true);
    assert.equal(policy.research_only, true);
    assert.equal(policy.effective_profile, 'private-paper');
    assert.match(policy.blocking_reasons.join(','), /permanently_non_executing/);
  });
}

test('local-private requires explicit live intent and authorization', () => {
  const environmentOnly = resolveRuntimePolicy({
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'local-private' },
    args: [],
  });
  assert.equal(environmentOnly.can_execute, false);
  assert.ok(environmentOnly.blocking_reasons.includes('explicit_live_flag_required'));

  const authorized = resolveRuntimePolicy({
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'local-private' },
    args: ['--live'],
  });
  assert.equal(authorized.can_execute, true);
  assert.equal(authorized.paper, false);
  assert.equal(authorized.research_only, false);
});

test('unknown runtime profiles fail closed', () => {
  const policy = resolveRuntimePolicy({
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'future-unsafe-mode' },
    args: ['--live'],
  });
  assert.equal(policy.can_execute, false);
  assert.equal(policy.paper, true);
  assert.ok(policy.blocking_reasons.includes('unsupported_runtime_profile:future-unsafe-mode'));
});

test('kill switch, native risk, feature, and broker gates fail closed', () => {
  const policy = resolveRuntimePolicy({
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'private-runner' },
    args: ['--live'],
    broker: 'polymarket',
    brokerLiveSupported: false,
    killSwitchActive: true,
    nativeRiskRequired: true,
    nativeRiskAvailable: false,
    featureGates: { polymarket: false },
  });

  assert.equal(policy.can_execute, false);
  assert.deepEqual(policy.blocking_reasons.slice(0, 4), [
    'kill_switch_active',
    'native_risk_unavailable',
    'broker_polymarket_live_unsupported',
    'feature_gates_disabled:polymarket',
  ]);
});

test('policy fingerprint is stable across timestamps and key order', () => {
  const first = resolveRuntimePolicy({
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'private-paper' },
    args: ['--live'],
    featureGates: { polymarket: true, bot_autopilot: false },
    now: '2026-07-24T00:00:00.000Z',
  });
  const second = resolveRuntimePolicy({
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'private-paper' },
    args: ['--live'],
    featureGates: { bot_autopilot: false, polymarket: true },
    now: '2027-01-01T00:00:00.000Z',
  });

  assert.equal(first.policy_fingerprint, second.policy_fingerprint);
  assert.equal(policyFingerprint(first), first.policy_fingerprint);
});

test('broker capability gate delegates permanent profile denial to the policy', () => {
  const gate = canLiveExecute('polymarket', {
    env: { ...POISONED_LIVE_ENV, SOVEREIGN_RUNTIME_MODE: 'private-paper' },
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.policy.can_execute, false);
  assert.equal(gate.policy.research_only, true);
  assert.match(gate.reason, /private-paper/);
});

test('gateway paper paths do not initialize credentialed execution adapters', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const gateway = fs.readFileSync(path.join(repoRoot, 'backend', 'gateway', 'src', 'index.ts'), 'utf8');
  const cycle = fs.readFileSync(path.join(repoRoot, 'backend', 'gateway', 'src', 'cycle.ts'), 'utf8');

  assert.match(gateway, /const adapter = isLive\s*\?\s*new AlpacaAdapter/);
  assert.match(gateway, /:\s*new SimulationAdapter\(\)/);
  assert.match(cycle, /if \(live && hasL2\) \{[\s\S]*createClobClient\(\{ withCreds: true \}\)/);
  assert.doesNotMatch(cycle, /if \(hasL2\) \{[\s\S]{0,120}createClobClient\(\{ withCreds: true \}\)/);
});
