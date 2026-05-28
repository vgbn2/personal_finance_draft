const CACHE = new Map();

function withTtl(key, ttlMs, producer) {
  const now = Date.now();
  const cached = CACHE.get(key);
  if (cached && now - cached.timestamp < ttlMs) {
    return { ...cached.value, from_memory_cache: true };
  }
  const value = producer();
  CACHE.set(key, { timestamp: now, value });
  return value;
}

function clearCache() {
  CACHE.clear();
}

module.exports = {
  clearCache,
  withTtl,
};
