const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { REPO_ROOT, API_CACHE_DIR } = require('../runtime/paths');
const API_CACHE_TTL_MS = 60 * 60 * 1000;
const API_CACHE_PRUNE_AGE_MS = 2 * API_CACHE_TTL_MS;
const API_CACHE_MAX_ENTRIES = 25000;

// Centralized rate limiters per domain
const LIMITERS = new Map();

/**
 * Simple Token Bucket / Delay queue per host
 */
async function rateLimit(host) {
  if (!LIMITERS.has(host)) {
    LIMITERS.set(host, { lastCall: 0, minDelay: 250 });
  }
  const limiter = LIMITERS.get(host);
  const now = Date.now();
  const wait = Math.max(0, limiter.lastCall + limiter.minDelay - now);
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  limiter.lastCall = Date.now();
}

async function pruneApiCache({
  cacheDir = API_CACHE_DIR,
  maxAgeMs = API_CACHE_PRUNE_AGE_MS,
  maxEntries = API_CACHE_MAX_ENTRIES,
  now = Date.now(),
} = {}) {
  let names;
  try {
    names = (await fs.readdir(cacheDir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return { scanned: 0, deleted: 0, freed_bytes: 0 };
    throw error;
  }

  const retained = [];
  let deleted = 0;
  let freedBytes = 0;
  const batchSize = 256;

  for (let offset = 0; offset < names.length; offset += batchSize) {
    const batch = names.slice(offset, offset + batchSize);
    const entries = await Promise.all(batch.map(async (name) => {
      const file = path.join(cacheDir, name);
      try {
        const stat = await fs.stat(file);
        return { file, mtimeMs: stat.mtimeMs, size: stat.size };
      } catch (_) {
        return null;
      }
    }));

    for (const entry of entries.filter(Boolean)) {
      if (now - entry.mtimeMs > maxAgeMs) {
        try {
          await fs.unlink(entry.file);
          deleted += 1;
          freedBytes += entry.size;
        } catch (_) {}
      } else {
        retained.push(entry);
      }
    }
  }

  if (retained.length > maxEntries) {
    retained.sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const entry of retained.slice(maxEntries)) {
      try {
        await fs.unlink(entry.file);
        deleted += 1;
        freedBytes += entry.size;
      } catch (_) {}
    }
  }

  return { scanned: names.length, deleted, freed_bytes: freedBytes };
}

async function cachedFetch(url, options = {}, ttl = API_CACHE_TTL_MS) {
  const urlStr = url.toString();
  const urlObj = new URL(urlStr);
  const host = urlObj.host;

  const cacheKey = crypto.createHash('sha256').update(urlStr + JSON.stringify(options)).digest('hex');
  const cacheFile = path.join(API_CACHE_DIR, `${cacheKey}.json`);

  try {
    const stats = await fs.stat(cacheFile);
    if (Date.now() - stats.mtimeMs < ttl) {
      const cached = await fs.readFile(cacheFile, 'utf8');
      return { json: async () => JSON.parse(cached), ok: true, status: 200, from_cache: true };
    }
  } catch (e) {}

  // Apply rate limit before actual network call
  await rateLimit(host);

  const response = await fetch(url, options);
  if (response.ok) {
    const clone = response.clone();
    const data = await clone.text();
    await fs.mkdir(API_CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, data, 'utf8');
  }
  return response;
}

async function fetchJson(url, options = {}) {
  const response = await cachedFetch(url, {
    ...options,
    headers: { 
        ...options.headers,
        'accept': 'application/json',
        'user-agent': 'sovereign-market-ingestor/2.0' 
    }
  });
  if (!response.ok) throw new Error(`Request to ${url} failed: ${response.status}`);
  return response.json();
}

module.exports = {
  cachedFetch,
  fetchJson,
  pruneApiCache,
  REPO_ROOT,
  API_CACHE_DIR,
  API_CACHE_TTL_MS,
  API_CACHE_PRUNE_AGE_MS,
  API_CACHE_MAX_ENTRIES,
};
