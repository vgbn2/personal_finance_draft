#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../shared/lib/runtime/paths');
const { loadEnvironmentManifest } = require('../../shared/lib/runtime/environment_manifest');

const SKIP_DIRECTORIES = new Set(['.git', '.claude', 'node_modules', 'dist', 'build', 'storage', 'workspace']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const EXAMPLE_FILES = ['.env.example', '.env.central.example', 'Frontend/dashboard/.env.example'];
const FRONTEND_ROOT = path.join(REPO_ROOT, 'Frontend', 'dashboard');
const EXPECTED_FRONTEND_NAMES = Object.freeze([
  'VITE_API_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
]);

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

function discoverFrontendSourceNames() {
  const names = new Set();
  const pattern = /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
  for (const filePath of walk(FRONTEND_ROOT)) {
    const source = fs.readFileSync(filePath, 'utf8');
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) names.add(match[1]);
  }
  return names;
}

function checkEnvironmentManifest() {
  const manifest = loadEnvironmentManifest();
  const discovered = new Set([...discoverSourceNames(), ...discoverExampleNames()]);
  const unclassified = [...discovered].filter((name) => !manifest.names.has(name)).sort();
  const manifestFrontendNames = manifest.entries
    .flatMap((entry) => entry.frontend_names)
    .sort();
  const frontendSourceNames = [...discoverFrontendSourceNames()].sort();
  const frontendExampleNames = [...discoverExampleNames()]
    .filter((name) => name.startsWith('VITE_'))
    .sort();
  const forbiddenFrontendNames = [...new Set([...frontendSourceNames, ...frontendExampleNames])]
    .filter((name) => !EXPECTED_FRONTEND_NAMES.includes(name))
    .sort();
  const frontendContractMatches = (
    JSON.stringify(manifestFrontendNames) === JSON.stringify(EXPECTED_FRONTEND_NAMES)
    && JSON.stringify(frontendSourceNames) === JSON.stringify(EXPECTED_FRONTEND_NAMES)
    && JSON.stringify(frontendExampleNames) === JSON.stringify(EXPECTED_FRONTEND_NAMES)
  );
  return {
    ok: unclassified.length === 0 && forbiddenFrontendNames.length === 0 && frontendContractMatches,
    type: 'environment_manifest_check',
    manifest_entries: manifest.entries.length,
    classified_names_and_aliases: manifest.names.size,
    discovered_names: discovered.size,
    unclassified,
    frontend_names: manifestFrontendNames,
    frontend_source_names: frontendSourceNames,
    frontend_example_names: frontendExampleNames,
    forbidden_frontend_names: forbiddenFrontendNames,
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
  discoverFrontendSourceNames,
  discoverSourceNames,
};
