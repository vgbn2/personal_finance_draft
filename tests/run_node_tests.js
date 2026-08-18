const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TEST_TARGETS = [
  'tests/scripts/**/*.test.js',
  'tests/web/**/*.test.js',
];
const DEFAULT_TEST_CONCURRENCY = 2;
const DEFAULT_FAILURE_LOG = path.resolve(
  process.env.SOVEREIGN_TEST_FAILURE_LOG
    || path.join('storage', 'logs', 'rag', 'test_failures.jsonl'),
);
const RAG_REPORTER = path.resolve(__dirname, 'support', 'rag_failure_reporter.mjs');

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

function withoutConcurrency(options) {
  const filtered = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--test-concurrency') {
      index += 1;
    } else if (!option.startsWith('--test-concurrency=')) {
      filtered.push(option);
    }
  }
  return filtered;
}

function runnerConcurrency(options) {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--test-concurrency') return Number(options[index + 1]);
    if (option.startsWith('--test-concurrency=')) return Number(option.split('=', 2)[1]);
  }
  return DEFAULT_TEST_CONCURRENCY;
}

let supportsTestIsolationNone;
function checkSupportsTestIsolationNone() {
  if (supportsTestIsolationNone !== undefined) return supportsTestIsolationNone;
  const res = spawnSync(process.execPath, ['--test-isolation=none', '-e', ''], { stdio: 'ignore' });
  supportsTestIsolationNone = res.status === 0;
  return supportsTestIsolationNone;
}

function buildFileArgs(options, target) {
  const hasReporter = options.some(
    (option) => option === '--test-reporter' || option.startsWith('--test-reporter='),
  );
  return [
    '--test',
    ...(checkSupportsTestIsolationNone() ? ['--test-isolation=none'] : []),
    ...(!hasReporter ? [
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      `--test-reporter=${RAG_REPORTER}`,
      '--test-reporter-destination=stderr',
    ] : []),
    ...withoutConcurrency(options),
    target,
  ];
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function expandTarget(repoRoot, target) {
  if (!/[*?]/.test(target)) {
    const absolute = path.resolve(repoRoot, target);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      return listFiles(absolute).filter((file) => file.endsWith('.test.js'));
    }
    return [absolute];
  }
  return fs.globSync(target, { cwd: repoRoot }).map((file) => path.resolve(repoRoot, file));
}

function resolveTargets(targets, repoRoot = path.resolve(__dirname, '..')) {
  const requested = targets.length > 0 ? targets : DEFAULT_TEST_TARGETS;
  return [...new Set(requested.flatMap((target) => expandTarget(repoRoot, target)))].sort();
}

function sourceRevision(environment = process.env) {
  if (environment.SOVEREIGN_SOURCE_REVISION) return environment.SOVEREIGN_SOURCE_REVISION;
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function runTestFile(options, target, environment, spawnProcess = spawn) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolve(exitCode);
    };
    const child = spawnProcess(process.execPath, buildFileArgs(options, target), {
      stdio: 'inherit',
      env: environment,
    });
    child.once('error', (error) => {
      process.stderr.write(`test runner failed to start ${target}: ${error.message}\n`);
      finish(1);
    });
    child.once('close', (code, signal) => {
      if (signal) process.stderr.write(`test runner terminated ${target} by signal: ${signal}\n`);
      finish(code ?? 1);
    });
  });
}

async function runTestFiles(options, targets, environment, concurrency) {
  let nextIndex = 0;
  let failed = false;
  async function worker() {
    while (nextIndex < targets.length) {
      const target = targets[nextIndex];
      nextIndex += 1;
      if (await runTestFile(options, target, environment) !== 0) failed = true;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );
  return failed ? 1 : 0;
}

async function main(argv = process.argv.slice(2)) {
  if (typeof fs.globSync !== 'function') {
    process.stderr.write('test runner requires Node.js 22 or newer\n');
    return 2;
  }
  fs.mkdirSync(path.dirname(DEFAULT_FAILURE_LOG), { recursive: true });
  const { options, targets } = splitRunnerArgs(argv);
  const concurrency = runnerConcurrency(options);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    process.stderr.write('test runner requires --test-concurrency to be a positive integer\n');
    return 2;
  }
  const resolvedTargets = resolveTargets(targets);
  if (resolvedTargets.length === 0) {
    process.stderr.write('test runner did not resolve any test files\n');
    return 2;
  }
  return runTestFiles(
    options,
    resolvedTargets,
    {
      ...process.env,
      SOVEREIGN_SOURCE_REVISION: sourceRevision(),
      SOVEREIGN_TEST_FAILURE_LOG: DEFAULT_FAILURE_LOG,
    },
    concurrency,
  );
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`test runner failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_TEST_CONCURRENCY,
  DEFAULT_FAILURE_LOG,
  DEFAULT_TEST_TARGETS,
  RAG_REPORTER,
  buildFileArgs,
  resolveTargets,
  runnerConcurrency,
  sourceRevision,
  splitRunnerArgs,
  withoutConcurrency,
};
