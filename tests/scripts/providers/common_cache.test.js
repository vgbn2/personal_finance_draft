'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  cachedFetch,
  pruneApiCache,
  API_CACHE_DIR,
} = require('../../../shared/lib/providers/common');

test('cachedFetch skips writing to disk by default unless SOVEREIGN_ENABLE_RAW_HTTP_DISK_CACHE is true', async () => {
  const originalEnv = process.env.SOVEREIGN_ENABLE_RAW_HTTP_DISK_CACHE;
  delete process.env.SOVEREIGN_ENABLE_RAW_HTTP_DISK_CACHE;

  try {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      clone: () => ({ text: async () => JSON.stringify({ hello: 'world' }) }),
      json: async () => ({ hello: 'world' }),
    });

    const res = await cachedFetch('http://example.com/test-endpoint-default-no-cache', {});
    assert.equal(res.ok, true);
    assert.equal(typeof res.json, 'function');

    global.fetch = originalFetch;
  } finally {
    if (originalEnv === undefined) {
      delete process.env.SOVEREIGN_ENABLE_RAW_HTTP_DISK_CACHE;
    } else {
      process.env.SOVEREIGN_ENABLE_RAW_HTTP_DISK_CACHE = originalEnv;
    }
  }
});
