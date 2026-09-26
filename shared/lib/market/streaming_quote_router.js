'use strict';

const { calculateFeatureFrame } = require('./indicators.js');
const { MultiGrainRollupPipeline } = require('./multi_grain_rollup.js');

// ponytail: default capacity falls back to env var SOVEREIGN_STREAMING_WINDOW_SIZE or 200
function resolveDefaultCapacity(override) {
  const num = Number(override);
  if (Number.isFinite(num) && num > 0) return Math.floor(num);
  const envNum = Number(process.env.SOVEREIGN_STREAMING_WINDOW_SIZE);
  if (Number.isFinite(envNum) && envNum > 0) return Math.floor(envNum);
  return 200;
}

class StreamingRingBuffer {
  constructor(capacity) {
    this.capacity = resolveDefaultCapacity(capacity);
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;

    this.rsiPeriod = 14;
    this.prevClose = null;
    this.sumGain = 0;
    this.sumLoss = 0;
    this.avgGain = 0;
    this.avgLoss = 0;
    this.rsi = null;
    this.rsiCount = 0;

    this.atrPeriod = 14;
    this.prevAtrClose = null;
    this.sumTr = 0;
    this.atr = null;
    this.atrCount = 0;

    this.bbPeriod = 20;
    this.bbBuffer = new Float64Array(20);
    this.bbHead = 0;
    this.bbCount = 0;
    this.bbSum = 0;
    this.bbSumSq = 0;
    this.bollinger = null;
  }

  resize(newCapacity) {
    const target = resolveDefaultCapacity(newCapacity);
    if (target === this.capacity) return this.capacity;

    const items = this.toArray();
    const kept = items.slice(Math.max(0, items.length - target));
    this.capacity = target;
    this.buffer = new Array(target);
    for (let i = 0; i < kept.length; i++) {
      this.buffer[i] = kept[i];
    }
    this.head = kept.length % target;
    this.size = kept.length;
    return this.capacity;
  }

  push(bar) {
    this.buffer[this.head] = bar;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;

    this._updateIndicators(bar);
  }

  _updateIndicators(bar) {
    const close = Number(bar.close);
    if (!Number.isFinite(close)) return;

    if (this.prevClose === null) {
      this.prevClose = close;
    } else {
      const change = close - this.prevClose;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      this.rsiCount++;

      if (this.rsiCount <= this.rsiPeriod) {
        this.sumGain += gain;
        this.sumLoss += loss;
        if (this.rsiCount === this.rsiPeriod) {
          this.avgGain = this.sumGain / this.rsiPeriod;
          this.avgLoss = this.sumLoss / this.rsiPeriod;
          this.rsi = this.avgLoss === 0 ? 100 : 100 - (100 / (1 + this.avgGain / this.avgLoss));
        }
      } else {
        this.avgGain = (this.avgGain * (this.rsiPeriod - 1) + gain) / this.rsiPeriod;
        this.avgLoss = (this.avgLoss * (this.rsiPeriod - 1) + loss) / this.rsiPeriod;
        this.rsi = this.avgLoss === 0 ? 100 : 100 - (100 / (1 + this.avgGain / this.avgLoss));
      }
      this.prevClose = close;
    }

    const high = Number.isFinite(bar.high) ? Number(bar.high) : close;
    const low = Number.isFinite(bar.low) ? Number(bar.low) : close;
    let tr = high - low;
    if (this.prevAtrClose !== null) {
      tr = Math.max(tr, Math.abs(high - this.prevAtrClose), Math.abs(low - this.prevAtrClose));
    }
    this.prevAtrClose = close;
    this.atrCount++;

    if (this.atrCount <= this.atrPeriod) {
      this.sumTr += tr;
      if (this.atrCount === this.atrPeriod) {
        this.atr = this.sumTr / this.atrPeriod;
      }
    } else if (this.atr !== null) {
      this.atr = (this.atr * (this.atrPeriod - 1) + tr) / this.atrPeriod;
    }

    if (this.bbCount < this.bbPeriod) {
      this.bbBuffer[this.bbHead] = close;
      this.bbHead = (this.bbHead + 1) % this.bbPeriod;
      this.bbCount++;
      this.bbSum += close;
      this.bbSumSq += close * close;
    } else {
      const oldVal = this.bbBuffer[this.bbHead];
      this.bbBuffer[this.bbHead] = close;
      this.bbHead = (this.bbHead + 1) % this.bbPeriod;
      this.bbSum += close - oldVal;
      this.bbSumSq += (close * close) - (oldVal * oldVal);
    }

    if (this.bbCount >= this.bbPeriod) {
      const mean = this.bbSum / this.bbPeriod;
      const variance = Math.max(0, (this.bbSumSq / this.bbPeriod) - (mean * mean));
      const stdev = Math.sqrt(variance);
      this.bollinger = {
        middle: mean,
        upper: mean + 2 * stdev,
        lower: mean - 2 * stdev,
      };
    }
  }

