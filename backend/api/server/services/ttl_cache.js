const DEFAULT_TTL_MS = Number.parseInt(process.env.SOVEREIGN_CACHE_TTL_MS || '30000', 10);
const DEFAULT_MAX_ENTRIES = Number.parseInt(process.env.SOVEREIGN_CACHE_MAX_ENTRIES || '50', 10);

const store = new Map();

function isCacheEnabled() {
  return process.env.SOVEREIGN_DISABLE_CACHE !== '1';
}

function prune(now = Date.now()) {
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
  while (store.size > DEFAULT_MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey === undefined) break;
    store.delete(firstKey);
  }
}

async function cached(key, ttlMs, loader) {
  if (!isCacheEnabled()) return loader();
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    store.delete(key);
    store.set(key, existing);
    return existing.value;
  }

  const value = await loader();
  setCached(key, value, ttlMs, now);
  return value;
}

function setCached(key, value, ttlMs, now = Date.now()) {
  if (!isCacheEnabled()) return value;
  if (store.has(key)) store.delete(key);
  while (store.size >= DEFAULT_MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey === undefined) break;
    store.delete(firstKey);
  }
  store.set(key, { value, expiresAt: now + (ttlMs ?? DEFAULT_TTL_MS) });
  return value;
}

function getCached(key, now = Date.now()) {
  if (!isCacheEnabled()) return undefined;
  const existing = store.get(key);
  if (!existing) return undefined;
  if (existing.expiresAt <= now) {
    store.delete(key);
    return undefined;
  }
  store.delete(key);
  store.set(key, existing);
  return existing.value;
}

function cacheStats() {
  prune();
  return {
    ok: true,
    enabled: isCacheEnabled(),
    entries: store.size,
    ttl_ms: DEFAULT_TTL_MS,
    max_entries: DEFAULT_MAX_ENTRIES,
  };
}

module.exports = {
  cacheStats,
  cached,
  getCached,
  isCacheEnabled,
  setCached,
};
