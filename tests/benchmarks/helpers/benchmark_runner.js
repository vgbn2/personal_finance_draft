'use strict';

/**
 * Benchmark Runner Engine
 * High-precision nanosecond performance benchmark harness with JIT warmup,
 * hardware profile simulation (SOVEREIGN_BENCH_PROFILE), CPU throttling simulation,
 * percentile metrics (p50, p90, p99), ops/sec, and heap allocation tracking.
 */

const { performance } = require('node:perf_hooks');

const BENCHMARK_PROFILES = {
  constrained_vps: {
    name: 'constrained_vps',
    label: '1-Core Low-Power Cloud VPS',
    ompThreads: 1,
    uvThreadPoolSize: 2,
    maxOldSpaceSizeMb: 512,
    simulatedGhz: 1.5,
    artificialDelayUs: 25,
    defaultConcurrency: 1,
  },
  mini_pc: {
    name: 'mini_pc',
    label: '2-Core Intel N100 / Pi 5',
    ompThreads: 2,
    uvThreadPoolSize: 4,
    maxOldSpaceSizeMb: 1024,
    simulatedGhz: 2.5,
    artificialDelayUs: 10,
    defaultConcurrency: 2,
  },
  unconstrained: {
    name: 'unconstrained',
    label: 'Workstation / Dedicated Host',
    ompThreads: null,
    uvThreadPoolSize: 4,
    maxOldSpaceSizeMb: null,
    simulatedGhz: null,
    artificialDelayUs: 0,
    defaultConcurrency: 10,
  },
};

/**
 * Resolves active benchmark hardware profile from process.env.SOVEREIGN_BENCH_PROFILE
 */
function getBenchmarkProfile() {
  const envProfile = (process.env.SOVEREIGN_BENCH_PROFILE || 'unconstrained').toLowerCase();
  const profile = BENCHMARK_PROFILES[envProfile] || BENCHMARK_PROFILES.unconstrained;

  if (profile.ompThreads && !process.env.OMP_NUM_THREADS) {
    process.env.OMP_NUM_THREADS = String(profile.ompThreads);
  }
  if (profile.uvThreadPoolSize && !process.env.UV_THREADPOOL_SIZE) {
    process.env.UV_THREADPOOL_SIZE = String(profile.uvThreadPoolSize);
  }

  return profile;
}

/**
 * Active high-precision nanosecond spin-wait delay simulating lower CPU clock frequencies.
 * @param {number} delayUs - Microsecond delay to inject
 */
function applyCpuDelay(delayUs) {
  if (!delayUs || delayUs <= 0) return;
  const start = process.hrtime.bigint();
  const targetNs = BigInt(Math.round(delayUs * 1000));
  while (process.hrtime.bigint() - start < targetNs) {
    // Spin-wait loop simulating CPU clock cycle execution delay without event loop yielding
  }
}

/**
 * Calculates statistical percentiles from a sorted array of numbers.
 * @param {number[]} samples
 * @param {number} p - Percentile (0 to 1)
 * @returns {number}
 */
