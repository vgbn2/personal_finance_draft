const { spawnSync } = require('node:child_process');

const DEFAULT_TEST_TARGETS = [
  'tests/scripts/**/*.test.js',
  'tests/web/**/*.test.js',
];
const DEFAULT_TEST_CONCURRENCY = 2;

const OPTIONS_WITH_VALUES = new Set([
  '--import',
  '--require',
  '-r',
  '--test-concurrency',
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-timeout',
]);

function splitRunnerArgs(argv) {
  const options = [];
  const targets = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      targets.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('-')) {
      options.push(arg);
      if (!arg.includes('=') && OPTIONS_WITH_VALUES.has(arg) && index + 1 < argv.length) {
        options.push(argv[index + 1]);
        index += 1;
      }
      continue;
    }
    targets.push(arg);
  }
  return { options, targets };
}

function buildArgs(argv = []) {
  const { options, targets } = splitRunnerArgs(argv);
  const hasConcurrency = options.some(
    (option) => option === '--test-concurrency' || option.startsWith('--test-concurrency='),
  );
  return [
    '--test',
    ...(!hasConcurrency ? [`--test-concurrency=${DEFAULT_TEST_CONCURRENCY}`] : []),
    ...options,
    ...(targets.length > 0 ? targets : DEFAULT_TEST_TARGETS),
  ];
}

function main(argv = process.argv.slice(2)) {
  const result = spawnSync(process.execPath, buildArgs(argv), {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    process.stderr.write(`test runner failed to start: ${result.error.message}\n`);
  } else if (result.signal) {
    process.stderr.write(`test runner terminated by signal: ${result.signal}\n`);
  }
  return result.status ?? 1;
}

if (require.main === module) process.exit(main());

module.exports = {
  DEFAULT_TEST_CONCURRENCY,
  DEFAULT_TEST_TARGETS,
  buildArgs,
  splitRunnerArgs,
};
