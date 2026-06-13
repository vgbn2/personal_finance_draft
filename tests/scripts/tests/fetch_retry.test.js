'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchWithRetry, retryTransient } = require('../../../shared/lib/runtime/fetch_retry');

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

// ── retryTransient tests ──────────────────────────────────────────────────────

test('retryTransient returns value on first success', async () => {
  let calls = 0;
  const fn = async () => { calls++; return 'ok'; };
  const result = await retryTransient(fn, { attempts: 3, baseDelayMs: 0 });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retryTransient retries on transient transport error then succeeds', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('connect ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      throw err;
    }
    return 'success';
  };
  const result = await retryTransient(fn, { attempts: 3, baseDelayMs: 0 });
  assert.equal(result, 'success');
  assert.equal(calls, 2, 'Should have retried once');
});

test('retryTransient retries on axios-style 5xx error then succeeds', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('Request failed with status code 503');
      err.response = { status: 503, data: { error: 'service unavailable' } };
      throw err;
    }
    return { data: 'ok' };
  };
  const result = await retryTransient(fn, { attempts: 3, baseDelayMs: 0 });
  assert.deepEqual(result, { data: 'ok' });
  assert.equal(calls, 2, 'Should have retried once on 503');
});

test('retryTransient does NOT retry on axios-style 4xx error', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    const err = new Error('Request failed with status code 401');
    err.response = { status: 401, data: { error: 'unauthorized' } };
    throw err;
  };
  await assert.rejects(
    () => retryTransient(fn, { attempts: 3, baseDelayMs: 0 }),
    (err) => {
      assert.equal(err.response.status, 401);
      return true;
    },
  );
  assert.equal(calls, 1, '4xx must not be retried');
});

test('retryTransient throws after exhausting all attempts on persistent transient error', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    const err = new Error('connect ETIMEDOUT');
    err.code = 'ETIMEDOUT';
    throw err;
  };
  await assert.rejects(
    () => retryTransient(fn, { attempts: 2, baseDelayMs: 0 }),
    (err) => {
      assert.equal(err.code, 'ETIMEDOUT');
      return true;
    },
  );
  assert.equal(calls, 2, 'Should have exhausted all attempts');
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

// ── retryOn429 tests ──────────────────────────────────────────────────────────

// Helper: build a Response-like object that also carries headers.
function makeResponseWithHeaders(status, headers = {}, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

test('fetchWithRetry retryOn429: retries on 429 and succeeds on later 200', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    if (calls < 3) return makeResponseWithHeaders(429);
    return makeResponseWithHeaders(200, {}, '{"ok":true}');
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 5, baseDelayMs: 0, retryOn429: true },
    );
    assert.equal(resp.status, 200);
    assert.equal(calls, 3, 'Should have retried twice before succeeding');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry retryOn429: Retry-After header is honored', async () => {
  const waited = [];
  const originalFetch = globalThis.fetch;

  // Patch setTimeout to capture delays without actually waiting.
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    waited.push(ms);
    fn(); // call immediately
    return 0;
  };
  globalThis.fetch = async () => {
    if (waited.length === 0) {
      // First attempt: return 429 with Retry-After: 2 (seconds)
      return makeResponseWithHeaders(429, { 'retry-after': '2' });
    }
    return makeResponseWithHeaders(200, {}, '{}');
  };

  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0, retryOn429: true },
    );
    assert.equal(resp.status, 200);
    // The delay passed to setTimeout should be max(0, 2000) = 2000ms.
    assert.ok(waited.some((ms) => ms >= 2000), `Expected a wait >= 2000ms; got: ${JSON.stringify(waited)}`);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('fetchWithRetry default behavior: 429 WITHOUT retryOn429 returns immediately', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return makeResponseWithHeaders(429);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0 }, // retryOn429 defaults to false
    );
    assert.equal(resp.status, 429);
    assert.equal(calls, 1, '429 without retryOn429 must not be retried');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRetry retryOn429: final-attempt 429 is returned, not thrown', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return makeResponseWithHeaders(429);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    // Should NOT throw; should return the 429 response.
    const resp = await fetchWithRetry(
      'https://example.com/api',
      {},
      { attempts: 3, baseDelayMs: 0, retryOn429: true },
    );
    assert.equal(resp.status, 429, 'Final-attempt 429 must be returned, not thrown');
    assert.equal(calls, 3, 'All 3 attempts should have been made');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
