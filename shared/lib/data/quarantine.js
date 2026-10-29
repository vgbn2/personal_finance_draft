'use strict';

/**
 * shared/lib/data/quarantine.js
 *
 * Ingestion Staging & Quarantine Engine.
 * Isolates malformed, corrupted, or non-finite records into forensic JSONL logs.
 *
 * Implementation: zero-dependency audit logging using node:crypto, node:fs, and node:path.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { STORAGE_DATA_DIR } = require('../runtime/paths.js');

const DEFAULT_QUARANTINE_DIR = path.join(STORAGE_DATA_DIR, 'quarantine');

const QUARANTINE_REASONS = Object.freeze({
  NON_FINITE_PRICE: 'NON_FINITE_PRICE',
  NEGATIVE_SPREAD: 'NEGATIVE_SPREAD',
  TIME_JUMP: 'TIME_JUMP',
  MISSING_PREDECESSOR: 'MISSING_PREDECESSOR',
  DUPLICATE_PAYLOAD_CONFLICT: 'DUPLICATE_PAYLOAD_CONFLICT',
  MALFORMED_ROW: 'MALFORMED_ROW',
});

function computePayloadHash(record) {
  const hash = crypto.createHash('sha256');
  try {
    hash.update(typeof record === 'string' ? record : JSON.stringify(record));
  } catch (err) {
    hash.update(String(record));
  }
  return hash.digest('hex');
}

function validateIngestRecord(record, family = 'general') {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      reason: QUARANTINE_REASONS.MALFORMED_ROW,
      error: 'Record must be a non-null object',
    };
  }

  // Check price fields. Macro observations are signed only in the canonical `value` field.
  const priceFields = ['open', 'high', 'low', 'close', 'value', 'price'];
  for (const field of priceFields) {
    if (field in record && record[field] !== undefined && record[field] !== null) {
      const value = Number(record[field]);
      const signedMacroValue = family === 'macro' && field === 'value';
      if (!Number.isFinite(value) || (!signedMacroValue && value <= 0)) {
        return {
          valid: false,
          reason: QUARANTINE_REASONS.NON_FINITE_PRICE,
          error: signedMacroValue
            ? `Macro value must be finite, got ${record[field]}`
            : `Price field "${field}" must be finite and positive, got ${record[field]}`,
        };
      }
    }
  }

  // Check spread validity
  if (record.bid !== undefined && record.ask !== undefined) {
    const bid = Number(record.bid);
    const ask = Number(record.ask);
    if (Number.isFinite(bid) && Number.isFinite(ask) && ask < bid) {
      return {
        valid: false,
        reason: QUARANTINE_REASONS.NEGATIVE_SPREAD,
        error: `Inverted spread: ask (${ask}) < bid (${bid})`,
      };
    }
  }

  // Check timestamp validity & forward clock skew (> 5 minutes in future)
  if (record.timestamp !== undefined) {
    const tsMs = typeof record.timestamp === 'number'
      ? record.timestamp
      : Date.parse(String(record.timestamp));
    if (!Number.isFinite(tsMs)) {
      return {
        valid: false,
        reason: QUARANTINE_REASONS.TIME_JUMP,
        error: `Invalid unparseable timestamp: ${record.timestamp}`,
      };
    }

    const maxFutureMs = Date.now() + 5 * 60 * 1000;
    if (tsMs > maxFutureMs) {
      return {
        valid: false,
        reason: QUARANTINE_REASONS.TIME_JUMP,
        error: `Timestamp exceeds 5-minute forward clock skew threshold: ${record.timestamp}`,
      };
    }
  }

  return { valid: true };
}

function resolveDateString(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.toISOString().slice(0, 10);
}

function quarantineRecord(record, reasonCode, errorMessage, options = {}) {
  const storageDir = options.storageDir || DEFAULT_QUARANTINE_DIR;
  const family = options.family || 'general';
  const symbol = options.symbol || record?.symbol || 'UNKNOWN';
  const now = options.now ? new Date(options.now) : new Date();
  const dateStr = resolveDateString(now);

  const payloadHash = computePayloadHash(record);
  const event = {
    schema_version: 1,
    quarantined_at: now.toISOString(),
    family,
    symbol,
    reason_code: reasonCode || QUARANTINE_REASONS.MALFORMED_ROW,
    error: errorMessage || 'Validation failed',
    payload_hash: payloadHash,
    raw_payload: record,
  };

  try {
    fs.mkdirSync(storageDir, { recursive: true });
    const targetFile = path.join(storageDir, `${family}_${dateStr}.jsonl`);
    fs.appendFileSync(targetFile, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    console.error(`[QUARANTINE] Failed to persist quarantine log: ${err.message}`);
  }

  return event;
}

function readQuarantineRecords(options = {}) {
  const storageDir = options.storageDir || DEFAULT_QUARANTINE_DIR;
  const targetFamily = options.family || null;
  const targetDate = options.date || null;
  const records = [];

  if (!fs.existsSync(storageDir)) return records;

  try {
    const files = fs.readdirSync(storageDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      if (targetFamily && !file.startsWith(`${targetFamily}_`)) continue;
      if (targetDate && !file.includes(targetDate)) continue;

      const content = fs.readFileSync(path.join(storageDir, file), 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch (err) {
          console.error(`[QUARANTINE] Corrupted line in ${file}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[QUARANTINE] Failed to read directory ${storageDir}: ${err.message}`);
  }

  return records;
}

function getQuarantineMetrics(options = {}) {
  const storageDir = options.storageDir || DEFAULT_QUARANTINE_DIR;
  const metrics = {
    total_quarantined: 0,
    file_count: 0,
    by_reason: {},
    by_family: {},
    latest_anomaly: null,
  };

  for (const reason of Object.values(QUARANTINE_REASONS)) {
    metrics.by_reason[reason] = 0;
  }

  if (!fs.existsSync(storageDir)) return metrics;

  try {
    const files = fs.readdirSync(storageDir).filter((f) => f.endsWith('.jsonl'));
    metrics.file_count = files.length;

    let latestTime = 0;
    for (const file of files) {
      const filePath = path.join(storageDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          metrics.total_quarantined += 1;
          const r = evt.reason_code;
          if (r) {
            metrics.by_reason[r] = (metrics.by_reason[r] || 0) + 1;
          }
          const f = evt.family || 'general';
          metrics.by_family[f] = (metrics.by_family[f] || 0) + 1;

          const t = Date.parse(evt.quarantined_at) || 0;
          if (t >= latestTime) {
            latestTime = t;
            metrics.latest_anomaly = evt;
          }
        } catch (err) {
          console.error(`[QUARANTINE] Corrupt metric entry in ${file}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[QUARANTINE] Error reading metrics from ${storageDir}: ${err.message}`);
  }

  return metrics;
}

function pruneQuarantineRecords(daysToKeep = 30, options = {}) {
  const storageDir = options.storageDir || DEFAULT_QUARANTINE_DIR;
  const now = options.now ? new Date(options.now) : new Date();
  const cutoffMs = now.getTime() - Number(daysToKeep) * 24 * 60 * 60 * 1000;

  let prunedFiles = 0;
  let freedBytes = 0;

  if (!fs.existsSync(storageDir)) {
    return { pruned_files: 0, freed_bytes: 0 };
  }

  try {
    const files = fs.readdirSync(storageDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      // Match pattern <family>_YYYY-MM-DD.jsonl
      const match = file.match(/_(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!match) continue;

      const fileDateMs = Date.parse(match[1]);
      if (Number.isFinite(fileDateMs) && fileDateMs < cutoffMs) {
        const fullPath = path.join(storageDir, file);
        try {
          const stat = fs.statSync(fullPath);
          freedBytes += stat.size;
          fs.unlinkSync(fullPath);
          prunedFiles += 1;
        } catch (err) {
          console.error(`[QUARANTINE] Failed to unlink ${fullPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[QUARANTINE] Pruning failed in ${storageDir}: ${err.message}`);
  }

  return { pruned_files: prunedFiles, freed_bytes: freedBytes };
}

module.exports = {
  QUARANTINE_REASONS,
  computePayloadHash,
  validateIngestRecord,
  quarantineRecord,
  readQuarantineRecords,
  getQuarantineMetrics,
  pruneQuarantineRecords,
};
