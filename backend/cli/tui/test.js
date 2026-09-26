const assert = require('node:assert');
const test = require('node:test');
const MANIFEST = require('./manifest');
const { findCommandSpec, handleIntersection } = require('./intersection');

test('TUI/CLI Manifest Integrity', (t) => {
  assert.ok(MANIFEST.categories.length > 0, 'Should have categories');
  assert.ok(MANIFEST.commands.op, 'Should have operational commands');

  const backendStats = MANIFEST.commands.backend.find(c => c.id === 'stats');
  assert.deepStrictEqual(backendStats.prefix, ['backend'], 'Backend stats should route through backend');
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

  const backendStats = findCommandSpec(['backend', 'stats']);
  assert.equal(backendStats.spec.id, 'stats');
  assert.deepStrictEqual(backendStats.spec.prefix, ['backend']);
  assert.equal(backendStats.pathLength, 2);

  const integrity = findCommandSpec(['backend', 'integrity']);
  assert.equal(integrity.spec.id, 'integrity');
  assert.equal(integrity.pathLength, 2);

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

test('Manifest Utils - Timeframe Options', (t) => {
  const timeframes = MANIFEST.commands.backend.find(c => c.id === 'correlation').flags['--timeframe'].options();
  assert.ok(Array.isArray(timeframes), 'Timeframes should be an array');
  assert.ok(timeframes.length > 0, 'Should return some timeframe options');
});
