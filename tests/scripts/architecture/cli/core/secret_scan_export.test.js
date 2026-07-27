'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { listTrackedFiles } = require('../../../../../backend/scripts/dev/secret_pattern_check');

test('secret scanner uses an explicit exported source inventory when git metadata is absent', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-secret-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.sovereign-source-files'), 'package.json\nshared/example.js\n');
  assert.deepEqual(listTrackedFiles({ cwd: root }), ['package.json', 'shared/example.js']);
});
