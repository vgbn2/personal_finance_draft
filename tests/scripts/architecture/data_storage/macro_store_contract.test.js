const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const helperPath = require.resolve('../../../../shared/lib/data/macro_store');
const supabaseJsPath = require.resolve('@supabase/supabase-js');

function withStubbedSupabaseClient(run) {
  const originalSupabase = require.cache[supabaseJsPath];
  const originalHelper = require.cache[helperPath];

  const calls = [];
  // audit-ignore-loader: controlled dependency fixture restored by this test scope
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
    assert.equal(normalizedCpi.point_in_time_eligible, false);

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
    assert.equal(calls[0].options.onConflict, 'revision_id');
    assert.equal(calls[0].rows.length, 2);
    assert.equal(calls[0].rows[0].unit, 'index_points');
    assert.equal(calls[0].rows[1].unit, 'count');
  });

  process.env.SOVEREIGN_SUPABASE_URL = envSnapshot.SOVEREIGN_SUPABASE_URL;
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY = envSnapshot.SOVEREIGN_SUPABASE_SECRET_KEY;
});

test('macro point-in-time selection excludes revisions unavailable at the decision time', async () => {
  await withStubbedSupabaseClient(async ({ buildMacroObservationRows, selectMacroObservationsAsOf }) => {
    const revisions = [
      {
        family: 'macro', series: 'GDP', source: 'fred', period_end: '2026-03-31T00:00:00.000Z',
        released_at: '2026-04-29T12:30:00.000Z', available_at: '2026-04-29T12:30:00.000Z',
        ingested_at: '2026-04-29T12:31:00.000Z', vintage: 'advance', value: 100,
      },
      {
        family: 'macro', series: 'GDP', source: 'fred', period_end: '2026-03-31T00:00:00.000Z',
        released_at: '2026-05-28T12:30:00.000Z', available_at: '2026-05-28T12:30:00.000Z',
        ingested_at: '2026-05-28T12:31:00.000Z', vintage: 'second', value: 102,
      },
      {
        family: 'macro', series: 'GDP', source: 'fred', period_end: '2026-03-31T00:00:00.000Z',
        released_at: '2026-04-30T12:30:00.000Z', available_at: '2026-04-30T12:30:00.000Z',
        ingested_at: '2026-05-10T12:31:00.000Z', vintage: 'delayed_ingest', value: 101,
      },
      {
        family: 'macro', series: 'GDP', source: 'fred', period_end: '2026-03-31T00:00:00.000Z',
        timestamp: '2026-03-31T00:00:00.000Z', value: 103,
      },
    ];

    const normalized = buildMacroObservationRows(revisions);
    const early = selectMacroObservationsAsOf(revisions, '2026-05-01T00:00:00.000Z');
    const late = selectMacroObservationsAsOf(revisions, '2026-06-01T00:00:00.000Z');

    assert.equal(normalized.length, 4);
    assert.equal(normalized.filter((row) => row.point_in_time_eligible).length, 3);
    assert.equal(early.length, 1);
    assert.equal(early[0].value, 100);
    assert.equal(early[0].vintage, 'advance');
    assert.equal(late.length, 1);
    assert.equal(late[0].value, 102);
    assert.equal(late[0].vintage, 'second');
    assert.notEqual(normalized[0].revision_id, normalized[1].revision_id);

    console.log(JSON.stringify({
      type: 'macro_point_in_time', input: revisions.length, eligible: 3, legacy_rejected: 1,
      early_visible: early.length, early_value: early[0].value, late_value: late[0].value,
    }));
  });
});

test('macro point-in-time migration preserves revisions and enforces timestamp order', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '../../../../supabase/migrations/20260713090000_macro_observations_point_in_time.sql',
  ), 'utf8');

  for (const column of ['period_end', 'released_at', 'available_at', 'ingested_at', 'vintage', 'revision_id', 'point_in_time_eligible']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
  }
  assert.match(migration, /UNIQUE INDEX[^;]+revision_id/s);
  assert.match(migration, /available_at >= released_at/);
  assert.match(migration, /ingested_at >= available_at/);
});
