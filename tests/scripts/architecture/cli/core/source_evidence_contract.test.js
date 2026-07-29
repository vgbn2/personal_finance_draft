'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const {
  PACKAGE_ROOTS,
  acquireSource,
  contentFingerprint,
  defaultEvidencePath,
  executeSteps,
  fixedSteps,
  parseArgs,
  parseCounts,
  runVerification,
  validateEvidence,
} = require('../../../../../scripts/dev/verify_source_evidence');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-evidence-fixture-'));
  git(root, ['init', '-q']);
  for (const packageRoot of PACKAGE_ROOTS) {
    const directory = path.join(root, packageRoot);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package-lock.json'), '{"lockfileVersion":3}\n');
  }
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
  git(root, ['add', '-A']);
  git(root, [
    '-c', 'user.name=Source Evidence Test',
    '-c', 'user.email=source-evidence-test@localhost.invalid',
    'commit', '-qm', 'fixture',
  ]);
  return root;
}

function fakePass() {
  return {
    status: 0,
    signal: null,
    stdout: '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
    stderr: '',
  };
}

function silentOutput() {
  return { write() {} };
}

test('source acquisition separates untracked worktree state from the committed archive', (t) => {
  const repoRoot = createFixtureRepository();
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-worktree-'));
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-archive-'));
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(repoRoot, 'untracked-sentinel.txt'), 'must-not-enter-archive\n');

  const snapshotSource = path.join(worktreeRoot, 'source');
  const snapshot = acquireSource({
    repoRoot,
    sourceRoot: snapshotSource,
    mode: 'worktree_snapshot',
    archivePath: path.join(worktreeRoot, 'unused.tar'),
  });
  const archiveSource = path.join(archiveRoot, 'source');
  const archive = acquireSource({
    repoRoot,
    sourceRoot: archiveSource,
    mode: 'committed_archive',
    archivePath: path.join(archiveRoot, 'source.tar'),
  });

  assert.equal(snapshot.dirty, true);
  assert.equal(archive.dirty, false);
  assert.equal(fs.existsSync(path.join(snapshotSource, 'untracked-sentinel.txt')), true);
  assert.equal(fs.existsSync(path.join(archiveSource, 'untracked-sentinel.txt')), false);
  assert.equal(snapshot.commit, archive.commit);
  assert.notEqual(snapshot.content_sha256, archive.content_sha256);
});

test('content fingerprint represents archived gitlink directories without reading them as files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-gitlink-fingerprint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'backend', 'polymarket-cli'), { recursive: true });

  const first = contentFingerprint(root, ['backend/polymarket-cli']);
  const second = contentFingerprint(root, ['backend/polymarket-cli']);

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, second);
});

test('verification atomically replaces stale pass evidence with a failed manifest', (t) => {
  const repoRoot = createFixtureRepository();
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-evidence-output-'));
  const evidencePath = path.join(evidenceRoot, 'evidence.json');
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  });

  const passed = runVerification({
    repoRoot,
    mode: 'committed_archive',
    evidenceOut: evidencePath,
    commandRunner: fakePass,
    output: silentOutput(),
  });
  assert.equal(passed.exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(evidencePath, 'utf8')).status, 'pass');

  let calls = 0;
  const failed = runVerification({
    repoRoot,
    mode: 'committed_archive',
    evidenceOut: evidencePath,
    commandRunner() {
      calls += 1;
      if (calls === 1) {
        const inProgress = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        assert.equal(inProgress.status, 'inconclusive');
        assert.equal(inProgress.failure_reason, 'verification_in_progress: npm_ci_root');
        assert.deepEqual(inProgress.active_step, {
          label: 'npm_ci_root',
          state: 'running',
          failure_class: 'unfinished_step',
        });
      }
      return calls === 1
        ? { status: 7, signal: null, stdout: '', stderr: 'token=fixture-secret\n' }
        : fakePass();
    },
    output: silentOutput(),
  });
  const retained = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(failed.exitCode, 1);
  assert.equal(retained.status, 'fail');
  assert.equal(retained.failure_reason, 'step failed: npm_ci_root');
  assert.deepEqual(retained.proven_claims, []);
  assert.equal(retained.steps.length, 1);
  assert.equal(retained.steps[0].exit_code, 7);
  assert.equal(retained.steps[0].error_code, null);
  assert.equal(retained.steps[0].diagnostic.failure_class, 'nonzero_exit:7');
  assert.match(retained.steps[0].diagnostic.summary, /token=\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(retained), /fixture-secret/);
  assert.match(retained.steps[0].diagnostic.stderr_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    fs.readdirSync(evidenceRoot).filter((name) => name.includes('.tmp-')),
    [],
  );
});

