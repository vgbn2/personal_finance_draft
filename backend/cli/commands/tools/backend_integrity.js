'use strict';
const path = require('node:path');
const fs = require('node:fs');
const utils = require('../../lib/utils.js');
const { hasFlag } = utils;
const { readSnapshot, validateSnapshot } = require('../../../../shared/lib/market/validation.js');

const TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');
const CONFIG_PATH = path.join(utils.REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx']);
const CALENDAR_EXEMPT_FAMILIES = new Set(['equities', 'indices', 'commodities']);
const TF_CANONICAL_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'];
const STALE_MS = {
  '5m': 1 * 60 * 60 * 1000,
  '15m': 2 * 60 * 60 * 1000,
  '30m': 4 * 60 * 60 * 1000,
  '1h': 6 * 60 * 60 * 1000,
  '4h': 12 * 60 * 60 * 1000,
  '1d': 96 * 60 * 60 * 1000,
  '1w': 14 * 24 * 60 * 60 * 1000,
};

function reportSnapshotIntegrity(inputPath, rejectStale = true) {
  try {
    const snapshot = readSnapshot(inputPath);
    const { report, usableSources } = validateSnapshot(snapshot, { rejectStale });
    return {
      ok: report.ok,
      input: inputPath,
      mode: snapshot.mode || 'unknown',
      fetched_at: snapshot.fetched_at || null,
      total_records: report.total_records,
      usable_records: (usableSources || []).length,
      rejected_records: report.rejected_records,
      stale_records: (report.freshness || {}).stale_records || 0,
      provider_errors: (report.provider_errors || []).length,
      issues: (report.issues || []).slice(0, 8),
    };
  } catch (error) {
    return {
      ok: false,
      input: inputPath,
      error: error.message,
    };
  }
}

function weekendHoursElapsed(fromTs, toTs) {
  let ms = 0;
  const cursor = new Date(fromTs);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= toTs) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) ms += 24 * 60 * 60 * 1000;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ms;
}

async function loadIntegrityPolicy(loadMarketConfig) {
  let config = {};
  try { config = await loadMarketConfig(CONFIG_PATH); } catch (_) {}
  const requiredTimeframes = Array.isArray(config?.quality?.integrity_timeframes)
    && config.quality.integrity_timeframes.length > 0
    ? config.quality.integrity_timeframes
    : ['1d'];
  const integrityExceptions = new Set(
    Array.isArray(config?.quality?.integrity_exceptions)
      ? config.quality.integrity_exceptions.filter(Boolean)
      : [],
  );
  return { config, requiredTimeframes, integrityExceptions };
}

