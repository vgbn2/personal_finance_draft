'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendWorkflowEvent,
  readWorkflow,
  scopePath,
  workflowScope,
} = require('../../../../shared/lib/analysis/promotion_store');

test('combined workflow is immutable, idempotent, and isolated by stable principal scope', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'combined-workflow-'));
  try {
    const actor = { principal_id: 'analyst-service', identity_type: 'service', acting_user_id: 'user-123' };
    const first = appendWorkflowEvent({
      root,
      scopeId: 'user-123',
      eventType: 'combined_signal_promoted',
      idempotencyKey: 'promotion-1',
      actor,
      payload: { asset_id: 'fx_pair:OTC:EURUSD', live_authorized: false },
      now: '2026-07-11T12:00:00.000Z',
    });
    const duplicate = appendWorkflowEvent({
      root,
      scopeId: 'user-123',
      eventType: 'combined_signal_promoted',
      idempotencyKey: 'promotion-1',
      actor,
      payload: { asset_id: 'fx_pair:OTC:EURUSD', live_authorized: false },
      now: '2026-07-11T12:00:01.000Z',
    });
    const paper = appendWorkflowEvent({
      root,
      scopeId: 'user-123',
      eventType: 'combined_paper_operation',
      idempotencyKey: `paper:${first.event.event_id}`,
      actor,
      payload: { promotion_id: first.event.event_id, mode: 'paper', provider_submission: false },
      now: '2026-07-11T12:01:00.000Z',
    });

    assert.equal(first.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(paper.event.sequence, 2);
    assert.equal(readWorkflow(root, 'user-123').events.length, 2);
    assert.equal(readWorkflow(root, 'user-456').events.length, 0);
    assert.equal(workflowScope({ authenticated: true, id: 'service', acting_user_id: 'user-123' }), 'user-123');

    const file = scopePath(root, 'user-123');
    const rows = fs.readFileSync(file, 'utf8').trim().split('\n');
    const tampered = JSON.parse(rows[0]);
    tampered.payload.live_authorized = true;
    fs.writeFileSync(file, `${JSON.stringify(tampered)}\n${rows[1]}\n`);
    assert.equal(readWorkflow(root, 'user-123').error, 'workflow_checksum_mismatch');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
