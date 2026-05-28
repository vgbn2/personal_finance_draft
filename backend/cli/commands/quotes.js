const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../scripts/data_ops/ingest_market_data');
const { DEFAULT_PROVIDER_PRIORITY } = require('../../../shared/lib/quote_router');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../../shared/lib/backtest');
const { calculateFeatureFrame, calculateRollingFeatureFrame, DEFAULT_PERIODS, generateSampleBars } = require('../../../shared/lib/indicators');
const { compareModels } = require('../../../shared/lib/models');
const { mergeSnapshots, readSnapshot, validateSnapshot, writeJson } = require('../../../shared/lib/market_validation');
const { runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal } = require('../tui');

const utils = require('../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;



function quoteProviderEnvConfigured(provider) {
  const normalized = String(provider || '').trim().toUpperCase();
  return Boolean(process.env[`SOVEREIGN_${normalized}_QUOTES_PATH`] || process.env[`${normalized}_QUOTES_PATH`]);
}

function quoteProviderPathLabel(provider) {
  const normalized = String(provider || '').trim().toUpperCase();
  if (process.env[`SOVEREIGN_${normalized}_QUOTES_PATH`]) return `SOVEREIGN_${normalized}_QUOTES_PATH`;
  if (process.env[`${normalized}_QUOTES_PATH`]) return `${normalized}_QUOTES_PATH`;
  return null;
}

async function commandQuotes(args) {
  const subcommand = args[0] || 'status';
  if (subcommand !== 'status') {
    printPayload({ ok: false, error: `Unsupported quotes command: ${subcommand}` }, args);
    return 1;
  }

  const config = await loadConfig();
  const quoteConfig = config.quote_feeds || {};
  const configuredProviders = (quoteConfig.providers || ['headway_mt5', 'mt5', 'webull'])
    .filter((provider) => typeof provider === 'string' && provider.trim().length > 0)
    .map((provider) => String(provider).trim().toLowerCase())
    .filter(Boolean);
  const imported = await loadExternalQuoteInputs(config);
  const deduped = dedupePreferredMarketQuotes(imported.records);
  const quoteQuality = validateSnapshot({
    mode: 'live',
    fetched_at: new Date().toISOString(),
    sources: imported.records,
    errors: imported.errors,
  }, { rejectStale: true }).report;
  const providerFreshness = new Map();
  for (const issue of quoteQuality.issues) {
    const provider = String(issue.key || '').split(':')[1] || 'unknown';
    const summary = providerFreshness.get(provider) || { stale_records: 0, freshness_issues: 0 };
    if (issue.code === 'stale_record' && issue.severity === 'error') summary.stale_records += 1;
    if (issue.code === 'stale_record') summary.freshness_issues += 1;
    providerFreshness.set(provider, summary);
  }
  const providerChecks = new Map((imported.provider_checks || []).map((check) => [check.provider, check]));
  const providers = configuredProviders.map((provider) => {
    const check = providerChecks.get(provider);
    const records = imported.records.filter((record) => record.provider === provider).length;
    const freshness = providerFreshness.get(provider) || { stale_records: 0, freshness_issues: 0 };
    const status = check ? check.status : 'not_configured';
    return {
      provider,
      enabled: quoteConfig.enabled !== false,
      configured: quoteProviderEnvConfigured(provider),
      env: quoteProviderPathLabel(provider),
      priority: DEFAULT_PROVIDER_PRIORITY[provider] ?? DEFAULT_PROVIDER_PRIORITY.default,
      status: status === 'ok' && freshness.stale_records > 0 ? 'stale' : status,
      records,
      stale_records: freshness.stale_records,
      freshness_issues: freshness.freshness_issues,
      message: check && check.message ? check.message : null,
    };
  });
  const selectedSymbols = deduped.records
    .filter((record) => ['equities', 'indices', 'commodities', 'crypto', 'fx'].includes(record.family))
    .slice(0, 20)
    .map((record) => ({
      family: record.family,
      symbol: record.symbol,
      provider: record.provider,
      timeframe: record.timeframe || record.quote_type || 'point',
      timestamp: record.timestamp,
      close: record.close ?? record.last ?? null,
      bid: record.bid ?? null,
      ask: record.ask ?? null,
    }));
  const payload = {
    ok: imported.errors.length === 0 && quoteQuality.ok,
    type: 'quote_sources',
    schema_version: 1,
    enabled: quoteConfig.enabled !== false,
    providers,
    records: imported.records.length,
    stale_records: quoteQuality.freshness.stale_records,
    freshness_issues: quoteQuality.freshness.issues,
    selected_records: deduped.records.length,
    deduplication: {
      input_records: deduped.input_records,
      quote_records: deduped.quote_records,
      output_records: deduped.records.length,
      removed_records: deduped.removed_records,
      policy: 'provider_priority_then_quality',
    },
    symbols: selectedSymbols,
    errors: imported.errors,
  };
  printPayload(payload, args);
  return payload.ok ? 0 : 1;
}

module.exports = {
  quoteProviderEnvConfigured, quoteProviderPathLabel, commandQuotes
};
