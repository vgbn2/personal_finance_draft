'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  LIVE_BASE_URL,
  PAPER_BASE_URL,
  resolveAlpacaSettings,
} = require('../../../../shared/lib/brokers/alpaca_env.js');

test('explicit Alpaca Paper scope selects only Paper credentials', () => {
  const settings = resolveAlpacaSettings({
    ALPACA_PAPER_API_KEY: 'paper-key',
    ALPACA_PAPER_SECRET_KEY: 'paper-secret',
    ALPACA_PAPER_BASE_URL: PAPER_BASE_URL,
    ALPACA_LIVE_API_KEY: 'live-key',
    ALPACA_LIVE_SECRET_KEY: 'live-secret',
    ALPACA_LIVE_BASE_URL: LIVE_BASE_URL,
  }, { paper: true });

  assert.deepEqual(settings, {
    baseUrl: PAPER_BASE_URL,
    keyId: 'paper-key',
    secretKey: 'paper-secret',
    paper: true,
    credentialScope: 'paper',
  });
});

test('explicit Alpaca Live scope selects only Live credentials', () => {
  const settings = resolveAlpacaSettings({
    ALPACA_PAPER_API_KEY: 'paper-key',
    ALPACA_PAPER_SECRET_KEY: 'paper-secret',
    ALPACA_LIVE_API_KEY: 'live-key',
    ALPACA_LIVE_SECRET_KEY: 'live-secret',
    ALPACA_LIVE_BASE_URL: LIVE_BASE_URL,
  }, { paper: false });

  assert.deepEqual(settings, {
    baseUrl: LIVE_BASE_URL,
    keyId: 'live-key',
    secretKey: 'live-secret',
    paper: false,
    credentialScope: 'live',
  });
});

test('legacy credentials fall back only when their base matches the requested scope', () => {
  const legacyPaper = {
    ALPACA_API_KEY: 'legacy-paper-key',
    ALPACA_SECRET_KEY: 'legacy-paper-secret',
    ALPACA_BASE_URL: PAPER_BASE_URL,
  };

  assert.equal(resolveAlpacaSettings(legacyPaper, { paper: true }).keyId, 'legacy-paper-key');
  assert.equal(resolveAlpacaSettings(legacyPaper, { paper: false }).keyId, null);
  assert.equal(resolveAlpacaSettings(legacyPaper, { paper: false }).secretKey, null);
});

test('Paper settings are the safe default when both scoped credential sets exist', () => {
  const settings = resolveAlpacaSettings({
    ALPACA_PAPER_API_KEY: 'paper-key',
    ALPACA_PAPER_SECRET_KEY: 'paper-secret',
    ALPACA_LIVE_API_KEY: 'live-key',
    ALPACA_LIVE_SECRET_KEY: 'live-secret',
  });

  assert.equal(settings.credentialScope, 'paper');
  assert.equal(settings.keyId, 'paper-key');
  assert.equal(settings.secretKey, 'paper-secret');
});
