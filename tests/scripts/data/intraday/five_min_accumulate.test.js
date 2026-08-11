'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const dataPath = path.resolve(REPO_ROOT, 'backend/cli/commands/data/data.js');
const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data.js');
const utilsPath = path.resolve(REPO_ROOT, 'backend/cli/lib/utils.js');

function freshData() {
  delete require.cache[dataPath];
  return require(dataPath);
}

async function runAccumulateWithStubs(cmdArgs, fakeConfig, snapshotFactory = null) {
  const ingestStub = async (...args) => (
    snapshotFactory ? snapshotFactory(...args) : { sources: [], errors: [], mode: 'test' }
  );
  ingestStub.loadConfig = async () => fakeConfig;
  ingestStub.ingestMarketData = ingestStub;

  const outputs = [];
  const realUtils = require(utilsPath);
  const utilsStub = { ...realUtils, printPayload: (payload) => outputs.push(payload) };
  const stubs = { [ingestPath]: ingestStub, [utilsPath]: utilsStub };

  const orig = Module._load;
  // audit-ignore-loader: controlled dependency fixture restored by this test scope
  Module._load = function (request, parent, isMain) {
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved && stubs[resolved]) return stubs[resolved];
    return orig.apply(this, arguments);
  };

  delete require.cache[dataPath];
  const dataMod = require(dataPath);

  let rc;
  try {
    rc = await dataMod.commandFiveMinAccumulate(cmdArgs);
  } finally {
    Module._load = orig;
    delete require.cache[dataPath];
    delete require.cache[ingestPath];
  }
  return { outputs, rc };
}

const FAKE_CONFIG = {
  indices: { symbols: ['SPX', 'NDX', 'FAKEIDX'] },
  commodities: { symbols: ['XAUUSD', 'USOIL'] },
  fx: { symbols: ['EURUSD', 'USDJPY'] },
};

test('buildFiveMinAccumulatePlan maps configured symbols across families and flags unmapped ones', () => {
  const { buildFiveMinAccumulatePlan } = freshData();
  const plan = buildFiveMinAccumulatePlan(FAKE_CONFIG, {});

  assert.strictEqual(plan.provider, 'yahoo');
  assert.strictEqual(plan.timeframe, '5m');
  const jobKeys = plan.jobs.map((j) => `${j.family}:${j.symbol}`).sort();
  assert.deepStrictEqual(jobKeys, [
    'commodities:USOIL', 'commodities:XAUUSD',
    'fx:EURUSD', 'fx:USDJPY',
    'indices:NDX', 'indices:SPX',
  ]);
  assert.deepStrictEqual(plan.skipped_symbols, [
    { family: 'indices', symbol: 'FAKEIDX', reason: 'no yahoo intraday symbol mapping' },
  ]);
});

test('buildFiveMinAccumulatePlan honors --family and --symbol filters', () => {
  const { buildFiveMinAccumulatePlan } = freshData();

  const fxOnly = buildFiveMinAccumulatePlan(FAKE_CONFIG, { family: 'fx' });
  assert.ok(fxOnly.jobs.every((j) => j.family === 'fx'));
  assert.strictEqual(fxOnly.jobs.length, 2);

  const oneSym = buildFiveMinAccumulatePlan(FAKE_CONFIG, { symbol: 'XAUUSD' });
  assert.deepStrictEqual(oneSym.jobs, [{ family: 'commodities', symbol: 'XAUUSD' }]);
  assert.strictEqual(oneSym.requested_symbol_found, true);

  assert.throws(() => buildFiveMinAccumulatePlan(FAKE_CONFIG, { family: 'bogus' }), /Invalid --family/);

  // 'all' (and blank) means no family filter -- the TUI select passes 'all'.
  const allFam = buildFiveMinAccumulatePlan(FAKE_CONFIG, { family: 'all' });
  assert.strictEqual(allFam.jobs.length, 6);
});

