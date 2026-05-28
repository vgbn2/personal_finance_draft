const assert = require('node:assert');
const test = require('node:test');
const MANIFEST = require('./manifest');
const { findCommandSpec, handleIntersection } = require('./intersection');

test('TUI/CLI Manifest Integrity', (t) => {
  assert.ok(MANIFEST.categories.length > 0, 'Should have categories');
  assert.ok(MANIFEST.commands.op, 'Should have operational commands');
  
  // Verify prefixes
  const backendSummary = MANIFEST.commands.backend.find(c => c.id === 'summary');
  assert.deepStrictEqual(backendSummary.prefix, ['backend', 'data'], 'Backend summary should route through backend data');
});

test('Intersection Logic - Command Matching', async (t) => {
  let executedArgs = null;
  const handlerSpy = (args) => { executedArgs = args; };

  await handleIntersection(['status'], handlerSpy);
  assert.deepStrictEqual(executedArgs, ['status'], 'Should pass through simple command');

  await handleIntersection(['backend', 'status'], handlerSpy);
  assert.deepStrictEqual(executedArgs, ['backend', 'status'], 'Should pass through prefixed command');
});

test('Intersection Logic - Manifest Path Resolution', (t) => {
  const status = findCommandSpec(['status']);
  assert.equal(status.spec.id, 'status');
  assert.equal(status.pathLength, 1);

  const backendSummary = findCommandSpec(['backend', 'data', 'summary']);
  assert.equal(backendSummary.spec.id, 'summary');
  assert.deepStrictEqual(backendSummary.spec.prefix, ['backend', 'data']);
  assert.equal(backendSummary.pathLength, 3);

  const strategyNew = findCommandSpec(['strategy', 'new']);
  assert.equal(strategyNew.spec.id, 'new');
  assert.equal(strategyNew.pathLength, 2);

  assert.equal(findCommandSpec(['unknown-command']), null);
});

test('Intersection Logic - Flag Preservation', async (t) => {
  let executedArgs = null;
  const handlerSpy = (args) => { executedArgs = args; };

  await handleIntersection(['bt', '--timeframe', '1d', '--sample'], handlerSpy);
  assert.ok(executedArgs.includes('--timeframe'), 'Should keep provided flags');
  assert.ok(executedArgs.includes('1d'), 'Should keep provided flag values');
  assert.ok(executedArgs.includes('--sample'), 'Should keep provided boolean flags');
});

test('Manifest Utils - Symbol Fetching', (t) => {
  // This depends on the cache file existing, but getCachedSymbols has a fallback
  const symbols = MANIFEST.commands.backend.find(c => c.id === 'summary').flags['--symbol'].options();
  assert.ok(Array.isArray(symbols), 'Symbols should be an array');
  assert.ok(symbols.length > 0, 'Should return some symbols');
});
