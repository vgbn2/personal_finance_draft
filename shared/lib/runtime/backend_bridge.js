'use strict';
const { spawnSync } = require('node:child_process');
const { findBackendBinary, REPO_ROOT } = require('./paths');

function backendAvailable() {
  return Boolean(findBackendBinary());
}

function runBackendCommand(commandArgs) {
  const binary = findBackendBinary();
  if (!binary) {
    return { available: false, ok: false, error: 'C++ backend executable not found' };
  }
  const result = spawnSync(binary, commandArgs, { cwd: REPO_ROOT, encoding: 'utf8', shell: false });
  if (result.error) {
    return { available: true, ok: false, error: result.error.message };
  }
  const raw = (result.stdout || '').trim();
  if (!raw) {
    return { available: true, ok: false, error: 'No output from backend', stderr: result.stderr || '' };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { available: true, ok: false, error: 'Non-JSON output', raw: raw.slice(0, 200) };
  }
}

module.exports = { backendAvailable, runBackendCommand };
