'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Helpers — build a minimal fake ts-index tree in a temp dir
// ---------------------------------------------------------------------------
function makeFakeTsDir(symbols) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-ts-test-'));
  for (const sym of symbols) {
    fs.writeFileSync(
      path.join(dir, `${sym}_1d.meta.json`),
      JSON.stringify({ symbol: sym, timeframe: '1d', family: 'crypto', provider: 'binance', count: 60 })
    );
  }
  return dir;
}

function makeBars(symbol, count = 60) {
  const bars = [];
  const base = Date.now() - count * 86400000;
  for (let i = 0; i < count; i++) {
    bars.push({
      family: 'crypto', provider: 'binance', symbol,
      timeframe: '1d',
      timestamp: new Date(base + i * 86400000).toISOString(),
      open: 50000 + i * 10, high: 50100 + i * 10,
      low: 49900 + i * 10, close: 50050 + i * 10, volume: 100,
    });
  }
  return bars;
}

// ---------------------------------------------------------------------------
// Test 1 — fallback fires when family is known and no explicit --input
// ---------------------------------------------------------------------------
test('loadUsableSources falls back to ts-index when family is known', () => {
  const tsDir = makeFakeTsDir(['BTCUSDT', 'ETHUSDT']);

  const origLoad = Module._load.bind(Module);
  Module._load = function (request, parent, isMain) {
    if (request.endsWith('paths.js')) {
      return { ...origLoad(request, parent, isMain), STORAGE_TS_DIR: tsDir };
    }
    if (request.endsWith('validation.js')) {
      const real = origLoad(request, parent, isMain);
      return {
        ...real,
        readTsIndexSince: (dir, sym) => makeBars(sym, 60),
      };
    }
    return origLoad(request, parent, isMain);
  };

  try {
    // Force re-require so stubs are applied
    delete require.cache[require.resolve('../../../backend/cli/commands/research/research_sources.js')];
    const { loadUsableSources } = require('../../../backend/cli/commands/research/research_sources.js');

    const result = loadUsableSources([], { family: 'crypto' });
    assert.equal(result.snapshot.mode, 'ts_index', 'should have loaded from ts-index');
    assert.ok(result.snapshot.sources.length >= 50, `expected >=50 sources, got ${result.snapshot.sources.length}`);
    assert.equal(result.loaded_family, 'crypto');
  } finally {
    Module._load = origLoad;
    delete require.cache[require.resolve('../../../backend/cli/commands/research/research_sources.js')];
  }
});

// ---------------------------------------------------------------------------
// Test 2 — explicit --input bypasses the ts-index fallback
// ---------------------------------------------------------------------------
test('loadUsableSources respects explicit --input and skips ts-index fallback', () => {
  const tsDir = makeFakeTsDir(['BTCUSDT']);
  // Write a tiny explicit input file with just 3 sources
  const inputFile = path.join(tsDir, 'custom_input.json');
  fs.writeFileSync(inputFile, JSON.stringify({
    mode: 'custom', sources: [
      { family: 'crypto', provider: 'test', symbol: 'BTCUSDT', timeframe: '1d', timestamp: new Date().toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ], errors: [],
  }));

  const origLoad = Module._load.bind(Module);
  Module._load = function (request, parent, isMain) {
    if (request.endsWith('paths.js')) {
      return { ...origLoad(request, parent, isMain), STORAGE_TS_DIR: tsDir };
    }
    if (request.endsWith('validation.js')) {
      const real = origLoad(request, parent, isMain);
      return { ...real, readTsIndexSince: () => makeBars('BTCUSDT', 60) };
    }
    return origLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('../../../backend/cli/commands/research/research_sources.js')];
    const { loadUsableSources } = require('../../../backend/cli/commands/research/research_sources.js');

    const result = loadUsableSources(['--input', inputFile], { family: 'crypto' });
    assert.equal(result.snapshot.mode, 'custom', 'explicit --input should be honoured, not overridden by ts-index fallback');
  } finally {
    Module._load = origLoad;
    delete require.cache[require.resolve('../../../backend/cli/commands/research/research_sources.js')];
  }
});

// ---------------------------------------------------------------------------
// Test 3 — fallback does not fire when no family is passed
// ---------------------------------------------------------------------------
test('loadUsableSources does not fall back when family is not specified', () => {
  const tsDir = makeFakeTsDir(['BTCUSDT']);

  const origLoad = Module._load.bind(Module);
  let tsIndexCalled = false;
  Module._load = function (request, parent, isMain) {
    if (request.endsWith('paths.js')) {
      return { ...origLoad(request, parent, isMain), STORAGE_TS_DIR: tsDir };
    }
    if (request.endsWith('validation.js')) {
      const real = origLoad(request, parent, isMain);
      return {
        ...real,
        readTsIndexSince: (...args) => { tsIndexCalled = true; return makeBars('BTCUSDT', 60); },
      };
    }
    return origLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('../../../backend/cli/commands/research/research_sources.js')];
    const { loadUsableSources } = require('../../../backend/cli/commands/research/research_sources.js');

    loadUsableSources([], {}); // no family
    assert.equal(tsIndexCalled, false, 'ts-index should not be read when family is unknown');
  } finally {
    Module._load = origLoad;
    delete require.cache[require.resolve('../../../backend/cli/commands/research/research_sources.js')];
  }
});
