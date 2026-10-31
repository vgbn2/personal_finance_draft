'use strict';

const DERIBIT_MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseDeribitInstrument(instrumentName) {
  if (typeof instrumentName !== 'string') return {};
  const parts = instrumentName.split('-');
  if (parts.length >= 4) {
    const rawDate = parts[1].toUpperCase();
    let expiration_ms = null;
    const match = rawDate.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = DERIBIT_MONTHS[match[2]];
      const year = 2000 + parseInt(match[3], 10);
      if (month !== undefined) {
        // Deribit options expire at 08:00:00 UTC
        expiration_ms = Date.UTC(year, month, day, 8, 0, 0);
      }
    }

    const strike = Number(parts[2]);
    const option_type = parts[3];
    return {
      expiration_ms,
      strike: Number.isFinite(strike) ? strike : null,
      option_type: option_type ? option_type.toUpperCase() : null,
    };
  }
  return {};
}

async function fetchBinanceFundingRates(symbol = 'BTCUSDT', limit = 100, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 5000;
  const target = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${Math.min(1000, Math.max(1, limit))}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Binance HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const nowIso = new Date().toISOString();
    return data.map((item) => ({
      symbol: String(item.symbol || symbol).toUpperCase(),
      funding_rate: Number(item.fundingRate || 0),
      funding_time_ms: Number(item.fundingTime || 0),
      mark_price: Number.isFinite(Number(item.markPrice)) ? Number(item.markPrice) : null,
      ingested_at: nowIso,
    })).filter((r) => Number.isFinite(r.funding_time_ms) && r.funding_time_ms > 0);
  } catch (err) {
    clearTimeout(timer);
    if (options.throwOnError) throw err;
    return [];
  }
}

async function fetchDeribitOptionsSummary(currency = 'BTC', options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 5000;
  const target = `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${encodeURIComponent(currency)}&kind=option`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Deribit HTTP ${res.status}`);
    }
    const json = await res.json();
    const data = json && Array.isArray(json.result) ? json.result : [];
    const nowIso = new Date().toISOString();

    return data.map((item) => {
      const parsed = parseDeribitInstrument(item.instrument_name);
      const greeks = item.greeks || {};
      return {
        currency: String(currency).toUpperCase(),
        instrument_name: String(item.instrument_name || ''),
        strike: parsed.strike,
        option_type: parsed.option_type,
        expiration_ms: Number.isFinite(item.expiration_timestamp)
          ? Number(item.expiration_timestamp)
          : (parsed.expiration_ms || (Number.isFinite(item.creation_timestamp) ? Number(item.creation_timestamp) : null)),
        mark_price: Number.isFinite(item.mark_price) ? Number(item.mark_price) : null,
        mark_iv: Number.isFinite(item.mark_iv) ? Number(item.mark_iv) : null,
        delta: Number.isFinite(greeks.delta) ? Number(greeks.delta) : (Number.isFinite(item.delta) ? Number(item.delta) : null),
        gamma: Number.isFinite(greeks.gamma) ? Number(greeks.gamma) : (Number.isFinite(item.gamma) ? Number(item.gamma) : null),
        vega: Number.isFinite(greeks.vega) ? Number(greeks.vega) : (Number.isFinite(item.vega) ? Number(item.vega) : null),
        theta: Number.isFinite(greeks.theta) ? Number(greeks.theta) : (Number.isFinite(item.theta) ? Number(item.theta) : null),
        volume_usd: Number.isFinite(item.volume_usd) ? Number(item.volume_usd) : null,
        open_interest: Number.isFinite(item.open_interest) ? Number(item.open_interest) : null,
        ingested_at: nowIso,
      };
    }).filter((r) => r.instrument_name.length > 0);
  } catch (err) {
    clearTimeout(timer);
    if (options.throwOnError) throw err;
    return [];
  }
}

async function fetchBinancePremiumIndex(symbol = 'BTCUSDT', options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 5000;
  const target = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Binance Premium Index HTTP ${res.status}`);
    }
    const item = await res.json();
    if (!item || typeof item !== 'object') return null;

    return {
      symbol: String(item.symbol || symbol).toUpperCase(),
      mark_price: Number.isFinite(Number(item.markPrice)) ? Number(item.markPrice) : null,
      index_price: Number.isFinite(Number(item.indexPrice)) ? Number(item.indexPrice) : null,
      estimated_settle_price: Number.isFinite(Number(item.estimatedSettlePrice)) ? Number(item.estimatedSettlePrice) : null,
      last_funding_rate: Number.isFinite(Number(item.lastFundingRate)) ? Number(item.lastFundingRate) : null,
      next_funding_time_ms: Number.isFinite(Number(item.nextFundingTime)) ? Number(item.nextFundingTime) : null,
      interest_rate: Number.isFinite(Number(item.interestRate)) ? Number(item.interestRate) : null,
      time_ms: Number.isFinite(Number(item.time)) ? Number(item.time) : Date.now(),
    };
  } catch (err) {
    clearTimeout(timer);
    if (options.throwOnError) throw err;
    return null;
  }
}

