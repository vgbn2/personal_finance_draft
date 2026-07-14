<<<<<<<< HEAD:shared/lib/env.js
module.exports = require('./runtime/env');
========
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.env.local');

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

function collectEnvPaths(envPath = ENV_PATH) {
  if (Array.isArray(envPath)) {
    return envPath.filter(Boolean);
  }
  if (envPath && envPath !== ENV_PATH) {
    return [envPath];
  }
  return [
    process.env.SOVEREIGN_ENV_FILE,
    ENV_LOCAL_PATH,
    ENV_PATH,
  ].filter(Boolean);
}

function loadLocalEnv(envPath = ENV_PATH) {
  if (process.env.SOVEREIGN_SKIP_DOTENV === '1' || process.env.SOVEREIGN_SKIP_LOCAL_ENV === '1') {
    return {};
  }
  const loaded = {};

  for (const candidatePath of collectEnvPaths(envPath)) {
    if (!fs.existsSync(candidatePath)) continue;
    const text = fs.readFileSync(candidatePath, 'utf8');

    for (const line of text.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      if (process.env[entry.key] === undefined) {
        process.env[entry.key] = entry.value;
      }
      loaded[entry.key] = entry.value;
    }
  }

  return loaded;
}

loadLocalEnv();

module.exports = {
  ENV_PATH,
  ENV_LOCAL_PATH,
  collectEnvPaths,
  loadLocalEnv,
};
>>>>>>>> feat-ink-tui-refactor-split:shared/lib/runtime/env.js
