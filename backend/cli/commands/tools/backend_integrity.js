'use strict';
const path = require('node:path');
const fs = require('node:fs');
const utils = require('../../lib/utils.js');
const { hasFlag } = utils;
const { readSnapshot, validateSnapshot } = require('../../../../shared/lib/market/validation.js');

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

async function runBackendIntegrity(args = []) {
  // Coverage probe (header + head/tail reads) instead of readTsIndex (full bin load):
  // integrity only needs bar count + first/last timestamp per (symbol, tf), so a deep
  // 1m bin (~525k bars) no longer has to be materialized into objects just to be counted.
  const { readCoverage, assessGrainIntegrity, grainCadencePolicy } = require('../../../../shared/lib/market/coverage.js');
  const { loadMarketConfig } = require('../../../../shared/lib/runtime/config_loader.js');
  const TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');
  const CONFIG_PATH = path.join(utils.REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
  const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx']);
  const now = Date.now();
  const STALE_MS = { '5m': 1*60*60*1000, '15m': 2*60*60*1000, '30m': 4*60*60*1000,
    '1h': 6*60*60*1000, '4h': 12*60*60*1000, '1d': 96*60*60*1000, '1w': 14*24*60*60*1000 };
  const CALENDAR_EXEMPT_FAMILIES = new Set(['equities', 'indices', 'commodities']);
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

  let config = {};
  try { config = await loadMarketConfig(CONFIG_PATH); } catch (_) {}
  const requiredTimeframes = Array.isArray(config?.quality?.integrity_timeframes) && config.quality.integrity_timeframes.length > 0
    ? config.quality.integrity_timeframes
    : ['1d'];
  const integrityExceptions = new Set(
    Array.isArray(config?.quality?.integrity_exceptions) ? config.quality.integrity_exceptions.filter(Boolean) : []
  );

  // Read the last ingest snapshot's errors so we can distinguish "stale" (old data,
  // provider still reachable) from "provider_unreachable" (every provider errored on
  // the most recent attempt). The ingest loop writes an aggregate-failure marker as
  // { provider: <family>, symbol, message: 'No <family> provider resolved successfully' }.
  const unreachableSymbols = new Set();
  try {
    const lastFetch = JSON.parse(
      fs.readFileSync(path.join(utils.REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json'), 'utf8')
    );
    for (const err of (lastFetch.errors || [])) {
      if (err && err.symbol && typeof err.message === 'string'
          && /no .*provider resolved successfully/i.test(err.message)) {
        unreachableSymbols.add(err.symbol);
      }
    }
  } catch (_) { /* no snapshot yet — treat nothing as unreachable */ }

  const TF_CANONICAL_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'];
  const tfBase = new Set([...requiredTimeframes, '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);
  const TIMEFRAMES = TF_CANONICAL_ORDER.filter(tf => tfBase.has(tf));

  const familyReport = {};
  const allSymbols = [];
  const grainSuspects = []; // intraday bins claiming a multi-year span with implausibly low density

  for (const [family, data] of Object.entries(config)) {
    if (!OHLCV_FAMILIES.has(family) || !data.enabled) continue;
    const configSymbols = [...new Set([
      ...(data.symbols || []),
      ...(data.series || []),
    ])];
    if (configSymbols.length === 0) continue;

    const fReport = { family, config_count: configSymbols.length, cached: [], missing: [], stale: [], exceptions: [] };

    for (const sym of configSymbols) {
      const tfData = {};
      let hasSomething = false;
      for (const tf of TIMEFRAMES) {
        const cov = readCoverage(TS_DIR, sym, tf, now);
        // Skip empty bins and meta-only "not found" markers (count 0), plus any bin
        // whose head/tail ts couldn't be read (truncated) — matches the prior
        // readTsIndex null/empty behaviour exactly.
        if (!cov.exists || cov.count === 0 || cov.lastBarMs === null || cov.firstBarMs === null) continue;
        hasSomething = true;
        const lastTs = cov.lastBarMs;
        const firstTs = cov.firstBarMs;
        const staleThresh = STALE_MS[tf] || 72 * 60 * 60 * 1000;
        const ageMs = now - lastTs;
        const effectiveAge = (CALENDAR_EXEMPT_FAMILIES.has(family) && tf === '1d')
          ? Math.max(0, ageMs - weekendHoursElapsed(lastTs, now))
          : ageMs;
        tfData[tf] = {
          bars: cov.count,
          from: new Date(firstTs).toISOString().slice(0, 10),
          to: new Date(lastTs).toISOString().slice(0, 10),
          stale: effectiveAge > staleThresh,
          age_h: Math.round(ageMs / 3600000),
          provider: cov.provider,
          derived_from: cov.derivedFrom
        };
        // Cheap grain-corruption tripwire (head/tail data already in cov): a coarse-data leak
        // into an intraday bin shows as a multi-year span with ~1 bar/day. Advisory only.
        const grain = assessGrainIntegrity(TS_DIR, sym, tf, family, cov);
        if (grain.suspect) {
          tfData[tf].grain_suspect = true;
          tfData[tf].grain_status = grain.status;
          tfData[tf].grain_blocking = grain.blocking;
          grainSuspects.push({
            symbol: sym,
            family,
            timeframe: tf,
            provider: cov.provider,
            derived_from: cov.derivedFrom,
            bars: cov.count,
            from: new Date(firstTs).toISOString(),
            to: new Date(lastTs).toISOString(),
            bars_per_day: grain.barsPerDay,
            span_days: grain.spanDays,
            status: grain.status,
            blocking: grain.blocking,
            reason: grain.reason,
            recent_cadence: grain.sample || null,
          });
        }
      }
      const symInfo = { symbol: sym, family, timeframes: tfData };
      if (hasSomething) {
        fReport.cached.push(symInfo);
        // Check only the policy-required timeframes for blocking freshness.
        const configTfs = requiredTimeframes;
        const staleOrMissing = configTfs.filter(tf => !tfData[tf] || tfData[tf].stale);
        if (staleOrMissing.length > 0) {
          if (integrityExceptions.has(sym)) {
            fReport.exceptions.push({ symbol: sym, issues: staleOrMissing });
          } else {
            const staleEntry = { symbol: sym, issues: staleOrMissing };
            if (unreachableSymbols.has(sym)) {
              staleEntry.provider_unreachable = true;
              symInfo.provider_unreachable = true;
            }
            fReport.stale.push(staleEntry);
          }
        }
      } else {
        fReport.missing.push(sym);
      }
      allSymbols.push(symInfo);
    }
    familyReport[family] = fReport;
  }

  // Audit Vintages mode
  if (hasFlag(args, '--audit-vintages')) {
    console.log(`\n=== VINTAGE ALIGNMENT AUDIT ===\n`);
    let totalAnomalies = 0;
    
    for (const [family, r] of Object.entries(familyReport)) {
      let familyAnomalies = [];
      r.cached.forEach(s => {
        let earliest = '9999-99-99';
        let latestFrom = '0000-00-00';
        Object.values(s.timeframes).forEach(meta => {
          if (meta.from < earliest) earliest = meta.from;
          if (meta.from > latestFrom) latestFrom = meta.from;
        });
        
        const yearDiff = parseInt(latestFrom.substring(0,4)) - parseInt(earliest.substring(0,4));
        if (yearDiff >= 1) {
          familyAnomalies.push({ symbol: s.symbol, earliest, latestFrom, yearDiff });
          totalAnomalies++;
        }
      });
      
      if (familyAnomalies.length > 0) {
        console.log(`[ ${family.toUpperCase()} ] - ${familyAnomalies.length} symbols with mixed vintages`);
        familyAnomalies.sort((a,b) => b.yearDiff - a.yearDiff).forEach(a => {
          console.log(`  ${a.symbol.padEnd(10)} | Delta: ${a.yearDiff} years | Deepest: ${a.earliest} | Shallowest: ${a.latestFrom}`);
        });
        console.log('');
      }
    }
    console.log(`Audit complete. Found ${totalAnomalies} mixed-vintage symbols.\n`);
    return { ok: true, type: 'vintage_audit' };
  }

  // Render to console (non-JSON mode)
  if (!hasFlag(args, '--json')) {
    const line = '-'.repeat(72);
    const totalCached = Object.values(familyReport).reduce((s, r) => s + r.cached.length, 0);
    const totalConfig = Object.values(familyReport).reduce((s, r) => s + r.config_count, 0);
    const totalMissing = Object.values(familyReport).reduce((s, r) => s + r.missing.length, 0);
    const totalStale = Object.values(familyReport).reduce((s, r) => s + r.stale.length, 0);
    const unexplainedGrain = grainSuspects.filter((entry) => entry.blocking);
    const plausibleGrain = grainSuspects.filter((entry) => !entry.blocking);

    console.log(`\n[DATA AVAILABILITY REPORT] ${new Date().toISOString()}`);
    console.log(`Coverage: ${totalCached}/${totalConfig} cached | missing: ${totalMissing} | stale: ${totalStale}`);
    console.log(`Policy: required timeframes = ${requiredTimeframes.join(', ')}`);
    if (integrityExceptions.size > 0) {
      console.log(`Policy: stale exceptions = ${Array.from(integrityExceptions).join(', ')}`);
    }
    if (grainSuspects.length > 0) {
      console.log(`\x1b[33mGrain: ${unexplainedGrain.length} unexplained, ${plausibleGrain.length} cadence-plausible across ${grainSuspects.length} density tripwire hit(s):\x1b[0m`);
      for (const g of grainSuspects.slice(0, 20)) {
        const cadence = g.recent_cadence
          ? `${g.recent_cadence.bars_per_active_day}/active-day, median gap ${g.recent_cadence.median_within_day_gap_minutes}m`
          : 'no recent cadence sample';
        console.log(`  ${g.blocking ? 'BLOCK' : 'OK   '} ${g.symbol} ${g.timeframe}: ${g.status} (${cadence}; ${g.provider || 'unknown'})`);
      }
    }
    console.log(line);

    for (const [family, r] of Object.entries(familyReport)) {
      const pct = r.config_count > 0 ? Math.round(r.cached.length / r.config_count * 100) : 0;
      const statusLabel = pct === 100 ? 'OK' : pct >= 50 ? 'WARN' : 'FAIL';
      console.log(`\n${family.toUpperCase()}  ${statusLabel}  ${r.cached.length}/${r.config_count} cached (${pct}%)`);

      if (r.missing.length > 0) {
        console.log(`  Missing: ${r.missing.join(', ')}`);
      }
      if (r.stale.length > 0) {
        r.stale.forEach(s => {
          const tag = s.provider_unreachable ? ' (provider unreachable — all providers failed last fetch)' : '';
          console.log(`  Stale: ${s.symbol} [${s.issues.join(', ')}]${tag}`);
        });
      }
      if (r.exceptions.length > 0) {
        r.exceptions.forEach(s => console.log(`  Exception: ${s.symbol} [${s.issues.join(', ')}]`));
      }

      // Show cached symbols with their history range and bar counts per timeframe
      r.cached.forEach(s => {
        const tf1d = s.timeframes['1d'];
        const tf1h = s.timeframes['1h'];
        const primary = tf1d || tf1h || Object.values(s.timeframes)[0];
        if (!primary) return;
        const staleTag = primary.stale ? ` [stale ${primary.age_h}h]` : '';

        console.log(`  OK ${s.symbol.padEnd(12)} ${primary.from} -> ${primary.to}${staleTag}`);
        Object.entries(s.timeframes)
          .sort(([a], [b]) => TF_CANONICAL_ORDER.indexOf(a) - TF_CANONICAL_ORDER.indexOf(b))
          .forEach(([tf, meta]) => {
            const range = (meta.from && meta.to) ? `[ ${meta.from} -> ${meta.to} ]` : '';
            const bars = meta.bars.toString().padStart(8);
            const provStr = meta.provider || 'unknown';
            const rollupStr = meta.derived_from ? `true (from ${meta.derived_from})` : 'false';
            console.log(`     └─ ${tf.padStart(3)}: ${bars} bars  ${range}  [ Source: ${provStr.padEnd(8)} | Rolled Up: ${rollupStr} ]`);
          });
      });
    }

    console.log(`\n${line}`);
    console.log(`SUMMARY: ${totalCached}/${totalConfig} symbols cached | ${totalMissing} missing | ${totalStale} stale`);
    if (totalMissing > 0) {
      console.log('Next step: backfill the missing symbols first.');
    }
    if (totalStale > 0) {
      console.log('Next step: refresh stale symbols or re-run ingestion for the affected timeframes.');
    }
    if (unexplainedGrain.length > 0) {
      console.log('Next step: keep unexplained grain bins out of scoring until a source-backed rebuild preserves or improves history.');
    }
    console.log('');
    return { ok: totalMissing === 0 && totalStale === 0 && unexplainedGrain.length === 0, type: 'data_availability' };
  }

  // JSON mode: return structured data
  const unexplainedGrain = grainSuspects.filter((entry) => entry.blocking);
  const plausibleGrain = grainSuspects.filter((entry) => !entry.blocking);
  return {
    ok: Object.values(familyReport).every(r => r.missing.length === 0 && r.stale.length === 0)
      && unexplainedGrain.length === 0,
    type: 'data_availability',
    policy: {
      required_timeframes: requiredTimeframes,
      integrity_exceptions: Array.from(integrityExceptions),
      grain_cadence: grainCadencePolicy(),
    },
    families: familyReport,
    grain_suspects: grainSuspects,
    unexplained_grain_suspects: unexplainedGrain,
    summary: {
      total_config: Object.values(familyReport).reduce((s, r) => s + r.config_count, 0),
      total_cached: Object.values(familyReport).reduce((s, r) => s + r.cached.length, 0),
      total_missing: Object.values(familyReport).reduce((s, r) => s + r.missing.length, 0),
      total_stale: Object.values(familyReport).reduce((s, r) => s + r.stale.length, 0),
      total_grain_suspect: grainSuspects.length,
      total_grain_cadence_plausible: plausibleGrain.length,
      total_grain_unexplained: unexplainedGrain.length,
      total_exceptions: Object.values(familyReport).reduce((s, r) => s + r.exceptions.length, 0),
      total_unreachable: Object.values(familyReport)
        .reduce((s, r) => s + r.stale.filter(e => e.provider_unreachable).length, 0),
    },
  };
}

module.exports = { reportSnapshotIntegrity, runBackendIntegrity };