async function fetchBybitFundingRates(symbol = 'BTCUSDT', limit = 100, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 5000;
  const target = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(symbol)}&limit=${Math.min(200, Math.max(1, limit))}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Bybit HTTP ${res.status}`);
    }
    const json = await res.json();
    const list = json && json.result && Array.isArray(json.result.list) ? json.result.list : [];
    const nowIso = new Date().toISOString();

    return list.map((item) => ({
      symbol: String(item.symbol || symbol).toUpperCase(),
      funding_rate: Number(item.fundingRate || 0),
      funding_time_ms: Number(item.fundingRateTimestamp || 0),
      mark_price: null,
      ingested_at: nowIso,
    })).filter((r) => Number.isFinite(r.funding_time_ms) && r.funding_time_ms > 0);
  } catch (err) {
    clearTimeout(timer);
    if (options.throwOnError) throw err;
    return [];
  }
}

async function fetchDeribitFundingRates(currency = 'BTC', options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 5000;
  const instrument = `${String(currency).toUpperCase()}-PERPETUAL`;
  const target = `https://www.deribit.com/api/v2/public/get_funding_rate_value?instrument_name=${encodeURIComponent(instrument)}&length=8h`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Deribit Funding HTTP ${res.status}`);
    }
    const json = await res.json();
    const rate = json && json.result !== undefined ? Number(json.result) : null;
    if (!Number.isFinite(rate)) return [];

    const nowIso = new Date().toISOString();
    return [{
      symbol: `${String(currency).toUpperCase()}-PERP`,
      funding_rate: rate,
      funding_time_ms: Date.now(),
      mark_price: null,
      ingested_at: nowIso,
    }];
  } catch (err) {
    clearTimeout(timer);
    if (options.throwOnError) throw err;
    return [];
  }
}

async function syncDerivativesToDb(db, options = {}) {
  const symbol = options.symbol || 'BTCUSDT';
  const currency = options.currency || 'BTC';

  const [funding, optionsSummary] = await Promise.all([
    fetchBinanceFundingRates(symbol, options.fundingLimit || 100, options),
    fetchDeribitOptionsSummary(currency, options),
  ]);

  const fundingInserted = db.insertFundingRates(funding);
  const optionsInserted = db.insertOptionsSummary(optionsSummary);

  return {
    symbol,
    currency,
    funding_fetched: funding.length,
    funding_inserted: fundingInserted,
    options_fetched: optionsSummary.length,
    options_inserted: optionsInserted,
  };
}

module.exports = {
  fetchBinanceFundingRates,
  fetchBinancePremiumIndex,
  fetchBybitFundingRates,
  fetchDeribitFundingRates,
  fetchDeribitOptionsSummary,
  syncDerivativesToDb,
  parseDeribitInstrument,
};
