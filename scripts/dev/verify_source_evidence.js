#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  EXCLUDED_CLAIMS,
  MODES,
  PACKAGE_ROOTS,
  validateEvidence: validateEvidenceSchema,
} = require('./source_evidence_schema');

const DEFAULT_JOB_LIMIT = 2;
const MAX_JOB_LIMIT = 8;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function checkedOutput(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.error || result.signal || result.status !== 0) {
    const reason = result.error?.message || result.signal || `exit ${result.status}`;
    throw new Error(`${command} ${args.join(' ')} failed: ${reason}`);
  }
  return result.stdout;
}

function listWorktreeFiles(repoRoot) {
  return checkedOutput(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot },
  ).split('\0').filter(Boolean).filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));
}

function listCommittedFiles(repoRoot) {
  return checkedOutput(
    'git',
    ['ls-tree', '-r', '--name-only', '-z', 'HEAD'],
    { cwd: repoRoot },
  ).split('\0').filter(Boolean);
}

function copyListedFiles(repoRoot, destination, relativePaths) {
  for (const relativePath of relativePaths) {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(destination, relativePath);
    const stat = fs.lstatSync(source);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (stat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(source), target);
    } else if (stat.isFile()) {
      fs.copyFileSync(source, target);
      fs.chmodSync(target, stat.mode);
    }
  }
}

function contentFingerprint(root, relativePaths) {
  const hash = crypto.createHash('sha256');
  for (const relativePath of [...relativePaths].sort()) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source)) continue;
    const stat = fs.lstatSync(source);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(stat.isSymbolicLink() ? fs.readlinkSync(source) : fs.readFileSync(source));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function initializeDisposableGit(sourceRoot) {
  checkedOutput('git', ['init', '-q'], { cwd: sourceRoot });
  checkedOutput('git', ['add', '-A'], { cwd: sourceRoot });
  checkedOutput(
    'git',
    [
      '-c', 'user.name=Sovereign Source Evidence',
      '-c', 'user.email=source-evidence@localhost.invalid',
      'commit', '-qm', 'source evidence snapshot',
    ],
    { cwd: sourceRoot },
  );
}

function acquireSource({ repoRoot, sourceRoot, mode, archivePath }) {
  fs.mkdirSync(sourceRoot, { recursive: true });
  const commit = checkedOutput('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  const tree = checkedOutput('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot }).trim();
  let files;
  let dirty;

  if (mode === 'worktree_snapshot') {
    files = listWorktreeFiles(repoRoot);
    copyListedFiles(repoRoot, sourceRoot, files);
    dirty = checkedOutput('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: repoRoot,
    }).trim().length > 0;
  } else {
    files = listCommittedFiles(repoRoot);
    checkedOutput('git', ['archive', '--format=tar', `--output=${archivePath}`, 'HEAD'], {
      cwd: repoRoot,
    });
    checkedOutput('tar', ['-xf', archivePath, '-C', sourceRoot]);
    dirty = false;
  }

  const sortedFiles = [...files].sort();
  const identity = {
    commit,
    tree,
    dirty,
    file_count: sortedFiles.length,
    source_list_sha256: sha256(`${sortedFiles.join('\0')}\0`),
    content_sha256: contentFingerprint(sourceRoot, sortedFiles),
  };
  initializeDisposableGit(sourceRoot);
  return identity;
}

function lockfileEvidence(sourceRoot) {
  return PACKAGE_ROOTS.map((packageRoot) => {
    const relativePath = packageRoot === '.' ? 'package-lock.json' : `${packageRoot}/package-lock.json`;
    const absolutePath = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`missing lockfile: ${relativePath}`);
    return { path: relativePath, sha256: sha256File(absolutePath) };
  });
}