  getIncrementalIndicators() {
    return {
      rsi: this.rsi,
      atr: this.atr,
      bollinger_middle: this.bollinger ? this.bollinger.middle : null,
      bollinger_upper: this.bollinger ? this.bollinger.upper : null,
      bollinger_lower: this.bollinger ? this.bollinger.lower : null,
    };
  }

  toArray() {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    const result = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity];
    }
    return result;
  }

  get length() {
    return this.size;
  }
}

class StreamingQuoteRouter {
  constructor(options = {}) {
    this.windowConfig = options.windowSize ?? options.capacity;
    this.buffers = new Map();
    this.listeners = new Set();
    this.bpSubscribers = new Set();
    this.bpStats = {
      total_dispatched: 0,
      total_dropped: 0,
      total_coalesced: 0,
    };
    // ponytail: optional in-memory multi-grain rollup pipeline for real-time 5m/15m/1h rollover signals
    this.rollupPipeline = options.rollupPipeline || (options.enableRollup ? new MultiGrainRollupPipeline(options.rollupOptions) : null);
    if (this.rollupPipeline) {
      this.rollupPipeline.onBarClosed((event) => {
        this._dispatchToAll(event, true);
      });
    }
  }

  _dispatchToAll(payload, isCritical = false) {
    for (const listener of this.listeners) {
      try { listener(payload); } catch (_) {}
    }

    for (const sub of this.bpSubscribers) {
      this._dispatchToBackpressuredSub(sub, payload, isCritical);
    }
  }

  _dispatchToBackpressuredSub(sub, payload, isCritical = false) {
    const isBackpressured = typeof sub.checkBackpressure === 'function'
      ? Boolean(sub.checkBackpressure())
      : (sub.pendingCount >= sub.highWaterMark);

    if (isBackpressured && !isCritical) {
      // Coalesce intermediate price updates, drop raw tick flood
      sub.coalescedPayload = payload;
      this.bpStats.total_dropped += 1;
      this.bpStats.total_coalesced += 1;
      return;
    }

    // Flush any coalesced latest payload before critical or unblocked delivery
    if (sub.coalescedPayload && !isBackpressured) {
      const c = sub.coalescedPayload;
      sub.coalescedPayload = null;
      try {
        sub.listener(c);
        this.bpStats.total_dispatched += 1;
      } catch (_) {}
    }

    try {
      sub.listener(payload);
      this.bpStats.total_dispatched += 1;
    } catch (_) {}
  }

  _getKey(symbol, timeframe = '1m') {
    return `${String(symbol).toUpperCase()}:${timeframe}`;
  }

