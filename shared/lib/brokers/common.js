const fs = require('node:fs');
const path = require('node:path');
const { ENV_PATH } = require('../env');

function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
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

function serializeEnvValue(value) {
  const text = String(value ?? '');
  if (text === '') return '';
  if (/[\s#"'=]/.test(text) || text.includes('\n') || text.includes('\r')) {
    return JSON.stringify(text);
  }
  return text;
}

function upsertEnvFile(updates, envPath = ENV_PATH) {
  const entries = Object.entries(updates || {})
    .filter(([, value]) => value !== undefined && value !== null);
  const wanted = new Map(entries.map(([key, value]) => [key, String(value)]));
  const existing = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    : [];
  const seen = new Set();

  const rewritten = existing.map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !wanted.has(parsed.key)) return line;
    seen.add(parsed.key);
    return `${parsed.key}=${serializeEnvValue(wanted.get(parsed.key))}`;
  });

  const additions = [];
  for (const [key, value] of wanted.entries()) {
    if (seen.has(key)) continue;
    additions.push(`${key}=${serializeEnvValue(value)}`);
  }

  let output = rewritten.slice();
  if (additions.length) {
    if (output.length && output[output.length - 1] !== '') output.push('');
    output.push(...additions);
  }
  if (!output.length) output.push('');
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${output.join('\n')}\n`, 'utf8');
  for (const [key, value] of wanted.entries()) {
    process.env[key] = String(value);
  }
  return {
    env_path: envPath,
    updated: [...seen],
    added: additions.map((line) => line.split('=')[0]),
  };
}

function getEnvValue(env, keys) {
  for (const key of keys || []) {
    if (env[key] !== undefined && env[key] !== null && String(env[key]).trim() !== '') {
      return String(env[key]).trim();
    }
  }
  return null;
}

function redactValue(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return '[redacted]';
}

async function probeUrl(url, timeoutMs = 4000) {
  if (!url) return { attempted: false, ok: false, reason: 'missing-url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return {
      attempted: true,
      ok: true,
      status: response.status,
      status_text: response.statusText,
      url,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      url,
      error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'request failed'),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildFieldReport(field, env, value) {
  return {
    key: field.key,
    label: field.label || field.key,
    required: Boolean(field.required),
    secret: Boolean(field.secret),
    present: value !== null,
    value: field.secret ? redactValue(value) : value,
    source: value !== null
      ? [field.key, ...(field.aliases || [])].find((key) => env[key] !== undefined && String(env[key]).trim() !== '') || null
      : null,
  };
}

function buildBrokerReport(spec, env = process.env, options = {}) {
  const fieldReports = spec.fields.map((field) => buildFieldReport(field, env, getEnvValue(env, [field.key, ...(field.aliases || [])])));
  const missing = fieldReports.filter((field) => field.required && !field.present).map((field) => field.key);
  const host = getEnvValue(env, spec.hostKeys || []);
  const resolvedHost = host || spec.defaultHost || null;
  const report = {
    broker: spec.broker,
    display_name: spec.displayName || spec.broker,
    ok: missing.length === 0,
    env_path: ENV_PATH,
    host: resolvedHost,
    fields: fieldReports,
    missing,
    validation_errors: missing.map((key) => `Missing required field: ${key}`),
    notes: spec.notes || [],
  };

  if (spec.resolveMode) {
    report.mode = spec.resolveMode(env);
  }

  if (options.includeReachability) {
    report.reachability = { attempted: false, ok: null, url: null, reason: 'not-requested' };
  }

  return report;
}

function brokerSetupEntries(spec, env = process.env, values = {}) {
  const updates = {};
  for (const field of spec.fields) {
    const provided = values[field.key];
    const current = getEnvValue(env, [field.key, ...(field.aliases || [])]);
    const value = provided !== undefined ? provided : current;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      updates[field.key] = String(value).trim();
    }
  }
  if (spec.setupDefaults) {
    for (const [key, value] of Object.entries(spec.setupDefaults(env, values) || {})) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        updates[key] = String(value).trim();
      }
    }
  }
  return updates;
}

module.exports = {
  parseEnvLine,
  serializeEnvValue,
  upsertEnvFile,
  getEnvValue,
  redactValue,
  probeUrl,
  buildBrokerReport,
  brokerSetupEntries,
};