function parseCounts(output) {
  const text = output || '';
  const tests = text.match(/(?:^|\n)(?:#|ℹ) tests (\d+)/);
  const pass = text.match(/(?:^|\n)(?:#|ℹ) pass (\d+)/);
  const fail = text.match(/(?:^|\n)(?:#|ℹ) fail (\d+)/);
  const skipped = text.match(/(?:^|\n)(?:#|ℹ) skipped (\d+)/);
  if (tests || pass || fail || skipped) {
    return {
      tests: tests ? Number(tests[1]) : null,
      pass: pass ? Number(pass[1]) : null,
      fail: fail ? Number(fail[1]) : null,
      skip: skipped ? Number(skipped[1]) : 0,
    };
  }
  const ctest = text.match(/(\d+)% tests passed, (\d+) tests failed out of (\d+)/);
  if (ctest) {
    const total = Number(ctest[3]);
    const failed = Number(ctest[2]);
    return { tests: total, pass: total - failed, fail: failed, skip: 0 };
  }
  return { tests: null, pass: null, fail: null, skip: null };
}

function fixedSteps(sourceRoot, jobs = DEFAULT_JOB_LIMIT) {
  const steps = [];
  for (const packageRoot of PACKAGE_ROOTS) {
    const prefix = path.join(sourceRoot, packageRoot);
    const label = packageRoot === '.' ? 'root' : packageRoot.replaceAll('/', '_');
    steps.push(
      { label: `npm_ci_${label}`, command: 'npm', args: ['--prefix', prefix, 'ci', '--no-audit', '--no-fund'] },
      { label: `npm_ls_${label}`, command: 'npm', args: ['--prefix', prefix, 'ls', '--depth=0'] },
    );
  }
  return steps.concat([
    {
      label: 'build_mcp',
      command: 'npm',
      args: ['--prefix', path.join(sourceRoot, 'backend/mcp_server'), 'run', 'build'],
    },
    {
      label: 'build_dashboard',
      command: 'npm',
      args: ['--prefix', path.join(sourceRoot, 'Frontend/dashboard'), 'run', 'build'],
    },
    {
      label: 'typecheck_gateway',
      command: process.execPath,
      args: [
        path.join(sourceRoot, 'node_modules/typescript/bin/tsc'),
        '-p',
        path.join(sourceRoot, 'backend/gateway/tsconfig.json'),
        '--noEmit',
      ],
    },
    ...[
      'shared/lib/market/quote_router.js',
      'backend/scripts/data_ops/ingest_market_data.js',
      'backend/scripts/data_ops/ingest_market_data/index.js',
      'backend/cli/sovereign_cli.js',
      'backend/cli/tui/intersection.js',
      'backend/api/app.js',
    ].map((relativePath) => ({
      label: `syntax_${relativePath.replaceAll('/', '_').replace(/\.js$/, '')}`,
      command: process.execPath,
      args: ['--check', path.join(sourceRoot, relativePath)],
    })),
    { label: 'test_native_core', command: 'npm', args: ['--prefix', sourceRoot, 'run', 'test:core'] },
    { label: 'check_environment', command: 'npm', args: ['--prefix', sourceRoot, 'run', 'check:env'] },
    { label: 'test_secrets', command: 'npm', args: ['--prefix', sourceRoot, 'run', 'test:secrets'] },
    { label: 'test_api', command: 'npm', args: ['--prefix', sourceRoot, 'run', 'test:api'] },
    { label: 'test_contracts', command: 'npm', args: ['--prefix', sourceRoot, 'run', 'test:contracts'] },
    { label: 'test_structure', command: 'npm', args: ['--prefix', sourceRoot, 'run', 'test:structure'] },
    {
      label: 'test_aggregate_node',
      command: 'npm',
      args: ['--prefix', sourceRoot, 'test', '--', `--test-concurrency=${jobs}`],
    },
  ]);
}

function executeSteps({
  sourceRoot,
  cacheRoot,
  jobs = DEFAULT_JOB_LIMIT,
  commandRunner = run,
  output = process.stdout,
}) {
  const evidence = [];
  const childEnvironment = {
    ...process.env,
    npm_config_cache: cacheRoot,
    npm_config_maxsockets: String(jobs),
    CMAKE_BUILD_PARALLEL_LEVEL: String(jobs),
    MAKEFLAGS: `-j${jobs}`,
    GOMAXPROCS: String(jobs),
    UV_THREADPOOL_SIZE: String(jobs),
  };
  let failure = null;
  for (const definition of fixedSteps(sourceRoot, jobs)) {
    const started = process.hrtime.bigint();
    output.write(`[source-evidence] ${definition.label}\n`);
    const result = commandRunner(definition.command, definition.args, {
      cwd: sourceRoot,
      env: childEnvironment,
    });
    const combinedOutput = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.stdout) output.write(result.stdout);
    if (result.stderr) output.write(result.stderr);
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const passed = !result.error && !result.signal && result.status === 0;
    evidence.push({
      label: definition.label,
      exit_code: !result.error && Number.isInteger(result.status) ? result.status : null,
      signal: result.signal || null,
      error_code: result.error?.code || null,
      duration_ms: Math.round(durationMs),
      status: passed ? 'pass' : (result.signal ? 'inconclusive' : 'fail'),
      counts: parseCounts(combinedOutput),
    });
    if (!passed) {
      failure = result.signal
        ? { status: 'inconclusive', reason: `step terminated by signal: ${definition.label}` }
        : { status: 'fail', reason: `step failed: ${definition.label}` };
      break;
    }
  }
  return { steps: evidence, failure };
}

function validateEvidence(evidence) {
  return validateEvidenceSchema(
    evidence,
    fixedSteps('/source', evidence.runtime?.job_limit).map((step) => step.label),
  );
}

function writeEvidenceAtomic(evidencePath, evidence) {
  validateEvidence(evidence);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const temporaryPath = `${evidencePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, evidencePath);
}

function parseArgs(argv) {
  const options = { mode: null, evidenceOut: null, jobs: DEFAULT_JOB_LIMIT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode' && argv[index + 1]) {
      options.mode = argv[index + 1];
      index += 1;
    } else if (argument === '--evidence-out' && argv[index + 1]) {
      options.evidenceOut = argv[index + 1];
      index += 1;
    } else if (argument === '--jobs' && argv[index + 1]) {
      options.jobs = Number(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${argument}`);
    }
  }
  if (!MODES.has(options.mode)) throw new Error(`invalid --mode: ${options.mode || '(missing)'}`);
  if (options.evidenceOut && !path.isAbsolute(options.evidenceOut)) {
    throw new Error('--evidence-out must be an absolute path');
  }
  if (!Number.isInteger(options.jobs) || options.jobs < 1 || options.jobs > MAX_JOB_LIMIT) {
    throw new Error(`--jobs must be an integer from 1 to ${MAX_JOB_LIMIT}`);
  }
  return options;
}

function baseEvidence(mode, startedAt, jobs) {
  return {
    schema_version: 1,
    evidence_id: crypto.randomUUID(),
    status: 'inconclusive',
    mode,
    started_at: startedAt,
    ended_at: startedAt,
    source: null,
    lockfiles: [],
    runtime: {
      node: process.version,
      npm: null,
      os: os.platform(),
      architecture: os.arch(),
      environment_class: process.env.CI ? 'ci' : 'local',
      job_limit: jobs,
    },
    steps: [],
    proven_claims: [],
    excluded_claims: [...EXCLUDED_CLAIMS],
    failure_reason: null,
  };
}

function npmVersion() {
  const result = run('npm', ['--version']);
  return result.status === 0 ? result.stdout.trim() : null;
}

function runVerification({
  repoRoot,
  mode,
  evidenceOut,
  jobs = DEFAULT_JOB_LIMIT,
  commandRunner = run,
  acquireSourceFn = acquireSource,
  output = process.stdout,
}) {
  const startedAt = new Date().toISOString();
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-source-evidence-'));
  const sourceRoot = path.join(runRoot, 'source');
  const cacheRoot = path.join(runRoot, 'npm-cache');
  const archivePath = path.join(runRoot, 'source.tar');
  const evidencePath = evidenceOut || path.join(runRoot, 'evidence.json');
  const preserveRunRoot = !evidenceOut;
  const evidence = baseEvidence(mode, startedAt, jobs);
  evidence.runtime.npm = npmVersion();

  try {
    evidence.failure_reason = 'verification_in_progress';
    writeEvidenceAtomic(evidencePath, evidence);
    evidence.source = acquireSourceFn({ repoRoot, sourceRoot, mode, archivePath });
    evidence.lockfiles = lockfileEvidence(sourceRoot);
    const execution = executeSteps({ sourceRoot, cacheRoot, jobs, commandRunner, output });
    evidence.steps = execution.steps;
    evidence.status = execution.failure ? execution.failure.status : 'pass';
    evidence.failure_reason = execution.failure?.reason || null;
    if (!execution.failure) {
      evidence.proven_claims = [
        mode === 'committed_archive'
          ? 'committed_archive_source_evidence'
          : 'worktree_snapshot_source_evidence',
        'five_root_lockfile_install',
        'declared_build_and_test_steps',
      ];
    }
  } catch (error) {
    evidence.status = 'fail';
    evidence.failure_reason = error.message;
  } finally {
    evidence.ended_at = new Date().toISOString();
    writeEvidenceAtomic(evidencePath, evidence);
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(cacheRoot, { recursive: true, force: true });
    fs.rmSync(archivePath, { force: true });
    if (!preserveRunRoot) fs.rmSync(runRoot, { recursive: true, force: true });
  }

  output.write(`[source-evidence] evidence: ${evidencePath}\n`);
  if (evidence.status === 'pass') output.write('[source-evidence] PASS\n');
  return { exitCode: evidence.status === 'pass' ? 0 : 1, evidence, evidencePath };
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`[source-evidence] ${error.message}\n`);
    return 2;
  }
  const result = runVerification({
    repoRoot: path.resolve(__dirname, '..', '..'),
    mode: options.mode,
    evidenceOut: options.evidenceOut,
    jobs: options.jobs,
  });
  return result.exitCode;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  EXCLUDED_CLAIMS,
  MODES,
  PACKAGE_ROOTS,
  acquireSource,
  contentFingerprint,
  executeSteps,
  fixedSteps,
  lockfileEvidence,
  main,
  parseArgs,
  parseCounts,
  runVerification,
  validateEvidence,
  writeEvidenceAtomic,
};
