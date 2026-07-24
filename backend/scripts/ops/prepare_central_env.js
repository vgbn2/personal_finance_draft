#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../../shared/lib/runtime/paths.js');
const { parseEnvFile } = require('./central_host_preflight.js');

const SOURCE_ALIASES = Object.freeze({
  ALPACA_API_KEY: ['ALPACA_API_KEY'],
  ALPACA_SECRET_KEY: ['ALPACA_SECRET_KEY', 'ALPACA_API_SECRET'],
  FRED_API_KEY: ['FRED_API_KEY'],
  FINNHUB_API_KEY: ['FINNHUB_API_KEY', 'FINHUB_API_KEY'],
  TWELVE_DATA_API_KEY: ['TWELVE_DATA_API_KEY', 'TWELVE_API_KEY'],
  KALSHI_API_KEY: ['KALSHI_API_KEY'],
  GOOGLE_API_KEY: ['GOOGLE_API_KEY'],
  GOOGLE_CSE_ID: ['GOOGLE_CSE_ID'],
  SOVEREIGN_SUPABASE_URL: ['SOVEREIGN_SUPABASE_URL'],
  SOVEREIGN_SUPABASE_PUBLISHABLE_KEY: ['SOVEREIGN_SUPABASE_PUBLISHABLE_KEY'],
  SOVEREIGN_SUPABASE_SECRET_KEY: ['SOVEREIGN_SUPABASE_SECRET_KEY'],
});

function firstNonEmpty(source, names) {
  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function encodeEnvValue(value) {
  if (/^[A-Za-z0-9_./:@+-]*$/.test(value)) return value;
  return JSON.stringify(value);
}

function renderCentralEnvironment(template, source, options = {}) {
  const replacements = {
    SOVEREIGN_API_TOKEN: options.apiToken || crypto.randomBytes(32).toString('hex'),
    SOVEREIGN_CLIENT_TOKEN: options.clientToken || crypto.randomBytes(32).toString('hex'),
    SOVEREIGN_WEB_BIND: options.bind || '127.0.0.1',
  };
  const copiedKeys = [];

  for (const [target, aliases] of Object.entries(SOURCE_ALIASES)) {
    const value = firstNonEmpty(source, aliases);
    if (!value) continue;
    replacements[target] = value;
    copiedKeys.push(target);
  }

  const rendered = template.replace(/^([A-Za-z_][A-Za-z0-9_]*)=.*$/gm, (line, key) => (
    Object.hasOwn(replacements, key) ? `${key}=${encodeEnvValue(replacements[key])}` : line
  ));
  return { rendered, copiedKeys };
}

function prepareCentralEnvironment(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const templatePath = path.resolve(options.templatePath || path.join(repoRoot, '.env.central.example'));
  const sourcePath = path.resolve(options.sourcePath || path.join(repoRoot, '.env'));
  const outputPath = path.resolve(options.outputPath || path.join(repoRoot, '.env.central'));
  if (!fs.existsSync(templatePath)) throw new Error(`missing central environment template: ${templatePath}`);
  if (!fs.existsSync(sourcePath)) throw new Error(`missing source environment: ${sourcePath}`);
  if (fs.existsSync(outputPath) && !options.force) {
    throw new Error(`refusing to overwrite existing central environment: ${outputPath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const source = parseEnvFile(sourcePath);
  const { rendered, copiedKeys } = renderCentralEnvironment(template, source, options);
  const temporaryPath = `${outputPath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, rendered, { mode: 0o600, flag: 'wx' });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }

  return {
    ok: true,
    type: 'central_environment_prepared',
    output_path: outputPath,
    mode: '600',
    generated_api_token: true,
    generated_client_token: true,
    copied_keys: copiedKeys.sort(),
    execution_credentials_copied: false,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--force') options.force = true;
    else if (argument === '--source') options.sourcePath = argv[++index];
    else if (argument === '--output') options.outputPath = argv[++index];
    else if (argument === '--bind') options.bind = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

if (require.main === module) {
  try {
    const result = prepareCentralEnvironment(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, type: 'central_environment_prepared', error: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SOURCE_ALIASES,
  encodeEnvValue,
  prepareCentralEnvironment,
  renderCentralEnvironment,
};
