const path = require('node:path');
const fs = require('node:fs');
const { writeJson } = require('./market_validation');
const { REPO_ROOT } = require('./paths');

/**
 * PERSISTENT EXECUTION MEMORY

 * Essential for unattended cloud hosting.
 *
 * Storage format: [[signalId, timestampMs], ...] with 180-day TTL eviction.
 * Backwards-compatible with old string[] format (entries migrated with ts=now).
 */

const MEMORY_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'execution_memory.json');
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

class PersistentExecutionMemory {
  constructor() {
    this.memory = new Map();
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      if (fs.existsSync(MEMORY_PATH)) {
        const raw = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
        const now = Date.now();
        const entries = Array.isArray(raw) ? raw : [];
        for (const entry of entries) {
          if (Array.isArray(entry)) {
            // New format: [signalId, timestampMs]
            const [id, ts] = entry;
            if (typeof id === 'string' && now - ts < TTL_MS) this.memory.set(id, ts);
          } else if (typeof entry === 'string') {
            // Old format: plain string — migrate with current timestamp
            this.memory.set(entry, now);
          }
        }
      }
      this.initialized = true;
    } catch (error) {
      console.warn(`[MEMORY] Failed to load execution memory: ${error.message}`);
      this.initialized = true;
    }
  }

  has(signalId) {
    this.init();
    return this.memory.has(signalId);
  }

  add(signalId) {
    this.init();
    this.memory.set(signalId, Date.now());
    this.save();
  }

  save() {
    try {
      const now = Date.now();
      const entries = Array.from(this.memory.entries())
        .filter(([, ts]) => now - ts < TTL_MS);
      writeJson(MEMORY_PATH, entries);
    } catch (error) {
      console.error(`[MEMORY] Failed to save execution memory: ${error.message}`);
    }
  }

  clear() {
    this.memory.clear();
    this.save();
  }

  size() {
    this.init();
    return this.memory.size;
  }
}

module.exports = new PersistentExecutionMemory();
