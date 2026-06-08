const fs = require('node:fs');
const path = require('node:path');
const { parseYamlRecursive } = require('../../../shared/lib/runtime/config_loader');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RESEARCH_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'trading', 'research.yaml');

function coerceNumbers(obj) {
  if (Array.isArray(obj)) return obj.map(coerceNumbers);
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string' && obj !== '' && !isNaN(obj)) return Number(obj);
    return obj;
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = coerceNumbers(v);
  }
  return out;
}

function loadResearchConfig() {
  try {
    if (!fs.existsSync(RESEARCH_CONFIG_PATH)) {
      return {};
    }
    const lines = fs.readFileSync(RESEARCH_CONFIG_PATH, 'utf8').split(/\r?\n/);
    const [config] = parseYamlRecursive(lines);
    return coerceNumbers(config);
  } catch (err) {
    console.error(`[WARN] Failed to load research config: ${err.message}`);
    return {};
  }
}

module.exports = {
  loadResearchConfig,
};
