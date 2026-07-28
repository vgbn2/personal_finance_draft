'use strict';

const MODES = new Set(['worktree_snapshot', 'committed_archive']);
const PACKAGE_ROOTS = [
  '.',
  'backend/api',
  'backend/gateway',
  'backend/mcp_server',
  'Frontend/dashboard',
];
const PROVEN_CLAIMS = new Set([
  'worktree_snapshot_source_evidence',
  'committed_archive_source_evidence',
  'five_root_lockfile_install',
  'declared_build_and_test_steps',
]);
const EXCLUDED_CLAIMS = [
  'authenticated_ci_result',
  'deployed_host_health',
  'provider_connectivity',
  'backup_restore',
  'restart_rollback',
  'single_writer',
  'recovery',
  'soak',
  'live_execution',
];
const EVIDENCE_KEYS = [
  'schema_version', 'evidence_id', 'status', 'mode', 'started_at', 'ended_at', 'source',
  'lockfiles', 'runtime', 'steps', 'proven_claims', 'excluded_claims', 'failure_reason',
];
const SOURCE_KEYS = [
  'commit', 'tree', 'dirty', 'file_count', 'source_list_sha256', 'content_sha256',
];
const STEP_KEYS = [
  'label', 'exit_code', 'signal', 'error_code', 'duration_ms', 'status', 'counts',
];
const LOCKFILE_KEYS = ['path', 'sha256'];
const RUNTIME_KEYS = ['node', 'npm', 'os', 'architecture', 'environment_class', 'job_limit'];
const COUNT_KEYS = ['tests', 'pass', 'fail', 'skip'];

function assertSameMembers(actual, expected, label) {
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== expected.length
    || [...actual].sort().some((value, index) => value !== sortedExpected[index])
  ) {
    throw new Error(`invalid ${label}`);
  }
}

function validateEvidence(evidence, expectedStepLabels) {
  const exactKeys = (actual, expected, label) => {
    assertSameMembers(Object.keys(actual), expected, `${label} keys`);
  };
  if (evidence.schema_version !== 1) throw new Error('invalid evidence schema version');
  if (!['pass', 'fail', 'inconclusive'].includes(evidence.status)) {
    throw new Error('invalid evidence status');
  }
  if (!MODES.has(evidence.mode)) throw new Error('invalid evidence mode');
  if (!evidence.evidence_id || !evidence.started_at || !evidence.ended_at) {
    throw new Error('incomplete evidence identity');
  }
  if (!Array.isArray(evidence.lockfiles) || !Array.isArray(evidence.steps)) {
    throw new Error('incomplete evidence payload');
  }
  exactKeys(evidence, EVIDENCE_KEYS, 'evidence');
  if (evidence.status === 'pass' && !evidence.source) {
    throw new Error('passing evidence requires source identity');
  }
  if (!evidence.proven_claims.every((claim) => PROVEN_CLAIMS.has(claim))) {
    throw new Error('unknown proven claim');
  }
  if (!evidence.excluded_claims.every((claim) => EXCLUDED_CLAIMS.includes(claim))) {
    throw new Error('unknown excluded claim');
  }
  assertSameMembers(evidence.excluded_claims, EXCLUDED_CLAIMS, 'excluded claims');
  if (evidence.source) exactKeys(evidence.source, SOURCE_KEYS, 'source');
  exactKeys(evidence.runtime, RUNTIME_KEYS, 'runtime');
  if (
    !Number.isInteger(evidence.runtime.job_limit)
    || evidence.runtime.job_limit < 1
    || evidence.runtime.job_limit > 8
  ) {
    throw new Error('invalid runtime job limit');
  }
  for (const lockfile of evidence.lockfiles) exactKeys(lockfile, LOCKFILE_KEYS, 'lockfile');
  for (const step of evidence.steps) {
    exactKeys(step, STEP_KEYS, `step ${step.label || '(missing)'}`);
    exactKeys(step.counts, COUNT_KEYS, `step ${step.label || '(missing)'} counts`);
  }
  if (evidence.status === 'pass') {
    if (evidence.lockfiles.length !== PACKAGE_ROOTS.length) {
      throw new Error('passing evidence requires all five lockfiles');
    }
    assertSameMembers(evidence.steps.map((step) => step.label), expectedStepLabels, 'passing step labels');
    if (evidence.steps.some((step) => step.status !== 'pass' || step.exit_code !== 0)) {
      throw new Error('passing evidence contains a non-pass step');
    }
    const expectedClaims = [
      evidence.mode === 'committed_archive'
        ? 'committed_archive_source_evidence'
        : 'worktree_snapshot_source_evidence',
      'five_root_lockfile_install',
      'declared_build_and_test_steps',
    ];
    assertSameMembers(evidence.proven_claims, expectedClaims, 'passing proven claims');
  }
  return evidence;
}

module.exports = {
  EXCLUDED_CLAIMS,
  MODES,
  PACKAGE_ROOTS,
  validateEvidence,
};