function loadUnreachableSymbols() {
  const unreachableSymbols = new Set();
  try {
    const lastFetch = JSON.parse(
      fs.readFileSync(path.join(utils.REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json'), 'utf8'),
    );
    for (const error of (lastFetch.errors || [])) {
      if (error && error.symbol && typeof error.message === 'string'
          && /no .*provider resolved successfully/i.test(error.message)) {
        unreachableSymbols.add(error.symbol);
      }
    }
  } catch (_) { /* no snapshot yet — treat nothing as unreachable */ }
  return unreachableSymbols;
}

function integrityTimeframes(requiredTimeframes) {
  const base = new Set([
    ...requiredTimeframes,
    '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w',
  ]);
  return TF_CANONICAL_ORDER.filter((timeframe) => base.has(timeframe));
}

function coverageMetadata(coverage, family, timeframe, now) {
  const ageMs = now - coverage.lastBarMs;
  const effectiveAge = CALENDAR_EXEMPT_FAMILIES.has(family) && timeframe === '1d'
    ? Math.max(0, ageMs - weekendHoursElapsed(coverage.lastBarMs, now))
    : ageMs;
  return {
    bars: coverage.count,
    from: new Date(coverage.firstBarMs).toISOString().slice(0, 10),
    to: new Date(coverage.lastBarMs).toISOString().slice(0, 10),
    stale: effectiveAge > (STALE_MS[timeframe] || 72 * 60 * 60 * 1000),
    age_h: Math.round(ageMs / 3600000),
    provider: coverage.provider,
    derived_from: coverage.derivedFrom,
  };
}

function recordGrainAssessment(grainSuspects, tfData, coverage, grain, symbol, family, timeframe) {
  if (!grain.suspect) return;
  tfData[timeframe].grain_suspect = true;
  tfData[timeframe].grain_status = grain.status;
  tfData[timeframe].grain_blocking = grain.blocking;
  grainSuspects.push({
    symbol,
    family,
    timeframe,
    provider: coverage.provider,
    derived_from: coverage.derivedFrom,
    bars: coverage.count,
    from: new Date(coverage.firstBarMs).toISOString(),
    to: new Date(coverage.lastBarMs).toISOString(),
    bars_per_day: grain.barsPerDay,
    span_days: grain.spanDays,
    status: grain.status,
    blocking: grain.blocking,
    reason: grain.reason,
    recent_cadence: grain.sample || null,
  });
}

function collectSymbolCoverage(symbol, family, timeframes, now, coverageTools) {
  const tfData = {};
  const grainSuspects = [];
  for (const timeframe of timeframes) {
    const coverage = coverageTools.readCoverage(
      TS_DIR,
      symbol,
      timeframe,
      now,
    );
    if (!coverage.exists || coverage.count === 0
        || coverage.lastBarMs === null || coverage.firstBarMs === null) continue;
    tfData[timeframe] = coverageMetadata(coverage, family, timeframe, now);
    const grain = coverageTools.assessGrainIntegrity(TS_DIR, symbol, timeframe, family, coverage);
    recordGrainAssessment(grainSuspects, tfData, coverage, grain, symbol, family, timeframe);
  }
  return { tfData, grainSuspects };
}

function classifySymbol(familyReport, symbolInfo, requiredTimeframes, integrityExceptions, unreachableSymbols) {
  const timeframes = symbolInfo.timeframes;
  if (Object.keys(timeframes).length === 0) {
    familyReport.missing.push(symbolInfo.symbol);
    return;
  }

  familyReport.cached.push(symbolInfo);
  const staleOrMissing = requiredTimeframes.filter((timeframe) => (
    !timeframes[timeframe] || timeframes[timeframe].stale
  ));
  if (staleOrMissing.length === 0) return;
  if (integrityExceptions.has(symbolInfo.symbol)) {
    familyReport.exceptions.push({ symbol: symbolInfo.symbol, issues: staleOrMissing });
    return;
  }

  const staleEntry = { symbol: symbolInfo.symbol, issues: staleOrMissing };
  if (unreachableSymbols.has(symbolInfo.symbol)) {
    staleEntry.provider_unreachable = true;
    symbolInfo.provider_unreachable = true;
  }
  familyReport.stale.push(staleEntry);
}

function collectIntegrityCoverage(policy, coverageTools, now) {
  const timeframes = integrityTimeframes(policy.requiredTimeframes);
  const familyReport = {};
  const grainSuspects = [];

  for (const [family, data] of Object.entries(policy.config)) {
    if (!OHLCV_FAMILIES.has(family) || !data.enabled) continue;
    const symbols = [...new Set([...(data.symbols || []), ...(data.series || [])])];
    if (symbols.length === 0) continue;

    const report = {
      family,
      config_count: symbols.length,
      cached: [],
      missing: [],
      stale: [],
      exceptions: [],
    };
    for (const symbol of symbols) {
      const collected = collectSymbolCoverage(
        symbol,
        family,
        timeframes,
        now,
        coverageTools,
      );
      grainSuspects.push(...collected.grainSuspects);
      classifySymbol(
        report,
        { symbol, family, timeframes: collected.tfData },
        policy.requiredTimeframes,
        policy.integrityExceptions,
        policy.unreachableSymbols,
      );
    }
    familyReport[family] = report;
  }
  return { familyReport, grainSuspects };
}

function collectVintageAnomalies(familyReport) {
  const familyAnomalies = {};
  let totalAnomalies = 0;
  for (const [family, report] of Object.entries(familyReport)) {
    const anomalies = [];
    for (const symbol of report.cached) {
      const { earliest, latestFrom } = vintageBounds(symbol.timeframes);
      const yearDiff = parseInt(latestFrom.substring(0, 4)) - parseInt(earliest.substring(0, 4));
      if (yearDiff >= 1) {
        anomalies.push({ symbol: symbol.symbol, earliest, latestFrom, yearDiff });
        totalAnomalies += 1;
      }
    }
    if (anomalies.length > 0) familyAnomalies[family] = anomalies;
  }
  return { familyAnomalies, totalAnomalies };
}

function vintageBounds(timeframes) {
  let earliest = '9999-99-99';
  let latestFrom = '0000-00-00';
  for (const metadata of Object.values(timeframes)) {
    if (metadata.from < earliest) earliest = metadata.from;
    if (metadata.from > latestFrom) latestFrom = metadata.from;
  }
  return { earliest, latestFrom };
}

function renderVintageAudit(familyReport) {
  const audit = collectVintageAnomalies(familyReport);
  console.log(`\n=== VINTAGE ALIGNMENT AUDIT ===\n`);
  for (const [family, anomalies] of Object.entries(audit.familyAnomalies)) {
    console.log(`[ ${family.toUpperCase()} ] - ${anomalies.length} symbols with mixed vintages`);
    anomalies.sort((a, b) => b.yearDiff - a.yearDiff).forEach((anomaly) => {
      console.log(`  ${anomaly.symbol.padEnd(10)} | Delta: ${anomaly.yearDiff} years | Deepest: ${anomaly.earliest} | Shallowest: ${anomaly.latestFrom}`);
    });
    console.log('');
  }
  console.log(`Audit complete. Found ${audit.totalAnomalies} mixed-vintage symbols.\n`);
  return { ok: true, type: 'vintage_audit' };
}

function summarizeAvailability(familyReport, grainSuspects) {
  const reports = Object.values(familyReport);
  return {
    totalConfig: reports.reduce((sum, report) => sum + report.config_count, 0),
    totalCached: reports.reduce((sum, report) => sum + report.cached.length, 0),
    totalMissing: reports.reduce((sum, report) => sum + report.missing.length, 0),
    totalStale: reports.reduce((sum, report) => sum + report.stale.length, 0),
    totalExceptions: reports.reduce((sum, report) => sum + report.exceptions.length, 0),
    totalUnreachable: reports.reduce(
      (sum, report) => sum + report.stale.filter((entry) => entry.provider_unreachable).length,
      0,
    ),
    unexplainedGrain: grainSuspects.filter((entry) => entry.blocking),
    plausibleGrain: grainSuspects.filter((entry) => !entry.blocking),
  };
}

function renderGrainSummary(grainSuspects, summary) {
  if (grainSuspects.length === 0) return;
  console.log(`\x1b[33mGrain: ${summary.unexplainedGrain.length} unexplained, ${summary.plausibleGrain.length} cadence-plausible across ${grainSuspects.length} density tripwire hit(s):\x1b[0m`);
  for (const grain of grainSuspects.slice(0, 20)) {
    const cadence = grain.recent_cadence
      ? `${grain.recent_cadence.bars_per_active_day}/active-day, median gap ${grain.recent_cadence.median_within_day_gap_minutes}m`
      : 'no recent cadence sample';
    console.log(`  ${grain.blocking ? 'BLOCK' : 'OK   '} ${grain.symbol} ${grain.timeframe}: ${grain.status} (${cadence}; ${grain.provider || 'unknown'})`);
  }
}

function renderFamilyCoverage(familyReport) {
  for (const [family, report] of Object.entries(familyReport)) {
    const pct = report.config_count > 0
      ? Math.round(report.cached.length / report.config_count * 100)
      : 0;
    const statusLabel = pct === 100 ? 'OK' : pct >= 50 ? 'WARN' : 'FAIL';
    console.log(`\n${family.toUpperCase()}  ${statusLabel}  ${report.cached.length}/${report.config_count} cached (${pct}%)`);

    if (report.missing.length > 0) console.log(`  Missing: ${report.missing.join(', ')}`);
    for (const stale of report.stale) {
      const tag = stale.provider_unreachable
        ? ' (provider unreachable — all providers failed last fetch)'
        : '';
      console.log(`  Stale: ${stale.symbol} [${stale.issues.join(', ')}]${tag}`);
    }
    for (const exception of report.exceptions) {
      console.log(`  Exception: ${exception.symbol} [${exception.issues.join(', ')}]`);
    }
    renderCachedSymbols(report.cached);
  }
}

function renderCachedSymbols(cachedSymbols) {
  for (const symbol of cachedSymbols) {
    const primary = symbol.timeframes['1d']
      || symbol.timeframes['1h']
      || Object.values(symbol.timeframes)[0];
    if (!primary) continue;
    const staleTag = primary.stale ? ` [stale ${primary.age_h}h]` : '';
    console.log(`  OK ${symbol.symbol.padEnd(12)} ${primary.from} -> ${primary.to}${staleTag}`);

    const timeframes = Object.entries(symbol.timeframes)
      .sort(([left], [right]) => TF_CANONICAL_ORDER.indexOf(left) - TF_CANONICAL_ORDER.indexOf(right));
    for (const [timeframe, metadata] of timeframes) {
      const range = metadata.from && metadata.to ? `[ ${metadata.from} -> ${metadata.to} ]` : '';
      const bars = metadata.bars.toString().padStart(8);
      const provider = metadata.provider || 'unknown';
      const rollup = metadata.derived_from ? `true (from ${metadata.derived_from})` : 'false';
      console.log(`     └─ ${timeframe.padStart(3)}: ${bars} bars  ${range}  [ Source: ${provider.padEnd(8)} | Rolled Up: ${rollup} ]`);
    }
  }
}

function renderHumanAvailability(policy, familyReport, grainSuspects) {
  const summary = summarizeAvailability(familyReport, grainSuspects);
  const line = '-'.repeat(72);
  console.log(`\n[DATA AVAILABILITY REPORT] ${new Date().toISOString()}`);
  console.log(`Coverage: ${summary.totalCached}/${summary.totalConfig} cached | missing: ${summary.totalMissing} | stale: ${summary.totalStale}`);
  console.log(`Policy: required timeframes = ${policy.requiredTimeframes.join(', ')}`);
  if (policy.integrityExceptions.size > 0) {
    console.log(`Policy: stale exceptions = ${Array.from(policy.integrityExceptions).join(', ')}`);
  }
  renderGrainSummary(grainSuspects, summary);
  console.log(line);
  renderFamilyCoverage(familyReport);

  console.log(`\n${line}`);
  console.log(`SUMMARY: ${summary.totalCached}/${summary.totalConfig} symbols cached | ${summary.totalMissing} missing | ${summary.totalStale} stale`);
  if (summary.totalMissing > 0) console.log('Next step: backfill the missing symbols first.');
  if (summary.totalStale > 0) {
    console.log('Next step: refresh stale symbols or re-run ingestion for the affected timeframes.');
  }
  if (summary.unexplainedGrain.length > 0) {
    console.log('Next step: keep unexplained grain bins out of scoring until a source-backed rebuild preserves or improves history.');
  }
  console.log('');
  return {
    ok: summary.totalMissing === 0
      && summary.totalStale === 0
      && summary.unexplainedGrain.length === 0,
    type: 'data_availability',
  };
}

function buildJsonAvailability(policy, familyReport, grainSuspects, grainCadencePolicy) {
  const summary = summarizeAvailability(familyReport, grainSuspects);
  return {
    ok: Object.values(familyReport).every((report) => (
      report.missing.length === 0 && report.stale.length === 0
    )) && summary.unexplainedGrain.length === 0,
    type: 'data_availability',
    policy: {
      required_timeframes: policy.requiredTimeframes,
      integrity_exceptions: Array.from(policy.integrityExceptions),
      grain_cadence: grainCadencePolicy(),
    },
    families: familyReport,
    grain_suspects: grainSuspects,
    unexplained_grain_suspects: summary.unexplainedGrain,
    summary: {
      total_config: summary.totalConfig,
      total_cached: summary.totalCached,
      total_missing: summary.totalMissing,
      total_stale: summary.totalStale,
      total_grain_suspect: grainSuspects.length,
      total_grain_cadence_plausible: summary.plausibleGrain.length,
      total_grain_unexplained: summary.unexplainedGrain.length,
      total_exceptions: summary.totalExceptions,
      total_unreachable: summary.totalUnreachable,
    },
  };
}

async function runBackendIntegrity(args = []) {
  const { readCoverage, assessGrainIntegrity, grainCadencePolicy } = require('../../../../shared/lib/market/coverage.js');
  const { loadMarketConfig } = require('../../../../shared/lib/runtime/config_loader.js');
  const policy = await loadIntegrityPolicy(loadMarketConfig);
  policy.unreachableSymbols = loadUnreachableSymbols();
  const coverage = collectIntegrityCoverage(
    policy,
    { readCoverage, assessGrainIntegrity },
    Date.now(),
  );

  if (hasFlag(args, '--audit-vintages')) return renderVintageAudit(coverage.familyReport);
  if (!hasFlag(args, '--json')) {
    return renderHumanAvailability(policy, coverage.familyReport, coverage.grainSuspects);
  }
  return buildJsonAvailability(
    policy,
    coverage.familyReport,
    coverage.grainSuspects,
    grainCadencePolicy,
  );
}

module.exports = { reportSnapshotIntegrity, runBackendIntegrity };
