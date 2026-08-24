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

const {
  classifyPolymarketGatewayError,
  describeGatewayError,
  gatewayErrorMessage,
  redactHeaderMap,
  sanitizeAxiosConfig,
  sanitizeGatewayError,
} = require('../../../../backend/gateway/src/polymarket/index.ts');

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
});

test('sanitizeGatewayError strips sensitive headers and exposes response context', () => {
  const sanitized = sanitizeGatewayError({
    message: 'Request failed with status code 400',
    name: 'AxiosError',
    code: 'ERR_BAD_REQUEST',
    config: {
      url: 'https://clob.polymarket.com/order',
      method: 'post',
      headers: {
        POLY_API_KEY: 'secret-key',
        POLY_SIGNATURE: 'secret-sig',
      },
    },
    response: {
      status: 400,
      statusText: 'Bad Request',
      data: { error: 'invalid order version' },
    },
  });

  assert.equal(sanitized.message, 'Request failed with status code 400');
  assert.equal(sanitized.config.headers.POLY_API_KEY, '[redacted]');
  assert.deepEqual(sanitized.response, {
    status: 400,
    statusText: 'Bad Request',
    data: { error: 'invalid order version' },
  });
});

test('gatewayErrorMessage extracts structured response message before fallback', () => {
  const message = gatewayErrorMessage({
    message: 'Axios generic error message',
    response: {
      data: {
        error: 'order minimum not met',
      },
    },
  });

  assert.equal(message, 'order minimum not met');
});

test('classifyPolymarketGatewayError categorizes network and auth error signatures', () => {
  const networkClassified = classifyPolymarketGatewayError({
    message: 'fetch failed',
  });
  assert.equal(networkClassified.error_category, 'network_unavailable');

  const sigClassified = classifyPolymarketGatewayError({
    message: 'invalid signature provided',
  });
  assert.equal(sigClassified.error_category, 'invalid_signature');
});
