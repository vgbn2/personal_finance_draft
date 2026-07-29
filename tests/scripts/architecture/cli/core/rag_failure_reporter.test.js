'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

test('RAG failure reporter appends one sanitized JSONL record per failed test event', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-failure-reporter-'));
  const outputPath = path.join(dir, 'failures.jsonl');
  const previous = process.env.SOVEREIGN_TEST_FAILURE_LOG;
  process.env.SOVEREIGN_TEST_FAILURE_LOG = outputPath;
  try {
    const reporterPath = path.resolve(__dirname, '..', '..', '..', '..', 'support', 'rag_failure_reporter.mjs');
    const { default: reporter } = await import(pathToFileURL(reporterPath).href);
    async function* events() {
      yield { type: 'test:pass', data: { name: 'safe pass' } };
      yield {
        type: 'test:fail',
        data: {
          name: 'wrong PIN remains denied',
          file: path.join(process.cwd(), 'tests', 'safety.test.js'),
          line: 12,
          details: {
            error: Object.assign(new Error('top-level failure'), {
              cause: new Error('authorization token=super-secret leaked'),
            }),
          },
        },
      };
    }
    for await (const _ of reporter(events())) { /* reporter intentionally emits no console output */ }

    const records = fs.readFileSync(outputPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].event, 'test_failure');
    assert.equal(records[0].test_name, 'wrong PIN remains denied');
    assert.match(records[0].message, /top-level failure/);
    assert.match(records[0].message, /token=\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(records), /super-secret/);
  } finally {
    if (previous === undefined) delete process.env.SOVEREIGN_TEST_FAILURE_LOG;
    else process.env.SOVEREIGN_TEST_FAILURE_LOG = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
