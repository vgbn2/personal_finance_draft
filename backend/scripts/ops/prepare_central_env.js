#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../../shared/lib/runtime/paths.js');
const {
  EXPECTED_COMPOSE_SERVICES,
  aliasesForCentralCopy,
  loadEnvironmentManifest,
  projectEnvironmentForComposeService,
  validateComposeServiceEnvironment,
} = require('../../../shared/lib/runtime/environment_manifest.js');
const { parseEnvFile } = require('./central_host_preflight.js');

const SOURCE_ALIASES = aliasesForCentralCopy();

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

function renderEnvironmentFile(environment) {
  return `${Object.keys(environment)
    .sort()
    .map((key) => `${key}=${encodeEnvValue(String(environment[key]))}`)
    .join('\n')}\n`;
}

function renderCentralEnvironment(template, source, options = {}) {
  const replacements = {
    SOVEREIGN_API_TOKEN: options.apiToken || crypto.randomBytes(32).toString('hex'),
    SOVEREIGN_CLIENT_TOKEN: options.clientToken || crypto.randomBytes(32).toString('hex'),
    SOVEREIGN_WEB_BIND: options.bind || '127.0.0.1',
    SOVEREIGN_DEPLOYMENT_PROFILE: options.profile || 'central-host',
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

function buildComposeServiceProjectionReport(environment) {
  const manifest = loadEnvironmentManifest();
  const services = EXPECTED_COMPOSE_SERVICES.map((serviceName) => {
    const projected = projectEnvironmentForComposeService(environment, serviceName);
    const validation = validateComposeServiceEnvironment(serviceName, projected);
    return Object.freeze({
      ...validation,
      projected_keys: Object.freeze(Object.keys(projected).sort()),
      fixed_override_keys: Object.freeze(
        Object.keys(manifest.compose_services[serviceName].fixed_overrides).sort(),
      ),
    });
  });
  return Object.freeze({
    ok: services.every((service) => service.ok),
    type: 'compose_service_projection_preview',
    services: Object.freeze(services),
  });
}

function publishComposeServiceEnvironments(environment, outputDirectory, options = {}) {
  const directory = path.resolve(outputDirectory);
  const temporaryDirectory = `${directory}.tmp.${process.pid}`;
  const backupDirectory = `${directory}.previous`;
  const manifest = loadEnvironmentManifest();
  const report = buildComposeServiceProjectionReport(environment);
  if (!report.ok) {
    const missing = report.services
      .filter((service) => !service.ok)
      .map((service) => `${service.service}:${service.missing_required_keys.join(',') || 'invalid'}`)
      .join(';');
    throw new Error(`compose_service_projection_invalid: ${missing}`);
  }
  if (fs.existsSync(directory) && !options.force) {
    throw new Error(`refusing to overwrite existing service environment directory: ${directory}`);
  }
  if (fs.existsSync(directory) && fs.existsSync(backupDirectory)) {
    throw new Error(`service environment rollback directory already exists: ${backupDirectory}`);
  }

  let movedExisting = false;
  try {
    fs.mkdirSync(temporaryDirectory, { recursive: false, mode: 0o700 });
    for (const serviceName of EXPECTED_COMPOSE_SERVICES) {
      const projected = projectEnvironmentForComposeService(environment, serviceName);
      const filePath = path.join(temporaryDirectory, `${serviceName}.env`);
      fs.writeFileSync(filePath, renderEnvironmentFile(projected), { mode: 0o600, flag: 'wx' });
      fs.chmodSync(filePath, 0o600);
    }
    if (fs.existsSync(directory)) {
      fs.renameSync(directory, backupDirectory);
      movedExisting = true;
    }
    fs.renameSync(temporaryDirectory, directory);
    return {
      ok: true,
      type: 'compose_service_environments_published',
      output_directory: directory,
      rollback_directory: movedExisting ? backupDirectory : null,
      services: report.services.map((service) => ({
        service: service.service,
        file: `${service.service}.env`,
        mode: '600',
        projected_keys: service.projected_keys,
      })),
    };
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    if (movedExisting && !fs.existsSync(directory) && fs.existsSync(backupDirectory)) {
      fs.renameSync(backupDirectory, directory);
    }
    throw error;
  }
}

function prepareCentralEnvironment(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const templatePath = path.resolve(options.templatePath || path.join(repoRoot, '.env.central.example'));
  const sourcePath = path.resolve(options.sourcePath || path.join(repoRoot, '.env'));
  const outputPath = path.resolve(options.outputPath || path.join(repoRoot, '.env.central'));
  const serviceEnvDirectory = path.resolve(
    options.serviceEnvDirectory || path.join(repoRoot, '.env.services'),
  );
  if (!fs.existsSync(templatePath)) throw new Error(`missing central environment template: ${templatePath}`);
  if (!fs.existsSync(sourcePath)) throw new Error(`missing source environment: ${sourcePath}`);
  if (fs.existsSync(outputPath) && !options.force) {
    throw new Error(`refusing to overwrite existing central environment: ${outputPath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const source = parseEnvFile(sourcePath);
  const { rendered, copiedKeys } = renderCentralEnvironment(template, source, options);
  const scopeFile = firstNonEmpty(source, ['POLYMARKET_RESEARCH_SCOPE_FILE']);
  const finalRendered = scopeFile
    ? rendered.replace(
      /^POLYMARKET_RESEARCH_SCOPE_FILE=.*$/m,
      `POLYMARKET_RESEARCH_SCOPE_FILE=${encodeEnvValue(scopeFile)}`,
    )
    : rendered;
  const temporaryPath = `${outputPath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, finalRendered, { mode: 0o600, flag: 'wx' });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }

  const preparedEnvironment = parseEnvFile(outputPath);
  const composeContract = buildComposeServiceProjectionReport(preparedEnvironment);
  const serviceEnvironments = publishComposeServiceEnvironments(
    preparedEnvironment,
    serviceEnvDirectory,
    { force: options.force },
  );
  return {
    ok: true,
    type: 'central_environment_prepared',
    output_path: outputPath,
    mode: '600',
    generated_api_token: true,
    generated_client_token: true,
    copied_keys: copiedKeys.sort(),
    execution_credentials_copied: false,
    compose_contract: composeContract,
    service_environments: serviceEnvironments,
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
    else if (argument === '--profile') options.profile = argv[++index];
    else if (argument === '--service-env-dir') options.serviceEnvDirectory = argv[++index];
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
  buildComposeServiceProjectionReport,
  encodeEnvValue,
  publishComposeServiceEnvironments,
  prepareCentralEnvironment,
  renderEnvironmentFile,
  renderCentralEnvironment,
};
