'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TEST_TARGETS,
  buildArgs,
  splitRunnerArgs,
} = require('../../../../run_node_tests.js');

test('default Node runner uses the canonical discovery targets', () => {
  assert.deepEqual(buildArgs(), [
    '--test',
    ...DEFAULT_TEST_TARGETS,
  ]);
});

test('runner options precede discovery targets and keep their values out of target detection', () => {
  assert.deepEqual(buildArgs(['--test-name-pattern', 'central host', '--test-reporter=dot']), [
    '--test',
    '--test-name-pattern',
    'central host',
    '--test-reporter=dot',
    ...DEFAULT_TEST_TARGETS,
  ]);
});

test('an explicit test file replaces broad discovery for a focused run', () => {
  const target = 'tests/scripts/lib/file_lock.test.js';
  assert.deepEqual(buildArgs(['--test-concurrency=2', target]), [
    '--test',
    '--test-concurrency=2',
    target,
  ]);
  assert.deepEqual(splitRunnerArgs(['--', target]).targets, [target]);
});
