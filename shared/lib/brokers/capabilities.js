const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../runtime/paths');
const { resolveRuntimePolicy, runtimeProfile } = require('../settings/runtime_policy');

const CAPABILITIES_PATH = path.join(REPO_ROOT, 'config', 'system', 'broker_capabilities.json');

function loadBrokerCapabilities() {
  if (!fs.existsSync(CAPABILITIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(CAPABILITIES_PATH, 'utf8'));
}

function getRuntimeMode() {
  return runtimeProfile();
}

function canLiveExecute(broker, options = {}) {
  const capabilities = loadBrokerCapabilities();
  const spec = capabilities[String(broker || '').toLowerCase()];
  if (!spec) {
    return { ok: false, reason: `Unknown broker: ${broker}` };
  }
  const policy = resolveRuntimePolicy({
    ...options,
    broker,
    brokerLiveSupported: Boolean(spec.live),
    requestedLive: true,
    explicitLive: true,
    executionAuthorized: true,
  });
  const reason = policy.can_execute
    ? 'allowed'
    : (
      policy.research_only
        ? `Live execution blocked in ${policy.requested_profile} mode`
        : policy.blocking_reasons.join('; ')
    );
  return {
    ok: policy.can_execute,
    reason,
    mode: policy.requested_profile,
    broker,
    policy,
  };
}

module.exports = {
  CAPABILITIES_PATH,
  loadBrokerCapabilities,
  getRuntimeMode,
  canLiveExecute,
};
