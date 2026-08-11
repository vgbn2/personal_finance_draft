'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  endpointClass,
  normalizeError,
  runAlpacaPaperAuthDiagnostic,
} = require('../../../shared/lib/brokers/alpaca_paper_auth_diagnostic.js');

const paperEnv = {
  ALPACA_PAPER_API_KEY: 'paper-key-not-for-output',
  ALPACA_PAPER_SECRET_KEY: 'paper-secret-not-for-output',
  ALPACA_PAPER_BASE_URL: 'https://paper-api.alpaca.markets',
};

test('Alpaca Paper auth diagnostic reports accepted raw and SDK account reads without account data', async () => {
  const payload = await runAlpacaPaperAuthDiagnostic({
    env: paperEnv,
    rawAccount: async () => ({ id: 'must-not-appear' }),
    sdkAccount: async () => ({ id: 'must-not-appear' }),
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'paper');
  assert.equal(payload.endpoint_class, 'alpaca_paper');
  assert.deepEqual(payload.paths.map((path) => path.outcome), ['accepted', 'accepted']);
  assert.doesNotMatch(JSON.stringify(payload), /paper-key-not-for-output|paper-secret-not-for-output|must-not-appear/);
});

test('Alpaca Paper auth diagnostic classifies a matched 401 rejection without provider bodies', async () => {
  const rejected = Object.assign(new Error('provider body must not appear'), { status: 401 });
  const payload = await runAlpacaPaperAuthDiagnostic({
    env: paperEnv,
    rawAccount: async () => { throw rejected; },
    sdkAccount: async () => { throw rejected; },
  });
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.paths.map((path) => path.outcome), ['rejected', 'rejected']);
  assert.deepEqual(payload.paths.map((path) => path.error_code), ['authentication_rejected', 'authentication_rejected']);
  assert.deepEqual(payload.paths.map((path) => path.http_status), [401, 401]);
  assert.doesNotMatch(JSON.stringify(payload), /provider body/);
});

test('Alpaca Paper auth diagnostic distinguishes transport failure and invalid endpoint configuration', async () => {
  const timeout = Object.assign(new Error('socket detail must not appear'), { code: 'ETIMEDOUT' });
  const transport = await runAlpacaPaperAuthDiagnostic({
    env: paperEnv,
    rawAccount: async () => { throw timeout; },
    sdkAccount: async () => { throw timeout; },
  });
  assert.deepEqual(transport.paths.map((path) => path.error_code), ['provider_transport_unavailable', 'provider_transport_unavailable']);

  const invalid = await runAlpacaPaperAuthDiagnostic({
    env: { ...paperEnv, ALPACA_PAPER_BASE_URL: 'https://api.alpaca.markets' },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.endpoint_class, 'unexpected_endpoint');
  assert.deepEqual(invalid.paths.map((path) => path.outcome), ['not_configured', 'not_configured']);
  assert.equal(endpointClass('not a url'), 'invalid_endpoint');
  assert.equal(normalizeError({ status: 429 }).outcome, 'rate_limited');
});
