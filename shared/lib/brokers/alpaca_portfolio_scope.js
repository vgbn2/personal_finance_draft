'use strict';

const ALPACA_PORTFOLIO_SCOPES = Object.freeze(['paper', 'live', 'both']);

function normalizeAlpacaPortfolioScope(value, fallback = null) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (ALPACA_PORTFOLIO_SCOPES.includes(normalized)) return normalized;
  return fallback;
}

function buildAlpacaPortfolioAdapterSpecs(value = 'both') {
  const scope = normalizeAlpacaPortfolioScope(value);
  if (!scope) throw new Error('invalid_alpaca_portfolio_scope');

  return Object.freeze({
    scope,
    live: Object.freeze(scope === 'paper' ? [] : [
      Object.freeze({ name: 'Alpaca (Live)', paper: false }),
    ]),
    live_paper: Object.freeze(scope === 'live' ? [] : [
      Object.freeze({ name: 'Alpaca (Paper)', paper: true }),
    ]),
  });
}

module.exports = {
  ALPACA_PORTFOLIO_SCOPES,
  normalizeAlpacaPortfolioScope,
  buildAlpacaPortfolioAdapterSpecs,
};
