const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizePolymarketApiCreds,
  summarizePolymarketApiCredShape,
} = require('../../../backend/gateway/src/polymarket_creds.js');

test('normalizePolymarketApiCreds accepts direct key/secret/passphrase shape', () => {
  assert.deepEqual(
    normalizePolymarketApiCreds({ key: 'k', secret: 's', passphrase: 'p' }),
    { key: 'k', secret: 's', passphrase: 'p' }
  );
});

test('normalizePolymarketApiCreds accepts apiKey-based shape', () => {
  assert.deepEqual(
    normalizePolymarketApiCreds({ apiKey: 'k', secret: 's', passphrase: 'p' }),
    { key: 'k', secret: 's', passphrase: 'p' }
  );
});

test('normalizePolymarketApiCreds accepts apiKeys array shape', () => {
  assert.deepEqual(
    normalizePolymarketApiCreds({ apiKeys: [{ key: 'k', secret: 's', passphrase: 'p' }] }),
    { key: 'k', secret: 's', passphrase: 'p' }
  );
});

test('summarizePolymarketApiCredShape exposes incomplete response shape for diagnostics', () => {
  assert.deepEqual(
    summarizePolymarketApiCredShape({ error: 'Could not create api key', apiKey: undefined }),
    {
      key: 'undefined',
      secret: 'undefined',
      passphrase: 'undefined',
      apiKey: 'undefined',
      apiKeys: 'undefined',
      error: 'string',
    }
  );
});
