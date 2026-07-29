'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PACKAGE_PATHS = [
  'package.json',
  'backend/api/package.json',
  'backend/gateway/package.json',
  'backend/mcp_server/package.json',
  'Frontend/dashboard/package.json',
];

test('every package root is private and points to the tracked personal license', () => {
  for (const relativePath of PACKAGE_PATHS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
    assert.equal(manifest.private, true, relativePath);
    assert.match(manifest.license, /^SEE LICENSE IN (?:\.\.\/\.\.\/)?LICENSE$/, relativePath);
  }
});