  resolveCapacity(symbol, timeframe = '1m', override) {
    if (override !== undefined) return resolveDefaultCapacity(override);
    if (typeof this.windowConfig === 'function') {
      return resolveDefaultCapacity(this.windowConfig(symbol, timeframe));
    }
    if (this.windowConfig && typeof this.windowConfig === 'object') {
      const key = this._getKey(symbol, timeframe);
      const val = this.windowConfig instanceof Map ? this.windowConfig.get(key) : this.windowConfig[key];
      if (val !== undefined) return resolveDefaultCapacity(val);
    }
    return resolveDefaultCapacity(this.windowConfig);
  }

  setCapacity(symbol, timeframe = '1m', capacity) {
    const key = this._getKey(symbol, timeframe);
    const target = resolveDefaultCapacity(capacity);
    if (this.buffers.has(key)) {
      this.buffers.get(key).resize(target);
    } else {
      this.buffers.set(key, new StreamingRingBuffer(target));
    }
    return target;
  }

  ingestBar(symbol, bar, timeframe = '1m', options = {}) {
    const key = this._getKey(symbol, timeframe);
    const targetCapacity = this.resolveCapacity(symbol, timeframe, options.capacity ?? options.windowSize);

    if (!this.buffers.has(key)) {
      this.buffers.set(key, new StreamingRingBuffer(targetCapacity));
    }
    const ring = this.buffers.get(key);
    if (options.capacity || options.windowSize) {
      ring.resize(targetCapacity);
    }

    const normalizedBar = {
      ...bar,
      symbol: String(bar.symbol || symbol).toUpperCase(),
      timeframe: String(bar.timeframe || timeframe),
      family: bar.family || 'crypto',
      timestamp: bar.timestamp || new Date().toISOString(),
    };

    ring.push(normalizedBar);

    let rollupEmitted = null;
    if (this.rollupPipeline) {
      rollupEmitted = this.rollupPipeline.ingest(normalizedBar);
    }

    let features = null;
    if (ring.length >= 14) {
      const bars = ring.toArray();
      const frame = calculateFeatureFrame(bars, { rsi: 14, atr: 14, bollinger: 20 });
      if (frame && Array.isArray(frame.features) && frame.features.length > 0) {
        features = frame.features[frame.features.length - 1];
      }
    }

    const payload = {
      symbol: normalizedBar.symbol,
      timeframe: normalizedBar.timeframe,
      bar: normalizedBar,
      window_size: ring.length,
      features,
      incremental: ring.getIncrementalIndicators(),
      ...(rollupEmitted ? { rollup: rollupEmitted } : {}),
    };

    this._dispatchToAll(payload, Boolean(rollupEmitted));

    return payload;
  }

  getOpenBuckets(symbol = null) {
    return this.rollupPipeline ? this.rollupPipeline.getOpenBuckets(symbol) : [];
  }

  flushRollup(options = {}) {
    return this.rollupPipeline ? this.rollupPipeline.flush(options) : { sources: [], counts: {} };
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return () => {};
  }

  subscribeWithBackpressure(listener, options = {}) {
    if (typeof listener !== 'function') return () => {};
    const sub = {
      listener,
      checkBackpressure: options.checkBackpressure || null,
      highWaterMark: Math.max(1, Number(options.highWaterMark) || 50),
      pendingCount: 0,
      coalescedPayload: null,
    };
    this.bpSubscribers.add(sub);
    return () => this.bpSubscribers.delete(sub);
  }

  getBackpressureStats() {
    let currentlyBackpressured = 0;
    for (const sub of this.bpSubscribers) {
      if (typeof sub.checkBackpressure === 'function' && sub.checkBackpressure()) {
        currentlyBackpressured += 1;
      }
    }
    return {
      subscribers_count: this.listeners.size + this.bpSubscribers.size,
      backpressured_subscribers: currentlyBackpressured,
      total_dispatched: this.bpStats.total_dispatched,
      total_dropped: this.bpStats.total_dropped,
      total_coalesced: this.bpStats.total_coalesced,
    };
  }
}

module.exports = {
  StreamingRingBuffer,
  StreamingQuoteRouter,
};
