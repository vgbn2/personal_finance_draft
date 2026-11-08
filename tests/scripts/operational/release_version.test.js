'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSemver,
  parseConventionalCommit,
  calculateBump,
  bumpVersion,
  generateChangelog,
} = require('../../../tools/operational/release_version');

test('parseSemver parses standard and v-prefixed versions', () => {
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseSemver('v2.0.10'), { major: 2, minor: 0, patch: 10 });
  assert.throws(() => parseSemver('invalid'), /Invalid semver string/);
  assert.throws(() => parseSemver('1.2'), /Invalid semver string/);
});

test('parseConventionalCommit extracts type, scope, breaking flag, and description', () => {
  const feat = parseConventionalCommit('a1b2c3d feat(api): add automated release endpoint');
  assert.equal(feat.type, 'feat');
  assert.equal(feat.scope, 'api');
  assert.equal(feat.breaking, false);
  assert.equal(feat.description, 'add automated release endpoint');

  const breakingFeat = parseConventionalCommit('e4f5g6h feat(core)!: drop legacy python bindings');
  assert.equal(breakingFeat.type, 'feat');
  assert.equal(breakingFeat.scope, 'core');
  assert.equal(breakingFeat.breaking, true);

  const fix = parseConventionalCommit('1122334 fix: align wrangler asset path');
  assert.equal(fix.type, 'fix');
  assert.equal(fix.scope, null);
  assert.equal(fix.breaking, false);
  assert.equal(fix.description, 'align wrangler asset path');

  const other = parseConventionalCommit('9988776 chore: clean tmpfs scratchpad');
  assert.equal(other.type, 'chore');
  assert.equal(other.breaking, false);
});

test('calculateBump determines major, minor, patch, or none based on commit hierarchy', () => {
  assert.equal(calculateBump([]), 'none');

  const choreCommits = [
    { type: 'chore', breaking: false },
    { type: 'docs', breaking: false },
  ];
  assert.equal(calculateBump(choreCommits), 'none');

  const patchCommits = [
    { type: 'chore', breaking: false },
    { type: 'fix', breaking: false },
    { type: 'feat', scope: 'ops', breaking: false },
  ];
  assert.equal(calculateBump(patchCommits), 'patch');

  const minorCommits = [
    { type: 'fix', breaking: false },
    { type: 'feat', scope: 'milestone', breaking: false },
  ];
  assert.equal(calculateBump(minorCommits), 'minor');

  const majorCommits = [
    { type: 'feat', breaking: false },
    { type: 'fix', breaking: true },
  ];
  assert.equal(calculateBump(majorCommits), 'major');

  // Manual override takes precedence
  assert.equal(calculateBump(choreCommits, 'major'), 'major');
  assert.equal(calculateBump(minorCommits, 'patch'), 'patch');
});

test('bumpVersion increments the appropriate semver position', () => {
  assert.equal(bumpVersion('1.0.0', 'patch'), '1.0.1');
  assert.equal(bumpVersion('1.0.1', 'minor'), '1.1.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
});

test('generateChangelog categorizes features, bug fixes, and performance improvements', () => {
  const commits = [
    { hash: 'abc1234', type: 'feat', scope: 'dashboard', breaking: false, description: 'add real-time chart' },
    { hash: 'def5678', type: 'fix', scope: 'api', breaking: false, description: 'prevent port conflict' },
    { hash: '7890abc', type: 'perf', scope: 'core', breaking: false, description: 'optimize ringbuffer' },
  ];

  const changelog = generateChangelog('1.1.0', commits, '2026-11-03');
  assert.match(changelog, /## v1\.1\.0 \(2026-11-03\)/);
  assert.match(changelog, /### Features/);
  assert.match(changelog, /\*\*dashboard\*\*: add real-time chart \(`abc1234`\)/);
  assert.match(changelog, /### Bug Fixes/);
  assert.match(changelog, /\*\*api\*\*: prevent port conflict \(`def5678`\)/);
  assert.match(changelog, /### Performance & Refactoring/);
  assert.match(changelog, /\*\*core\*\*: optimize ringbuffer \(`7890abc`\)/);
  assert.doesNotMatch(changelog, /[\u{1F300}-\u{1F9FF}]/u); // Zero emojis allowed
});
