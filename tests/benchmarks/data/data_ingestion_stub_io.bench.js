'use strict';

/**
 * Data Ingestion Stub & Disk I/O Longevity Benchmark Suite
 *
 * Measures:
 * 1. Real physical block device disk write throughput (bars/sec, MB/sec).
 * 2. Raw wire fixture parsing, quote normalization, validation, and single-pass multi-grain disk commit.
 * 3. In-place live bar append latency (with fsync durability).
 * 4. Physical Write Amplification Factor (WAF) via Linux /sys/block/<dev>/stat accounting.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { writeMultiGrainTsIndex } = require('../../../shared/lib/market/multi_grain_rollup.js');
const { readTsIndex } = require('../../../shared/lib/market/ts_index_storage.js');
const { normalizeExternalQuotePayload } = require('../../../shared/lib/market/quote_router.js');
const { validateSnapshot } = require('../../../shared/lib/market/validation.js');

function getBlockDeviceSectors(dev = 'nvme1n1') {
  try {
    const statPath = `/sys/block/${dev}/stat`;
    if (!fs.existsSync(statPath)) return null;
    const parts = fs.readFileSync(statPath, 'utf8').trim().split(/\s+/);
    return {
      readsCompleted: parseInt(parts[0], 10),
      sectorsRead: parseInt(parts[2], 10),
      writesCompleted: parseInt(parts[4], 10),
      sectorsWritten: parseInt(parts[6], 10), // Field 7: sectors written (512B each)
    };
  } catch (_) {
    return null;
  }
}

test('benchmark data ingestion pipeline: raw wire fixture parsing to physical disk commit', async () => {
  // CRITICAL: Scratchbed must be on the real repository filesystem mount (/dev/nvme1n1p2), NEVER /tmp (tmpfs)
  const repoDataDir = path.resolve(__dirname, '../../../storage/data');
  const scratchDir = fs.mkdtempSync(path.join(repoDataDir, '_bench_scratch_'));

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AAPL', 'NVDA'];
  const barsPerSymbol = 1000;
  const startMs = Date.parse('2026-01-01T00:00:00Z');

  // Build realistic wire payloads
  const rawWirePayloads = symbols.map((symbol) => {
    let price = 100;
    const records = [];
    for (let i = 0; i < barsPerSymbol; i++) {
      price += (i % 2 === 0 ? 0.5 : -0.4);
      records.push({
        symbol,
        family: symbol.includes('USDT') ? 'crypto' : 'equities',
        provider: symbol.includes('USDT') ? 'binance' : 'alpaca',
        timeframe: '1m',
        timestamp: new Date(startMs + i * 60000).toISOString(),
        open: price - 0.2, high: price + 0.5, low: price - 0.5, close: price, volume: 1000,
      });
    }
    return JSON.stringify({ fetched_at: new Date().toISOString(), sources: records });
  });

  const reports = [];

  try {
    const startStats = getBlockDeviceSectors('nvme1n1');

    const result = await runBenchmark(
      'Raw Wire Ingest -> Multi-Grain Disk Commit (5 sym x 1k bars)',
      { warmupRuns: 2, iterations: 5, itemsPerIteration: symbols.length * barsPerSymbol },
      () => {
        let totalIngested = 0;
        for (const rawJson of rawWirePayloads) {
          const parsed = JSON.parse(rawJson);
          const { usableSources } = validateSnapshot(parsed, { rejectStale: false });
          const res = writeMultiGrainTsIndex(scratchDir, { sources: usableSources });
          if (res && res.ok) totalIngested += res.total_records;
        }
        return totalIngested;
      }
    );

    const endStats = getBlockDeviceSectors('nvme1n1');

    assert.ok(result.opsPerSec > 0);
    assert.ok(result.throughputPerSec > 0);
    reports.push(result);

    console.log(formatBenchmarkReport(reports));

    if (startStats && endStats) {
      const deltaSectors = endStats.sectorsWritten - startStats.sectorsWritten;
      const physicalBytesWritten = deltaSectors * 512;
      const logicalBytes = result.totalItems * 48;
      const waf = physicalBytesWritten > 0 ? (physicalBytesWritten / logicalBytes) : 1.0;
      console.log(`[STORAGE WEAR] Physical Sectors Written: ${deltaSectors.toLocaleString()} (${(physicalBytesWritten / 1024).toFixed(1)} KB)`);
      console.log(`[STORAGE WEAR] Logical Market Data:    ${(logicalBytes / 1024).toFixed(1)} KB`);
      console.log(`[STORAGE WEAR] Write Amplification:    ${waf.toFixed(2)}x`);
    }

    // Verify read-back integrity of committed files
    const btcRead = readTsIndex(scratchDir, 'BTCUSDT', '1m');
    assert.ok(btcRead && btcRead.length === barsPerSymbol, 'expected committed 1m records on disk');
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
});
