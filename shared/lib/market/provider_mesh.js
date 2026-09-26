'use strict';

const DEFAULT_LANES = {
  binance: { maxConcurrency: 10, minDelayMs: 50, maxRetries: 3, baseBackoffMs: 200, maxBackoffMs: 5000 },
  deribit: { maxConcurrency: 5, minDelayMs: 100, maxRetries: 3, baseBackoffMs: 300, maxBackoffMs: 6000 },
  polymarket: { maxConcurrency: 5, minDelayMs: 100, maxRetries: 3, baseBackoffMs: 300, maxBackoffMs: 6000 },
  yahoo: { maxConcurrency: 2, minDelayMs: 250, maxRetries: 2, baseBackoffMs: 500, maxBackoffMs: 5000 },
  alpaca: { maxConcurrency: 5, minDelayMs: 100, maxRetries: 3, baseBackoffMs: 200, maxBackoffMs: 5000 },
  default: { maxConcurrency: 4, minDelayMs: 150, maxRetries: 3, baseBackoffMs: 250, maxBackoffMs: 5000 },
};

function calculateJitteredBackoff(attempt, baseMs = 200, maxMs = 5000) {
  const cap = Math.min(maxMs, baseMs * (2 ** attempt));
  return Math.floor(Math.random() * cap);
}

class ProviderLane {
  constructor(name, config = {}) {
    this.name = String(name).toLowerCase();
    const def = DEFAULT_LANES[this.name] || DEFAULT_LANES.default;
    this.maxConcurrency = config.maxConcurrency || def.maxConcurrency;
    this.minDelayMs = config.minDelayMs || def.minDelayMs;
    this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : def.maxRetries;
    this.baseBackoffMs = config.baseBackoffMs || def.baseBackoffMs;
    this.maxBackoffMs = config.maxBackoffMs || def.maxBackoffMs;

    this.active = 0;
    this.queue = [];
    this.lastCallTime = 0;
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    this.stats = {
      total_executed: 0,
      total_retries: 0,
      total_errors: 0,
      circuit_trips: 0,
    };
  }

  isCircuitOpen() {
    if (this.circuitOpenUntil === 0) return false;
    if (Date.now() > this.circuitOpenUntil) {
      // Half-open probe
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    this.stats.total_executed += 1;
  }

  recordFailure(isRateLimit = false) {
    this.consecutiveFailures += 1;
    this.stats.total_errors += 1;
    if (isRateLimit || this.consecutiveFailures >= 5) {
      // Trip circuit for 5 seconds on heavy rate limits or 5 consecutive crashes
      this.circuitOpenUntil = Date.now() + 5000;
      this.stats.circuit_trips += 1;
    }
  }

  async acquireToken() {
    const now = Date.now();
    const wait = Math.max(0, this.lastCallTime + this.minDelayMs - now);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastCallTime = Date.now();
  }

  async execute(taskFn, options = {}) {
    if (this.isCircuitOpen()) {
      throw new Error(`Provider lane '${this.name}' circuit breaker is OPEN`);
    }

    if (this.active >= this.maxConcurrency) {
      await new Promise((resolve) => this.queue.push(resolve));
    }

    this.active += 1;
    let attempt = 0;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;

    try {
      while (true) {
        try {
          await this.acquireToken();
          const result = await taskFn();
          this.recordSuccess();
          return result;
        } catch (err) {
          attempt += 1;
          const isRateLimit = err && (err.status === 429 || String(err.message).includes('429') || String(err.message).includes('rate limit'));
          this.recordFailure(isRateLimit);

          if (attempt <= maxRetries) {
            this.stats.total_retries += 1;
            const backoff = calculateJitteredBackoff(attempt, this.baseBackoffMs, this.maxBackoffMs);
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw err;
        }
      }
    } finally {
      this.active -= 1;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  getStats() {
    return {
      lane: this.name,
      active: this.active,
      queued: this.queue.length,
      max_concurrency: this.maxConcurrency,
      circuit_open: this.isCircuitOpen(),
      total_executed: this.stats.total_executed,
      total_retries: this.stats.total_retries,
      total_errors: this.stats.total_errors,
      circuit_trips: this.stats.circuit_trips,
    };
  }
}

class ProviderMesh {
  constructor(customConfigs = {}) {
    this.lanes = new Map();
    this.customConfigs = customConfigs;
  }

  getLane(providerOrHost) {
    let key = String(providerOrHost || 'default').toLowerCase();
    if (key.includes('binance')) key = 'binance';
    else if (key.includes('deribit')) key = 'deribit';
    else if (key.includes('polymarket') || key.includes('gamma')) key = 'polymarket';
    else if (key.includes('yahoo')) key = 'yahoo';
    else if (key.includes('alpaca')) key = 'alpaca';

    if (!this.lanes.has(key)) {
      this.lanes.set(key, new ProviderLane(key, this.customConfigs[key]));
    }
    return this.lanes.get(key);
  }

  execute(providerOrHost, taskFn, options = {}) {
    return this.getLane(providerOrHost).execute(taskFn, options);
  }

  getStats(providerOrHost) {
    if (providerOrHost) {
      return this.getLane(providerOrHost).getStats();
    }
    const all = {};
    for (const [k, lane] of this.lanes.entries()) {
      all[k] = lane.getStats();
    }
    return all;
  }

  reset() {
    this.lanes.clear();
  }
}

let _defaultMesh = null;

function getDefaultProviderMesh() {
  if (!_defaultMesh) {
    _defaultMesh = new ProviderMesh();
  }
  return _defaultMesh;
}

module.exports = {
  ProviderMesh,
  ProviderLane,
  getDefaultProviderMesh,
  calculateJitteredBackoff,
  DEFAULT_LANES,
};
