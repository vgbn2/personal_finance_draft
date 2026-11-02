#!/usr/bin/env node
'use strict';

/**
 * Sovereign Trades - Automated Release & Version Manager
 *
 * Evaluates git history since the latest semver tag, classifies Conventional
 * Commits, derives the appropriate semver bump, updates package.json, and
 * generates categorized Markdown release notes.
 *
 * Usage:
 *   node scripts/ops/release_version.js [--dry-run] [--bump=auto|patch|minor|major] [--apply]
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');

/**
 * Parse a semver string 'X.Y.Z' into numeric tuple.
 */
function parseSemver(versionStr) {
  const clean = String(versionStr || '').trim().replace(/^v/, '');
  const parts = clean.split('.').map(n => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n) || n < 0)) {
    throw new Error(`Invalid semver string: "${versionStr}"`);
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

/**
 * Parse a single commit line into structured metadata.
 */
function parseConventionalCommit(line) {
  if (!line || !line.trim()) return null;
  // Expected format: <hash> <message>
  const firstSpace = line.indexOf(' ');
  if (firstSpace === -1) return null;

  const hash = line.slice(0, firstSpace).trim();
  const rawMsg = line.slice(firstSpace + 1).trim();

  // Pattern: type(scope)!: description OR type!: description OR type(scope): description
  const match = rawMsg.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);
  if (!match) {
    return {
      hash,
      type: 'other',
      scope: null,
      breaking: false,
      description: rawMsg,
      raw: rawMsg,
    };
  }

  const [, type, scope, exclamation, description] = match;
  const isBreaking = Boolean(exclamation) || rawMsg.includes('BREAKING CHANGE');

  return {
    hash,
    type: type.toLowerCase(),
    scope: scope || null,
    breaking: isBreaking,
    description: description.trim(),
    raw: rawMsg,
  };
}

/**
 * Find the latest semantic version tag matching 'v*.*.*'.
 */
function getLatestSemverTag(cwd = REPO_ROOT) {
  try {
    const raw = execSync('git tag -l "v[0-9]*.[0-9]*.[0-9]*" --sort=-v:refname', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (!raw) return null;
    const tags = raw.split('\n').map(t => t.trim()).filter(Boolean);
    return tags[0] || null;
  } catch {
    return null;
  }
}

/**
 * Fetch commits between the given tag and HEAD.
 */
function getCommitsSinceTag(tag, cwd = REPO_ROOT) {
  try {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const log = execSync(`git log ${range} --pretty=format:"%h %s" --no-merges`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (!log) return [];
    return log.split('\n').map(parseConventionalCommit).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Determine the bump type based on parsed commits.
 */
function calculateBump(commits, manualBump = 'auto') {
  if (manualBump && manualBump !== 'auto') {
    if (!['patch', 'minor', 'major'].includes(manualBump)) {
      throw new Error(`Unknown manual bump level: "${manualBump}"`);
    }
    return manualBump;
  }

  if (!commits || commits.length === 0) return 'none';

  let hasMajor = false;
  let hasMinor = false;
  let hasPatch = false;

  for (const c of commits) {
    if (c.breaking) {
      hasMajor = true;
      break;
    }
    if (c.type === 'feat') {
      hasMinor = true;
    } else if (['fix', 'perf', 'refactor'].includes(c.type)) {
      hasPatch = true;
    }
  }

  if (hasMajor) return 'major';
  if (hasMinor) return 'minor';
  if (hasPatch) return 'patch';
  return 'none';
}

/**
 * Calculate the next version string given current version and bump.
 */
function bumpVersion(currentVersionStr, bump) {
  const { major, minor, patch } = parseSemver(currentVersionStr);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor}.${patch}`;
}

/**
 * Generate formatted Markdown changelog from commits.
 */
function generateChangelog(newVersion, commits, date = new Date().toISOString().slice(0, 10)) {
  const sections = {
    breaking: [],
    features: [],
    fixes: [],
    perf: [],
    other: [],
  };

  for (const c of commits) {
    const scopePrefix = c.scope ? `**${c.scope}**: ` : '';
    const line = `- ${scopePrefix}${c.description} (\`${c.hash}\`)`;

    if (c.breaking) {
      sections.breaking.push(`- **BREAKING CHANGE** ${scopePrefix}${c.description} (\`${c.hash}\`)`);
    } else if (c.type === 'feat') {
      sections.features.push(line);
    } else if (c.type === 'fix') {
      sections.fixes.push(line);
    } else if (c.type === 'perf' || c.type === 'refactor') {
      sections.perf.push(line);
    } else {
      sections.other.push(line);
    }
  }

  const lines = [
    `## v${newVersion} (${date})`,
    '',
  ];

  if (sections.breaking.length > 0) {
    lines.push('### Breaking Changes', ...sections.breaking, '');
  }
  if (sections.features.length > 0) {
    lines.push('### Features', ...sections.features, '');
  }
  if (sections.fixes.length > 0) {
    lines.push('### Bug Fixes', ...sections.fixes, '');
  }
  if (sections.perf.length > 0) {
    lines.push('### Performance & Refactoring', ...sections.perf, '');
  }
  if (sections.other.length > 0 && lines.length === 2) {
    // If no features/fixes/perf, show other commits
    lines.push('### Maintenance & Chores', ...sections.other.slice(0, 10), '');
  }

  return lines.join('\n').trim();
}

/**
 * Main orchestrator for release versioning.
 */
function runReleaseManager(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const apply = Boolean(options.apply);
  const bumpOverride = options.bump || 'auto';

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const currentVersion = pkg.version || '1.0.0';

  const latestTag = getLatestSemverTag();
  const commits = getCommitsSinceTag(latestTag);
  const bump = calculateBump(commits, bumpOverride);

  if (bump === 'none') {
    return {
      releaseNeeded: false,
      currentVersion,
      newVersion: currentVersion,
      tag: latestTag || `v${currentVersion}`,
      bump: 'none',
      commitsCount: commits.length,
      changelog: '',
    };
  }

  const newVersion = bumpVersion(currentVersion, bump);
  const newTag = `v${newVersion}`;
  const changelog = generateChangelog(newVersion, commits);

  if (apply && !dryRun) {
    pkg.version = newVersion;
    fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }

  return {
    releaseNeeded: true,
    currentVersion,
    newVersion,
    tag: newTag,
    bump,
    commitsCount: commits.length,
    changelog,
  };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const bumpArg = args.find(a => a.startsWith('--bump='));
  const bump = bumpArg ? bumpArg.split('=')[1] : 'auto';

  const result = runReleaseManager({ dryRun, apply, bump });

  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(`Current Version: ${result.currentVersion}`);
    console.log(`Release Needed:  ${result.releaseNeeded}`);
    console.log(`Bump Level:      ${result.bump}`);
    console.log(`New Version:     ${result.newVersion} (${result.tag})`);
    console.log(`Commits Scanned: ${result.commitsCount}\n`);
    if (result.releaseNeeded) {
      console.log('--- CHANGELOG ---');
      console.log(result.changelog);
      console.log('-----------------');
      if (apply && !dryRun) {
        console.log(`\nUpdated ${PKG_PATH} to version ${result.newVersion}`);
      }
    }
  }
}

module.exports = {
  parseSemver,
  parseConventionalCommit,
  getLatestSemverTag,
  getCommitsSinceTag,
  calculateBump,
  bumpVersion,
  generateChangelog,
  runReleaseManager,
};
