'use strict';

// ponytail: in-memory multi-grain rollup engine. O(1) streaming accumulator + zero-copy batch rollup.
// Eliminates 4-6x disk I/O read-back amplification before writing to binary TS index.

const {
  bucketStartFor,
  parseTimeframeMs,
  SUPPORTED_INTERVALS,
} = require('../../../backend/scripts/data_ops/ingest_market_data/constants.js');
const { writeTsIndex } = require('./ts_index_storage.js');

const DEFAULT_ROLLUP_LADDER = ['5m', '15m', '30m', '1h', '4h', '1d'];

/**
 * Sanitizes and normalizes an OHLCV record with invariant enforcement.
 * Enforces: low <= min(open, close) and high >= max(open, close), volume >= 0.
 */
function sanitizeRecord(rec, defaultTimeframe = '1m') {
  if (!rec || typeof rec !== 'object') return null;
  const ms = typeof rec.timestamp === 'string' ? Date.parse(rec.timestamp) : Number(rec.timestamp || rec.openTime || rec.ms);
  if (!Number.isFinite(ms)) return null;

  const open = Number(rec.open);
  const high = Number(rec.high);
  const low = Number(rec.low);
  const close = Number(rec.close);
  const volume = Number(rec.volume);

  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;

  const safeOpen = open;
  const safeClose = close;
  const safeHigh = Number.isFinite(high) ? Math.max(high, safeOpen, safeClose) : Math.max(safeOpen, safeClose);
  const safeLow = Number.isFinite(low) ? Math.min(low, safeOpen, safeClose) : Math.min(safeOpen, safeClose);
  const safeVolume = Number.isFinite(volume) && volume > 0 ? volume : 0;

  return {
    symbol: String(rec.symbol || '').toUpperCase(),
    timeframe: String(rec.timeframe || defaultTimeframe),
    family: rec.family || 'unknown',
    provider: rec.provider || 'rollup',
    timestamp: new Date(ms).toISOString(),
    timestampMs: ms,
    open: safeOpen,
    high: safeHigh,
    low: safeLow,
    close: safeClose,
    volume: safeVolume,
    coordinate_id: rec.coordinate_id || undefined,
    config_market: rec.config_market || undefined,
    config_sector: rec.config_sector || undefined,
    derived_from_timeframe: rec.derived_from_timeframe || undefined,
  };
}

/**
 * Derives coarser timeframes in RAM from an array of base-grain records without any disk I/O.
 *
 * @param {Array<Object>} records - Raw base grain records (e.g. 1m bars).
 * @param {Object} [options]
 * @param {string} [options.baseTimeframe='1m'] - Base grain timeframe.
 * @param {Array<string>} [options.targetTimeframes] - Target coarser timeframes.
 * @param {boolean} [options.includeBase=true] - Whether to include sanitized base records in output sources.
 * @returns {{ derived: Record<string, Array<Object>>, sources: Array<Object>, counts: Record<string, number> }}
 */