test('commandFiveMinAccumulate rejects --days beyond the Yahoo 5m cap and below the floor', async () => {
  for (const bad of ['60', '61']) {
    const { outputs, rc } = await runAccumulateWithStubs(['--days', bad, '--json'], FAKE_CONFIG);
    assert.strictEqual(rc, 1);
    assert.strictEqual(outputs[0].ok, false);
    assert.match(outputs[0].error, /at most --days 59/);
  }
  const low = await runAccumulateWithStubs(['--days', '3', '--json'], FAKE_CONFIG);
  assert.strictEqual(low.rc, 1);
  assert.match(low.outputs[0].error, /requires --days > 5/);
});

test('commandFiveMinAccumulate dry-run reports per-symbol plan without fetching', async () => {
  const { outputs, rc } = await runAccumulateWithStubs(['--dry-run', '--json'], FAKE_CONFIG);
  assert.strictEqual(rc, 0);
  const out = outputs[0];
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.dry_run, true);
  assert.strictEqual(out.provider, 'yahoo');
  assert.strictEqual(out.timeframe, '5m');
  assert.strictEqual(out.jobs, 6);
  assert.strictEqual(out.estimated_api_calls, 6);
  assert.strictEqual(out.skipped, 1);
  assert.strictEqual(out.job_list.length, 6);
});

test('commandFiveMinAccumulate pins yahoo/5m/force on every ingest call and accounts failures loudly', async () => {
  const calls = [];
  const { outputs, rc } = await runAccumulateWithStubs(['--json', '--delay-ms', '0'], FAKE_CONFIG, (opts) => {
    calls.push(opts);
    // EURUSD returns zero bars + an error -> must be counted as a failure.
    if (opts.symbol === 'EURUSD') return { sources: [], errors: [{ message: 'boom' }] };
    return {
      sources: [{ family: opts.family, provider: 'yahoo', symbol: opts.symbol, timeframe: '5m' }],
      errors: [],
    };
  });

  assert.strictEqual(calls.length, 6);
  for (const c of calls) {
    assert.strictEqual(c.provider, 'yahoo');
    assert.strictEqual(c.timeframe, '5m');
    assert.strictEqual(c.force, true);
    assert.ok(['indices', 'commodities', 'fx'].includes(c.family));
  }
  const out = outputs[0];
  assert.strictEqual(rc, 1);
  assert.strictEqual(out.ok, false);
  assert.ok(out.errors >= 1);
  const eur = out.symbol_results.find((r) => r.symbol === 'EURUSD');
  assert.strictEqual(eur.ok, false);
  assert.match(eur.error, /boom/);
  assert.strictEqual(out.total_5m_bars, 5);
});

test('real data_sources.yaml carries the commodity ETF proxies and the full accumulate universe', async () => {
  const { loadConfig } = require(ingestPath);
  const config = await loadConfig();

  const equitySymbols = config.equities.symbols;
  for (const etf of ['GLD', 'SLV', 'CPER', 'USO', 'BNO', 'UNG', 'WEAT', 'SOYB']) {
    assert.ok(equitySymbols.includes(etf), `equities.symbols should include ${etf}`);
  }
  assert.ok(!equitySymbols.includes('CORN'), 'CORN ETF must be excluded (ts-index bin collision)');

  const matrix = config.equities.universe_matrix;
  assert.ok(matrix.y_axis_sectors.includes('commodity_etfs'));
  assert.deepStrictEqual(
    matrix.grid.USA.commodity_etfs,
    ['GLD', 'SLV', 'CPER', 'USO', 'BNO', 'UNG', 'WEAT', 'SOYB'],
  );

  const { buildFiveMinAccumulatePlan } = freshData();
  const plan = buildFiveMinAccumulatePlan(config, {});
  assert.strictEqual(plan.jobs.length, 30, '11 indices + 9 commodities + 10 fx');
  assert.strictEqual(plan.skipped_symbols.length, 0);
});
