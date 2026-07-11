'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { exitCodeForResult } = require('../../../backend/scripts/ops/host_backup');

test('host-backup CLI maps retention-only failure to exit code 3', () => {
  assert.equal(exitCodeForResult({ ok: true, backup_ok: true }), 0);
  assert.equal(exitCodeForResult({ ok: false, backup_ok: true }), 3);
  assert.equal(exitCodeForResult({ ok: false, backup_ok: false }), 1);
});
