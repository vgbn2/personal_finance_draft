const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RESEARCH_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'research.yaml');

function parseYamlValue(value) {
  const v = value.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(item => parseYamlValue(item.trim()));
  }
  if (!isNaN(v) && v !== '') return Number(v);
  return v.replace(/^"|"$/g, '');
}

function loadResearchConfig() {
  try {
    if (!fs.existsSync(RESEARCH_CONFIG_PATH)) {
      return {};
    }
    const content = fs.readFileSync(RESEARCH_CONFIG_PATH, 'utf8');
    const lines = content.split(/\r?\n/);
    const config = {};
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.match(/^\s*/)[0].length;
      if (indent === 0 && trimmed.endsWith(':')) {
        currentSection = trimmed.slice(0, -1);
        config[currentSection] = {};
        continue;
      }

      if (currentSection && indent > 0 && trimmed.includes(':')) {
        const [key, ...rest] = trimmed.split(':');
        const value = rest.join(':').trim();
        config[currentSection][key.trim()] = parseYamlValue(value);
      }
    }
    return config;
  } catch (err) {
    console.error(`[WARN] Failed to load research config: ${err.message}`);
    return {};
  }
}

module.exports = {
  loadResearchConfig,
};
