const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const { parseCsvTable, summarizeTraceRows } = require('../../../../backend/gateway/src/polymarket/index.ts');

test('parseCsvTable parses simple block explorer csv rows', () => {
  const rows = parseCsvTable([
    'Chain Name,Hash,Status,Action,Token,Value,From,From Info,To,To Info',
    'Polygon,0xabc,Success,Transfer,USDC,,0xfrom,Address,0xto,Relay: Solver',
  ].join('\n'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Chain Name'], 'Polygon');
  assert.equal(rows[0].Action, 'Transfer');
  assert.equal(rows[0]['To Info'], 'Relay: Solver');
});

test('summarizeTraceRows separates upstream vs downstream and labels solver candidates', () => {
  const summary = summarizeTraceRows([
    {
      'Chain Name': 'Polygon',
      Hash: '0x1',
      Status: 'Success',
      Action: 'Transfer',
      Token: 'USDC',
      From: '0xupstream',
      'From Info': 'Funder Wallet',
      To: '0xroot',
      'To Info': 'Deposit Wallet',
    },
    {
      'Chain Name': 'Polygon',
      Hash: '0x2',
      Status: 'Success',
      Action: 'Transfer',
      Token: 'USDC',
      From: '0xroot',
      'From Info': 'Deposit Wallet',
      To: '0xsolver',
      'To Info': 'Relay: Solver',
    },
  ], '0xroot');

  assert.equal(summary.rowCount, 2);
  assert.equal(summary.inflowCount, 1);
  assert.equal(summary.outflowCount, 1);
  assert.equal(summary.upstream[0].address, '0xupstream');
  assert.equal(summary.downstream[0].address, '0xsolver');
  assert.equal(summary.downstream[0].likely_role, 'solver_or_bridge');
  assert.deepEqual(summary.recommendedProbeAddresses, ['0xsolver']);
});
