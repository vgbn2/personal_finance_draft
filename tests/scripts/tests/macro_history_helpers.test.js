const test = require('node:test');
const assert = require('node:assert/strict');

const commonPath = require.resolve('../lib/providers/common');
const macroPath = require.resolve('../lib/providers/macro');

function withStubbedCommon(fetchJsonImpl, run) {
  const originalCommon = require.cache[commonPath];
  const originalMacro = require.cache[macroPath];

  require.cache[commonPath] = {
    id: commonPath,
    filename: commonPath,
    loaded: true,
    exports: { fetchJson: fetchJsonImpl },
  };

  delete require.cache[macroPath];

  try {
    return run(require(macroPath));
  } finally {
    if (originalCommon) {
      require.cache[commonPath] = originalCommon;
    } else {
      delete require.cache[commonPath];
    }

    if (originalMacro) {
      require.cache[macroPath] = originalMacro;
    } else {
      delete require.cache[macroPath];
    }
  }
}

test('fetchFredHistory maps FRED observations into canonical rows', async () => {
  process.env.FRED_API_KEY = 'test-key';
  await withStubbedCommon(async (url) => {
    assert.match(url, /fred\/series\/observations/);
    return {
      observations: [
        { date: '2026-05-01', value: '2.5' },
        { date: '2026-05-08', value: '2.75' },
      ],
    };
  }, async ({ fetchFredHistory }) => {
    const rows = await fetchFredHistory('GDP', 30);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].source, 'fred');
    assert.equal(rows[0].timestamp, '2026-05-01T00:00:00.000Z');
    assert.equal(rows[0].value, 2.5);
    assert.equal(rows[1].value, 2.75);
  });
});

test('fetchWorldBankHistory maps World Bank observations into canonical rows', async () => {
  await withStubbedCommon(async (url) => {
    assert.match(url, /worldbank\.org/);
    return [
      null,
      [
        { date: '2025', value: '1.5' },
        { date: '2024', value: null },
        { date: '2023M12', value: '1.25' },
      ],
    ];
  }, async ({ fetchWorldBankHistory }) => {
    const rows = await fetchWorldBankHistory('US', 'NY.GDP.MKTP.KD.ZG', 3650);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].source, 'worldbank');
    assert.equal(rows[0].timestamp, '2025-01-01T00:00:00.000Z');
    assert.equal(rows[0].value, 1.5);
    assert.equal(rows[1].timestamp, '2023-12-01T00:00:00.000Z');
    assert.equal(rows[1].value, 1.25);
  });
});

