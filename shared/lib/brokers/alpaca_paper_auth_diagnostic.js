'use strict';

const { resolveAlpacaSettings, PAPER_BASE_URL } = require('./alpaca_env');

const OUTCOMES = new Set(['accepted', 'rejected', 'unavailable', 'rate_limited', 'inconclusive', 'not_configured']);

function endpointClass(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.hostname === new URL(PAPER_BASE_URL).hostname ? 'alpaca_paper' : 'unexpected_endpoint';
  } catch {
    return 'invalid_endpoint';
  }
}

function normalizeError(error) {
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 401 || status === 403) return { outcome: 'rejected', http_status: status, error_code: 'authentication_rejected' };
  if (status === 429) return { outcome: 'rate_limited', http_status: status, error_code: 'provider_rate_limited' };
  if (Number.isFinite(status)) return { outcome: 'unavailable', http_status: status, error_code: 'provider_http_error' };
  const code = String(error?.code || '').toUpperCase();
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return { outcome: 'unavailable', http_status: null, error_code: 'provider_transport_unavailable' };
  }
  return { outcome: 'inconclusive', http_status: null, error_code: 'provider_diagnostic_inconclusive' };
}

function redactedSettings(env = process.env) {
  const settings = resolveAlpacaSettings(env, { paper: true });
  const configured = Boolean(settings.keyId && settings.secretKey);
  return {
    settings,
    report: {
      scope: 'paper',
      credential_scope: settings.credentialScope,
      endpoint_class: endpointClass(settings.baseUrl),
      configured,
    },
  };
}

async function executePath(kind, operation, report) {
  const started = Date.now();
  try {
    await operation();
    return {
      ...report,
      path_kind: kind,
      outcome: 'accepted',
      http_status: 200,
      error_code: null,
      latency_ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ...report,
      path_kind: kind,
      ...normalizeError(error),
      latency_ms: Date.now() - started,
    };
  }
}

async function runAlpacaPaperAuthDiagnostic(options = {}) {
  const { settings, report } = redactedSettings(options.env || process.env);
  if (!report.configured || report.endpoint_class !== 'alpaca_paper') {
    return {
      ok: false,
      type: 'alpaca_paper_auth_diagnostic',
      ...report,
      paths: ['raw_http', 'sdk'].map((path_kind) => ({
        ...report,
        path_kind,
        outcome: 'not_configured',
        http_status: null,
        error_code: report.configured ? 'alpaca_paper_endpoint_invalid' : 'alpaca_paper_credentials_missing',
        latency_ms: 0,
      })),
    };
  }

  const rawAccount = options.rawAccount || (async () => {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': settings.keyId,
        'APCA-API-SECRET-KEY': settings.secretKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(options.timeoutMs || 10000),
    });
    if (!response.ok) {
      const error = new Error(`Alpaca Paper account request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
  });
  const sdkAccount = options.sdkAccount || (async () => {
    const Alpaca = require('@alpacahq/alpaca-trade-api');
    const client = new Alpaca({ keyId: settings.keyId, secretKey: settings.secretKey, paper: true });
    await client.getAccount();
  });

  const paths = await Promise.all([
    executePath('raw_http', rawAccount, report),
    executePath('sdk', sdkAccount, report),
  ]);
  return {
    ok: paths.every((path) => path.outcome === 'accepted'),
    type: 'alpaca_paper_auth_diagnostic',
    ...report,
    paths,
  };
}

module.exports = { OUTCOMES, endpointClass, normalizeError, redactedSettings, runAlpacaPaperAuthDiagnostic };
