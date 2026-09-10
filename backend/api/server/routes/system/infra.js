'use strict';

const { execSync, spawnSync } = require('node:child_process');

function dockerImages() {
  try {
    const raw = execSync('docker images --format "{{json .}}"', { timeout: 8000, encoding: 'utf8' });
    return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (e) {
    return { error: e.message };
  }
}

function dockerPs() {
  try {
    const raw = execSync('docker ps --format "{{json .}}"', { timeout: 8000, encoding: 'utf8' });
    return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

function dockerLogs(container, lines = 100) {
  if (!container || typeof container !== 'string' || !/^[\w._-]+$/.test(container)) {
    return { error: 'invalid container name' };
  }
  const parsedLines = Number(lines);
  const lineCount = Number.isInteger(parsedLines) && parsedLines > 0
    ? String(Math.min(parsedLines, 5000))
    : '100';

  try {
    const res = spawnSync('docker', ['logs', '--tail', lineCount, container], {
      timeout: 10000,
      encoding: 'utf8',
      shell: false,
    });
    if (res.error) return { error: res.error.message };
    const out = (res.stdout || '') + (res.stderr || '');
    return out.split('\n').filter(Boolean);
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  path: '/api/system/infra',
  status: (payload) => (payload?.error ? 500 : 200),
  handle: (query = {}) => {
    const resource = query.resource || 'images';

    if (resource === 'images') {
      return { ok: true, images: dockerImages(), containers: dockerPs() };
    }
    if (resource === 'logs') {
      return { ok: true, logs: dockerLogs(query.container, query.lines) };
    }
    return { error: `unknown resource: ${resource}` };
  },
};