function quantile(samples, p) {
  if (samples.length === 0) return 0;
  const index = (samples.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return samples[lower] * (1 - weight) + samples[upper] * weight;
}

/**
 * Filter extreme V8 GC outliers using Interquartile Range (IQR).
 * @param {number[]} samples - Nanosecond samples
 * @returns {number[]} Filtered nanosecond samples
 */
function filterOutliers(samples) {
  if (samples.length < 10) return samples;
  const sorted = [...samples].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const upperBound = q3 + 3 * iqr; // 3x IQR conservative upper fence
  return sorted.filter((s) => s <= upperBound);
}

/**
 * Runs a benchmark function with un-timed warmup iterations followed by timed sampling.
 *
 * @param {string} name - Name of the benchmark
 * @param {Object} opts - Options
 * @param {number} [opts.warmupRuns=100] - Number of un-timed warmup iterations
 * @param {number} [opts.iterations=1000] - Number of timed iterations
 * @param {number} [opts.itemsPerIteration=1] - Items/records/bars per iteration
 * @param {number} [opts.artificialDelayUs] - Override artificial delay per iteration
 * @param {Function} fn - Benchmark function to run (sync or async)
 * @returns {Promise<Object>} Benchmark result object
 */
async function runBenchmark(name, opts = {}, fn) {
  const profile = getBenchmarkProfile();
  const warmupRuns = opts.warmupRuns ?? 100;
  const iterations = opts.iterations ?? 1000;
  const itemsPerIteration = opts.itemsPerIteration ?? 1;
  const delayUs = opts.artificialDelayUs ?? profile.artificialDelayUs ?? 0;

  // Un-timed JIT Warmup
  if (typeof global.gc === 'function') {
    try { global.gc(); } catch (_) {}
  }

  for (let i = 0; i < warmupRuns; i += 1) {
    const res = fn();
    if (res && typeof res.then === 'function') await res;
    if (delayUs > 0) applyCpuDelay(delayUs);
  }

  const samplesNs = [];
  const startHeap = process.memoryUsage().heapUsed;
  const startWallMs = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    const startNs = process.hrtime.bigint();
    const res = fn();
    if (res && typeof res.then === 'function') await res;
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    samplesNs.push(elapsedNs);

    if (delayUs > 0) applyCpuDelay(delayUs);
  }

  const endWallMs = performance.now();
  const endHeap = process.memoryUsage().heapUsed;
  const heapDeltaBytes = endHeap - startHeap;

  const totalWallMs = endWallMs - startWallMs;
  const filtered = filterOutliers(samplesNs);
  const sorted = [...filtered].sort((a, b) => a - b);

  const sumNs = sorted.reduce((a, b) => a + b, 0);
  const meanNs = sumNs / sorted.length;
  const p50Ns = quantile(sorted, 0.5);
  const p90Ns = quantile(sorted, 0.9);
  const p99Ns = quantile(sorted, 0.99);

  const meanMs = meanNs / 1e6;
  const p50Ms = p50Ns / 1e6;
  const p90Ms = p90Ns / 1e6;
  const p99Ms = p99Ns / 1e6;

  const totalItems = iterations * itemsPerIteration;
  const opsPerSec = (iterations / (totalWallMs / 1000));
  const throughputPerSec = (totalItems / (totalWallMs / 1000));

  return {
    name,
    profile: profile.name,
    profileLabel: profile.label,
    ompThreads: process.env.OMP_NUM_THREADS || 'uncapped',
    uvThreadPoolSize: process.env.UV_THREADPOOL_SIZE || 'default(4)',
    artificialDelayUs: delayUs,
    iterations,
    warmupRuns,
    totalWallMs: Number(totalWallMs.toFixed(2)),
    itemsPerIteration,
    totalItems,
    opsPerSec: Number(opsPerSec.toFixed(2)),
    throughputPerSec: Number(throughputPerSec.toFixed(2)),
    latency: {
      meanMs: Number(meanMs.toFixed(4)),
      p50Ms: Number(p50Ms.toFixed(4)),
      p90Ms: Number(p90Ms.toFixed(4)),
      p99Ms: Number(p99Ms.toFixed(4)),
    },
    memory: {
      heapDeltaMb: Number((heapDeltaBytes / (1024 * 1024)).toFixed(2)),
    },
  };
}

/**
 * Formats benchmark results into a clean ASCII table.
 * @param {Object[]} results
 * @returns {string}
 */
function formatBenchmarkReport(results) {
  const profile = getBenchmarkProfile();
  const line = '-'.repeat(84);
  const header = `=== BENCHMARK REPORT [Profile: ${profile.name} (${profile.label}) | OMP: ${process.env.OMP_NUM_THREADS || 'uncapped'} | UV: ${process.env.UV_THREADPOOL_SIZE || '4'} | Delay: ${profile.artificialDelayUs}us] ===`;
  const lines = [`\n${header}`];
  lines.push(line);
  lines.push(
    `  ${'Benchmark Name'.padEnd(28)} ${'ops/sec'.padStart(10)} ${'p50 (ms)'.padStart(10)} ${'p95 (ms)'.padStart(10)} ${'p99 (ms)'.padStart(10)} ${'Heap Delta'.padStart(11)}`
  );
  lines.push(line);

  for (const res of results) {
    const nameStr = String(res.name).slice(0, 28).padEnd(28);
    const opsStr = String(res.opsPerSec.toLocaleString()).padStart(10);
    const p50Str = String(res.latency.p50Ms).padStart(10);
    const p90Str = String(res.latency.p90Ms).padStart(10);
    const p99Str = String(res.latency.p99Ms).padStart(10);
    const heapStr = `${res.memory.heapDeltaMb}MB`.padStart(11);

    lines.push(`  ${nameStr} ${opsStr} ${p50Str} ${p90Str} ${p99Str} ${heapStr}`);
  }

  lines.push(line);
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  runBenchmark,
  formatBenchmarkReport,
  getBenchmarkProfile,
  applyCpuDelay,
  filterOutliers,
  quantile,
  BENCHMARK_PROFILES,
};
