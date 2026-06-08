function normalizePolymarketApiCreds(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.key && raw.secret && raw.passphrase) {
    return {
      key: String(raw.key),
      secret: String(raw.secret),
      passphrase: String(raw.passphrase),
    };
  }
  if (Array.isArray(raw.apiKeys) && raw.apiKeys[0]) {
    return normalizePolymarketApiCreds(raw.apiKeys[0]);
  }
  if (raw.apiKey && raw.secret && raw.passphrase) {
    return {
      key: String(raw.apiKey),
      secret: String(raw.secret),
      passphrase: String(raw.passphrase),
    };
  }
  return null;
}

function summarizePolymarketApiCredShape(raw) {
  if (!raw || typeof raw !== 'object') return { kind: typeof raw };
  return {
    key: typeof raw.key,
    secret: typeof raw.secret,
    passphrase: typeof raw.passphrase,
    apiKey: typeof raw.apiKey,
    apiKeys: Array.isArray(raw.apiKeys) ? `array(${raw.apiKeys.length})` : typeof raw.apiKeys,
    error: typeof raw.error,
  };
}

module.exports = {
  normalizePolymarketApiCreds,
  summarizePolymarketApiCredShape,
};
