const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'poly_api_key',
  'poly_passphrase',
  'poly_signature',
  'x-api-key',
  'api-key',
  'apikey',
  'secret',
  'password',
  'passphrase',
  'token',
  'access-token',
  'auth-token',
  'l2-api-key',
  'l2-signature',
  'l2-passphrase',
]);

function redactHeaderMap(headers) {
  const input = headers && typeof headers === 'object' ? headers : {};
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = String(key || '').toLowerCase();
    output[key] = SENSITIVE_HEADER_KEYS.has(normalized) ? '[redacted]' : value;
  }
  return output;
}

function sanitizeAxiosConfig(config) {
  if (!config || typeof config !== 'object') return undefined;
  return {
    url: config.url,
    method: config.method,
    params: config.params,
    timeout: config.timeout,
    headers: redactHeaderMap(config.headers),
  };
}

function sanitizeGatewayError(error) {
  if (!error || typeof error !== 'object') {
    return { message: 'Unknown error' };
  }

  const responseData = error.response && error.response.data;
  const sanitized = {
    message: typeof error.message === 'string' && error.message.trim() ? error.message.trim() : '',
    name: error.name,
    code: error.code,
  };

  const config = sanitizeAxiosConfig(error.config);
  if (config) sanitized.config = config;

  if (typeof responseData === 'string' && responseData.trim()) {
    sanitized.response = { data: responseData.trim() };
  } else if (responseData && typeof responseData === 'object') {
    sanitized.response = { data: responseData };
  }

  if (error.response && error.response.status !== undefined) {
    sanitized.response = {
      ...(sanitized.response || {}),
      status: error.response.status,
      statusText: error.response.statusText,
    };
  }

  if (typeof error.stack === 'string' && error.stack.trim()) {
    sanitized.stack = error.stack;
  }

  return sanitized;
}

function describeGatewayError(error) {
  if (!error) return 'Unknown error';
  const responseData = error.response && error.response.data;
  if (typeof responseData === 'string' && responseData.trim()) return responseData.trim();
  if (responseData && typeof responseData === 'object') {
    const explicit = responseData.error || responseData.message;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  }
  const sanitized = sanitizeGatewayError(error);
  try {
    return JSON.stringify(sanitized);
  } catch {
    return 'Unknown error';
  }
}

function gatewayErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error.trim() || 'Unknown error';
  const responseData = error.response && error.response.data;
  if (typeof responseData === 'string' && responseData.trim()) return responseData.trim();
  if (responseData && typeof responseData === 'object') {
    const explicit = responseData.error || responseData.message || responseData.errorMsg;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  }
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return describeGatewayError(error);
}

function classifyPolymarketGatewayError(error) {
  const message = gatewayErrorMessage(error);
  const inheritedCategory = error && typeof error === 'object' && typeof error.error_category === 'string'
    ? error.error_category
    : undefined;
  let error_category = inheritedCategory;
  let suggestion = error && typeof error === 'object' && typeof error.suggestion === 'string'
    ? error.suggestion
    : undefined;

  if (!error_category) {
    if (/fetch failed|EACCES|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|socket|TLS/i.test(message)) {
      error_category = 'network_unavailable';
      suggestion = 'Check local network access to Polymarket Gamma/CLOB endpoints and retry.';
    } else if (/allowance/i.test(message)) {
      error_category = 'insufficient_allowance';
      suggestion = 'Approve USDC for the CTF Exchange contract via the Polymarket UI, then retry.';
    } else if (/maker address not allowed|deposit wallet flow/i.test(message)) {
      error_category = 'deposit_wallet_required';
      suggestion = 'This market/account requires a different maker flow. Verify the active funder address, signature type, and L2 API credentials for this Polymarket wallet before retrying.';
    } else if (/sig(nature)?|signing|owner|unauthorized/i.test(message)) {
      error_category = 'invalid_signature';
      suggestion = 'Check the configured signer, funder wallet, and POLYMARKET_SIGNATURE_TYPE before retrying.';
    } else if (/Cannot read properties of undefined \(reading 'price'\)|rounding_config|tick size|minimum_tick_size/i.test(message)) {
      error_category = 'invalid_token_or_tick_size';
      suggestion = 'Re-fetch the market/orderbook and retry with an active token whose CLOB tick size is available.';
    } else if (/token|market|not found|resolved|delisted/i.test(message)) {
      error_category = 'invalid_token';
      suggestion = 'The token ID may belong to a resolved or delisted market. Re-fetch markets and pick an active one.';
    }
  }

  return {
    error: message,
    ...(error_category ? { error_category } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

module.exports = {
  classifyPolymarketGatewayError,
  describeGatewayError,
  gatewayErrorMessage,
  redactHeaderMap,
  sanitizeAxiosConfig,
  sanitizeGatewayError,
};
