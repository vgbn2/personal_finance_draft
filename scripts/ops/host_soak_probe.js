#!/usr/bin/env node
'use strict';

/**
 * Host-Level Soak & Leak Monitoring Probe (CLI / Ops)
 *
 * Samples process memory (RSS / Heap), open file descriptors, active event loop handles,
 * and disk I/O write amplification during simulated workloads.
 *
 * Usage:
 *   node scripts/ops/host_soak_probe.js [--iterations N] [--bars N] [--json]
 *
 * ponytail: native stdlib node:fs + /proc/self/fd inspection; zero extra dependencies.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeTsIndex,
  readTsIndex,
  readLatestTsRecord,
} = require('../../shared/lib/market/ts_index_storage.js');
const {
  deriveMultiGrainInMemory,
} = require('../../shared/lib/market/multi_grain_rollup.js');
const { GateIoAdapter } = require('../../backend/gateway/dist/adapters/gate_io_adapter.js');
const { DeribitAdapter } = require('../../backend/gateway/dist/adapters/deribit_adapter.js');
const { AlpacaAdapter } = require('../../backend/gateway/dist/adapters/alpaca_adapter.js');
const { PolymarketAdapter } = require('../../backend/gateway/dist/adapters/polymarket_adapter.js');

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    iterations: 20,
    barsPerSymbol: 1000,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && i + 1 < args.length) {
      options.iterations = parseInt(args[++i], 10) || options.iterations;
    } else if (args[i] === '--bars' && i + 1 < args.length) {
      options.barsPerSymbol = parseInt(args[++i], 10) || options.barsPerSymbol;
    } else if (args[i] === '--json') {
      options.json = true;
    }
  }
  return options;
}

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

function generateBars(symbol, count, startMs = 1700000000000) {
  const bars = [];
  let price = 50000.0;
  for (let i = 0; i < count; i++) {
    const ms = startMs + i * 60000;
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

async function runSoakProbe() {
  const opts = parseCliArgs();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-soak-probe-'));

  const initialFds = countOpenFileDescriptors();
  const initialHandles = countActiveHandles();
  const initialMem = process.memoryUsage();
  const symbols = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT'];

  const startTime = Date.now();
  let totalRawBytes = 0;
  let ordersDispatched = 0;

  try {
    for (let iter = 0; iter < opts.iterations; iter++) {
      // Bar Ingestion & Multi-Grain Rollup
      for (const sym of symbols) {
        const bars = generateBars(sym, opts.barsPerSymbol);
        totalRawBytes += Buffer.byteLength(JSON.stringify(bars), 'utf8');

        const rollup = deriveMultiGrainInMemory(bars, {
          baseTimeframe: '1m',
          targetTimeframes: ['5m', '15m', '1h', '1d'],
          includeBase: true,
        });
        writeTsIndex(tempDir, { sources: rollup.sources });
      }

      // Order Cycle Simulation
      const alpaca = new AlpacaAdapter({ simulateIfMissingCredentials: true, keyId: '', secretKey: '' });
      await alpaca.placeOrder({ instrumentId: 'AAPL', quantity: 1, side: 'buy', type: 'market' });
      const gate = new GateIoAdapter({ simulateIfMissingCredentials: true, apiKey: '', apiSecret: '' });
      await gate.placeOrder({ instrumentId: 'BTC_USDT', quantity: 0.01, side: 'buy', type: 'limit', price: 65000 });
      const deribit = new DeribitAdapter({ simulateIfMissingCredentials: true, clientId: '', clientSecret: '' });
      await deribit.placeOrder({ instrumentId: 'BTC-27SEP24-60000-C', quantity: 1, side: 'buy', type: 'limit', price: 0.05 });
      const poly = new PolymarketAdapter({ simulateIfMissingCredentials: true, privateKey: '', creds: null });
      await poly.placeOrder({ instrumentId: '0x123', quantity: 10, side: 'buy', type: 'limit', price: 0.5 });
      ordersDispatched += 4;
    }

    if (typeof global.gc === 'function') {
      global.gc();
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const finalFds = countOpenFileDescriptors();
    const finalHandles = countActiveHandles();
    const finalMem = process.memoryUsage();
    const diskBytesWritten = calculateDirSize(tempDir);

    const fdDelta = finalFds - initialFds;
    const handleDelta = finalHandles - initialHandles;
    const writeAmpRatio = totalRawBytes > 0 ? (diskBytesWritten / (totalRawBytes / opts.iterations)).toFixed(3) : '0';

    const report = {
      status: (fdDelta <= 0 && handleDelta === 0) ? 'HEALTHY' : 'LEAK_DETECTED',
      elapsed_seconds: Number(elapsedSec),
      iterations: opts.iterations,
      total_bars_processed: opts.iterations * symbols.length * opts.barsPerSymbol,
      orders_dispatched: ordersDispatched,
      file_descriptors: {
        initial: initialFds,
        final: finalFds,
        delta: fdDelta,
      },
      active_handles: {
        initial: initialHandles,
        final: finalHandles,
        delta: handleDelta,
      },
      memory_mb: {
        initial_rss: (initialMem.rss / 1048576).toFixed(2),
        final_rss: (finalMem.rss / 1048576).toFixed(2),
        initial_heap: (initialMem.heapUsed / 1048576).toFixed(2),
        final_heap: (finalMem.heapUsed / 1048576).toFixed(2),
      },
      io_write_amplification: {
        disk_kb_written: (diskBytesWritten / 1024).toFixed(2),
        ratio: Number(writeAmpRatio),
      },
    };

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(` Host Soak & Leak Probe Result: ${report.status}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log(` Elapsed:            ${report.elapsed_seconds}s across ${report.iterations} iterations`);
      console.log(` Bars Processed:     ${report.total_bars_processed}`);
      console.log(` Orders Dispatched:  ${report.orders_dispatched}`);
      console.log(` Open FDs:           ${report.file_descriptors.initial} -> ${report.file_descriptors.final} (delta: ${report.file_descriptors.delta})`);
      console.log(` Active Handles:     ${report.active_handles.initial} -> ${report.active_handles.final} (delta: ${report.active_handles.delta})`);
      console.log(` Heap Used:          ${report.memory_mb.initial_heap}MB -> ${report.memory_mb.final_heap}MB`);
      console.log(` Write Amplification Ratio: ${report.io_write_amplification.ratio}x`);
      console.log('═══════════════════════════════════════════════════════════');
    }

    if (fdDelta > 0 || handleDelta > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  runSoakProbe().catch((err) => {
    console.error('Host soak probe failure:', err);
    process.exit(1);
  });
}

module.exports = { runSoakProbe };
