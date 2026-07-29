'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  sanitizedText,
} = require('../scripts/dev/sanitized_diagnostics');
const { sourceRevision } = require('./run_node_tests.js');

const DEFAULT_FAILURE_LOG = path.resolve(
  process.env.SOVEREIGN_TEST_FAILURE_LOG
    || path.join('storage', 'logs', 'rag', 'test_failures.jsonl'),
);
function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error('usage: run_logged_command --label <name> -- <command> [args...]');
  }
  const labelIndex = argv.indexOf('--label');
  const label = labelIndex >= 0 && labelIndex + 1 < separator ? argv[labelIndex + 1] : 'test_command';
  return {
    label,
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
  };
}

function appendFailure(record, outputPath = DEFAULT_FAILURE_LOG) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.appendFileSync(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
}

function commandFailureRecord({ label, command, args, result }) {
  return {
    schema_version: 1,
    event: 'test_command_failure',
    recorded_at: new Date().toISOString(),
    revision: sourceRevision(),
    test_name: sanitizedText(label, 500),
    command: sanitizedText([command, ...args].join(' '), 1000),
    exit_code: Number.isInteger(result.status) ? result.status : null,
    signal: sanitizedText(result.signal || '', 120) || null,
    error_code: sanitizedText(result.error?.code || '', 120) || null,
    message: sanitizedText(result.error?.message || result.stderr || result.stdout || 'test command failed'),
  };
}

function main(argv = process.argv.slice(2)) {
  let definition;
  try {
    definition = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  const result = spawnSync(definition.command, definition.args, {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const passed = !result.error && !result.signal && result.status === 0;
  if (!passed) {
    appendFailure(commandFailureRecord({ ...definition, result }));
  }
  return passed ? 0 : (result.status ?? 1);
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DEFAULT_FAILURE_LOG,
  appendFailure,
  commandFailureRecord,
  main,
  parseArgs,
  sanitizedText,
};
