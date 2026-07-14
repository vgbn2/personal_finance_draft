'use strict';

/**
 * Tests for fetchPaginated's opt-in gap-aware fetch (shared/lib/data/backfill.js):
 * when options.tsDir is supplied and the ts-index already has bars covering part
 * of the requested window, only the genuinely-new tail (plus a small overlap
 * margin) is requested from the provider, instead of blindly re-walking the
 * full window every time (the old, pre-fix behavior for ALL callers).
 *
 * No network: a fake fetchFn just records what window it was asked for and
 * returns no bars (this test cares about the request window, not the data).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { fetchPaginated } = require('../../../../shared/lib/data/backfill.js');
const { writeTsIndex } = require('../../../../shared/lib/market/validation.js');

const DAY_MS = 24 * 60 * 60 * 1000;

function makeTmpTsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-paginated-gap-aware-'));
}

function seedDailyBars(tsDir, symbol, fromMs, toMs) {
  const sources = [];
  for (let t = fromMs; t <= toMs; t += DAY_MS) {
    sources.push({
      timestamp: new Date(t).toISOString(),
      open: 1, high: 1, low: 1, close: 1, volume: 1,
      symbol, family: 'crypto', timeframe: '1d', provider: 'test',
    });
  }
  writeTsIndex(tsDir, { sources }, 'live');
}

function makeRecordingFetchFn() {
  const calls = [];
  const fetchFn = async (symbol, maxBars, timeframe, startTs, endTs) => {
    calls.push({ startTs, endTs });
    return [];
  };
  return { fetchFn, calls };
}

test('fetchPaginated without options.tsDir is unaffected (existing behavior for all other callers)', async () => {
  const { fetchFn, calls } = makeRecordingFetchFn();
  const now = Date.now();
  await fetchPaginated('BTCUSDT', '1d', 30, 'crypto', fetchFn, now); // no options at all
  assert.equal(calls.length, 1);
  assert.equal(calls[0].startTs, now - 30 * DAY_MS, 'walks the full requested window when tsDir is not supplied');
});

test('fetchPaginated narrows the fetch window when the ts-index already covers the tail of the request', async () => {
  const tsDir = makeTmpTsDir();
  try {
    const now = Date.now();
    seedDailyBars(tsDir, 'BTCUSDT', now - 10 * DAY_MS, now - 2 * DAY_MS);

    const { fetchFn, calls } = makeRecordingFetchFn();
    const result = await fetchPaginated('BTCUSDT', '1d', 30, 'crypto', fetchFn, now, { tsDir });

    assert.equal(calls.length, 1);
    // Narrowed to 1 day before the last covered bar (now-2d), not the full 30-day ask.
    assert.equal(calls[0].startTs, now - 3 * DAY_MS);
    assert.equal(calls[0].endTs, now);

    assert.ok(result.backfillMeta.gap_aware, 'metadata flags that gap-aware narrowing happened');
    assert.equal(result.backfillMeta.gap_aware.narrowed_to_start_ts, now - 3 * DAY_MS);
    assert.equal(result.backfillMeta.requested_start_ts, now - 30 * DAY_MS,
      'the metadata still reports the original full ask, separately from what was actually narrowed/fetched');
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('fetchPaginated does not narrow when existing coverage does not reach the requested window at all', async () => {
  const tsDir = makeTmpTsDir();
  try {
    const now = Date.now();
    // Existing data is old and stale -- far older than the requested 30-day window.
    seedDailyBars(tsDir, 'BTCUSDT', now - 200 * DAY_MS, now - 100 * DAY_MS);

    const { fetchFn, calls } = makeRecordingFetchFn();
    const result = await fetchPaginated('BTCUSDT', '1d', 30, 'crypto', fetchFn, now, { tsDir });

    assert.equal(calls[0].startTs, now - 30 * DAY_MS, 'falls back to the full window -- stale coverage has nothing useful to skip');
    assert.equal(result.backfillMeta.gap_aware, null);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('fetchPaginated falls back to the full window when no coverage exists yet for the symbol', async () => {
  const tsDir = makeTmpTsDir(); // empty -- never backfilled
  try {
    const now = Date.now();
    const { fetchFn, calls } = makeRecordingFetchFn();
    const result = await fetchPaginated('NEVERFETCHED', '1d', 30, 'crypto', fetchFn, now, { tsDir });

    assert.equal(calls[0].startTs, now - 30 * DAY_MS);
    assert.equal(result.backfillMeta.gap_aware, null);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('fetchPaginated treats a coverage-probe error as best-effort and still completes the full fetch', async () => {
  const now = Date.now();
  const { fetchFn, calls } = makeRecordingFetchFn();
  // A tsDir that doesn't exist on disk -- readCoverage handles this internally
  // (returns "not exists"), so this also doubles as a not-a-real-directory check.
  const bogusTsDir = path.join(os.tmpdir(), 'fetch-paginated-gap-aware-does-not-exist-' + Date.now());
  const result = await fetchPaginated('BTCUSDT', '1d', 30, 'crypto', fetchFn, now, { tsDir: bogusTsDir });
  assert.equal(calls[0].startTs, now - 30 * DAY_MS);
  assert.equal(result.backfillMeta.gap_aware, null);
});