function deriveMultiGrainInMemory(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return { derived: {}, sources: [], counts: {} };
  }

  const baseTf = options.baseTimeframe || records[0]?.timeframe || '1m';
  const baseMs = parseTimeframeMs(baseTf) || 60000;

  const targetTfs = (options.targetTimeframes || DEFAULT_ROLLUP_LADDER).filter((tf) => {
    const ms = parseTimeframeMs(tf);
    return ms != null && ms > baseMs;
  });

  const sanitized = [];
  for (let i = 0; i < records.length; i++) {
    const s = sanitizeRecord(records[i], baseTf);
    if (s && s.symbol) sanitized.push(s);
  }

  if (sanitized.length === 0) {
    return { derived: {}, sources: [], counts: {} };
  }

  // ponytail: sort chronologically to resolve out-of-order feeds before bucket aggregation
  sanitized.sort((a, b) => a.timestampMs - b.timestampMs);

  // ponytail: deduplicate identical timestamps (latest wins)
  const deduped = [];
  let prevMs = -1;
  let prevSym = '';
  for (let i = 0; i < sanitized.length; i++) {
    const cur = sanitized[i];
    if (cur.timestampMs === prevMs && cur.symbol === prevSym) {
      deduped[deduped.length - 1] = cur;
    } else {
      deduped.push(cur);
      prevMs = cur.timestampMs;
      prevSym = cur.symbol;
    }
  }

  const derived = {};
  const counts = {};
  for (const tf of targetTfs) {
    derived[tf] = [];
    counts[tf] = 0;
  }

  // Group by symbol first to support multi-symbol batches
  const bySymbol = new Map();
  for (const bar of deduped) {
    if (!bySymbol.has(bar.symbol)) bySymbol.set(bar.symbol, []);
    bySymbol.get(bar.symbol).push(bar);
  }

  for (const [symbol, symBars] of bySymbol) {
    const sample = symBars[0];
    const family = sample.family;
    const provider = sample.provider;

    for (const tf of targetTfs) {
      let currentBucket = null;

      for (let i = 0; i < symBars.length; i++) {
        const bar = symBars[i];
        const bucketStart = bucketStartFor(bar.timestampMs, tf);

        if (!currentBucket || currentBucket.startMs !== bucketStart) {
          if (currentBucket) {
            derived[tf].push(finalizeBucket(currentBucket, tf, baseTf));
          }
          currentBucket = {
            symbol,
            family,
            provider,
            startMs: bucketStart,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          };
        } else {
          currentBucket.high = Math.max(currentBucket.high, bar.high);
          currentBucket.low = Math.min(currentBucket.low, bar.low);
          currentBucket.close = bar.close;
          currentBucket.volume += bar.volume;
        }
      }

      if (currentBucket) {
        derived[tf].push(finalizeBucket(currentBucket, tf, baseTf));
      }
      counts[tf] = derived[tf].length;
    }
  }

  const sources = [];
  if (options.includeBase !== false) {
    for (const bar of deduped) sources.push(bar);
  }
  for (const tf of targetTfs) {
    for (const bar of derived[tf]) sources.push(bar);
  }

  return { derived, sources, counts };
}

function finalizeBucket(b, targetTf, baseTf) {
  return {
    symbol: b.symbol,
    timeframe: targetTf,
    family: b.family,
    provider: b.provider,
    timestamp: new Date(b.startMs).toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    derived_from_timeframe: baseTf,
  };
}

/**
 * Stateful in-memory streaming rollup accumulator with O(1) memory per active symbol.
 */
class MultiGrainRollupPipeline {
  constructor(options = {}) {
    this.baseTimeframe = options.baseTimeframe || '1m';
    this.baseMs = parseTimeframeMs(this.baseTimeframe) || 60000;
    this.targetTimeframes = (options.targetTimeframes || DEFAULT_ROLLUP_LADDER).filter(
      (tf) => (parseTimeframeMs(tf) || 0) > this.baseMs,
    );

    // key -> active candle state
    this.activeBuckets = new Map();
    // buffer of finalized/closed bars pending flush
    this.closedBuffer = [];

    this.closedListeners = new Set();
    this.updateListeners = new Set();
  }

  _bucketKey(symbol, timeframe) {
    return `${String(symbol).toUpperCase()}:${timeframe}`;
  }

  onBarClosed(callback) {
    if (typeof callback === 'function') {
      this.closedListeners.add(callback);
      return () => this.closedListeners.delete(callback);
    }
    return () => {};
  }

  onBarUpdated(callback) {
    if (typeof callback === 'function') {
      this.updateListeners.add(callback);
      return () => this.updateListeners.delete(callback);
    }
    return () => {};
  }

