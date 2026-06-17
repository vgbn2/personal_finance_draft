'use strict';

const { formatStrategyAssetModeLabel } = require('../../../../shared/lib/strategy/registry.js');

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatPercent(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const percent = value * 100;
  if (Math.abs(percent) > 9999) return percent > 0 ? '>9999%' : '<-9999%';
  return `${percent.toFixed(digits)}%`;
}

function formatDecimal(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

function formatBacktestLine(label, value, width = 22) {
  return `  ${label.padEnd(width)} ${value}`;
}

function formatPanelLine(label, value) {
  return formatBacktestLine(label, value, 17);
}

function formatCompactPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const percent = value * 100;
  if (Math.abs(percent) >= 1000) return `${Math.round(percent)}%`;
  if (Math.abs(percent) >= 100) return `${percent.toFixed(0)}%`;
  return `${percent.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// ANSI / string utilities
// ---------------------------------------------------------------------------

const ANSI_STRIP_RE = /\[[0-9;]*m/g;

function visibleLength(text) {
  return String(text || '').replace(ANSI_STRIP_RE, '').length;
}

function padVisibleRight(text, width) {
  const value = String(text || '');
  const pad = Math.max(0, width - visibleLength(value));
  return value + ' '.repeat(pad);
}

function clipVisible(text, width) {
  const value = String(text || '');
  if (visibleLength(value) <= width) return value;
  const plain = value.replace(ANSI_STRIP_RE, '');
  if (width <= 3) return plain.slice(0, width);
  return `${plain.slice(0, width - 3)}...`;
}

function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

function shortTimestamp(value) {
  if (!value) return 'n/a';
  return String(value).replace('T', ' ').replace('.000Z', '').replace('Z', '').slice(0, 16);
}

function shortDate(value) {
  if (!value) return 'n/a';
  return String(value).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Data sampling / charting
// ---------------------------------------------------------------------------

function sampleSeries(values, width) {
  if (!Array.isArray(values) || values.length === 0 || width <= 0) return [];
  if (values.length <= width) return values.slice();
  const samples = [];
  for (let index = 0; index < width; index += 1) {
    const ratio = width === 1 ? 0 : index / (width - 1);
    const position = ratio * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    samples.push(lower === upper ? values[lower] : values[lower] * (1 - weight) + values[upper] * weight);
  }
  return samples;
}

function drawBar(value, min, max, width, fill = '#') {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return `[${'.'.repeat(width)}]`;
  }
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const filled = Math.round(pct * width);
  return `[${fill.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
}

// ---------------------------------------------------------------------------
// Panel renderers
// ---------------------------------------------------------------------------

function renderReturnTape(points, options = {}) {
  const width = Math.max(18, Math.floor(options.width || 28));
  const validPoints = (Array.isArray(points) ? points : []).filter((point) => Number.isFinite(point?.equity));
  if (validPoints.length === 0) return '  (no return path available)';

  const startEquity = validPoints[0].equity || 1;
  const returns = validPoints.map((point) => Math.max(-1, (point.equity / startEquity) - 1));
  const endReturn = returns[returns.length - 1];
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const finalEquity = validPoints[validPoints.length - 1].equity;
  let peakEquity = startEquity;
  let maxDrawdown = 0;
  for (const point of validPoints) {
    peakEquity = Math.max(peakEquity, point.equity);
    if (peakEquity > 0) maxDrawdown = Math.max(maxDrawdown, (peakEquity - point.equity) / peakEquity);
  }

  const sampled = sampleSeries(returns, width);
  const floor = -1;
  const ceiling = Math.max(0.05, maxReturn);
  const baseline = 0;
  const path = sampled.map((value, index) => {
    const previous = index > 0 ? sampled[index - 1] : value;
    if (value < floor + 0.02) return '_';
    if (value < baseline) return '\\';
    if (value > previous + 0.02) return '/';
    if (value < previous - 0.02) return '\\';
    return '|';
  }).join('');
  const scale = `-${formatCompactPercent(1)} ${formatCompactPercent(baseline)} ${formatCompactPercent(ceiling)}`;

  const lines = [];
  lines.push(formatPanelLine('End', formatCompactPercent(endReturn)));
  lines.push(formatPanelLine('Range', `${formatCompactPercent(minReturn)}..${formatCompactPercent(maxReturn)}`));
  lines.push(formatPanelLine('Peak equity', formatCompactPercent((peakEquity / startEquity) - 1)));
  lines.push(formatPanelLine('Max DD', formatCompactPercent(maxDrawdown)));
  lines.push(`  Trace             ${path}`);
  lines.push(`  Scale             ${scale}`);
  lines.push(`  Drawdown         ${drawBar(maxDrawdown, 0, 1, 28, '#')} ${formatCompactPercent(maxDrawdown)}`);
  lines.push(formatPanelLine('Floor', '-100%'));
  lines.push(formatPanelLine('Last equity', formatDecimal(finalEquity)));
  return lines.join('\n');
}

function renderStressShape(stress) {
  const medianFinal = Number.isFinite(stress.median_final_return) ? stress.median_final_return : 0;
  const worstFinal = Number.isFinite(stress.worst_path?.final_return)
    ? stress.worst_path.final_return
    : stress.p05_final_return;
  const p05 = Number.isFinite(stress.p05_final_return) ? stress.p05_final_return : worstFinal;
  const p95 = Number.isFinite(stress.p95_final_return) ? stress.p95_final_return : medianFinal;
  const ddMean = Number.isFinite(stress.mean_max_drawdown) ? stress.mean_max_drawdown : 0;
  const ddP95 = Number.isFinite(stress.p95_max_drawdown) ? stress.p95_max_drawdown : ddMean;
  const lossProb = Number.isFinite(stress.probability_of_loss) ? stress.probability_of_loss : 0;
  const upsideScale = Math.max(0.01, Math.min(10, Math.max(medianFinal, p95)));

  return [
    formatPanelLine('Median final', formatCompactPercent(medianFinal)),
    `  Median lift      ${drawBar(Math.max(0, medianFinal), 0, upsideScale, 30, '+')}`,
    formatPanelLine('Worst sample', formatCompactPercent(worstFinal)),
    `  Loss risk        ${drawBar(lossProb, 0, 1, 30, '!')} ${formatCompactPercent(lossProb)}`,
    formatPanelLine('P05 / P95', `${formatCompactPercent(p05)} / ${formatCompactPercent(p95)}`),
    `  Tail width       ${drawBar(Math.min(10, Math.max(0, p95 - p05)), 0, 10, 30, '=')}`,
    formatPanelLine('Mean DD', formatCompactPercent(ddMean)),
    `  DD pressure      ${drawBar(ddMean, 0, 1, 30, '#')}`,
    formatPanelLine('P95 DD', formatCompactPercent(ddP95)),
    `  DD shock         ${drawBar(ddP95, 0, 1, 30, '#')}`,
  ].join('\n');
}

function renderSideBySide(leftText, rightText, leftWidth = 48, gap = '  ') {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const rows = Math.max(leftLines.length, rightLines.length);
  const lines = [];
  for (let index = 0; index < rows; index += 1) {
    const left = padVisibleRight(leftLines[index] || '', leftWidth);
    const right = rightLines[index] || '';
    lines.push(`${left}${gap}${right}`);
  }
  return lines.join('\n');
}

function renderVerdictBlock(report) {
  const trust = report.trust_gate || {};
  const propFirm = report.metrics && report.metrics.prop_firm ? report.metrics.prop_firm : null;
  const oos = report.out_of_sample && report.out_of_sample.metrics ? report.out_of_sample.metrics : {};

  // Determine overall action
  const trustFail = trust.grade === 'F' || trust.verdict === 'do-not-trust-yet';
  const propFail = propFirm && propFirm.passable === false;
  const oosNegative = typeof oos.net_return === 'number' && oos.net_return < 0;

  let action, actionColor, fixes;

  if (trustFail && propFail) {
    action = 'DO NOT TRADE';
    actionColor = '\x1b[1;31m';
    fixes = [];
    if (trust.warnings && trust.warnings.length) fixes.push(`Resolve trust warnings: ${trust.warnings.slice(0, 2).join(', ')}`);
    if (propFirm && propFirm.max_daily_loss_usage > 100) fixes.push(`Daily loss ${(propFirm.max_daily_loss_usage).toFixed(0)}% of limit — reduce position size`);
    if (propFirm && propFirm.max_total_loss_usage > 100) fixes.push(`Total loss ${(propFirm.max_total_loss_usage).toFixed(0)}% of limit — tighten stop-loss`);
    if (oosNegative) fixes.push(`OOS return negative (${(oos.net_return * 100).toFixed(1)}%) — strategy needs re-optimisation`);
  } else if (trustFail) {
    action = 'HOLD — trust gate not met';
    actionColor = '\x1b[1;33m';
    fixes = trust.warnings && trust.warnings.length ? [`Fix: ${trust.warnings.slice(0, 2).join('; ')}`] : ['Refresh data cache and re-run'];
  } else if (propFail) {
    action = 'HOLD — prop firm breach risk';
    actionColor = '\x1b[1;33m';
    fixes = [];
    if (propFirm.max_daily_loss_usage > 100) fixes.push(`Cut daily risk: loss usage ${(propFirm.max_daily_loss_usage).toFixed(0)}% > 100%`);
    if (propFirm.max_total_loss_usage > 100) fixes.push(`Cut total risk: loss usage ${(propFirm.max_total_loss_usage).toFixed(0)}% > 100%`);
    if (!fixes.length && propFirm.warnings && propFirm.warnings.length) fixes.push(propFirm.warnings[0]);
  } else if (oosNegative) {
    action = 'CAUTION — OOS underperforms';
    actionColor = '\x1b[1;33m';
    fixes = [`OOS return ${(oos.net_return * 100).toFixed(1)}% — consider extending training window or adjusting threshold`];
  } else {
    action = 'PROCEED — strategy passes gates';
    actionColor = '\x1b[1;32m';
    fixes = ['Run live paper trade before committing capital'];
  }

  const W = 96;
  const sep = '─'.repeat(W);
  let out = `\n\x1b[1mVerdict\x1b[0m\n${sep}\n`;
  out += `  Action    ${actionColor}${action}\x1b[0m\n`;
  if (fixes.length) {
    fixes.forEach((f, i) => {
      out += `  ${i === 0 ? 'Fix' : '   '}       ${f}\n`;
    });
  }
  if (propFirm) {
    const pfColor = propFirm.passable ? '\x1b[32m' : '\x1b[31m';
    out += `  Prop firm ${pfColor}${propFirm.profile_name || propFirm.profile_id || 'active'} — ${propFirm.passable ? 'passable' : 'breach risk'}\x1b[0m`;
    if (propFirm.grade) out += ` (grade ${propFirm.grade})`;
    out += '\n';
  }
  out += sep;
  return out;
}

function renderFramedBlock(title, body, width) {
  const innerWidth = Math.max(18, width - 2);
  const lines = splitLines(body);
  const framed = [];
  framed.push(`+${'-'.repeat(innerWidth)}+`);
  if (title) {
    framed.push(`| ${padVisibleRight(clipVisible(title, innerWidth - 2), innerWidth - 2)} |`);
    framed.push(`|${'-'.repeat(innerWidth)}|`);
  }
  if (lines.length === 0) {
    framed.push(`|${padVisibleRight('', innerWidth)}|`);
  } else {
    for (const line of lines) {
      const clipped = clipVisible(line, innerWidth);
      framed.push(`|${padVisibleRight(clipped, innerWidth)}|`);
    }
  }
  framed.push(`+${'-'.repeat(innerWidth)}+`);
  return framed.join('\n');
}

// ---------------------------------------------------------------------------
// Return / time span calculations
// ---------------------------------------------------------------------------

function annualizedReturn(netReturn, start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  if (typeof netReturn !== 'number' || !Number.isFinite(netReturn) || netReturn <= -1) return null;
  const years = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 0) return null;
  return Math.pow(1 + netReturn, 1 / years) - 1;
}

function timeSpanYears(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Benchmark helpers
// ---------------------------------------------------------------------------

function compactBenchmark(benchmark) {
  if (!benchmark) return null;
  return {
    name: benchmark.name,
    symbol_count: benchmark.symbol_count,
    net_return: benchmark.net_return,
    best: benchmark.best ? {
      symbol: benchmark.best.symbol,
      net_return: benchmark.best.net_return,
      start: benchmark.best.start,
      end: benchmark.best.end,
    } : null,
    worst: benchmark.worst ? {
      symbol: benchmark.worst.symbol,
      net_return: benchmark.worst.net_return,
      start: benchmark.worst.start,
      end: benchmark.worst.end,
    } : null,
  };
}

function compactBenchmarks(benchmarks) {
  if (!benchmarks) return null;
  return {
    buy_hold_equal_weight: compactBenchmark(benchmarks.buy_hold_equal_weight),
  };
}

// ---------------------------------------------------------------------------
// Trust assessment
// ---------------------------------------------------------------------------

function buildTrustAssessment(report, outOfSample, options = {}) {
  const quality = report.data_quality_summary || {};
  const benchmark = outOfSample.benchmarks?.buy_hold_equal_weight || null;
  const oosAlpha = benchmark && Number.isFinite(benchmark.net_return)
    ? outOfSample.metrics.net_return - benchmark.net_return
    : null;
  const annualized = options.annualized;
  const oosAnnualized = options.oosAnnualized;
  const wf = options.walkForward && options.walkForward.ok ? options.walkForward : null;
  const freshnessRatio = quality.total_records > 0
    ? (quality.freshness_warnings || 0) / quality.total_records
    : 0;
  let score = 100;
  const warnings = [];

  if (report.source_mode === 'sample') {
    score -= 35;
    warnings.push('sample mode is not research evidence');
  }
  if (quality.risk === 'elevated') {
    score -= 35;
    warnings.push('data rejects/errors present');
  } else if (quality.risk === 'watch') {
    score -= 15;
    warnings.push('data freshness/provenance needs review');
  }
  if (freshnessRatio > 0.25) {
    score -= 15;
    warnings.push('large stale-record share');
  } else if (freshnessRatio > 0) {
    score -= 5;
    warnings.push('some stale records');
  }
  if ((outOfSample.metrics.trades || 0) < 50) {
    score -= 20;
    warnings.push('small OOS trade sample');
  }
  if (Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0.75) {
    score -= 20;
    warnings.push('extreme full-sample drawdown');
  } else if (Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0.5) {
    score -= 12;
    warnings.push('large full-sample drawdown');
  }
  if (Number.isFinite(oosAlpha) && oosAlpha < 0) {
    score -= 20;
    warnings.push('OOS underperforms buy-and-hold');
  }
  if (Number.isFinite(annualized) && Number.isFinite(oosAnnualized) && annualized > 1 && oosAnnualized < annualized * 0.35) {
    score -= 15;
    warnings.push('in-sample return far exceeds OOS');
  }
  const lossProb = report.metrics.monte_carlo?.probability_of_loss;
  if (Number.isFinite(lossProb) && lossProb > 0.5) {
    score -= 18;
    warnings.push('stress loss probability high');
  } else if (Number.isFinite(lossProb) && lossProb > 0.2) {
    score -= 10;
    warnings.push('stress loss probability elevated');
  }

  // Rolling walk-forward evidence
  const wfSummary = wf ? wf.aggregate : null;
  if (wf) {
    const positiveRate = wf.aggregate.positive_oos_rate;
    const meanOosReturn = wf.aggregate.mean_oos_return;
    if (Number.isFinite(positiveRate) && positiveRate < 0.5) {
      score -= 15;
      warnings.push(`rolling WF: only ${Math.round(positiveRate * 100)}% of folds profitable`);
    } else if (Number.isFinite(positiveRate) && positiveRate >= 0.67) {
      score = Math.min(100, score + 5);
    }
    if (Number.isFinite(meanOosReturn) && meanOosReturn < 0) {
      score -= 10;
      warnings.push('rolling WF mean OOS return negative');
    }
  } else if (report.source_mode !== 'sample') {
    score -= 5;
    warnings.push('rolling walk-forward not run');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  const verdict = grade === 'A' || grade === 'B'
    ? 'researchable'
    : grade === 'C'
      ? 'provisional'
      : 'do-not-trust-yet';
  return {
    grade,
    score,
    verdict,
    warnings: [...new Set(warnings)].slice(0, 6),
    oos_alpha_vs_buy_hold: oosAlpha,
    freshness_warning_ratio: freshnessRatio,
    walk_forward_summary: wfSummary || null,
  };
}

// ---------------------------------------------------------------------------
// Backtest summary payload + renderer
// ---------------------------------------------------------------------------

function backtestSummaryPayload(report, outOfSample, output, note = null) {
  const tailRisk = report.metrics.tail_risk || {};
  const monteCarlo = report.metrics.monte_carlo || {};
  const propFirm = report.metrics.prop_firm || null;
  const annualized = annualizedReturn(report.metrics.net_return, report.data_start, report.data_end);
  const tradeDensity = timeSpanYears(report.data_start, report.data_end);
  const recoveryFactor = Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0
    ? report.metrics.net_return / report.metrics.max_drawdown
    : null;
  const propFirmExpectancy = propFirm ? {
    profile_id: propFirm.profile_id || null,
    profile_name: propFirm.profile_name || null,
    firm: propFirm.firm || null,
    account_type: propFirm.account_type || null,
    step_count: propFirm.step_count ?? null,
    grade: propFirm.grade || null,
    score: propFirm.score ?? null,
    verdict: propFirm.verdict || null,
    passable: typeof propFirm.passable === 'boolean' ? propFirm.passable : null,
    trading_days: propFirm.trading_days ?? null,
    max_daily_loss_usage: propFirm.max_daily_loss_usage ?? null,
    max_total_loss_usage: propFirm.max_total_loss_usage ?? null,
    best_day_share_of_positive_profit: propFirm.best_day_share_of_positive_profit ?? null,
    time_weighted_variance: propFirm.time_weighted_variance ?? null,
    warnings: Array.isArray(propFirm.warnings) ? propFirm.warnings : [],
  } : null;
  const oosAnnualized = annualizedReturn(outOfSample.metrics.net_return, report.oos_start_at, report.oos_end_at);
  return {
    generated_at: report.generated_at,
    source_mode: report.source_mode,
    backtest_engine: report.engine || 'sovereign_js',
    data_quality_ok: report.data_quality_ok,
    data_quality_summary: report.data_quality_summary || null,
    trust_assessment: report.trust_assessment || null,
    strategy: report.strategy,
    strategy_source: report.strategy_source,
    strategy_family: report.strategy_family,
    strategy_lane: report.strategy_lane,
    strategy_role: report.strategy_role,
    strategy_universe: report.strategy_universe,
    strategy_asset_mode: report.strategy_asset_mode || null,
    model: report.model,
    timeframe: report.timeframe,
    period: report.period,
    threshold: report.threshold,
    data_start: report.data_start,
    data_end: report.data_end,
    data_bars: report.data_bars,
    oos_start_at: report.oos_start_at,
    oos_end_at: report.oos_end_at,
    oos_bars: report.oos_bars,
    run_started_at: report.run_started_at,
    run_ended_at: report.run_ended_at,
    runtime_ms: report.runtime_ms,
    trade_logs: report.trades.length,
    trades: report.metrics.trades,
    fee_bps: report.fee_bps,
    slippage_bps: report.slippage_bps,
    net_return: report.metrics.net_return,
    annualized_return: annualized,
    oos_annualized_return: oosAnnualized,
    calmar_ratio: report.calmar_ratio,
    trade_density_per_year: tradeDensity && tradeDensity > 0 ? report.metrics.trades / tradeDensity : null,
    recovery_factor: recoveryFactor,
    max_drawdown: report.metrics.max_drawdown,
    profit_factor: report.metrics.profit_factor,
    sharpe_ratio: report.metrics.sharpe_ratio,
    sortino_ratio: report.metrics.sortino_ratio,
    average_win: report.metrics.average_win,
    average_loss: report.metrics.average_loss,
    payoff_ratio: report.metrics.payoff_ratio,
    win_rate: report.metrics.win_rate,
    expected_value: report.metrics.expected_value,
    time_weighted_variance: report.metrics.time_weighted_variance,
    time_weighted_stddev: report.metrics.time_weighted_stddev,
    daily_summary: report.metrics.daily_summary || null,
    tail_var_95: tailRisk.value_at_risk,
    tail_es_95: tailRisk.expected_shortfall,
    mc_p05_return: monteCarlo.p05_final_return,
    mc_loss_prob: monteCarlo.probability_of_loss,
    mc_mean_max_drawdown: monteCarlo.mean_max_drawdown,
    mc_p95_max_drawdown: monteCarlo.p95_max_drawdown,
    stress_test: monteCarlo,
    benchmarks: compactBenchmarks(report.benchmarks),
    oos_benchmarks: compactBenchmarks(outOfSample.benchmarks),
    oos_trades: outOfSample.metrics.trades,
    oos_expected_value: outOfSample.metrics.expected_value,
    oos_net_return: outOfSample.metrics.net_return,
    prop_firm_suitability: propFirm,
    prop_firm_expectancy: propFirmExpectancy,
    prop_firm_profile: propFirm ? {
      id: propFirm.profile_id || null,
      name: propFirm.profile_name || null,
      firm: propFirm.firm || null,
      account_type: propFirm.account_type || null,
      step_count: propFirm.step_count ?? null,
    } : null,
    walk_forward: report.walk_forward ? {
      ok: report.walk_forward.ok,
      folds_run: report.walk_forward.folds_run,
      aggregate: report.walk_forward.aggregate || null,
    } : null,
    notes: note ? [note] : [],
    output,
  };
}

function renderBacktestSummary(report, outOfSample, output, note = null) {
  const universe = Array.isArray(report.strategy_universe) && report.strategy_universe.length
    ? report.strategy_universe.join(', ')
    : 'all available symbols';
  const assetMode = report.strategy_asset_mode || 'single_asset';
  const period = report.period && (report.period.from || report.period.to)
    ? `${report.period.from || 'start'} -> ${report.period.to || 'latest'}`
    : 'full sample';
  const tailRisk = report.metrics.tail_risk || {};
  const monteCarlo = report.metrics.monte_carlo || {};
  const annualized = annualizedReturn(report.metrics.net_return, report.data_start, report.data_end);
  const oosAnnualized = annualizedReturn(outOfSample.metrics.net_return, report.oos_start_at, report.oos_end_at);
  const tradeDensity = timeSpanYears(report.data_start, report.data_end);
  const recoveryFactor = Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0
    ? report.metrics.net_return / report.metrics.max_drawdown
    : null;
  const oosRecoveryFactor = Number.isFinite(outOfSample.metrics.max_drawdown) && outOfSample.metrics.max_drawdown > 0
    ? outOfSample.metrics.net_return / outOfSample.metrics.max_drawdown
    : null;

  console.log('');
  console.log('Backtest Summary');
  console.log('----------------');
  console.log(formatBacktestLine('Strategy', report.strategy));
  if (report.strategy_source) console.log(formatBacktestLine('Source', report.strategy_source));
  console.log(formatBacktestLine('Asset mode', formatStrategyAssetModeLabel(assetMode)));
  console.log(formatBacktestLine('Universe', universe));
  console.log(formatBacktestLine('Model', report.model));
  console.log(formatBacktestLine('Timeframe', report.timeframe || 'all'));
  console.log(formatBacktestLine('Period', period));
  console.log(formatBacktestLine('Threshold', formatDecimal(report.threshold, 2)));
  if (report.data_start || report.data_end) {
    const windowLabel = report.data_start && report.data_end
      ? `${report.data_start} -> ${report.data_end}`
      : report.data_start || report.data_end;
    console.log(formatBacktestLine('Data window', windowLabel));
    if (Number.isFinite(report.data_bars)) {
      console.log(formatBacktestLine('Data bars', String(report.data_bars)));
    }
  }
  console.log(formatBacktestLine('Runtime', Number.isFinite(report.runtime_ms) ? `${report.runtime_ms} ms` : 'n/a'));
  if (note) {
    const color = '\x1b[2;32m';
    console.log(`  \x1b[90mNote\x1b[0m                   ${color}${note}\x1b[0m`);
  }
  if (report.data_quality_summary && !report.data_quality_summary.ok) {
    const summary = report.data_quality_summary;
    const codes = summary.top_issue_codes && summary.top_issue_codes.length
      ? ` (${summary.top_issue_codes.join(', ')})`
      : '';
    console.log(formatBacktestLine('Data quality', `${summary.rejected_records} rejected, ${summary.warnings} warnings${codes}`));
  }

  const metricPanelBody = (title, metrics, start, end, annReturn, recovery) => [
    formatPanelLine('Window', `${shortDate(start)}..${shortDate(end)}`),
    formatPanelLine('Net return', formatPercent(metrics.net_return)),
    formatPanelLine('Annualized', formatPercent(annReturn)),
    formatPanelLine('Max drawdown', formatPercent(metrics.max_drawdown)),
    formatPanelLine('Recovery', formatDecimal(recovery)),
    formatPanelLine('Profit factor', formatDecimal(metrics.profit_factor)),
    formatPanelLine('Trades', String(metrics.trades)),
    formatPanelLine('Win rate', formatPercent(metrics.win_rate)),
    formatPanelLine('Expected value', formatPercent(metrics.expected_value)),
    formatPanelLine('Sharpe/Sortino', `${formatDecimal(metrics.sharpe_ratio)} / ${formatDecimal(metrics.sortino_ratio)}`),
    formatPanelLine('Avg win/loss', `${formatPercent(metrics.average_win)} / ${formatPercent(metrics.average_loss)}`),
  ].join('\n');

  const equitySeries = Array.isArray(report.compare_equity_curves) && report.compare_equity_curves.length
    ? report.compare_equity_curves
    : Array.isArray(report.equity_curve) && report.equity_curve.length
      ? [{ label: report.strategy, points: report.equity_curve, symbol: '|' }]
      : [];
  const equityChart = equitySeries.length > 0
    ? renderReturnTape(equitySeries[0].points, { width: 42, height: 5 })
    : '  (no return tape available)';
  const metricsPanel = renderFramedBlock('Backtest Metrics', metricPanelBody('Backtest', report.metrics, report.data_start, report.data_end, annualized, recoveryFactor), 46);
  const equityPanel = renderFramedBlock('Backtest Return Tape', equityChart, 68);

  console.log('');
  console.log('Backtest Panel');
  console.log('--------------');
  console.log(renderSideBySide(metricsPanel, equityPanel, 46));

  const oosSeries = Array.isArray(outOfSample.equity_curve) && outOfSample.equity_curve.length
    ? [{ label: `${report.strategy} OOS`, points: outOfSample.equity_curve, color: '\x1b[36m', symbol: '|' }]
    : [];
  const oosChart = oosSeries.length > 0
    ? renderReturnTape(oosSeries[0].points, { width: 42, height: 5 })
    : '  (no OOS return tape available)';
  const oosMetricsPanel = renderFramedBlock(
    'OOS Metrics',
    metricPanelBody('OOS', outOfSample.metrics, report.oos_start_at, report.oos_end_at, oosAnnualized, oosRecoveryFactor),
    46,
  );
  const oosCurvePanel = renderFramedBlock('OOS Return Tape', oosChart, 68);

  console.log('');
  console.log('Out Of Sample Panel');
  console.log('-------------------');
  console.log(renderSideBySide(oosMetricsPanel, oosCurvePanel, 46));

  const riskPanel = renderFramedBlock('Risk', [
    formatPanelLine('Fee/slippage', `${formatDecimal(report.fee_bps, 1)} / ${formatDecimal(report.slippage_bps, 1)} bps`),
    formatPanelLine('VaR 95', formatPercent(tailRisk.value_at_risk)),
    formatPanelLine('ES 95', formatPercent(tailRisk.expected_shortfall)),
    formatPanelLine('MC p05 return', formatPercent(monteCarlo.p05_final_return)),
    formatPanelLine('MC loss prob', formatPercent(monteCarlo.probability_of_loss)),
    formatPanelLine('MC p95 max DD', formatPercent(monteCarlo.p95_max_drawdown)),
  ].join('\n'), 46);

  const hygiene = report.data_quality_summary || {};
  const issueCodes = Array.isArray(hygiene.top_issue_codes) && hygiene.top_issue_codes.length
    ? hygiene.top_issue_codes.join(', ')
    : 'none';
  const hygienePanel = renderFramedBlock('Data Hygiene', [
    formatPanelLine('Status', hygiene.risk || 'clean'),
    formatPanelLine('Total records', String(hygiene.total_records ?? report.data_bars ?? 0)),
    formatPanelLine('Usable records', String(hygiene.usable_records ?? report.data_bars ?? 0)),
    formatPanelLine('Rejected', String(hygiene.rejected_records ?? 0)),
    formatPanelLine('Fresh stale', String(hygiene.freshness_warnings ?? 0)),
    formatPanelLine('Issues', issueCodes),
    formatPanelLine('Action', (hygiene.rejected_records || 0) > 0 ? 'clean/reingest' : (hygiene.freshness_warnings || 0) > 0 ? 'refresh cache' : 'none'),
  ].join('\n'), 46);

  console.log('');
  console.log('Evaluation');
  console.log('----------');
  console.log(renderSideBySide(riskPanel, hygienePanel, 46));

  const trust = report.trust_assessment || {};
  const fullBenchmark = report.benchmarks?.buy_hold_equal_weight || {};
  const oosBenchmark = outOfSample.benchmarks?.buy_hold_equal_weight || {};
  const benchmarkAlpha = Number.isFinite(trust.oos_alpha_vs_buy_hold) ? trust.oos_alpha_vs_buy_hold : null;
  const trustPanel = renderFramedBlock('Trust Gate', [
    formatPanelLine('Grade', trust.grade ? `${trust.grade} (${trust.score}/100)` : 'n/a'),
    formatPanelLine('Verdict', trust.verdict || 'n/a'),
    formatPanelLine('OOS alpha', formatPercent(benchmarkAlpha)),
    formatPanelLine('Fresh ratio', formatPercent(trust.freshness_warning_ratio)),
    formatPanelLine('Warnings', Array.isArray(trust.warnings) && trust.warnings.length ? trust.warnings.join(', ') : 'none'),
  ].join('\n'), 46);
  const propFirm = report.metrics.prop_firm || null;
  const propFirmPanel = renderFramedBlock('Prop Firm Expectancy', propFirm ? [
    formatPanelLine('Profile', propFirm.profile_name || propFirm.profile_id || 'active'),
    formatPanelLine('Firm', propFirm.firm || 'n/a'),
    formatPanelLine('Account type', propFirm.account_type || 'n/a'),
    formatPanelLine('Expectancy', propFirm.score != null ? `${propFirm.score}/100` : 'n/a'),
    formatPanelLine('Grade', propFirm.grade ? `${propFirm.grade}` : 'n/a'),
    formatPanelLine('Verdict', propFirm.verdict || 'n/a'),
    formatPanelLine('Passable', typeof propFirm.passable === 'boolean' ? (propFirm.passable ? 'yes' : 'no') : 'n/a'),
    formatPanelLine('Trading days', String(propFirm.trading_days ?? 'n/a')),
    formatPanelLine('Max daily loss', formatPercent(propFirm.max_daily_loss_usage)),
    formatPanelLine('Max total loss', formatPercent(propFirm.max_total_loss_usage)),
    formatPanelLine('Best day share', formatPercent(propFirm.best_day_share_of_positive_profit)),
    formatPanelLine('TW variance', formatDecimal(propFirm.time_weighted_variance, 6)),
    formatPanelLine('Warnings', Array.isArray(propFirm.warnings) && propFirm.warnings.length ? propFirm.warnings.join(', ') : 'none'),
  ].join('\n') : [
    formatPanelLine('Expectancy', 'n/a'),
    formatPanelLine('Grade', 'n/a'),
    formatPanelLine('Verdict', 'n/a'),
    formatPanelLine('Passable', 'n/a'),
  ].join('\n'), 46);
  const benchmarkPanel = renderFramedBlock('Benchmark', [
    formatPanelLine('Type', 'buy-hold EW'),
    formatPanelLine('Full return', formatPercent(fullBenchmark.net_return)),
    formatPanelLine('OOS return', formatPercent(oosBenchmark.net_return)),
    formatPanelLine('Symbols', String(oosBenchmark.symbol_count ?? fullBenchmark.symbol_count ?? 0)),
    formatPanelLine('Best OOS', oosBenchmark.best ? `${oosBenchmark.best.symbol} ${formatPercent(oosBenchmark.best.net_return)}` : 'n/a'),
    formatPanelLine('Worst OOS', oosBenchmark.worst ? `${oosBenchmark.worst.symbol} ${formatPercent(oosBenchmark.worst.net_return)}` : 'n/a'),
  ].join('\n'), 46);

  console.log('');
  console.log('Reliability');
  console.log('-----------');
  console.log(renderSideBySide(trustPanel, benchmarkPanel, 46));
  console.log('');
  console.log(renderSideBySide(propFirmPanel, renderFramedBlock('Return Shape', [
    formatPanelLine('TW variance', formatDecimal(report.metrics.time_weighted_variance, 6)),
    formatPanelLine('TW stddev', formatDecimal(report.metrics.time_weighted_stddev, 6)),
    formatPanelLine('Daily stddev', formatDecimal(report.metrics.daily_summary?.daily_return_stddev, 6)),
    formatPanelLine('Profitable days', `${report.metrics.daily_summary?.positive_days ?? 'n/a'}/${report.metrics.daily_summary?.trading_days ?? 'n/a'}`),
    formatPanelLine('Worst day', formatPercent(report.metrics.daily_summary?.worst_day_return)),
  ].join('\n'), 46), 46));

  const wf = report.walk_forward;
  if (wf && wf.ok && wf.folds && wf.folds.length > 0) {
    const wfAgg = wf.aggregate || {};
    const wfPanel = renderFramedBlock('Walk-Forward', [
      formatPanelLine('Folds run', `${wf.folds_run} of ${wf.folds_requested}`),
      formatPanelLine('Mean OOS return', formatPercent(wfAgg.mean_oos_return)),
      formatPanelLine('Mean OOS Sharpe', formatDecimal(wfAgg.mean_oos_sharpe, 2)),
      formatPanelLine('Mean OOS DD', formatPercent(wfAgg.mean_oos_drawdown)),
      formatPanelLine('Profitable folds', `${wfAgg.positive_oos_folds}/${wf.folds_run} (${formatPercent(wfAgg.positive_oos_rate)})`),
    ].join('\n'), 46);
    const foldRows = wf.folds.map((f) =>
      formatPanelLine(`Fold ${f.fold}`, `${formatPercent(f.out_of_sample.net_return)} | ${f.out_of_sample.trades}t | Sharpe ${formatDecimal(f.out_of_sample.sharpe_ratio, 1)}`),
    ).join('\n');
    const foldPanel = renderFramedBlock('WF Fold Detail', foldRows, 68);
    console.log('');
    console.log('Walk-Forward');
    console.log('------------');
    console.log(renderSideBySide(wfPanel, foldPanel, 46));
  }

  const stress = report.metrics.monte_carlo || {};
  if (stress && Object.keys(stress).length > 0) {
    const stressStats = renderFramedBlock('Stress Test', [
      formatPanelLine('Median final', formatPercent(stress.median_final_return)),
      formatPanelLine('Worst sample', formatPercent(stress.worst_path ? stress.worst_path.final_return : stress.p05_final_return)),
      formatPanelLine('P05 final', formatPercent(stress.p05_final_return)),
      formatPanelLine('P95 final', formatPercent(stress.p95_final_return)),
      formatPanelLine('Mean max DD', formatPercent(stress.mean_max_drawdown)),
      formatPanelLine('P95 max DD', formatPercent(stress.p95_max_drawdown)),
    ].join('\n'), 46);
    console.log('');
    console.log('Stress Test');
    console.log('-----------');
    if (stress.paths_available === false) {
      console.log(stressStats);
    } else {
      const stressChart = renderFramedBlock('Stress Shape', renderStressShape(stress), 68);
      console.log(renderSideBySide(stressStats, stressChart, 46));
    }
  }

  console.log('');
  console.log(renderVerdictBlock(report));
  console.log('');
  console.log(`Output: ${output}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  formatPercent,
  formatDecimal,
  formatBacktestLine,
  formatPanelLine,
  formatCompactPercent,
  ANSI_STRIP_RE,
  visibleLength,
  padVisibleRight,
  clipVisible,
  splitLines,
  shortTimestamp,
  shortDate,
  sampleSeries,
  drawBar,
  renderReturnTape,
  renderStressShape,
  renderSideBySide,
  renderVerdictBlock,
  renderFramedBlock,
  annualizedReturn,
  timeSpanYears,
  compactBenchmark,
  compactBenchmarks,
  buildTrustAssessment,
  backtestSummaryPayload,
  renderBacktestSummary,
};