test('local verification defaults to a durable ignored repository evidence path', (t) => {
  const repoRoot = createFixtureRepository();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const result = runVerification({
    repoRoot,
    mode: 'worktree_snapshot',
    commandRunner: fakePass,
    output: silentOutput(),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidencePath, defaultEvidencePath(repoRoot, 'worktree_snapshot'));
  assert.equal(fs.existsSync(result.evidencePath), true);
  assert.equal(JSON.parse(fs.readFileSync(result.evidencePath, 'utf8')).status, 'pass');
});

test('a terminated verification step is retained as inconclusive, never pass', (t) => {
  const repoRoot = createFixtureRepository();
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-evidence-signal-'));
  const evidencePath = path.join(evidenceRoot, 'evidence.json');
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  });

  const result = runVerification({
    repoRoot,
    mode: 'worktree_snapshot',
    evidenceOut: evidencePath,
    commandRunner() {
      return { status: null, signal: 'SIGTERM', stdout: '', stderr: '' };
    },
    output: silentOutput(),
  });
  const retained = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(result.exitCode, 1);
  assert.equal(retained.status, 'inconclusive');
  assert.deepEqual(retained.proven_claims, []);
  assert.equal(retained.steps[0].signal, 'SIGTERM');
  assert.equal(retained.steps[0].status, 'inconclusive');
  assert.equal(retained.steps[0].diagnostic.failure_class, 'signal:SIGTERM');
  assert.equal(retained.active_step, null);
});

test('a thrown step error is retained with its sanitized spawn class', (t) => {
  const repoRoot = createFixtureRepository();
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-evidence-throw-'));
  const evidencePath = path.join(evidenceRoot, 'evidence.json');
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  });

  const result = runVerification({
    repoRoot,
    mode: 'committed_archive',
    evidenceOut: evidencePath,
    commandRunner() {
      throw Object.assign(new Error('token=fixture-secret'), { code: 'EPERM' });
    },
    output: silentOutput(),
  });
  const retained = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

  assert.equal(result.exitCode, 1);
  assert.equal(retained.status, 'fail');
  assert.equal(retained.active_step, null);
  assert.equal(retained.steps[0].error_code, 'EPERM');
  assert.equal(retained.steps[0].diagnostic.failure_class, 'spawn_error:EPERM');
  assert.match(retained.steps[0].diagnostic.summary, /token=\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(retained), /fixture-secret/);
});

test('evidence parser rejects ambiguous modes and reports real TAP/CTest counts', () => {
  assert.throws(() => parseArgs([]), /invalid --mode/);
  assert.throws(
    () => parseArgs(['--mode', 'worktree_snapshot', '--evidence-out', 'relative.json']),
    /absolute path/,
  );
  assert.deepEqual(parseArgs(['--mode', 'committed_archive']), {
    mode: 'committed_archive',
    evidenceOut: null,
    jobs: 2,
  });
  assert.equal(parseArgs(['--mode', 'worktree_snapshot', '--jobs', '1']).jobs, 1);
  assert.throws(() => parseArgs(['--mode', 'worktree_snapshot', '--jobs', '0']), /1 to 8/);
  assert.throws(() => parseArgs(['--mode', 'worktree_snapshot', '--jobs', '9']), /1 to 8/);
  assert.throws(() => parseArgs(['--mode', 'worktree_snapshot', '--jobs', '2.5']), /1 to 8/);
  assert.equal(
    defaultEvidencePath('/repo', 'worktree_snapshot'),
    path.join('/repo', 'storage', 'logs', 'source_evidence', 'worktree_snapshot-latest.json'),
  );
  assert.deepEqual(parseCounts('# tests 4\n# pass 3\n# fail 0\n# skipped 1\n'), {
    tests: 4,
    pass: 3,
    fail: 0,
    skip: 1,
  });
  assert.deepEqual(parseCounts('ℹ tests 986\nℹ pass 976\nℹ fail 0\nℹ skipped 10\n'), {
    tests: 986,
    pass: 976,
    fail: 0,
    skip: 10,
  });
  assert.deepEqual(parseCounts('100% tests passed, 0 tests failed out of 30'), {
    tests: 30,
    pass: 30,
    fail: 0,
    skip: 0,
  });
});

