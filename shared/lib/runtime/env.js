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

function collectEnvPaths(envPath = ENV_PATH, options = {}) {
  const environment = options.environment || process.env;
  const envLocalPath = options.envLocalPath || ENV_LOCAL_PATH;
  const defaultEnvPath = options.defaultEnvPath || ENV_PATH;
  if (Array.isArray(envPath)) {
    return envPath.filter(Boolean);
  }
  if (envPath && envPath !== defaultEnvPath) {
    return [envPath];
  }
  if (environment.SOVEREIGN_ENV_FILE) {
    return [environment.SOVEREIGN_ENV_FILE];
  }
  return [
    envLocalPath,
    defaultEnvPath,
  ].filter(Boolean);
}

function loadLocalEnv(envPath = ENV_PATH, options = {}) {
  const environment = options.environment || process.env;
  const fileSystem = options.fs || fs;
  if (environment.SOVEREIGN_SKIP_DOTENV === '1' || environment.SOVEREIGN_SKIP_LOCAL_ENV === '1') {
    return {};
  }
  const loaded = {};

  for (const candidatePath of collectEnvPaths(envPath, { ...options, environment })) {
    if (!fileSystem.existsSync(candidatePath)) continue;
    const text = fileSystem.readFileSync(candidatePath, 'utf8');

    for (const line of text.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      if (environment[entry.key] === undefined) {
        environment[entry.key] = entry.value;
      }
      loaded[entry.key] = entry.value;
    }
  }

  return loaded;
}

const {
  exportMaskedEnv,
  sanitizeEnv,
  validateEnv,
  verifyCredential,
} = require('./env_pipeline');

loadLocalEnv();

module.exports = {
  ENV_PATH,
  ENV_LOCAL_PATH,
  collectEnvPaths,
  loadLocalEnv,
  exportMaskedEnv,
  sanitizeEnv,
  validateEnv,
  verifyCredential,
};
