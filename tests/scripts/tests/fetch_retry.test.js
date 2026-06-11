'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchWithRetry } = require('../../../shared/lib/runtime/fetch_retry');

// Helper: build a minimal Response-like object
function makeResponse(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

// Helper: create a transport-level error with a given code
function makeNetworkError(code) {
  const err = new Error(`connect ${code}`);
  err.code = code;
  return err;
}

test('fetchWithRetry returns the response on first success', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push(url);
    return makeResponse(200, '{"ok":true}');
  };

  // Temporarily replace global fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry('https://example.com/api', {});
    assert.equal(resp.status, 200);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry retries on EACCES transport error then succeeds', async () => {
  const calls = [];
  let attempt = 0;
  const mockFetch = async (url) => {
    calls.push(url);
    attempt++;
    if (attempt === 1) {
      throw makeNetworkError('EACCES');
    }
    return makeResponse(200, '{"ok":true}');
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0 },
    );
    assert.equal(resp.status, 200);
    assert.equal(calls.length, 2, 'Should have retried once after EACCES');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry retries on ECONNREFUSED then succeeds', async () => {
  let attempt = 0;
  const mockFetch = async () => {
    attempt++;
    if (attempt < 3) throw makeNetworkError('ECONNREFUSED');
    return makeResponse(200);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0 },
    );
    assert.equal(resp.status, 200);
    assert.equal(attempt, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry does NOT retry on 4xx responses', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return makeResponse(400, '{"error":"bad request"}');
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0 },
    );
    assert.equal(resp.status, 400);
    assert.equal(calls, 1, '4xx must not be retried');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry retries on 5xx responses', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    if (calls < 3) return makeResponse(503);
    return makeResponse(200);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0 },
    );
    assert.equal(resp.status, 200);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry throws last transport error after exhausting attempts', async () => {
  const mockFetch = async () => {
    throw makeNetworkError('ECONNRESET');
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await assert.rejects(
      () => fetchWithRetry('https://example.com/api', {}, { attempts: 2, baseDelayMs: 0 }),
      (err) => {
        assert.equal(err.code, 'ECONNRESET');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry does not retry on non-transport errors (e.g. AbortError)', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    // no .code set → not a transport error
    throw err;
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await assert.rejects(
      () => fetchWithRetry('https://example.com/api', {}, { attempts: 3, baseDelayMs: 0 }),
      /aborted/i,
    );
    assert.equal(calls, 1, 'AbortError must not be retried');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
