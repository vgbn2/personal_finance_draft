'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { STORAGE_DATA_DIR } = require('../runtime/paths');

const SCHEMA_VERSION = 1;
const GENESIS = '0'.repeat(64);
const DEFAULT_ROOT = path.join(STORAGE_DATA_DIR, 'combined_workflow');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(stable(value)),
  ).digest('hex');
}

function scopePath(root, scopeId) {
  if (!scopeId) throw new TypeError('workflow scope identity is required');
  return path.join(root, digest(`scope:${scopeId}`).slice(0, 32), 'events.jsonl');
}

function checksum(event) {
  const unsigned = { ...event };
  delete unsigned.checksum;
  return digest(unsigned);
}

function readWorkflow(root = DEFAULT_ROOT, scopeId) {
  const file = scopePath(root, scopeId);
  if (!fs.existsSync(file)) return { ok: true, events: [], last_checksum: GENESIS };
  const text = fs.readFileSync(file, 'utf8');
  if (text && !text.endsWith('\n')) return { ok: false, error: 'truncated_workflow_log', events: [] };
  const events = [];
  let prior = GENESIS;
  for (const [index, line] of text.split('\n').filter(Boolean).entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return { ok: false, error: 'malformed_workflow_event', sequence: index + 1, events };
    }
    if (event.schema_version !== SCHEMA_VERSION
      || event.sequence !== index + 1
      || event.prior_checksum !== prior
      || event.checksum !== checksum(event)) {
      return { ok: false, error: 'workflow_checksum_mismatch', sequence: index + 1, events };
    }
    events.push(event);
    prior = event.checksum;
  }
  return { ok: true, events, last_checksum: prior };
}

function appendWorkflowEvent({
  root = DEFAULT_ROOT,
  scopeId,
  eventType,
  idempotencyKey,
  actor,
  payload,
  now = new Date().toISOString(),
}) {
  if (!eventType || !idempotencyKey) throw new TypeError('event type and idempotency key are required');
  if (!/^[a-zA-Z0-9:_.-]{1,160}$/.test(String(idempotencyKey))) {
    throw new TypeError('idempotency key must be 1-160 safe characters');
  }
  const file = scopePath(root, scopeId);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  let lockFd;
  try {
    lockFd = fs.openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') return { ok: false, error: 'workflow_writer_busy' };
    throw error;
  }
  try {
    const loaded = readWorkflow(root, scopeId);
    if (!loaded.ok) return loaded;
    const duplicate = loaded.events.find((event) => event.idempotency_key === idempotencyKey);
    if (duplicate) return { ok: true, duplicate: true, event: duplicate };
    const event = {
      schema_version: SCHEMA_VERSION,
      event_id: digest(`${scopeId}:${eventType}:${idempotencyKey}`).slice(0, 32),
      idempotency_key: String(idempotencyKey),
      sequence: loaded.events.length + 1,
      event_type: String(eventType),
      event_time: new Date(now).toISOString(),
      actor: {
        principal_id: String(actor.principal_id),
        identity_type: String(actor.identity_type),
        acting_user_id: actor.acting_user_id ? String(actor.acting_user_id) : null,
      },
      payload: stable(payload),
      prior_checksum: loaded.last_checksum,
    };
    event.checksum = checksum(event);
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    return { ok: true, duplicate: false, event };
  } finally {
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try { fs.unlinkSync(lock); } catch {}
  }
}

function workflowScope(principal) {
  if (!principal || !principal.authenticated || !principal.id) return null;
  return principal.acting_user_id || principal.id;
}

module.exports = {
  DEFAULT_ROOT,
  appendWorkflowEvent,
  digest,
  readWorkflow,
  scopePath,
  stable,
  workflowScope,
};
