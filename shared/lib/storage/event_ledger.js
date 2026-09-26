'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GENESIS_PREV_HASH = '0'.repeat(64);

function computeEventHash(index, timestamp, eventType, prevHash, payload) {
  const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return crypto
    .createHash('sha256')
    .update(`${index}:${timestamp}:${eventType}:${prevHash}:${serializedPayload}`)
    .digest('hex');
}

class EventLedger {
  constructor(filePath) {
    this.filePath = filePath;
    this.lastEvent = null;
    this.count = 0;

    if (filePath && filePath !== ':memory:') {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this._loadTail();
    } else {
      this.memoryEvents = [];
    }
  }

  _loadTail() {
    if (!fs.existsSync(this.filePath)) return;
    const content = fs.readFileSync(this.filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    this.count = lines.length;
    if (lines.length > 0) {
      try {
        this.lastEvent = JSON.parse(lines[lines.length - 1]);
      } catch (_) {
        this.lastEvent = null;
      }
    }
  }

  append(eventType, payload, timestamp = Date.now()) {
    const prevHash = this.lastEvent ? this.lastEvent.hash : GENESIS_PREV_HASH;
    const index = this.count;
    const hash = computeEventHash(index, timestamp, eventType, prevHash, payload);

    const event = {
      index,
      timestamp,
      event_type: String(eventType),
      prev_hash: prevHash,
      hash,
      payload,
    };

    if (this.filePath && this.filePath !== ':memory:') {
      fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8');
    } else {
      this.memoryEvents.push(event);
    }

    this.lastEvent = event;
    this.count += 1;
    return event;
  }

  getLatestEvent() {
    return this.lastEvent ? { ...this.lastEvent } : null;
  }

  getEvents(options = {}) {
    let events = [];
    if (this.filePath && this.filePath !== ':memory:') {
      if (!fs.existsSync(this.filePath)) return [];
      const content = fs.readFileSync(this.filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      events = lines.map((l) => {
        try { return JSON.parse(l); } catch (_) { return null; }
      }).filter(Boolean);
    } else {
      events = [...this.memoryEvents];
    }

    if (options.eventType) {
      events = events.filter((e) => e.event_type === options.eventType);
    }
    if (Number.isFinite(options.sinceTimestamp)) {
      events = events.filter((e) => e.timestamp >= options.sinceTimestamp);
    }
    if (Number.isFinite(options.limit) && options.limit > 0) {
      events = events.slice(-options.limit);
    }
    return events;
  }

  verifyIntegrity() {
    const events = this.getEvents();
    if (events.length === 0) {
      return { valid: true, count: 0, last_hash: null };
    }

    let expectedPrevHash = GENESIS_PREV_HASH;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.index !== i) {
        return {
          valid: false,
          error: `Index mismatch at position ${i}: expected ${i}, found ${e.index}`,
          corrupted_index: i,
        };
      }
      if (e.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          error: `Broken hash chain at index ${i}: prev_hash does not match preceding hash`,
          corrupted_index: i,
        };
      }
      const recomputed = computeEventHash(e.index, e.timestamp, e.event_type, e.prev_hash, e.payload);
      if (e.hash !== recomputed) {
        return {
          valid: false,
          error: `Corrupted hash at index ${i}: payload tampered`,
          corrupted_index: i,
        };
      }
      expectedPrevHash = e.hash;
    }

    return {
      valid: true,
      count: events.length,
      last_hash: events[events.length - 1].hash,
    };
  }
}

module.exports = {
  EventLedger,
  computeEventHash,
  GENESIS_PREV_HASH,
};