test('resource policy bounds npm, native builds, and aggregate Node concurrency', () => {
  const captured = [];
  const result = executeSteps({
    sourceRoot: '/fixture/source',
    cacheRoot: '/fixture/cache',
    jobs: 2,
    output: silentOutput(),
    commandRunner(command, args, options) {
      captured.push({ command, args, env: options.env });
      return fakePass();
    },
  });
  assert.equal(result.failure, null);
  assert.equal(captured.length, fixedSteps('/fixture/source', 2).length);
  for (const call of captured) {
    assert.equal(call.env.npm_config_jobs, undefined);
    assert.equal(call.env.npm_config_maxsockets, '2');
    assert.equal(call.env.CMAKE_BUILD_PARALLEL_LEVEL, '2');
    assert.equal(call.env.MAKEFLAGS, '-j2');
    assert.equal(call.env.GOMAXPROCS, '2');
    assert.equal(call.env.UV_THREADPOOL_SIZE, '2');
  }
  const aggregate = captured.at(-1);
  assert.deepEqual(
    aggregate.args.slice(-3),
    ['test', '--', '--test-concurrency=2'],
  );
});

test('pass evidence cannot assert unknown or operational claims', () => {
  const evidence = {
    schema_version: 2,
    evidence_id: 'fixture',
    status: 'pass',
    mode: 'committed_archive',
    started_at: '2026-07-28T00:00:00.000Z',
    ended_at: '2026-07-28T00:00:01.000Z',
    source: { commit: 'abc' },
    lockfiles: [],
    runtime: {
      node: process.version,
      npm: 'fixture',
      os: process.platform,
      architecture: process.arch,
      environment_class: 'local',
      job_limit: 2,
    },
    active_step: null,
    steps: [],
    proven_claims: ['deployed_host_health'],
    excluded_claims: [],
    failure_reason: null,
  };
  assert.throws(() => validateEvidence(evidence), /unknown proven claim/);
});

test('schema validation rejects a fabricated pass with incomplete execution evidence', () => {
  const evidence = {
    schema_version: 2,
    evidence_id: 'fixture',
    status: 'pass',
    mode: 'committed_archive',
    started_at: '2026-07-28T00:00:00.000Z',
    ended_at: '2026-07-28T00:00:01.000Z',
    source: {
      commit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      dirty: false,
      file_count: 1,
      source_list_sha256: 'c'.repeat(64),
      content_sha256: 'd'.repeat(64),
    },
    lockfiles: [],
    runtime: {
      node: process.version,
      npm: 'fixture',
      os: process.platform,
      architecture: process.arch,
      environment_class: 'local',
      job_limit: 2,
    },
    active_step: null,
    steps: [],
    proven_claims: [
      'committed_archive_source_evidence',
      'five_root_lockfile_install',
      'declared_build_and_test_steps',
    ],
    excluded_claims: [
      'authenticated_ci_result',
      'deployed_host_health',
      'provider_connectivity',
      'backup_restore',
      'restart_rollback',
      'single_writer',
      'recovery',
      'soak',
      'live_execution',
    ],
    failure_reason: null,
  };
  assert.throws(() => validateEvidence(evidence), /all five lockfiles/);
});
