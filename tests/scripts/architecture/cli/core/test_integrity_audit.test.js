'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditCppSource,
  auditJsSource,
  listCppTestFiles,
} = require('../../../../../scripts/dev/audit_test_integrity.js');

function rules(violations) {
  return violations.map((violation) => violation.rule);
}

test('test integrity scanner detects forbidden internal mocks', () => {
  const violations = auditJsSource(`
    test('bad mock', (t) => {
      t.mock.method(validation, 'readTsIndex');
    });
  `);
  assert.deepEqual(rules(violations), ['RULE_1_INTERNAL_MOCKING']);
});

test('test integrity scanner rejects boolean-wrapped equality assertions', () => {
  const violations = auditJsSource(`
    test('loose contract', () => {
      assert.ok(actual === expected);
      assert(actual != forbidden);
    });
  `);
  assert.deepEqual(rules(violations), [
    'RULE_2_STRICT_ASSERTION',
    'RULE_2_STRICT_ASSERTION',
  ]);
});

test('test integrity scanner accepts explicit strict assertions', () => {
  const violations = auditJsSource(`
    test('explicit contract', () => {
      assert.equal(actual, expected);
      assert.notEqual(actual, forbidden);
      assert.deepEqual(actualRows, expectedRows);
    });
  `);
  assert.deepEqual(violations, []);
});

test('test integrity scanner detects swallowed assertion failures', () => {
  const violations = auditJsSource(`
    try {
      assert.equal(actual, expected);
    } catch (error) {}
  `);
  assert.deepEqual(rules(violations), ['RULE_3_SILENT_ERROR_SWALLOWING']);
});

test('test integrity scanner detects direct runtime-cache fixture reads', () => {
  const violations = auditJsSource(`
    const payload = fs.readFileSync('storage/data/cache/live.json', 'utf8');
  `);
  assert.deepEqual(rules(violations), ['RULE_4_CACHE_DEPENDENCE']);
});

test('test integrity scanner rejects require.cache module replacement but allows reload invalidation', () => {
  const injected = auditJsSource(`
    require.cache[require.resolve('./validation.js')] = { exports: { readTsIndex: () => [] } };
  `);
  const reload = auditJsSource(`
    delete require.cache[require.resolve('./validation.js')];
  `);
  assert.deepEqual(rules(injected), ['RULE_1_LOADER_REPLACEMENT']);
  assert.deepEqual(reload, []);
});

test('test integrity scanner rejects Module._load replacement unless narrowly reasoned', () => {
  const injected = auditJsSource(`
    Module._load = function(request) { return {}; };
  `);
  const exempt = auditJsSource(`
    // audit-ignore-loader: external HTTP adapter boundary fixture
    Module._load = function(request) { return {}; };
  `);
  const malformed = auditJsSource(`
    // audit-ignore-loader:
    Module._load = function(request) { return {}; };
  `);
  assert.deepEqual(rules(injected), ['RULE_1_LOADER_REPLACEMENT']);
  assert.deepEqual(exempt, []);
  assert.deepEqual(rules(malformed), ['RULE_1_LOADER_REPLACEMENT', 'RULE_1_LOADER_IGNORE']);
});

test('test integrity scanner inventories registered C++ tests in a clean tree', () => {
  const files = listCppTestFiles();
  assert.equal(files.length > 0, true);
  assert.equal(files.some((filePath) => filePath.endsWith('global_sweep_optimizer_test.cpp')), true);
});

test('test integrity scanner rejects Release-elided C++ assertions', () => {
  const violations = auditCppSource(`
    // assert(comment_only);
    const char* text = "assert(string_only)";
    assert(result.ok);
  `);
  assert.deepEqual(rules(violations), ['RULE_2_CPP_RELEASE_ASSERTION']);
});
