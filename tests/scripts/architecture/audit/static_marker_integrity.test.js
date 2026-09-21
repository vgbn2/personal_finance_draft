'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MANIFEST_PATH = path.join(REPO_ROOT, 'config/audit/static_audit_manifest.json');

test('static audit manifest: structure and schema integrity', () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), 'static_audit_manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  assert.equal(typeof manifest.version, 'string', 'version must be defined');
  assert.equal(typeof manifest.generated_at, 'string', 'generated_at must be defined');
  assert.ok(manifest.audited_plane_hashes && typeof manifest.audited_plane_hashes === 'object', 'audited_plane_hashes must be an object');

  const entries = Object.entries(manifest.audited_plane_hashes);
  assert.ok(entries.length >= 4, 'must have at least 4 audited immutable plane files registered');

  for (const [relPath, metadata] of entries) {
    assert.equal(typeof metadata.plane, 'string', `${relPath} must specify plane`);
    assert.equal(typeof metadata.grade, 'string', `${relPath} must specify grade`);
    assert.match(metadata.sha256, /^[a-f0-9]{64}$/, `${relPath} must have a valid 64-character SHA-256 hash`);
    assert.ok(Array.isArray(metadata.invariants), `${relPath} must list verified mathematical invariants`);
  }
});

test('static audit manifest: cryptographic SHA-256 hash verification for audited modules', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  for (const [relPath, metadata] of Object.entries(manifest.audited_plane_hashes)) {
    const fullPath = path.join(REPO_ROOT, relPath);
    assert.ok(fs.existsSync(fullPath), `Audited file ${relPath} must exist on disk`);

    const fileBuffer = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    assert.equal(
      actualHash,
      metadata.sha256,
      `SHA-256 checksum mismatch for ${relPath}. If code was intentionally modified, rerun mathematical invariant validation and update the manifest.`
    );
  }
});
