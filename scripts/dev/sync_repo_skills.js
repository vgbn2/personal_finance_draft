#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL_ROOT = path.join(REPO_ROOT, 'skills');
const MIRROR_ROOT = path.join(REPO_ROOT, '.agents', 'skills');
const MANIFEST_PATH = path.join(CANONICAL_ROOT, 'manifest.json');

function readManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.skills)) {
    throw new Error('skills/manifest.json must contain schema_version=1 and a skills array');
  }
  const names = [...manifest.skills];
  const sorted = [...new Set(names)].sort();
  if (names.length !== sorted.length || names.some((name, index) => name !== sorted[index])) {
    throw new Error('skills/manifest.json skills must be unique and sorted');
  }
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(`invalid skill name in manifest: ${name}`);
    }
  }
  return names;
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];

  function walk(current, relative) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryRelative = relative ? path.join(relative, entry.name) : entry.name;
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`skill packages must not contain symlinks: ${entryPath}`);
      }
      if (entry.isDirectory()) {
        walk(entryPath, entryRelative);
      } else if (entry.isFile()) {
        output.push(entryRelative.replaceAll(path.sep, '/'));
      }
    }
  }

  walk(root, '');
  return output.sort();
}

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function comparePackage(skillName) {
  const canonical = path.join(CANONICAL_ROOT, skillName);
  const mirror = path.join(MIRROR_ROOT, skillName);
  const findings = [];

  if (!fs.existsSync(path.join(canonical, 'SKILL.md'))) {
    findings.push(`${skillName}: canonical SKILL.md is missing`);
    return findings;
  }
  if (!fs.existsSync(mirror)) {
    findings.push(`${skillName}: discovery mirror is missing`);
    return findings;
  }

  const canonicalFiles = listFiles(canonical);
  const mirrorFiles = listFiles(mirror);
  for (const relative of canonicalFiles) {
    if (!mirrorFiles.includes(relative)) {
      findings.push(`${skillName}: mirror missing ${relative}`);
    } else if (digest(path.join(canonical, relative)) !== digest(path.join(mirror, relative))) {
      findings.push(`${skillName}: mirror differs at ${relative}`);
    }
  }
  for (const relative of mirrorFiles) {
    if (!canonicalFiles.includes(relative)) {
      findings.push(`${skillName}: mirror has extra ${relative}`);
    }
  }
  return findings;
}

function compareInventory(skillNames, options = {}) {
  const requireMirror = options.requireMirror !== false;
  const findings = [];
  const canonicalDirs = fs.readdirSync(CANONICAL_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const mirrorDirs = fs.existsSync(MIRROR_ROOT)
    ? fs.readdirSync(MIRROR_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];

  for (const name of canonicalDirs) {
    if (!skillNames.includes(name)) findings.push(`canonical inventory has unlisted skill: ${name}`);
  }
  for (const name of skillNames) {
    if (!canonicalDirs.includes(name)) findings.push(`manifest skill is missing canonical package: ${name}`);
  }
  if (requireMirror || fs.existsSync(MIRROR_ROOT)) {
    for (const name of mirrorDirs) {
      if (!skillNames.includes(name)) findings.push(`discovery mirror has unlisted skill: ${name}`);
    }
    for (const name of skillNames) {
      findings.push(...comparePackage(name));
    }
  }
  return findings;
}

function copyPackage(skillName) {
  const canonical = path.join(CANONICAL_ROOT, skillName);
  const mirror = path.join(MIRROR_ROOT, skillName);
  fs.mkdirSync(mirror, { recursive: true });

  for (const relative of listFiles(canonical)) {
    const source = path.join(canonical, relative);
    const destination = path.join(mirror, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function main() {
  const mode = process.argv[2] || '--check';
  if (!['--check', '--write'].includes(mode) || process.argv.length > 3) {
    console.error('Usage: node scripts/dev/sync_repo_skills.js [--check|--write]');
    process.exit(2);
  }

  const skillNames = readManifest();
  if (mode === '--write') {
    for (const name of skillNames) copyPackage(name);
  }

  const findings = compareInventory(skillNames);
  if (findings.length > 0) {
    console.error(findings.map((finding) => `- ${finding}`).join('\n'));
    if (mode === '--write') {
      console.error('Mirror extras are never deleted automatically; review them explicitly.');
    }
    process.exit(1);
  }

  console.log(`Repo skill inventory is synchronized (${skillNames.length} packages).`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  CANONICAL_ROOT,
  MANIFEST_PATH,
  MIRROR_ROOT,
  compareInventory,
  comparePackage,
  readManifest,
};
