'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  appendFailure,
  commandFailureRecord,
} = require('../../../../run_logged_command.js');

test('logged command runner records sanitized non-assertion test failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-command-reporter-'));
  const outputPath = path.join(dir, 'failures.jsonl');
  try {
    appendFailure(commandFailureRecord({
      label: 'fixture command',
      command: process.execPath,
      args: ['fixture'],
      result: {
        status: 7,
        signal: null,
        error: null,
        stderr: 'token=fixture-secret https://operator:another-secret@example.invalid',
        stdout: '',
      },
    }), outputPath);

    const records = fs.readFileSync(outputPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].event, 'test_command_failure');
    assert.equal(records[0].test_name, 'fixture command');
    assert.equal(records[0].exit_code, 7);
    assert.match(records[0].message, /token=\[REDACTED\]/);
    assert.match(records[0].message, /:\/\/\[REDACTED\]@example\.invalid/);
    assert.doesNotMatch(JSON.stringify(records), /fixture-secret/);
    assert.doesNotMatch(JSON.stringify(records), /another-secret/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
