'use strict';

const { execSync } = require('node:child_process');

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
  if (!container || !/^[\w._-]+$/.test(container)) return { error: 'invalid container name' };
  try {
    const raw = execSync(`docker logs --tail ${Number(lines)} ${container} 2>&1`, {
      timeout: 10000,
      encoding: 'utf8',
    });
    return raw.split('\n').filter(Boolean);
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
