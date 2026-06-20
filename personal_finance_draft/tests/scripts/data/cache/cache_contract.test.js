const test = require('node:test');
const assert = require('node:assert/strict');

function loadCacheModule() {
  const modulePath = require.resolve('../../../../backend/api/server/services/ttl_cache');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('cached values are reused when cache is enabled', async () => {
  delete process.env.SOVEREIGN_DISABLE_CACHE;
  process.env.SOVEREIGN_CACHE_TTL_MS = '30000';
  process.env.SOVEREIGN_CACHE_MAX_ENTRIES = '2';

  const { cached, cacheStats } = loadCacheModule();

  let calls = 0;
  const first = await cached('alpha', 30000, async () => {
    calls += 1;
    return { value: 'first' };
  });
  const second = await cached('alpha', 30000, async () => {
    calls += 1;
    return { value: 'second' };
  });

  assert.deepEqual(first, { value: 'first' });
  assert.deepEqual(second, { value: 'first' });
  assert.equal(calls, 1);
  assert.equal(cacheStats().entries >= 1, true);

  console.log(JSON.stringify({
    type: 'cache_contract',
    calls,
    entries: cacheStats().entries,
    enabled: cacheStats().enabled,
  }, null, 2));
});

test('cache can be disabled for strict freshness checks', async () => {
  process.env.SOVEREIGN_DISABLE_CACHE = '1';
  const { cached, cacheStats } = loadCacheModule();

  let calls = 0;
  const first = await cached('beta', 30000, async () => {
    calls += 1;
    return calls;
  });
  const second = await cached('beta', 30000, async () => {
    calls += 1;
    return calls;
  });

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(calls, 2);
  assert.equal(cacheStats().enabled, false);
  assert.equal(cacheStats().entries, 0);

  delete process.env.SOVEREIGN_DISABLE_CACHE;
});
