const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  if (!key) return null;

  let value = trimmed.slice(equalsIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  return { key, value };
}

function loadLocalEnv(envPath = ENV_PATH) {
  if (!fs.existsSync(envPath)) return {};
  const text = fs.readFileSync(envPath, 'utf8');
  const loaded = {};

  for (const line of text.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry) continue;
    if (process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
    }
    loaded[entry.key] = entry.value;
  }

  return loaded;
}

loadLocalEnv();

module.exports = {
  ENV_PATH,
  loadLocalEnv,
};
