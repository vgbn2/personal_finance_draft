'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDeploymentEvidence,
  deploymentServiceRows,
  evidenceMatches,
  parseServiceEvidence,
} = require('../../../backend/scripts/ops/deployment_evidence');

const SERVICES = [
  'web\tweb-id\tsha256:exact\trunning',
  'backfill\tbackfill-id\tsha256:exact\trunning',
  'portfolio-monitor\tmonitor-id\tsha256:exact\trunning',
].join('\n');

test('deployment service rows are derived from the environment manifest', () => {
  const rows = deploymentServiceRows();
  assert.deepEqual(rows.filter((row) => row.required).map((row) => row.service).sort(), ['backfill', 'web']);
  assert.equal(rows.find((row) => row.service === 'portfolio-monitor').profile, 'monitoring');
  assert.equal(rows.find((row) => row.service === 'bot').profile, 'paper');
});

test('deployment evidence binds source, image, and exact active service set', () => {
  const expected = {
    revision: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    imageRef: `personal_finance:${'a'.repeat(40)}`,
    imageId: 'sha256:exact',
    servicesSource: SERVICES,
    verifiedAt: '2026-07-29T00:00:00.000Z',
  };
  const evidence = buildDeploymentEvidence(expected);

  assert.equal(evidence.schema_version, 1);
  assert.equal(evidence.active_before.web.image_id, 'sha256:exact');
  assert.equal(evidence.services['portfolio-monitor'].image_id, 'sha256:exact');
  assert.equal(evidenceMatches(evidence, expected), true);
  assert.equal(evidenceMatches(evidence, {
    ...expected,
    servicesSource: SERVICES.replace('monitor-id', 'different-id'),
  }), false);
});

test('deployment evidence rejects missing required, duplicate, and stopped service rows', () => {
  assert.throws(
    () => buildDeploymentEvidence({
      revision: 'revision',
      tree: 'tree',
      imageRef: 'image',
      imageId: 'id',
      servicesSource: 'web\tid\timage\trunning\n',
    }),
    /missing required.*backfill/,
  );
  assert.throws(
    () => parseServiceEvidence('web\tone\timage\trunning\nweb\ttwo\timage\trunning\n'),
    /duplicate/,
  );
  assert.throws(
    () => parseServiceEvidence('web\tid\timage\texited\n'),
    /invalid/,
  );
});
