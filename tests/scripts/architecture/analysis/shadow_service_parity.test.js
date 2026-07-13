'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { buildRecordedAppleShadow } = require('../../../../shared/lib/analysis/services/equity_3m_shadow');
const { buildScorecard, renderShadowCatalog } = require('../../../../backend/cli/commands/research/scorecard');
const { backendScorecard } = require('../../../../backend/api/server/services/cli_executor');
const { buildAllRecordedShadowCatalog } = require('../../../../shared/lib/analysis/services/shadow_catalog');

test('canonical service, CLI adapter, and API adapter return identical schema-v3 shadow output', async () => {
  const service = buildRecordedAppleShadow();
  const cliAdapter = await buildScorecard(['--schema', '3', '--fixture', 'aapl-recorded']);
  const apiAdapter = await backendScorecard({ schema: '3', fixture: 'aapl-recorded' });
  assert.deepEqual(cliAdapter, service);
  assert.deepEqual(apiAdapter, service);

  const { NODE_TEST_CONTEXT: _testContext, ...childEnv } = process.env;
  const cli = spawnSync(process.execPath, [path.resolve('backend/cli/sovereign_cli.js'), 'scorecard', '--schema', '3', '--fixture', 'aapl-recorded', '--json'], {
    cwd: path.resolve('.'), encoding: 'utf8', env: { ...childEnv, NO_COLOR: '1' },
  });
  assert.equal(cli.error, undefined, cli.error?.message);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), service);
  assert.equal(service.research_only, true);
  assert.equal(service.decision_ready, false);
  assert.equal(service.schema_version, 3);
  assert.equal(service.rows.length, 1);
  console.log(`shadow parity: service=1 cli=1 api=1 bytes=${Buffer.byteLength(JSON.stringify(service))} rows=${service.rows.length} sec_observations=${service.counts.sec_observations}`);
});

test('all-recorded catalog is identical through service, CLI, and API adapters', async () => {
  const service = buildAllRecordedShadowCatalog();
  const cliAdapter = await buildScorecard(['--schema', '3', '--fixture', 'all-recorded']);
  const apiAdapter = await backendScorecard({ schema: '3', fixture: 'all-recorded' });
  assert.deepEqual(cliAdapter, service);
  assert.deepEqual(apiAdapter, service);
  assert.equal(service.rows.length, 7);
  assert.deepEqual(service.counts, { rows: 7, eligible: 0, degraded: 4, excluded: 3, recorded_provider_envelopes: 7 });
  assert.equal(service.research_only, true);
  assert.equal(service.decision_ready, false);
  console.log(`shadow catalog parity: rows=${service.counts.rows} eligible=${service.counts.eligible} degraded=${service.counts.degraded} excluded=${service.counts.excluded}`);
});

test('terminal research screener and asset workbench stay compact and expose evidence', async () => {
  const crypto = await buildScorecard(['--schema', '3', '--fixture', 'all-recorded', '--family', 'crypto', '--state', 'excluded']);
  assert.equal(crypto.rows.length, 2);
  assert.deepEqual(crypto.rows.map((row) => row.asset_descriptor.symbol), ['BTC', 'ETH']);
  const rankedCrypto = await buildScorecard(['--schema', '3', '--fixture', 'all-recorded', '--family', 'crypto']);
  assert.deepEqual(rankedCrypto.rows.map((row) => row.asset_descriptor.symbol), ['AAVE', 'BTC', 'ETH']);
  assert.deepEqual(rankedCrypto.rows.map((row) => row.decision_state), ['degraded', 'excluded', 'excluded']);
  const workbench = await buildScorecard(['--schema', '3', '--fixture', 'all-recorded', '--symbol', 'CL']);
  assert.equal(workbench.rows.length, 1);
  assert.equal(workbench.rows[0].asset_descriptor.family, 'commodity');
  for (const width of [80, 100, 120]) {
    const output = renderShadowCatalog(workbench, { width });
    assert.ok(output.includes('NOT DECISION-READY'));
    assert.ok(output.includes('factors:'));
    assert.ok(output.includes('evidence:'));
    assert.ok(output.split('\n').every((line) => line.length <= width));
  }
  console.log('terminal research UI: family_screener=2 asset_workbench=CL widths=80,100,120');
});

test('schema-v3 adapters reject unnamed fixtures and schema-v2 remains the default', async () => {
  const cliRejected = await buildScorecard(['--schema', '3']);
  const apiRejected = await backendScorecard({ schema: '3' });
  assert.equal(cliRejected.ok, false);
  assert.equal(apiRejected.ok, false);
  assert.equal(apiRejected.error_code, 'invalid_fixture');

  const v2 = await buildScorecard(['--family', 'equities'], { universeLoader: async () => [] });
  assert.equal(v2.ok, false);
  assert.equal(v2.schema_version, undefined);
  console.log('shadow gating: unnamed_fixture=reject schema_v2_default=unchanged');
});
