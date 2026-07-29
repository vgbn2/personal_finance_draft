#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEnvironmentManifest } = require('../../../shared/lib/runtime/environment_manifest');

const DEPLOYMENT_EVIDENCE_SCHEMA_VERSION = 1;
const REQUIRED_SERVICES = Object.freeze(['web', 'backfill']);

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
}

function deploymentServiceRows(manifest = loadEnvironmentManifest()) {
  return Object.entries(manifest.compose_services).map(([service, row]) => ({
    service,
    profile: row.compose_profile,
    required: REQUIRED_SERVICES.includes(service),
  }));
}

function parseServiceEvidence(source) {
  const services = {};
  for (const line of String(source || '').split(/\r?\n/).filter(Boolean)) {
    const [service, containerId, imageId, state] = line.split('\t');
    if (!/^[a-z][a-z0-9-]*$/.test(service || '')
      || !containerId
      || !imageId
      || !['running', 'restarting'].includes(state)) {
      throw new Error(`invalid deployment service evidence: ${line}`);
    }
    if (services[service]) throw new Error(`duplicate deployment service evidence: ${service}`);
    services[service] = {
      container_id: containerId,
      image_id: imageId,
      state,
    };
  }
  return services;
}

function writeAtomicJson(filePath, payload, fsImpl = fs) {
  const directory = path.dirname(filePath);
  fsImpl.mkdirSync(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fsImpl.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    fsImpl.renameSync(tempPath, filePath);
  } catch (error) {
    try { fsImpl.unlinkSync(tempPath); } catch (_) {}
    throw error;
  }
}

function buildDeploymentEvidence(options) {
  const services = parseServiceEvidence(options.servicesSource);
  const activeBefore = parseServiceEvidence(options.preServicesSource || options.servicesSource);
  for (const service of REQUIRED_SERVICES) {
    if (!services[service]) throw new Error(`missing required deployment service evidence: ${service}`);
  }
  return {
    schema_version: DEPLOYMENT_EVIDENCE_SCHEMA_VERSION,
    result: 'verified',
    verified_at: options.verifiedAt || new Date().toISOString(),
    source: {
      revision: options.revision,
      tree: options.tree,
    },
    image: {
      reference: options.imageRef,
      id: options.imageId,
      build_contract: 1,
    },
    active_before: activeBefore,
    services,
  };
}

function evidenceMatches(actual, expected) {
  if (!actual || actual.schema_version !== DEPLOYMENT_EVIDENCE_SCHEMA_VERSION || actual.result !== 'verified') {
    return false;
  }
  if (actual.source?.revision !== expected.revision
    || actual.source?.tree !== expected.tree
    || actual.image?.reference !== expected.imageRef
    || actual.image?.id !== expected.imageId) {
    return false;
  }
  const expectedServices = parseServiceEvidence(expected.servicesSource);
  return JSON.stringify(actual.services) === JSON.stringify(expectedServices);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function runCli(args = process.argv.slice(2)) {
  const command = args[0];
  if (command === 'services') {
    for (const row of deploymentServiceRows()) {
      process.stdout.write(`${row.service}\t${row.profile || '-'}\t${row.required ? 'required' : 'optional'}\n`);
    }
    return 0;
  }
  const evidencePath = optionValue(args, '--path');
  const servicesPath = optionValue(args, '--services-file');
  const expected = {
    revision: optionValue(args, '--revision'),
    tree: optionValue(args, '--tree'),
    imageRef: optionValue(args, '--image-ref'),
    imageId: optionValue(args, '--image-id'),
    servicesSource: fs.readFileSync(servicesPath, 'utf8'),
  };
  if (command === 'write') {
    const preServicesPath = optionValue(args, '--pre-services-file');
    writeAtomicJson(evidencePath, buildDeploymentEvidence({
      ...expected,
      preServicesSource: fs.readFileSync(preServicesPath, 'utf8'),
    }));
    return 0;
  }
  if (command === 'matches') {
    return evidenceMatches(readJson(evidencePath), expected) ? 0 : 1;
  }
  throw new Error(`unknown deployment evidence command: ${command || '<missing>'}`);
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  DEPLOYMENT_EVIDENCE_SCHEMA_VERSION,
  REQUIRED_SERVICES,
  buildDeploymentEvidence,
  deploymentServiceRows,
  evidenceMatches,
  parseServiceEvidence,
  runCli,
  writeAtomicJson,
};
