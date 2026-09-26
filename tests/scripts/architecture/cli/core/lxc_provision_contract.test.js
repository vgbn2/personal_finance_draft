'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SCRIPT_PATH = path.resolve(__dirname, '../../../../../infra/lxc/provision_lxc.sh');
const DOC_PATH = path.resolve(__dirname, '../../../../../docs/how_to/proxmox_lxc_deployment.md');

test('LXC Provisioning Contract: script exists and has executable permissions', () => {
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'provision_lxc.sh must exist');
  const stat = fs.statSync(SCRIPT_PATH);
  // Check executable bits (at least user executable)
  assert.notEqual(stat.mode & 0o111, 0, 'provision_lxc.sh must be executable');
});

test('LXC Provisioning Contract: script enforces strict safety and sizing guardrails', () => {
  const content = fs.readFileSync(SCRIPT_PATH, 'utf8');

  // Strict bash safety
  assert.ok(content.includes('set -euo pipefail'), 'Must use set -euo pipefail');

  // Sizing guardrails
  assert.ok(content.includes('MEMORY="${MEMORY:-6144}"'), 'Default RAM must be 6144 MB (6 GB)');
  assert.ok(content.includes('CORES="${CORES:-4}"'), 'Default CPU cores must be 4 vCPUs');
  assert.ok(content.includes('DISK_SIZE="${DISK_SIZE:-40G}"'), 'Default disk size must be 40G');

  // Security & isolation features
  assert.ok(content.includes('nesting=1,keyctl=1'), 'Must include nesting=1,keyctl=1 for container features');
  assert.ok(content.includes('--unprivileged'), 'Must enforce unprivileged container creation');
  assert.ok(content.includes('sovereign'), 'Must configure unprivileged sovereign service user');
});

test('LXC Provisioning Contract: script supports dry-run mode without pct binary', () => {
  // Execute with DRY_RUN=1 and mock PATH to ensure no host mutation or failure
  const out = execSync(`DRY_RUN=1 bash "${SCRIPT_PATH}"`, {
    encoding: 'utf8',
    env: { ...process.env, DRY_RUN: '1', EUID: '1000' },
  });

  assert.ok(out.includes('DRY_RUN mode enabled'), 'Output must note DRY_RUN mode');
  assert.ok(out.includes('Target Container ID'), 'Must print target container configuration');
  assert.ok(out.includes('6144MB'), 'Must reflect 6144MB allocation');
});

test('LXC Deployment Documentation: exists and covers sizing table and security', () => {
  assert.ok(fs.existsSync(DOC_PATH), 'proxmox_lxc_deployment.md must exist');
  const doc = fs.readFileSync(DOC_PATH, 'utf8');

  assert.ok(doc.includes('6 GB (6144 MB)'), 'Doc must specify 6 GB RAM');
  assert.ok(doc.includes('40 GB SSD'), 'Doc must specify 40 GB storage');
  assert.ok(doc.includes('nesting=1,keyctl=1'), 'Doc must document nesting and keyctl features');
  assert.ok(doc.includes('unprivileged'), 'Doc must emphasize unprivileged container isolation');
});
