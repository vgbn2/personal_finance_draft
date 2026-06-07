const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { REPO_ROOT, API_CACHE_DIR } = require('../paths');
const API_CACHE_TTL_MS = 60 * 60 * 1000;

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
  REPO_ROOT,
  API_CACHE_DIR
};
