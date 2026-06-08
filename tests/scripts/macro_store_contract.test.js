const test = require('node:test');
const assert = require('node:assert/strict');

const helperPath = require.resolve('../../shared/lib/data/macro_store');
const supabaseJsPath = require.resolve('@supabase/supabase-js');

function withStubbedSupabaseClient(run) {
  const originalSupabase = require.cache[supabaseJsPath];
  const originalHelper = require.cache[helperPath];

  const calls = [];
  require.cache[supabaseJsPath] = {
    id: supabaseJsPath,
    filename: supabaseJsPath,
    loaded: true,
    exports: {
      createClient: () => ({
        from: (table) => ({
          upsert: async (rows, options) => {
            calls.push({ table, rows, options });
            return { error: null };
          },
        }),
      }),
    },
  };

  delete require.cache[helperPath];

  try {
    return run({
      ...require(helperPath),
      calls,
    });
  } finally {
    if (originalSupabase) require.cache[supabaseJsPath] = originalSupabase;
    else delete require.cache[supabaseJsPath];

    if (originalHelper) require.cache[helperPath] = originalHelper;
    else delete require.cache[helperPath];
  }
}

test('macro store normalizes mixed macro units into a canonical unitless feature', async () => {
  const envSnapshot = {
    SOVEREIGN_SUPABASE_URL: process.env.SOVEREIGN_SUPABASE_URL,
    SOVEREIGN_SUPABASE_SECRET_KEY: process.env.SOVEREIGN_SUPABASE_SECRET_KEY,
  };

  process.env.SOVEREIGN_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY = 'service-role-secret';

  await withStubbedSupabaseClient(async ({ normalizeMacroObservation, signedLog1p, buildMacroObservationRows }) => {
    const cpi = {
      family: 'macro',
      series: 'CPI',
      series_id: 'CPIAUCSL',
      source: 'fred',
      timestamp: '2026-04-01T00:00:00.000Z',
      value: 332.407,
    };
    const adp = {
      family: 'macro',
      series: 'ADP',
      series_id: 'ADPWNUSNERSA',
      source: 'fred',
      timestamp: '2026-03-14T00:00:00.000Z',
      value: 132295000,
    };

    const normalizedCpi = normalizeMacroObservation(cpi);
    const normalizedAdp = normalizeMacroObservation(adp);

    assert.equal(normalizedCpi.unit, 'index_points');
    assert.equal(normalizedAdp.unit, 'count');
    assert.equal(normalizedCpi.normalization_method, 'signed_log1p');
    assert.equal(normalizedCpi.normalized_value, signedLog1p(332.407));
    assert.equal(normalizedAdp.normalized_value, signedLog1p(132295000));

    const rows = buildMacroObservationRows([
      cpi,
      adp,
      {
        family: 'reserves',
        source: 'worldbank',
        country_code: 'USA',
        indicator: 'FI.RES.TOTL.CD',
        timestamp: '2025-01-01T00:00:00.000Z',
        value: 1.5,
      },
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].series, 'CPI');
    assert.equal(rows[1].series, 'ADP');
    assert.equal(rows[0].observed_at, '2026-04-01T00:00:00.000Z');
  });

  process.env.SOVEREIGN_SUPABASE_URL = envSnapshot.SOVEREIGN_SUPABASE_URL;
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY = envSnapshot.SOVEREIGN_SUPABASE_SECRET_KEY;
});

test('macro store writes canonical rows to Supabase in one batch', async () => {
  const envSnapshot = {
    SOVEREIGN_SUPABASE_URL: process.env.SOVEREIGN_SUPABASE_URL,
    SOVEREIGN_SUPABASE_SECRET_KEY: process.env.SOVEREIGN_SUPABASE_SECRET_KEY,
  };

  process.env.SOVEREIGN_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY = 'service-role-secret';

  await withStubbedSupabaseClient(async ({ saveMacroObservations, calls }) => {
    const result = await saveMacroObservations([
      {
        family: 'macro',
        series: 'CPI',
        series_id: 'CPIAUCSL',
        source: 'fred',
        timestamp: '2026-04-01T00:00:00.000Z',
        value: 332.407,
      },
      {
        family: 'macro',
        series: 'ADP',
        series_id: 'ADPWNUSNERSA',
        source: 'fred',
        timestamp: '2026-03-14T00:00:00.000Z',
        value: 132295000,
      },
    ]);

    assert.equal(result.configured, true);
    assert.equal(result.skipped, false);
    assert.equal(result.written, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, 'macro_observations');
    assert.equal(calls[0].options.onConflict, 'family,series,observed_at');
    assert.equal(calls[0].rows.length, 2);
    assert.equal(calls[0].rows[0].unit, 'index_points');
    assert.equal(calls[0].rows[1].unit, 'count');
  });

  process.env.SOVEREIGN_SUPABASE_URL = envSnapshot.SOVEREIGN_SUPABASE_URL;
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY = envSnapshot.SOVEREIGN_SUPABASE_SECRET_KEY;
});
