'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyPin } = require('../../../../backend/cli/lib/auth');

function withEnvironment(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test('mock authentication never bypasses the trade PIN', () => {
  withEnvironment('SOVEREIGN_MOCK', 'true', () => {
    assert.equal(verifyPin('wrong-pin', 'correct-pin'), false);
    assert.equal(verifyPin('correct-pin', 'correct-pin'), true);
    assert.equal(verifyPin('', ''), false);
  });
});
