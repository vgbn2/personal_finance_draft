'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./paths');

const MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'system', 'environment_manifest.json');

function loadEnvironmentManifest(options = {}) {
  const manifestPath = path.resolve(options.path || MANIFEST_PATH);
  const parsed = JSON.parse((options.readFileSync || fs.readFileSync)(manifestPath, 'utf8'));
  if (!parsed || parsed.schema_version !== 1 || !Array.isArray(parsed.groups)) {
    throw new Error('unsupported_environment_manifest');
  }
  const entries = [];
  const names = new Set();
  for (const group of parsed.groups) {
    for (const rawMember of group.members || []) {
      const member = typeof rawMember === 'string' ? { name: rawMember } : rawMember;
      const entry = {
        name: String(member.name || ''),
        aliases: Array.isArray(member.aliases) ? member.aliases.map(String) : [],
        scope: String(group.scope || ''),
        sensitivity: String(group.sensitivity || ''),
        frontend_exposure: group.frontend_exposure === true,
        profiles: Array.isArray(group.profiles) ? group.profiles.map(String) : [],
        default: member.default === undefined ? null : String(member.default),
        central_copy: member.central_copy === true,
      };
      if (!/^[A-Z][A-Z0-9_]*$/.test(entry.name)) throw new Error(`invalid environment name: ${entry.name}`);
      for (const name of [entry.name, ...entry.aliases]) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`invalid environment alias: ${name}`);
        if (names.has(name)) throw new Error(`duplicate environment name or alias: ${name}`);
        names.add(name);
      }
      if (entry.frontend_exposure && entry.sensitivity !== 'public') {
        throw new Error(`frontend environment entry must be public: ${entry.name}`);
      }
      entries.push(Object.freeze(entry));
    }
  }
  return Object.freeze({
    schema_version: 1,
    entries: Object.freeze(entries),
    names,
  });
}

function aliasesForCentralCopy(options = {}) {
  return Object.freeze(Object.fromEntries(
    loadEnvironmentManifest(options).entries
      .filter((entry) => entry.central_copy)
      .map((entry) => [entry.name, Object.freeze([entry.name, ...entry.aliases])]),
  ));
}

module.exports = {
  MANIFEST_PATH,
  aliasesForCentralCopy,
  loadEnvironmentManifest,
};
