'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  appendWorkflowEvent,
  readWorkflow,
  workflowScope,
} = require('../../../shared/lib/analysis/promotion_store');

test('promotion_store - cryptographic SHA-256 audit chain integrity', () => {
  const tmpRoot = path.join(__dirname, 'tmp_promotion_test_' + Date.now());
  const scopeId = 'test_scope_1';

  try {
    const event1 = appendWorkflowEvent({
      root: tmpRoot,
      scopeId,
      eventType: 'signal_promoted',
      idempotencyKey: 'test_idempotency_1',
      actor: { principal_id: 'p1', identity_type: 'service', acting_user_id: 'u1' },
      payload: { signal_ids: ['sig_1'], promoted_at: new Date().toISOString() },
    });

    assert.equal(event1.ok, true);
    assert.equal(event1.duplicate, false);
    assert.equal(event1.event.sequence, 1);
    assert.equal(event1.event.prior_checksum, '0'.repeat(64));
    assert.equal(typeof event1.event.checksum, 'string');
    assert.equal(event1.event.checksum.length, 64);

    const event2 = appendWorkflowEvent({
      root: tmpRoot,
      scopeId,
      eventType: 'signal_promoted',
      idempotencyKey: 'test_idempotency_2',
      actor: { principal_id: 'p1', identity_type: 'service', acting_user_id: 'u1' },
      payload: { signal_ids: ['sig_2'], promoted_at: new Date().toISOString() },
    });

    assert.equal(event2.ok, true);
    assert.equal(event2.duplicate, false);
    assert.equal(event2.event.sequence, 2);
    assert.equal(event2.event.prior_checksum, event1.event.checksum);

    // Idempotency deduplication check
    const dup = appendWorkflowEvent({
      root: tmpRoot,
      scopeId,
      eventType: 'signal_promoted',
      idempotencyKey: 'test_idempotency_1',
      actor: { principal_id: 'p1', identity_type: 'service', acting_user_id: 'u1' },
      payload: { signal_ids: ['sig_1'] },
    });

    assert.equal(dup.ok, true);
    assert.equal(dup.duplicate, true);
    assert.equal(dup.event.event_id, event1.event.event_id);

    // Verify hash chain audit log integrity
    const readResult = readWorkflow(tmpRoot, scopeId);
    assert.equal(readResult.ok, true);
    assert.equal(readResult.events.length, 2);
    assert.equal(readResult.last_checksum, event2.event.checksum);
  } finally {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
});
