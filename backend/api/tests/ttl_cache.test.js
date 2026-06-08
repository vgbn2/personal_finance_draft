const test = require('node:test');
const assert = require('node:assert/strict');

const ttlCache = require('../server/services/ttl_cache');

test('ttl cache keeps memory bounded with oldest-entry eviction', () => {
  for (let i = 0; i < 55; i += 1) {
    ttlCache.setCached(`bounded-${i}`, { value: i }, 60_000);
  }

  const stats = ttlCache.cacheStats();
  assert.ok(stats.entries <= 50, `expected <= 50 entries, got ${stats.entries}`);
  assert.equal(ttlCache.getCached('bounded-0'), undefined);
  assert.deepEqual(ttlCache.getCached('bounded-54'), { value: 54 });
});
