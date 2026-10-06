'use strict';

/**
 * Host-Level Soak & Leak Monitoring Probe Benchmark
 *
 * Samples process memory (RSS / Heap), open file descriptors (/proc/self/fd),
 * active event loop handles, and disk I/O write amplification during high-throughput
 * multi-grain bar ingestion and broker order dispatch cycles.
 *
 * Invariants:
 *  1. Zero file descriptor leaks (FD delta === 0 after completion)
 *  2. Zero uncollected handles (active handle count returns to baseline)
 *  3. In-memory multi-grain rollup strictly bounds write amplification (< 3.5x)
 *
 * ponytail: stdlib node:test + /proc/self/fd sampling; zero external dependencies.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');

const {
  writeTsIndex,
  readTsIndex,
  readLatestTsRecord,
} = require('../../../shared/lib/market/ts_index_storage.js');
const {
  deriveMultiGrainInMemory,
} = require('../../../shared/lib/market/multi_grain_rollup.js');
const { GateIoAdapter } = require('../../../backend/gateway/dist/adapters/gate_io_adapter.js');
const { DeribitAdapter } = require('../../../backend/gateway/dist/adapters/deribit_adapter.js');
const { AlpacaAdapter } = require('../../../backend/gateway/dist/adapters/alpaca_adapter.js');
const { PolymarketAdapter } = require('../../../backend/gateway/dist/adapters/polymarket_adapter.js');

function countOpenFileDescriptors() {
  if (fs.existsSync('/proc/self/fd')) {
    return fs.readdirSync('/proc/self/fd').length;
  }
  return 0;
}

function countActiveHandles() {
  if (typeof process._getActiveHandles === 'function') {
    return process._getActiveHandles().length;
  }
  return 0;
}

function calculateDirSize(dirPath) {
  let totalBytes = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalBytes += calculateDirSize(full);
    } else if (entry.isFile()) {
      totalBytes += fs.statSync(full).size;
    }
  }
  return totalBytes;
}

function generateSimulatedBars(symbol, count, startMs = 1700000000000) {
  const bars = [];
  let price = 50000.0;
  for (let i = 0; i < count; i++) {
    const ms = startMs + i * 60000; // 1-minute intervals
    const change = (Math.sin(i / 10) + Math.cos(i / 7)) * 20;
    const open = price;
    const close = Math.max(100, open + change);
    const high = Math.max(open, close) + Math.abs(change) * 0.5;
    const low = Math.min(open, close) - Math.abs(change) * 0.5;
    const volume = 10 + (i % 50);
    price = close;

    bars.push({
      symbol,
      timeframe: '1m',
      family: 'crypto',
      provider: 'binance',
      timestamp: new Date(ms).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return bars;
}

test('Host Soak: high-throughput bar ingestion and order cycles exhibit zero handle/FD leaks', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-soak-bench-'));

  // Baseline measurements
  const initialFds = countOpenFileDescriptors();
  const initialHandles = countActiveHandles();

  const symbols = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'AVAX_USDT'];
  const BARS_PER_SYMBOL = 1500; // 6,000 total 1m bars across symbols
  let totalRawBytes = 0;

  try {
    // ── Phase 1: High-Throughput Ingestion & Multi-Grain Rollups ──────────────
    const ingestionReport = await runBenchmark(
      'High-Throughput Ingestion Soak',
      { warmupRuns: 2, iterations: 10, itemsPerIteration: symbols.length * BARS_PER_SYMBOL },
      () => {
        for (const sym of symbols) {
          const rawBars = generateSimulatedBars(sym, BARS_PER_SYMBOL);
          const rawJson = JSON.stringify(rawBars);
          totalRawBytes += Buffer.byteLength(rawJson, 'utf8');

          // Derive 5m, 15m, 30m, 1h, 4h, 1d in memory
          const rollup = deriveMultiGrainInMemory(rawBars, {
            baseTimeframe: '1m',
            targetTimeframes: ['5m', '15m', '30m', '1h', '4h', '1d'],
            includeBase: true,
          });

          // Write to binary TS storage
          writeTsIndex(tempDir, { sources: rollup.sources });

          // Read back latest record to verify storage integrity
          const latest = readLatestTsRecord(tempDir, sym, '1m');
          assert.ok(latest && latest.record);
          assert.equal(latest.record.symbol, sym);
        }
      }
    );

    // ── Phase 2: High-Throughput Broker Order Cycles ──────────────────────────
    const orderReport = await runBenchmark(
      'Simulated Broker Order Cycle Soak',
      { warmupRuns: 5, iterations: 50, itemsPerIteration: 4 },
      async () => {
        // Alpaca simulation
        const alpaca = new AlpacaAdapter({ simulateIfMissingCredentials: true, keyId: '', secretKey: '' });
        const alpacaRes = await alpaca.placeOrder({
          instrumentId: 'AAPL',
          quantity: 10,
          side: 'buy',
          type: 'market',
        });
        assert.ok(alpacaRes.orderId.startsWith('alpaca-sim-'));

        // Gate.io simulation
        const gate = new GateIoAdapter({ simulateIfMissingCredentials: true, apiKey: '', apiSecret: '' });
        const gateRes = await gate.placeOrder({
          instrumentId: 'BTC_USDT',
          quantity: 0.1,
          side: 'buy',
          type: 'limit',
          price: 65000,
        });
        assert.ok(gateRes.orderId.startsWith('gate-sim-'));

        // Deribit simulation
        const deribit = new DeribitAdapter({ simulateIfMissingCredentials: true, clientId: '', clientSecret: '' });
        const deribitRes = await deribit.placeOrder({
          instrumentId: 'BTC-27SEP24-60000-C',
          quantity: 1,
          side: 'buy',
          type: 'limit',
          price: 0.05,
        });
        assert.ok(deribitRes.orderId.startsWith('deribit-sim-'));

        // Polymarket simulation
        const poly = new PolymarketAdapter({ simulateIfMissingCredentials: true, privateKey: '', creds: null });
        const polyRes = await poly.placeOrder({
          instrumentId: '0x1234567890abcdef',
          quantity: 100,
          side: 'buy',
          type: 'limit',
          price: 0.5,
        });
        assert.ok(polyRes.orderId.startsWith('poly-sim-'));
      }
    );

    // ── Phase 3: Post-Soak Leak & Amplification Verification ──────────────────
    if (typeof global.gc === 'function') {
      global.gc();
    }

    const finalFds = countOpenFileDescriptors();
    const finalHandles = countActiveHandles();
    const finalMemory = process.memoryUsage();
    const diskBytesWritten = calculateDirSize(tempDir);

    const fdDelta = finalFds - initialFds;
    const handleDelta = finalHandles - initialHandles;
    const writeAmplificationRatio = totalRawBytes > 0 ? (diskBytesWritten / (totalRawBytes / 10)) : 0;

    console.log(formatBenchmarkReport([ingestionReport, orderReport]));
    console.log(JSON.stringify({
      type: 'host_soak_metrics',
      initial_fds: initialFds,
      final_fds: finalFds,
      fd_delta: fdDelta,
      initial_handles: initialHandles,
      final_handles: finalHandles,
      handle_delta: handleDelta,
      memory_rss_mb: (finalMemory.rss / (1024 * 1024)).toFixed(2),
      memory_heap_used_mb: (finalMemory.heapUsed / (1024 * 1024)).toFixed(2),
      disk_bytes_written_kb: (diskBytesWritten / 1024).toFixed(2),
      write_amplification_ratio: writeAmplificationRatio.toFixed(3),
    }, null, 2));

    // Assert zero leaks
    assert.equal(handleDelta, 0, `zero uncollected active handles (delta: ${handleDelta})`);
    assert.ok(fdDelta <= 0, `zero open file descriptor leaks (initial: ${initialFds}, final: ${finalFds}, delta: ${fdDelta})`);
    assert.ok(writeAmplificationRatio <= 3.5, `write amplification strictly bounded (ratio: ${writeAmplificationRatio.toFixed(3)})`);

    // Verify written data validity
    for (const sym of symbols) {
      const records = readTsIndex(tempDir, sym, '1m');
      assert.ok(Array.isArray(records));
      assert.ok(records.length > 0, `valid records written for ${sym}`);
    }
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});
