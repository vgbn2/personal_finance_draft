// audit-ignore-test-scanner
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  DEFAULT_LOG_PATH,
  ERROR_KEYWORD_TAXONOMY,
  auditTestFileSource,
  loadTestResults,
  spotKeywordsInResults,
  spotKeywordsInSource,
} = require('../../../../scripts/dev/audit_test_results.js');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

test('audit_test_results: loads test failure results from JSONL properly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-keyword-audit-'));
  const tmpLog = path.join(tmpDir, 'test_failures.jsonl');

  try {
    // Non-existent file returns empty array
    assert.deepEqual(loadTestResults(path.join(tmpDir, 'non_existent.jsonl')), []);

    // Empty file returns empty array
    fs.writeFileSync(tmpLog, '', 'utf8');
    assert.deepEqual(loadTestResults(tmpLog), []);

    // Valid and malformed records
    const records = [
      JSON.stringify({ event: 'test_failure', test_name: 'test A', message: 'failed' }),
      'invalid json string',
      JSON.stringify({ event: 'test_failure', test_name: 'test B', message: 'error' }),
    ].join('\n');
    fs.writeFileSync(tmpLog, records, 'utf8');

    const loaded = loadTestResults(tmpLog);
    assert.equal(loaded.length, 3);
    assert.equal(loaded[0].test_name, 'test A');
    assert.equal(loaded[1].error, 'MALFORMED_RECORD');
    assert.equal(loaded[2].test_name, 'test B');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('audit_test_results: spots error keywords and categorizes test results', () => {
  const sampleRecords = [
    {
      event: 'test_failure',
      test_name: 'backend api entry point loads',
      file: 'tests/scripts/architecture/cli/core/module_loading.test.js',
      line: 35,
      failure_type: 'Error',
      message: "backend/api/app.js failed to load: Cannot find module 'socket.io'",
      error_code: 'ERR_TEST_FAILURE',
    },
    {
      event: 'test_failure',
      test_name: 'backtest uses strategy YAML defaults',
      file: 'tests/scripts/architecture/strategy_contracts/strategy_backtest_contract.test.js',
      line: 197,
      failure_type: 'Error',
      message: 'The expression evaluated to a falsy value: assert.ok(...)',
      error_code: 'ERR_TEST_FAILURE',
    },
    {
      event: 'test_failure',
      test_name: 'async ingestion handles reconnect',
      file: 'tests/scripts/data/ingest/reconnect.test.js',
      line: 55,
      failure_type: 'UnhandledPromiseRejection',
      message: 'UnhandledPromiseRejection: connection reset',
      error_code: 'ERR_UNHANDLED_REJECTION',
    },
    {
      event: 'test_failure',
      test_name: 'null pointer safeguard',
      file: 'tests/scripts/lib/safeguard.test.js',
      line: 12,
      failure_type: 'TypeError',
      message: 'TypeError: Cannot read properties of undefined (reading parse)',
      error_code: 'ERR_TYPE_ERROR',
    },
  ];

  const analysis = spotKeywordsInResults(sampleRecords, {
    keywords: ['connection reset'],
  });

  assert.equal(analysis.totalRecords, 4);
  assert.equal(analysis.matchedRecords, 4);

  // Verifies category counts
  assert.equal(analysis.categoryCounts.MODULE_RESOLUTION, 1);
  assert.equal(analysis.categoryCounts.ASSERTION_FAILURE, 2); // 'failed to load' and 'falsy value' / 'ERR_TEST_FAILURE'
  assert.equal(analysis.categoryCounts.ASYNC_UNHANDLED, 1);
  assert.equal(analysis.categoryCounts.TYPE_ERROR, 1);
  assert.equal(analysis.categoryCounts.USER_KEYWORD, 1);

  // Verifies matching details
  const moduleMatch = analysis.matches.find((m) => m.test_name === 'backend api entry point loads');
  assert.ok(moduleMatch);
  assert.ok(moduleMatch.categories.includes('MODULE_RESOLUTION'));
  assert.ok(moduleMatch.keywords.includes('Cannot find module'));
});

test('audit_test_results: spots defective keywords in test source code', () => {
  // Test isolation (.only, fit)
  const onlySource = `
    test.only('focus this test', () => {
      assert.equal(1, 1);
    });
    fit('focused jasmine/jest style', () => {});
  `;
  const onlyViolations = spotKeywordsInSource(onlySource);
  assert.equal(onlyViolations.filter((v) => v.rule === 'RULE_TEST_ISOLATION_ONLY').length, 2);

  // Test silent skip (.skip, xit)
  const skipSource = `
    it.skip('temporarily skipped', () => {
      assert.fail('should not run');
    });
    xdescribe('ignored suite', () => {});
  `;
  const skipViolations = spotKeywordsInSource(skipSource);
  assert.equal(skipViolations.filter((v) => v.rule === 'RULE_TEST_SILENT_SKIP').length, 2);

  // Debugger keyword
  const debugSource = `
    test('breaks automated execution', () => {
      debugger;
      assert.ok(true);
    });
  `;
  const debugViolations = spotKeywordsInSource(debugSource);
  assert.ok(debugViolations.some((v) => v.rule === 'RULE_DEBUGGER_STATEMENT'));
  assert.ok(debugViolations.some((v) => v.rule === 'RULE_TAUTOLOGICAL_ASSERTION'));

  // Unawaited rejects
  const unawaitedSource = `
    test('unawaited reject causes unhandled rejection', () => {
      assert.rejects(Promise.reject(new Error('boom')));
    });
  `;
  const unawaitedViolations = spotKeywordsInSource(unawaitedSource);
  assert.ok(unawaitedViolations.some((v) => v.rule === 'RULE_UNAWAITED_REJECTS'));

  // Clean code produces zero violations
  const cleanSource = `
    test('proper test contract', async () => {
      await assert.rejects(async () => { throw new Error('expected'); });
      assert.equal(actual, expected);
      assert.deepEqual(objA, objB);
    });
  `;
  const cleanViolations = spotKeywordsInSource(cleanSource);
  assert.deepEqual(cleanViolations, []);
});

test('audit_test_results: repository test files contain zero defective keywords', () => {
  function findTestFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'build', '.git', '.claude'].includes(entry.name)) {
          files = files.concat(findTestFiles(full));
        }
      } else if (entry.isFile() && (entry.name.endsWith('.test.js') || entry.name.endsWith('.test.ts'))) {
        files.push(full);
      }
    }
    return files;
  }

  const allTestFiles = [
    ...findTestFiles(path.join(REPO_ROOT, 'tests')),
    ...findTestFiles(path.join(REPO_ROOT, 'backend')),
  ].filter((f) => !f.endsWith('test_keyword_audit.test.js'));

  assert.ok(allTestFiles.length > 200, `Expected >200 test files, found ${allTestFiles.length}`);

  const allViolations = [];
  for (const file of allTestFiles) {
    const violations = auditTestFileSource(file);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  }

  assert.deepEqual(
    allViolations,
    [],
    `Found defective keywords in test files:\n${allViolations.map((v) => `  ${v.fileName}:${v.line} [${v.rule}] ${v.snippet}`).join('\n')}`
  );
});

test('audit_test_results: real failure logs analysis does not throw and categorizes historical errors', () => {
  if (fs.existsSync(DEFAULT_LOG_PATH)) {
    const realRecords = loadTestResults(DEFAULT_LOG_PATH);
    const analysis = spotKeywordsInResults(realRecords);
    assert.equal(typeof analysis.totalRecords, 'number');
    assert.equal(typeof analysis.matchedRecords, 'number');
    assert.ok(analysis.matchedRecords <= analysis.totalRecords);
  }
});