  /**
   * Ingest a single base-grain bar. Updates open buckets and emits closed bars on boundary rollover.
   */
  ingest(rawBar) {
    const bar = sanitizeRecord(rawBar, this.baseTimeframe);
    if (!bar || !bar.symbol) return null;

    const emitted = {
      closed: [],
      updated: [],
    };

    for (const tf of this.targetTimeframes) {
      const bucketStart = bucketStartFor(bar.timestampMs, tf);
      const key = this._bucketKey(bar.symbol, tf);
      const active = this.activeBuckets.get(key);

      if (!active) {
        const newBucket = {
          symbol: bar.symbol,
          timeframe: tf,
          family: bar.family,
          provider: bar.provider,
          startMs: bucketStart,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          count: 1,
        };
        this.activeBuckets.set(key, newBucket);
        const updatePayload = {
          event: 'bar_updated',
          symbol: bar.symbol,
          timeframe: tf,
          bar: finalizeBucket(newBucket, tf, this.baseTimeframe),
        };
        emitted.updated.push(updatePayload);
        this._notifyUpdates(updatePayload);
      } else if (bucketStart > active.startMs) {
        // Rollover: previous bucket is complete
        const closedBar = finalizeBucket(active, tf, this.baseTimeframe);
        this.closedBuffer.push(closedBar);
        const closedPayload = {
          event: 'bar_closed',
          symbol: bar.symbol,
          timeframe: tf,
          bar: closedBar,
        };
        emitted.closed.push(closedPayload);
        this._notifyClosed(closedPayload);

        // Open new bucket
        const nextBucket = {
          symbol: bar.symbol,
          timeframe: tf,
          family: bar.family,
          provider: bar.provider,
          startMs: bucketStart,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          count: 1,
        };
        this.activeBuckets.set(key, nextBucket);
        const updatePayload = {
          event: 'bar_updated',
          symbol: bar.symbol,
          timeframe: tf,
          bar: finalizeBucket(nextBucket, tf, this.baseTimeframe),
        };
        emitted.updated.push(updatePayload);
        this._notifyUpdates(updatePayload);
      } else if (bucketStart === active.startMs) {
        // Bar falls within existing open bucket
        active.high = Math.max(active.high, bar.high);
        active.low = Math.min(active.low, bar.low);
        active.close = bar.close;
        active.volume += bar.volume;
        active.count += 1;

        const updatePayload = {
          event: 'bar_updated',
          symbol: bar.symbol,
          timeframe: tf,
          bar: finalizeBucket(active, tf, this.baseTimeframe),
        };
        emitted.updated.push(updatePayload);
        this._notifyUpdates(updatePayload);
      } else {
        // Out-of-order / late bar for already closed bucket
        const retroPayload = {
          event: 'bar_retroactive',
          symbol: bar.symbol,
          timeframe: tf,
          bucketStartMs: bucketStart,
          bar,
        };
        this._notifyUpdates(retroPayload);
      }
    }

    return emitted;
  }

  ingestBatch(bars) {
    if (!Array.isArray(bars)) return [];
    const results = [];
    for (let i = 0; i < bars.length; i++) {
      results.push(this.ingest(bars[i]));
    }
    return results;
  }

  _notifyClosed(payload) {
    for (const listener of this.closedListeners) {
      try { listener(payload); } catch (_) {}
    }
  }

  _notifyUpdates(payload) {
    for (const listener of this.updateListeners) {
      try { listener(payload); } catch (_) {}
    }
  }

  /**
   * Returns snapshot of active in-progress (partial) candles across all grains in RAM.
   */
  getOpenBuckets(symbol = null) {
    const targetSymbol = symbol ? String(symbol).toUpperCase() : null;
    const result = [];
    for (const [key, active] of this.activeBuckets) {
      if (!targetSymbol || active.symbol === targetSymbol) {
        const bar = finalizeBucket(active, active.timeframe, this.baseTimeframe);
        result.push({ ...bar, is_partial: true, count: active.count });
      }
    }
    return result;
  }

  /**
   * Flushes closed bars (and optionally active open buckets).
   */
  flush(options = {}) {
    const sources = [...this.closedBuffer];
    this.closedBuffer = [];

    if (options.includeOpenBuckets) {
      for (const openBar of this.getOpenBuckets()) {
        sources.push(openBar);
      }
    }

    const counts = {};
    for (const s of sources) {
      counts[s.timeframe] = (counts[s.timeframe] || 0) + 1;
    }

    return { sources, counts };
  }

  removeSymbol(symbol) {
    const sym = String(symbol).toUpperCase();
    for (const key of Array.from(this.activeBuckets.keys())) {
      if (key.startsWith(`${sym}:`)) {
        this.activeBuckets.delete(key);
      }
    }
  }

  clear() {
    this.activeBuckets.clear();
    this.closedBuffer = [];
  }
}

/**
 * Single-pass in-memory rollup and atomic disk flush.
 * Derives all coarser grains in RAM and writes directly to disk without read-after-write cycles.
 *
 * @param {string} tsDir - Destination directory (e.g. storage/data/ts)
 * @param {{ sources: Array<Object> }} snapshot - Ingestion snapshot containing base records
 * @param {Object} [options] - Options passed to deriveMultiGrainInMemory
 */
function writeMultiGrainTsIndex(tsDir, snapshot, options = {}) {
  if (!snapshot || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
    return { ok: false, error: 'empty_snapshot', written: 0 };
  }

  const { sources, counts } = deriveMultiGrainInMemory(snapshot.sources, options);
  writeTsIndex(tsDir, { sources });

  return {
    ok: true,
    total_records: sources.length,
    counts,
  };
}

module.exports = {
  DEFAULT_ROLLUP_LADDER,
  sanitizeRecord,
  deriveMultiGrainInMemory,
  MultiGrainRollupPipeline,
  writeMultiGrainTsIndex,
};
