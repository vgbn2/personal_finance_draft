'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  DEFAULT_TEST_CONCURRENCY,
  RAG_REPORTER,
  DEFAULT_TEST_TARGETS,
  buildFileArgs,
  resolveTargets,
  runnerConcurrency,
  sourceRevision,
  splitRunnerArgs,
  withoutConcurrency,
} = require('../../../../run_node_tests.js');
const packageJson = require('../../../../../package.json');

test('each Node test file runs without a second isolation layer and keeps canonical reporters', () => {
  const target = '/fixture/example.test.js';
  assert.deepEqual(buildFileArgs([], target), [
    '--test',
    '--test-isolation=none',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    `--test-reporter=${RAG_REPORTER}`,
    '--test-reporter-destination=stderr',
    target,
  ]);
});

test('runner options precede a file and concurrency controls file workers, not nested isolation', () => {
  const options = ['--test-concurrency', '3', '--test-name-pattern', 'central host', '--test-reporter=dot'];
  assert.deepEqual(buildFileArgs(options, '/fixture/example.test.js'), [
    '--test',
    '--test-isolation=none',
    '--test-name-pattern',
    'central host',
    '--test-reporter=dot',
    '/fixture/example.test.js',
  ]);
  assert.equal(runnerConcurrency(options), 3);
  assert.deepEqual(withoutConcurrency(options), [
    '--test-name-pattern',
    'central host',
    '--test-reporter=dot',
  ]);
});

test('an explicit test file replaces broad discovery for a focused run', () => {
  const target = 'tests/scripts/lib/file_lock.test.js';
  assert.deepEqual(splitRunnerArgs(['--', target]).targets, [target]);
  assert.deepEqual(resolveTargets([target]), [path.resolve(target)]);
  assert.equal(runnerConcurrency(['--test-concurrency=2']), 2);
  assert.equal(runnerConcurrency([]), DEFAULT_TEST_CONCURRENCY);
});

test('default discovery expands only canonical test trees into isolated file jobs', () => {
  const resolved = resolveTargets([]);
  assert.ok(resolved.length > 0);
  assert.ok(resolved.every((target) => target.endsWith('.test.js')));
  assert.ok(resolved.every((target) => (
    target.includes(`${path.sep}tests${path.sep}scripts${path.sep}`)
    || target.includes(`${path.sep}tests${path.sep}web${path.sep}`)
  )));
  assert.deepEqual(DEFAULT_TEST_TARGETS, [
    'tests/scripts/**/*.test.js',
    'tests/web/**/*.test.js',
  ]);
});

test('runner failure records carry a source revision', () => {
  assert.equal(sourceRevision({ SOVEREIGN_SOURCE_REVISION: 'fixture-revision' }), 'fixture-revision');
  assert.match(sourceRevision({}), /^[0-9a-f]+$|^unknown$/);
});

test('every root Node test script routes failures through the RAG reporter', () => {
  const nodeTestScripts = Object.entries(packageJson.scripts)
    .filter(([name, command]) => name === 'test' || name.startsWith('test:'))
    .filter(([, command]) => String(command).includes('.test.js') || String(command).includes('run_node_tests.js'));

  assert.ok(nodeTestScripts.length > 0);
  for (const [name, command] of nodeTestScripts) {
    assert.match(command, /node tests\/run_node_tests\.js/, `${name} bypasses the RAG-aware runner`);
    assert.doesNotMatch(command, /\bnode --test\b/, `${name} invokes the raw Node test runner`);
  }
});

test('canonical native and secret checks log command-level failures for RAG', () => {
  assert.match(packageJson.scripts['test:core'], /run_logged_command\.js --label native-build/);
  assert.match(packageJson.scripts['test:core'], /run_logged_command\.js --label native-ctest/);
  assert.match(packageJson.scripts['test:secrets'], /run_logged_command\.js --label secret-scan/);
});
