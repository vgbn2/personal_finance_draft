const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyPolymarketGatewayError,
  describeGatewayError,
  gatewayErrorMessage,
  redactHeaderMap,
  sanitizeAxiosConfig,
  sanitizeGatewayError,
} = require('../../../backend/gateway/src/polymarket_errors.js');

test('redactHeaderMap removes Polymarket auth-bearing headers', () => {
  const redacted = redactHeaderMap({
    Accept: '*/*',
    POLY_API_KEY: 'secret-key',
    POLY_PASSPHRASE: 'secret-passphrase',
    POLY_SIGNATURE: 'secret-signature',
    POLY_ADDRESS: '0xabc',
  });

  assert.deepEqual(redacted, {
    Accept: '*/*',
    POLY_API_KEY: '[redacted]',
    POLY_PASSPHRASE: '[redacted]',
    POLY_SIGNATURE: '[redacted]',
    POLY_ADDRESS: '0xabc',
  });

  // x-api-key and l2-signature must be redacted (lookup is lowercased)
  const redacted2 = redactHeaderMap({
    'x-api-key': 'my-api-key',
    'l2-signature': 'my-l2-sig',
    'x-request-id': 'trace-123',
  });
  assert.equal(redacted2['x-api-key'], '[redacted]');
  assert.equal(redacted2['l2-signature'], '[redacted]');
  assert.equal(redacted2['x-request-id'], 'trace-123');
});

test('sanitizeAxiosConfig preserves endpoint context but redacts headers', () => {
  const sanitized = sanitizeAxiosConfig({
    url: 'https://clob.polymarket.com/balance-allowance/update',
    method: 'get',
    params: { asset_type: 'COLLATERAL', signature_type: '1' },
    timeout: 0,
    headers: {
      POLY_API_KEY: 'secret-key',
      POLY_SIGNATURE: 'secret-signature',
      'User-Agent': '@polymarket/clob-client',
    },
  });

  assert.deepEqual(sanitized, {
    url: 'https://clob.polymarket.com/balance-allowance/update',
    method: 'get',
    params: { asset_type: 'COLLATERAL', signature_type: '1' },
    timeout: 0,
    headers: {
      POLY_API_KEY: '[redacted]',
      POLY_SIGNATURE: '[redacted]',
      'User-Agent': '@polymarket/clob-client',
    },
  });
});

test('describeGatewayError does not leak Polymarket auth fields', () => {
  const text = describeGatewayError({
    name: 'AggregateError',
    code: 'EACCES',
    message: '',
    stack: 'AggregateError',
    config: {
      url: 'https://clob.polymarket.com/balance-allowance/update',
      method: 'get',
      params: { asset_type: 'COLLATERAL', signature_type: '1' },
      headers: {
        POLY_API_KEY: 'secret-key',
        POLY_PASSPHRASE: 'secret-passphrase',
        POLY_SIGNATURE: 'secret-signature',
        POLY_ADDRESS: '0xabc',
      },
    },
  });

  assert.match(text, /"code":"EACCES"/);
  assert.match(text, /"POLY_API_KEY":"\[redacted\]"/);
  assert.match(text, /"POLY_PASSPHRASE":"\[redacted\]"/);
  assert.match(text, /"POLY_SIGNATURE":"\[redacted\]"/);
  assert.doesNotMatch(text, /secret-key/);
  assert.doesNotMatch(text, /secret-passphrase/);
  assert.doesNotMatch(text, /secret-signature/);
});

test('sanitizeGatewayError keeps response status context', () => {
  const sanitized = sanitizeGatewayError({
    message: 'Request failed with status code 400',
    name: 'AxiosError',
    code: 'ERR_BAD_REQUEST',
    response: {
      status: 400,
      statusText: 'Bad Request',
      data: { error: 'Could not create api key' },
    },
  });

  assert.equal(sanitized.response.status, 400);
  assert.equal(sanitized.response.statusText, 'Bad Request');
  assert.deepEqual(sanitized.response.data, { error: 'Could not create api key' });
});

test('classifyPolymarketGatewayError identifies deposit wallet account-mode rejection', () => {
  const diagnostic = classifyPolymarketGatewayError('Polymarket CLOB rejected order: {"error":"maker address not allowed, please use the deposit wallet flow"}');
  assert.equal(diagnostic.error_category, 'deposit_wallet_required');
  assert.match(diagnostic.suggestion, /funder address/i);
});

test('classifyPolymarketGatewayError identifies SDK tick-size/order-shape failures', () => {
  const diagnostic = classifyPolymarketGatewayError(new TypeError("Cannot read properties of undefined (reading 'price')"));
  assert.equal(diagnostic.error_category, 'invalid_token_or_tick_size');
  assert.match(diagnostic.suggestion, /active token/);
});

test('classifyPolymarketGatewayError prioritizes transport failures over endpoint text', () => {
  const diagnostic = classifyPolymarketGatewayError('{"code":"EACCES","config":{"url":"https://clob.polymarket.com/balance-allowance/update"}}');
  assert.equal(diagnostic.error_category, 'network_unavailable');
  assert.match(diagnostic.suggestion, /network access/i);
});

test('gatewayErrorMessage prefers response error text without leaking headers', () => {
  const message = gatewayErrorMessage({
    message: 'Request failed',
    response: { data: { error: 'network blocked' } },
    config: { headers: { POLY_API_KEY: 'secret-key' } },
  });
  assert.equal(message, 'network blocked');
  assert.doesNotMatch(message, /secret-key/);
});
