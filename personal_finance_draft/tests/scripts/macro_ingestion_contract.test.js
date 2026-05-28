const test = require('node:test');
const assert = require('node:assert/strict');

const fsPromises = require('node:fs/promises');
const providersPath = require.resolve('../../shared/lib/providers');
const marketValidationPath = require.resolve('../../shared/lib/market_validation');
const supabasePath = require.resolve('../../shared/lib/supabase_admin');
const macroStorePath = require.resolve('../../shared/lib/macro_store');
const ingestPath = require.resolve('../../backend/scripts/data_ops/ingest_market_data');

function clearModule(modulePath) {
  delete require.cache[modulePath];
}

function withStubbedIngestEnvironment(stubs, run) {
  const originalProviders = require.cache[providersPath];
  const originalValidation = require.cache[marketValidationPath];
  const originalSupabase = require.cache[supabasePath];
  const originalMacroStore = require.cache[macroStorePath];
  const originalWriteFile = fsPromises.writeFile;
  const originalMkdir = fsPromises.mkdir;
  const originalReadFile = fsPromises.readFile;

  const realProviders = require(providersPath);

  require.cache[providersPath] = {
    id: providersPath,
    filename: providersPath,
    loaded: true,
    exports: {
      ...realProviders,
      ...stubs.providers,
    },
  };

  require.cache[marketValidationPath] = {
    id: marketValidationPath,
    filename: marketValidationPath,
    loaded: true,
    exports: {
      readSnapshot: () => ({ sources: [] }),
      recordKey: (_record, index) => `record-${index}`,
      validateSnapshot: (snapshot) => ({
        report: {
          rejected_keys: [],
          freshness: { stale_records: 0 },
          source_count: snapshot.sources.length,
        },
      }),
      mergeSnapshots: (_existing, snapshot) => snapshot,
    },
  };

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      getAdminClient: () => ({
        from: () => ({
          select: () => ({
            limit: () => ({ data: [], error: null })
          })
        })
      }),
    },
  };

  require.cache[macroStorePath] = {
    id: macroStorePath,
    filename: macroStorePath,
    loaded: true,
    exports: {
      saveMacroObservations: async () => ({
        configured: false,
        skipped: true,
        written: 0,
        records: 0,
        units: {},
      }),
    },
  };

  fsPromises.mkdir = async () => {};
  fsPromises.writeFile = async () => {};
  fsPromises.readFile = originalReadFile;

  clearModule(ingestPath);

  try {
    return run(require(ingestPath));
  } finally {
    fsPromises.writeFile = originalWriteFile;
    fsPromises.mkdir = originalMkdir;
    fsPromises.readFile = originalReadFile;

    if (originalProviders) require.cache[providersPath] = originalProviders;
    else clearModule(providersPath);

    if (originalValidation) require.cache[marketValidationPath] = originalValidation;
    else clearModule(marketValidationPath);

    if (originalSupabase) require.cache[supabasePath] = originalSupabase;
    else clearModule(supabasePath);

    if (originalMacroStore) require.cache[macroStorePath] = originalMacroStore;
    else clearModule(macroStorePath);

    clearModule(ingestPath);
  }
}

test('macro history ingest path returns canonical history rows through the full ingest entrypoint', async () => {
  await withStubbedIngestEnvironment({
    providers: {
      fetchFredHistory: async (seriesId, days) => [
        {
          family: 'macro',
          source: 'fred',
          series_id: seriesId,
          timestamp: '2026-05-01T00:00:00.000Z',
          value: 2.5,
          requested_days: days,
        },
        {
          family: 'macro',
          source: 'fred',
          series_id: seriesId,
          timestamp: '2026-05-08T00:00:00.000Z',
          value: 2.75,
          requested_days: days,
        },
      ],
    },
  }, async ({ ingestMarketData }) => {
    const snapshot = await ingestMarketData({ family: 'macro', historyDays: 30 });
    const macroRows = snapshot.sources.filter((row) => row.family === 'macro');

    assert.ok(macroRows.length > 0);
    assert.ok(macroRows.every((row) => row.source === 'fred'));
    assert.ok(macroRows.every((row) => row.series));
    assert.ok(macroRows.every((row) => typeof row.value === 'number'));
    assert.equal(snapshot.errors.length, 0);
    assert.equal(snapshot.deduplication.policy, 'provider_priority_then_quality');

    console.log(JSON.stringify({
      type: 'macro_ingest_contract',
      records: macroRows.length,
      sample_series: macroRows[0].series,
      sample_timestamp: macroRows[0].timestamp,
      quality_filter_policy: snapshot.quality_filter.policy,
    }, null, 2));
  });
});

test('reserves history ingest path keeps country and metric context through the full ingest entrypoint', async () => {
  await withStubbedIngestEnvironment({
    providers: {
      fetchWorldBankHistory: async (country, indicator, days) => [
        {
          family: 'reserves',
          source: 'worldbank',
          country_code: country,
          indicator,
          timestamp: '2025-01-01T00:00:00.000Z',
          value: 1.5,
          requested_days: days,
        },
      ],
    },
  }, async ({ ingestMarketData }) => {
    const snapshot = await ingestMarketData({ family: 'reserves', historyDays: 3650 });
    const reserveRows = snapshot.sources.filter((row) => row.family === 'reserves');

    assert.ok(reserveRows.length > 0);
    assert.ok(reserveRows.every((row) => row.source === 'worldbank'));
    assert.ok(reserveRows.every((row) => row.country));
    assert.ok(reserveRows.every((row) => row.metric));
    assert.equal(snapshot.errors.length, 0);

    console.log(JSON.stringify({
      type: 'reserves_ingest_contract',
      records: reserveRows.length,
      sample_country: reserveRows[0].country,
      sample_metric: reserveRows[0].metric,
      sample_timestamp: reserveRows[0].timestamp,
    }, null, 2));
  });
});
