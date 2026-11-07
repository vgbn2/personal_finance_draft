'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../runtime/paths');
const { ENV_PATH } = require('../runtime/env');
const { parseEnvLine, serializeEnvValue, redactValue } = require('../brokers/common');

const DEFAULT_TEMPLATE_PATH = path.join(REPO_ROOT, '.env.example');

/**
 * Load and parse the schema of allowed keys and rules from .env.example
 */
function loadEnvSchema(templatePath = DEFAULT_TEMPLATE_PATH) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found at: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, 'utf8');
  const allowedKeys = new Set();
  const rules = new Map();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*#?\s*([A-Z0-9_]+)=/);
    if (!match) continue;
    const key = match[1];
    allowedKeys.add(key);

    // Rule inference
    if (key.includes('PORT')) {
      rules.set(key, 'port');
    } else if (
      key.includes('_DISABLE_') ||
      key.includes('_ENABLE_') ||
      key.endsWith('_ENABLED') ||
      key === 'SOVEREIGN_DISABLE_MT5_AUTO_PATH'
    ) {
      rules.set(key, 'boolean');
    } else if (
      key.endsWith('_URL') ||
      key.endsWith('_BASE_URL') ||
      key === 'SOVEREIGN_SUPABASE_URL'
    ) {
      rules.set(key, 'url');
    } else if (
      key.endsWith('_TIMEOUT_MS') ||
      key.endsWith('_INTERVAL_SECS') ||
      key.endsWith('_RETENTION_DAYS') ||
      key.endsWith('_MAX_ARCHIVE_BYTES') ||
      key.endsWith('_MAX_ROWS_PER_TOKEN') ||
      key.endsWith('_MAX_TOKENS') ||
      key.endsWith('_MAX_COUNT') ||
      key.endsWith('_TRADE_PAGE_CAP') ||
      key.endsWith('_MIN_FREE_GB') ||
      key.endsWith('_MIN_FREE_PERCENT') ||
      key.endsWith('_MAX_AGE_MIN') ||
      key.endsWith('_MAX_BODY_BYTES')
    ) {
      rules.set(key, 'number');
    }
  }

  return { allowedKeys, rules };
}

/**
 * Validate a single key-value pair against the schema
 */
function validateSecretKey(key, value, schema) {
  if (!schema.allowedKeys.has(key)) {
    return {
      ok: false,
      error: `Key '${key}' is not defined in .env.example template`,
    };
  }

  const rule = schema.rules.get(key);
  const strVal = String(value ?? '').trim();

  // Empty string is allowed (unsetting/clearing a secret)
  if (strVal === '') {
    return { ok: true };
  }

  // Reject null bytes
  if (strVal.includes('\0')) {
    return {
      ok: false,
      error: `Key '${key}' contains forbidden null byte character`,
    };
  }

  if (rule === 'port') {
    if (!/^\d+$/.test(strVal)) {
      return {
        ok: false,
        error: `Key '${key}' must be a valid port number (1-65535), received: '${strVal}'`,
      };
    }
    const portNum = Number(strVal);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return {
        ok: false,
        error: `Key '${key}' must be a valid port number (1-65535), received: '${strVal}'`,
      };
    }
  } else if (rule === 'boolean') {
    const lower = strVal.toLowerCase();
    if (!['true', 'false', '1', '0'].includes(lower)) {
      return {
        ok: false,
        error: `Key '${key}' must be a boolean flag ('true', 'false', '1', '0'), received: '${strVal}'`,
      };
    }
  } else if (rule === 'url') {
    try {
      const parsed = new URL(strVal);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
        return {
          ok: false,
          error: `Key '${key}' must have a valid protocol (http, https, ws, wss), received: '${strVal}'`,
        };
      }
    } catch {
      return {
        ok: false,
        error: `Key '${key}' must be a valid URL, received: '${strVal}'`,
      };
    }
  } else if (rule === 'number') {
    const num = Number(strVal);
    if (Number.isNaN(num) || num < 0) {
      return {
        ok: false,
        error: `Key '${key}' must be a non-negative number, received: '${strVal}'`,
      };
    }
  }

  return { ok: true };
}

/**
 * Validate an entire batch of secrets atomically
 */
function validateSecretsBatch(entries, schema) {
  const errors = [];
  for (const [key, val] of entries) {
    const res = validateSecretKey(key, val, schema);
    if (!res.ok) {
      errors.push(res.error);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Parse batch input from JSON or .env text format
 */
function parseBatchInput(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return [];

  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        // [{key, value}] or [[key, value]]
        return parsed.map((item) => {
          if (Array.isArray(item)) return [item[0], item[1]];
          if (item && typeof item === 'object') return [item.key || item.name, item.value];
          return null;
        }).filter((item) => item && item[0]);
      } else if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed);
      }
    } catch {
      // Not JSON, fall back to dotenv parsing
    }
  }

  // Parse as .env lines
  const entries = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed) {
      entries.push([parsed.key, parsed.value]);
    }
  }
  return entries;
}

/**
 * Read secrets from target file and return key-value pairs (with redacted values)
 */
function listSecrets(envPath = ENV_PATH) {
  if (!fs.existsSync(envPath)) {
    return [];
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const items = [];
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed) {
      items.push({
        key: parsed.key,
        value: redactValue(parsed.value),
        set: parsed.value.trim().length > 0,
      });
    }
  }
  return items;
}

/**
 * Atomically write secrets to target file with POSIX 0600 permissions
 */
function writeSecrets(entries, envPath = ENV_PATH) {
  const wanted = new Map(entries.map(([k, v]) => [k, String(v ?? '')]));
  const existingLines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    : [];

  const seen = new Set();
  const rewritten = existingLines.map((line) => {
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

  const output = rewritten.slice();
  if (additions.length) {
    if (output.length && output[output.length - 1] !== '') output.push('');
    output.push(...additions);
  }
  if (!output.length) output.push('');

  const targetDir = path.dirname(envPath);
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });

  // Write atomically via sibling temp file
  const tempPath = `${envPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, `${output.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(tempPath, 0o600);
  fs.renameSync(tempPath, envPath);
  fs.chmodSync(envPath, 0o600);

  // Synchronize process.env
  for (const [key, value] of wanted.entries()) {
    process.env[key] = String(value);
  }

  return {
    ok: true,
    env_path: envPath,
    updated: [...seen],
    added: additions.map((line) => line.split('=')[0]),
    mode: '0600',
  };
}

module.exports = {
  DEFAULT_TEMPLATE_PATH,
  loadEnvSchema,
  validateSecretKey,
  validateSecretsBatch,
  parseBatchInput,
  listSecrets,
  writeSecrets,
};
