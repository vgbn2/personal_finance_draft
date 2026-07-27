#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../shared/lib/runtime/paths');
const { loadEnvironmentManifest } = require('../../shared/lib/runtime/environment_manifest');

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'storage', 'workspace']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const EXAMPLE_FILES = ['.env.example', '.env.central.example', 'Frontend/dashboard/.env.example'];

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function discoverSourceNames() {
  const names = new Set();
  const dotPattern = /\bprocess\.env\.([A-Z][A-Z0-9_]*)/g;
  const bracketPattern = /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;
  for (const filePath of walk(REPO_ROOT)) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const pattern of [dotPattern, bracketPattern]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) names.add(match[1]);
    }
  }
  return names;
}

function discoverExampleNames() {
  const names = new Set();
  for (const relative of EXAMPLE_FILES) {
    const filePath = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
      if (match) names.add(match[1]);
    }
  }
  return names;
}

function checkEnvironmentManifest() {
  const manifest = loadEnvironmentManifest();
  const discovered = new Set([...discoverSourceNames(), ...discoverExampleNames()]);
  const unclassified = [...discovered].filter((name) => !manifest.names.has(name)).sort();
  return {
    ok: unclassified.length === 0,
    type: 'environment_manifest_check',
    manifest_entries: manifest.entries.length,
    classified_names_and_aliases: manifest.names.size,
    discovered_names: discovered.size,
    unclassified,
  };
}

if (require.main === module) {
  const result = checkEnvironmentManifest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = {
  checkEnvironmentManifest,
  discoverExampleNames,
  discoverSourceNames,
};
