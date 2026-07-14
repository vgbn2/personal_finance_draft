const assert = require('node:assert/strict');
const test = require('node:test');

const { parseCsvTable, summarizeTraceRows } = require('../../../../backend/gateway/src/polymarket_trace.js');

test('parseCsvTable parses simple block explorer csv rows', () => {
  const rows = parseCsvTable([
    'Chain Name,Hash,Status,Action,Token,Value,From,From Info,To,To Info',
    'Polygon,0xabc,Success,Transfer,USDC,,0xfrom,Address,0xto,Relay: Solver',
  ].join('\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Hash, '0xabc');
  assert.equal(rows[0]['To Info'], 'Relay: Solver');
});

test('summarizeTraceRows groups inflows and downstream solver candidates', () => {
  const rows = parseCsvTable([
    'Chain Name,Hash,Status,Action,Token,Value,From,From Info,To,To Info',
    'Polygon,0x1,Success,Transfer,USDC,,0xup,Exchange,0xroot,Address',
    'Polygon,0x2,Success,0x765e827f,USDT0,,0xroot,Address,0xsolver,Relay: Solver',
    'Polygon,0x3,Success,0x34FCD5BE,polygon,,0xroot,Address,0xbridge,Address',
  ].join('\n'));
  const summary = summarizeTraceRows(rows, '0xroot');
  assert.equal(summary.inflowCount, 1);
  assert.equal(summary.outflowCount, 2);
  assert.equal(summary.upstream[0].address, '0xup');
  assert.equal(summary.downstream[0].address, '0xbridge');
  assert.equal(summary.downstream[1].likely_role, 'solver_or_bridge');
  assert.deepEqual(summary.recommendedProbeAddresses, ['0xbridge', '0xsolver']);
});
