const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../runtime/paths');

const CAPABILITIES_PATH = path.join(REPO_ROOT, 'config', 'system', 'broker_capabilities.json');

function loadBrokerCapabilities() {
  if (!fs.existsSync(CAPABILITIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(CAPABILITIES_PATH, 'utf8'));
}

function getRuntimeMode() {
  const mode = String(process.env.SOVEREIGN_RUNTIME_MODE || process.env.SOVEREIGN_DEPLOYMENT_MODE || 'local-private').trim();
  return mode || 'local-private';
}

function canLiveExecute(broker) {
  const capabilities = loadBrokerCapabilities();
  const spec = capabilities[String(broker || '').toLowerCase()];
  if (!spec) {
    return { ok: false, reason: `Unknown broker: ${broker}` };
  }
  const mode = getRuntimeMode();
  if (mode === 'cloud-compute') {
    return { ok: false, reason: 'Live execution blocked in cloud-compute mode', mode, broker };
  }
  if (mode === 'private-runner' || mode === 'local-private') {
    return { ok: Boolean(spec.live), reason: Boolean(spec.live) ? 'allowed' : 'broker does not support live execution', mode, broker };
  }
  return { ok: false, reason: `Unsupported runtime mode: ${mode}`, mode, broker };
}

module.exports = {
  CAPABILITIES_PATH,
  loadBrokerCapabilities,
  getRuntimeMode,
  canLiveExecute,
};
