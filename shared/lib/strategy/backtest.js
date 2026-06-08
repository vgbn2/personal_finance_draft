const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../ui/ansi');
const { modelCandidates, resolveModel } = require('../ml/models');
const { STORAGE_DATA_DIR } = require('../runtime/paths');
const {
  ACCOUNT_TYPE_DEFAULTS,
  flattenRules,
  getActivePropFirmProfile,
  normalizeProfile,
  resolvePropFirmProfile,
} = require('../profiles/prop_firms');

function maxDrawdown(equityCurve) {
  let peak = 1;
  let max = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    max = Math.max(max, peak > 0 ? (peak - point.equity) / peak : 0);
  }
  return max;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleStddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function weightedMean(values, weights) {
  let weightSum = 0;
  let weightedTotal = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    const weight = Number(weights[index]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weightSum += weight;
    weightedTotal += value * weight;
  }
  return weightSum > 0 ? weightedTotal / weightSum : 0;
}

function weightedVariance(values, weights) {
  let weightSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    const weight = Number(weights[index]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weightSum += weight;
  }
  if (weightSum <= 0) return 0;
  const avg = weightedMean(values, weights);
  let varianceTotal = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    const weight = Number(weights[index]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    varianceTotal += weight * (value - avg) ** 2;
  }
  return varianceTotal / weightSum;
}

function weightedStddev(values, weights) {
  return Math.sqrt(weightedVariance(values, weights));
}

function tradeExposureWeight(trade) {
  if (!trade || typeof trade !== 'object') return 1;
  const holdingPeriod = Number(trade.holding_period_bars);
  if (Number.isFinite(holdingPeriod) && holdingPeriod > 0) {
    return holdingPeriod;
  }
  const entryMs = Date.parse(trade.entry_time || trade.entryTime || '');
  const exitMs = Date.parse(trade.exit_time || trade.exitTime || '');
  if (Number.isFinite(entryMs) && Number.isFinite(exitMs) && exitMs > entryMs) {
    const hours = (exitMs - entryMs) / (60 * 60 * 1000);
    if (Number.isFinite(hours) && hours > 0) {
      return hours;
    }
  }
  return 1;
}

function summarizeDailyTradeReturns(trades) {
  const byDay = new Map();
  for (const trade of trades || []) {
    const returnValue = Number(trade && trade.net_return);
    if (!Number.isFinite(returnValue)) continue;
    const exitTime = Date.parse(trade.exit_time || trade.exitTime || trade.timestamp || trade.entry_time || '');
    if (!Number.isFinite(exitTime)) continue;
    const day = new Date(exitTime).toISOString().slice(0, 10);
    const currentEquity = byDay.get(day) || 1;
    byDay.set(day, currentEquity * (1 + returnValue));
  }
  const sortedDays = Array.from(byDay.entries()).sort(([left], [right]) => left.localeCompare(right));
  const dailyReturns = sortedDays.map(([, equity]) => equity - 1);
  const positiveReturns = dailyReturns.filter((value) => value > 0);
  const negativeReturns = dailyReturns.filter((value) => value < 0);
  const bestDay = dailyReturns.length ? Math.max(...dailyReturns) : null;
  const worstDay = dailyReturns.length ? Math.min(...dailyReturns) : null;
  const positiveTotal = positiveReturns.reduce((sum, value) => sum + value, 0);
  const absoluteTotal = dailyReturns.reduce((sum, value) => sum + Math.abs(value), 0);
  const bestDayShare = Number.isFinite(bestDay) && positiveTotal > 0 ? bestDay / positiveTotal : null;
  return {
    trading_days: sortedDays.length,
    daily_returns: dailyReturns,
    daily_return_mean: mean(dailyReturns),
    daily_return_stddev: sampleStddev(dailyReturns),
    best_day_return: bestDay,
    worst_day_return: worstDay,
    positive_days: positiveReturns.length,
    negative_days: negativeReturns.length,
    positive_day_ratio: dailyReturns.length ? positiveReturns.length / dailyReturns.length : 0,
    positive_return_total: positiveTotal,
    absolute_return_total: absoluteTotal,
    best_day_share_of_positive_profit: bestDayShare,
  };
}

function assessPropFirmSuitability(metrics, trades, options = {}) {
  const explicitProfile = options.propFirmProfile || options.profile || null;
  const propFirmRef = options.propFirm || options.propFirmProfileId || options.propFirmProfileName || options.profileId;
  const propFirmRefText = typeof propFirmRef === 'string' ? propFirmRef.trim().toLowerCase() : null;
  if (['none', 'off', 'disabled', 'skip'].includes(propFirmRefText)) {
    return null;
  }
  const selectedProfile = explicitProfile
    ? normalizeProfile(explicitProfile)
    : propFirmRef !== undefined && propFirmRef !== null
      ? resolvePropFirmProfile(propFirmRef, options.propFirmOptions || {})
      : getActivePropFirmProfile(options.propFirmOptions || {});
  const normalizedProfile = selectedProfile ? normalizeProfile(selectedProfile) : null;
  const profileRules = normalizedProfile
    ? flattenRules(normalizedProfile)
    : { ...ACCOUNT_TYPE_DEFAULTS.two_step };
  const rules = {
    ...profileRules,
    ...((options && options.rules) || {}),
  };
  const daily = summarizeDailyTradeReturns(trades);
  const maxTotalLossUsage = Number.isFinite(metrics?.max_drawdown) && Number.isFinite(rules.max_total_loss) && rules.max_total_loss > 0
    ? metrics.max_drawdown / rules.max_total_loss
    : null;
  const maxDailyLoss = Number.isFinite(daily.worst_day_return) ? Math.abs(Math.min(0, daily.worst_day_return)) : null;
  const maxDailyLossUsage = Number.isFinite(maxDailyLoss) && Number.isFinite(rules.max_daily_loss) && rules.max_daily_loss > 0
    ? maxDailyLoss / rules.max_daily_loss
    : null;
  const tradingDays = daily.trading_days;
  const bestDayShare = daily.best_day_share_of_positive_profit;
  const timeWeightedVariance = Number.isFinite(metrics?.time_weighted_variance) ? metrics.time_weighted_variance : 0;
  const variancePenalty = Math.max(0, Math.min(20, Math.sqrt(Math.max(0, timeWeightedVariance)) * 100));

  let score = 100;
  const warnings = [];
  let passable = true;

  if (Number.isFinite(maxTotalLossUsage)) {
    if (maxTotalLossUsage >= 1) {
      passable = false;
      score -= 50;
      warnings.push('max drawdown breaches prop-firm cap');
    } else {
      score -= Math.min(30, maxTotalLossUsage * 30);
    }
  }

  if (Number.isFinite(maxDailyLossUsage)) {
    if (maxDailyLossUsage >= 1) {
      passable = false;
      score -= 40;
      warnings.push('daily loss breaches prop-firm cap');
    } else {
      score -= Math.min(25, maxDailyLossUsage * 25);
    }
  }

  if (Number.isFinite(tradingDays) && Number.isFinite(rules.min_trading_days)) {
    if (tradingDays < rules.min_trading_days) {
      passable = false;
      score -= 20;
      warnings.push(`needs ${rules.min_trading_days} trading days`);
    } else if (tradingDays < rules.min_trading_days * 2) {
      score -= 5;
      warnings.push('low trade-day sample for consistency');
    }
  }

  if (Number.isFinite(bestDayShare) && Number.isFinite(rules.consistency_cap) && rules.consistency_cap > 0) {
    if (bestDayShare > rules.consistency_cap) {
      score -= 20;
      warnings.push('best day concentration above consistency cap');
    } else {
      score -= Math.min(15, (bestDayShare / rules.consistency_cap) * 15);
    }
  }

  if (Number.isFinite(metrics?.net_return) && Number.isFinite(rules.profit_target) && rules.profit_target > 0) {
    if (metrics.net_return <= 0) {
      score -= 10;
      warnings.push('strategy not yet profitable');
    } else if (metrics.net_return < rules.profit_target) {
      score -= 5;
      warnings.push('profit target not yet reached');
    } else {
      score += 5;
    }
  }

  if (Number.isFinite(timeWeightedVariance)) {
    score -= variancePenalty;
    if (timeWeightedVariance > 0.0008) {
      warnings.push('time-weighted variance is elevated');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  const verdict = passable && score >= 70
    ? 'likely-pass'
    : passable
      ? 'borderline'
      : 'breach-risk';

  return {
    profile_id: normalizedProfile?.id || null,
    profile_name: normalizedProfile?.name || null,
    firm: normalizedProfile?.firm || null,
    account_type: normalizedProfile?.account_type || null,
    step_count: normalizedProfile?.step_count ?? null,
    rules,
    grade,
    score,
    verdict,
    passable,
    warnings: [...new Set(warnings)].slice(0, 8),
    trading_days: tradingDays,
    max_daily_loss: maxDailyLoss,
    max_daily_loss_usage: maxDailyLossUsage,
    max_total_loss_usage: maxTotalLossUsage,
    best_day_share_of_positive_profit: bestDayShare,
    time_weighted_variance: timeWeightedVariance,
    time_weighted_stddev: Number.isFinite(timeWeightedVariance) ? Math.sqrt(timeWeightedVariance) : null,
    profile: normalizedProfile ? flattenRules(normalizedProfile) : null,
  };
}

function quantile(values, q) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return null;
  const sorted = [...finiteValues].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, q));
  const index = (sorted.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return function random() {
    seed += seed << 13;
    seed ^= seed >>> 7;
    seed += seed << 3;
    seed ^= seed >>> 17;
    seed += seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function periodsPerYear(timeframe) {
  // Use 365 calendar days so crypto (24/7) assets are not understated.
  // Intraday: 365 * (24h / bar_size_in_hours)
  switch (timeframe) {
  case '5m':  return 365 * 24 * 12;  // 105120
  case '15m': return 365 * 24 * 4;   // 35040
  case '30m': return 365 * 24 * 2;   // 17520
  case '1h':  return 365 * 24;       // 8760
  case '4h':  return 365 * 6;        // 2190
  case '1d':
  default:    return 365;
  }
}

function annualizedSharpe(returns, timeframe, horizon) {
  const deviation = sampleStddev(returns);
  if (returns.length < 2 || deviation === 0) return null;
  return (mean(returns) / deviation) * Math.sqrt(periodsPerYear(timeframe) / Math.max(horizon, 1));
}

function annualizedSortino(returns, timeframe, horizon) {
  const downside = returns.filter((value) => value < 0);
  const downsideDeviation = sampleStddev(downside);
  if (returns.length < 2 || downside.length < 2 || downsideDeviation === 0) return null;
  return (mean(returns) / downsideDeviation) * Math.sqrt(periodsPerYear(timeframe) / Math.max(horizon, 1));
}

function historicalTailRisk(returns, alpha = 0.05) {
  const finiteReturns = returns.filter((value) => Number.isFinite(value));
  if (!finiteReturns.length) return null;
  const threshold = quantile(finiteReturns, alpha);
  if (threshold === null) return null;
  const tail = finiteReturns.filter((value) => value <= threshold);
  return {
    alpha,
    value_at_risk: threshold,
    expected_shortfall: tail.length ? mean(tail) : threshold,
    tail_count: tail.length,
    sample_size: finiteReturns.length,
  };
}

function monteCarloStress(returns, options = {}) {
  const finiteReturns = returns.filter((value) => Number.isFinite(value));
  if (!finiteReturns.length) return null;
  const runs = Math.max(100, Math.floor(options.runs || 200));
  const maxPathPoints = Math.max(2, Math.floor(options.maxPathPoints || 50));
  const seedText = options.seed || `${finiteReturns.length}:${finiteReturns.reduce((sum, value) => sum + value, 0).toFixed(8)}`;
  const random = createSeededRandom(seedText);
  const simulations = [];
  const sparsePath = (points) => {
    if (points.length <= maxPathPoints) return points;
    const step = Math.ceil(points.length / maxPathPoints);
    const sampled = points.filter((_, index) => index % step === 0);
    const last = points[points.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    return sampled;
  };

  for (let run = 0; run < runs; run += 1) {
    let equity = 1;
    let peak = 1;
    let maxRunDrawdown = 0;
    const path = [1];
    for (let i = 0; i < finiteReturns.length; i += 1) {
      const sampleIndex = Math.floor(random() * finiteReturns.length);
      const nextReturn = finiteReturns[sampleIndex];
      equity *= 1 + nextReturn;
      peak = Math.max(peak, equity);
      maxRunDrawdown = Math.max(maxRunDrawdown, peak > 0 ? (peak - equity) / peak : 0);
      path.push(equity);
    }
    simulations.push({ final: equity, drawdown: maxRunDrawdown, path: sparsePath(path) });
  }

  const sortedByFinal = [...simulations].sort((a, b) => a.final - b.final);
  const sortedDrawdowns = [...simulations].map((simulation) => simulation.drawdown).sort((a, b) => a - b);
  const finals = simulations.map((simulation) => simulation.final);
  const worstSample = sortedByFinal[0];
  const medianSample = sortedByFinal[Math.floor(sortedByFinal.length / 2)];
  const pathToEquityCurve = (path) => path.map((equity, index) => ({
    timestamp: String(index),
    equity,
  }));
  return {
    runs,
    seed: seedText,
    sample_size: finiteReturns.length,
    mean_final_return: mean(finals) - 1,
    median_final_return: quantile(finals, 0.5) - 1,
    p05_final_return: quantile(finals, 0.05) - 1,
    p95_final_return: quantile(finals, 0.95) - 1,
    probability_of_loss: simulations.filter((simulation) => simulation.final < 1).length / runs,
    mean_max_drawdown: mean(simulations.map((simulation) => simulation.drawdown)),
    p95_max_drawdown: quantile(sortedDrawdowns, 0.95),
    median_path: medianSample ? {
      final_return: medianSample.final - 1,
      max_drawdown: medianSample.drawdown,
      equity_curve: pathToEquityCurve(medianSample.path),
    } : null,
    worst_path: worstSample ? {
      final_return: worstSample.final - 1,
      max_drawdown: worstSample.drawdown,
      equity_curve: pathToEquityCurve(worstSample.path),
    } : null,
  };
}

function compactTimeLabel(timestamp) {
  if (!timestamp) return '';
  const text = String(timestamp).replace('T', ' ').replace('Z', '').slice(0, 16);
  return text;
}

function fitLabel(text, width) {
  const value = String(text || '');
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function renderEquityCurveChart(seriesList, options = {}) {
  const normalizedSeries = (Array.isArray(seriesList) ? seriesList : [])
    .map((series, index) => {
      const points = Array.isArray(series?.points) ? series.points.filter((point) => Number.isFinite(point?.equity)) : [];
      if (points.length === 0) return null;
      const startEquity = Number.isFinite(points[0].equity) && points[0].equity !== 0 ? points[0].equity : 1;
      const values = points.map((point) => {
        const equity = Number(point.equity);
        const normalized = options.normalize === false ? equity : equity / startEquity;
        if (options.valueMode === 'return') return Math.max(-1, normalized - 1);
        return normalized;
      });
      return {
        label: series.label || `Series ${index + 1}`,
        color: series.color || [A.GREEN, A.CYAN, A.B_MAGENTA, A.YELLOW, A.RED][index % 5],
        symbol: series.symbol || ['*', '+', 'x', 'o', '#'][index % 5],
        timestamps: points.map((point) => point.timestamp || null),
        values,
      };
    })
    .filter(Boolean);

  if (normalizedSeries.length === 0) return '';

  const width = Math.max(24, Math.floor(options.width || 72));
  const height = Math.max(8, Math.floor(options.height || 12));
  const labelWidth = options.compact ? 8 : 10;
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ', color: '' })));

  const allValues = normalizedSeries.flatMap((series) => series.values);
  let minValue = Math.min(...allValues);
  let maxValue = Math.max(...allValues);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return '';
  if (options.valueMode === 'return') {
    minValue = Math.max(-1, Math.min(0, minValue));
    maxValue = Math.max(0, maxValue);
  }
  if (minValue === maxValue) {
    minValue -= 0.5;
    maxValue += 0.5;
  }

  const scaleY = (value) => {
    const pct = (value - minValue) / (maxValue - minValue);
    return Math.max(0, Math.min(height - 1, Math.round((height - 1) - pct * (height - 1))));
  };

  const drawPoint = (x, y, ch, color) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const cell = grid[y][x];
    if (cell.ch === ' ') {
      cell.ch = ch;
      cell.color = color;
    } else if (cell.ch !== ch) {
      cell.ch = '|';
      cell.color = A.WHITE;
    }
  };

  const drawLine = (x0, y0, x1, y1, ch, color) => {
    const segmentGlyph = options.slopeGlyphs
      ? (y1 < y0 ? '/' : y1 > y0 ? '\\' : '.')
      : ch;
    let cx = x0;
    let cy = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      drawPoint(cx, cy, segmentGlyph, color);
      if (cx === x1 && cy === y1) break;
      const twiceErr = 2 * err;
      if (twiceErr >= dy) {
        err += dy;
        cx += sx;
      }
      if (twiceErr <= dx) {
        err += dx;
        cy += sy;
      }
    }
  };

  normalizedSeries.forEach((series) => {
    const samples = [];
    const values = series.values;
    for (let x = 0; x < width; x += 1) {
      const ratio = width === 1 ? 0 : x / (width - 1);
      const position = ratio * (values.length - 1);
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      const weight = position - lower;
      const value = lower === upper
        ? values[lower]
        : values[lower] * (1 - weight) + values[upper] * weight;
      samples.push({ x, y: scaleY(value) });
    }

    for (let i = 1; i < samples.length; i += 1) {
      drawLine(samples[i - 1].x, samples[i - 1].y, samples[i].x, samples[i].y, series.symbol, series.color);
    }
    if (!options.slopeGlyphs) {
      drawPoint(samples[0].x, samples[0].y, series.symbol, series.color);
      drawPoint(samples[samples.length - 1].x, samples[samples.length - 1].y, series.symbol, series.color);
    }
  });

  const renderValue = (value) => {
    if (options.valueMode === 'return') {
      const range = Math.abs(maxValue - minValue);
      const digits = range < 0.01 ? 2 : range < 0.1 ? 1 : 0;
      const percent = Math.abs(value) < 0.0000001 ? 0 : value * 100;
      return `${percent.toFixed(digits)}%`;
    }
    return value.toFixed(2);
  };
  const topLabel = renderValue(maxValue);
  const midLabel = renderValue((maxValue + minValue) / 2);
  const bottomLabel = renderValue(minValue);
  const axisPad = ' '.repeat(labelWidth);

  let buffer = '';
  if (options.title !== false) {
    const titleSuffix = options.valueMode === 'return'
      ? '(return, floor = -100%)'
      : '(normalized to start = 1.00)';
    buffer += `\n   ${A.BOLD}Equity Curve${A.RESET} ${A.muted(titleSuffix)}\n`;
  }
  for (let row = 0; row < height; row += 1) {
    const leftLabel = row === 0 ? topLabel : row === Math.floor(height / 2) ? midLabel : row === height - 1 ? bottomLabel : '';
    buffer += ` ${A.muted(String(leftLabel).padStart(labelWidth))} | `;
    for (let col = 0; col < width; col += 1) {
      const cell = grid[row][col];
      buffer += cell.color ? `${cell.color}${cell.ch}${A.RESET}` : cell.ch;
    }
    buffer += '\n';
  }

  const seriesRange = normalizedSeries[0];
  const startLabel = compactTimeLabel(seriesRange.timestamps[0]) || 'start';
  const endLabel = compactTimeLabel(seriesRange.timestamps[seriesRange.timestamps.length - 1]) || 'end';
  buffer += ` ${axisPad} +${A.GLYPH.hline.repeat(width)}\n`;
  if (options.compact) {
    const left = fitLabel(startLabel, Math.floor(width / 2));
    const right = fitLabel(endLabel, Math.floor(width / 2));
    buffer += ` ${axisPad} ${left.padEnd(width - right.length)}${right}\n`;
  } else {
    const midLabelTime = compactTimeLabel(seriesRange.timestamps[Math.floor(seriesRange.timestamps.length / 2)]);
    const left = fitLabel(startLabel, Math.floor(width / 3));
    const mid = fitLabel(midLabelTime, Math.floor(width / 3));
    const right = fitLabel(endLabel, Math.floor(width / 3));
    buffer += ` ${axisPad} ${left.padEnd(Math.floor(width / 3))}${mid.padStart(Math.floor(width / 3))}${right.padStart(Math.max(0, width - Math.floor(width / 3) * 2))}\n`;
  }
  if (options.legend === false) {
    return buffer;
  }
  if (normalizedSeries.length > 1) {
    buffer += `${A.muted('Legend: ')}${normalizedSeries.map((series) => `${series.color}${series.symbol}${A.RESET} ${series.label}`).join('   ')}\n`;
  } else {
    buffer += `${A.muted('Series: ')}${normalizedSeries[0].label}\n`;
  }
  return buffer;
}

function withinDateRange(row, from, to) {
  const stamp = Date.parse(row.as_of);
  if (!Number.isFinite(stamp)) return false;
  if (from && stamp < Date.parse(from)) return false;
  if (to && stamp > Date.parse(to)) return false;
  return true;
}

function filterFeatureFrame(featureFrame, options = {}) {
  const timeframe = options.timeframe || null;
  const from = options.from || null;
  const to = options.to || null;
  const features = (featureFrame.features || []).filter((feature) => {
    if (timeframe && feature.timeframe !== timeframe) return false;
    return withinDateRange(feature, from, to);
  });
  return { ...featureFrame, features, feature_count: features.length };
}

function splitFeatureFrame(featureFrame, trainRatio = 0.7) {
  const byKey = new Map();
  for (const feature of featureFrame.features || []) {
    if (!byKey.has(feature.key)) byKey.set(feature.key, []);
    byKey.get(feature.key).push(feature);
  }

  const train = [];
  const test = [];
  for (const rows of byKey.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    const splitIndex = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * trainRatio)));
    train.push(...rows.slice(0, splitIndex));
    test.push(...rows.slice(splitIndex));
  }

  return {
    train: { ...featureFrame, features: train, feature_count: train.length },
    test: { ...featureFrame, features: test, feature_count: test.length },
  };
}

function rollingWalkForward(featureFrame, runBacktestFn, options = {}) {
  const folds = Math.max(2, Math.min(10, Math.floor(options.folds ?? 3)));
  const backtestOptions = options.backtestOptions || {};
  const compactMetrics = (metrics = {}) => ({
    trades: metrics.trades,
    net_return: metrics.net_return,
    sharpe_ratio: metrics.sharpe_ratio,
    max_drawdown: metrics.max_drawdown,
    win_rate: metrics.win_rate,
  });

  const byKey = new Map();
  for (const feature of featureFrame.features || []) {
    if (!byKey.has(feature.key)) byKey.set(feature.key, []);
    byKey.get(feature.key).push(feature);
  }

  // Sort each symbol's rows chronologically, then build a flat global order index.
  const allRows = [];
  for (const rows of byKey.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    allRows.push(...rows);
  }
  allRows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));

  const n = allRows.length;
  const chunkSize = Math.floor(n / (folds + 1));
  if (chunkSize < 2) {
    return { ok: false, reason: 'insufficient bars for rolling walk-forward', folds: [] };
  }

  const foldResults = [];
  for (let fold = 0; fold < folds; fold += 1) {
    const trainEnd = chunkSize * (fold + 1);
    const testStart = trainEnd;
    const testEnd = Math.min(n, chunkSize * (fold + 2));
    if (testStart >= n || testEnd <= testStart) break;

    const trainRows = allRows.slice(0, trainEnd);
    const testRows = allRows.slice(testStart, testEnd);

    const trainFrame = { ...featureFrame, features: trainRows, feature_count: trainRows.length };
    const testFrame = { ...featureFrame, features: testRows, feature_count: testRows.length };

    const { metrics: trainMetrics } = runBacktestFn(trainFrame, backtestOptions);
    const { metrics: testMetrics } = runBacktestFn(testFrame, backtestOptions);

    const trainDates = trainRows.map((r) => r.as_of).filter(Boolean).sort();
    const testDates = testRows.map((r) => r.as_of).filter(Boolean).sort();

    foldResults.push({
      fold: fold + 1,
      train_bars: trainRows.length,
      test_bars: testRows.length,
      train_start: trainDates[0] || null,
      train_end: trainDates[trainDates.length - 1] || null,
      test_start: testDates[0] || null,
      test_end: testDates[testDates.length - 1] || null,
      in_sample: compactMetrics(trainMetrics),
      out_of_sample: compactMetrics(testMetrics),
    });
  }

  if (!foldResults.length) {
    return { ok: false, reason: 'no folds completed', folds: [] };
  }

  const oosReturns = foldResults.map((f) => f.out_of_sample.net_return).filter(Number.isFinite);
  const oosTrades = foldResults.map((f) => f.out_of_sample.trades).filter(Number.isFinite);
  const oosSharpes = foldResults.map((f) => f.out_of_sample.sharpe_ratio).filter(Number.isFinite);
  const oosDrawdowns = foldResults.map((f) => f.out_of_sample.max_drawdown).filter(Number.isFinite);
  const positiveOosFolds = oosReturns.filter((r) => r > 0).length;

  return {
    ok: true,
    folds_run: foldResults.length,
    folds_requested: folds,
    aggregate: {
      mean_oos_return: oosReturns.length ? mean(oosReturns) : null,
      mean_oos_trades: oosTrades.length ? mean(oosTrades) : null,
      mean_oos_sharpe: oosSharpes.length ? mean(oosSharpes) : null,
      mean_oos_drawdown: oosDrawdowns.length ? mean(oosDrawdowns) : null,
      positive_oos_folds: positiveOosFolds,
      positive_oos_rate: foldResults.length ? positiveOosFolds / foldResults.length : null,
    },
    folds: foldResults,
  };
}

function buyHoldBenchmark(featureFrame, options = {}) {
  const costBps = options.costBps != null ? options.costBps : 5;
  const feeBps = options.feeBps != null ? options.feeBps : costBps / 2;
  const slippageBps = options.slippageBps != null ? options.slippageBps : costBps / 2;
  const byKey = new Map();
  for (const feature of featureFrame.features || []) {
    if (!byKey.has(feature.key)) byKey.set(feature.key, []);
    byKey.get(feature.key).push(feature);
  }

  const legs = [];
  const entryDrag = (feeBps + slippageBps) / 10000;
  const exitDrag = (feeBps + slippageBps) / 10000;
  for (const rows of byKey.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    const first = rows.find((row) => Number.isFinite(row.close) && row.close > 0);
    const last = [...rows].reverse().find((row) => Number.isFinite(row.close) && row.close > 0);
    if (!first || !last || first === last) continue;
    const adjustedEntry = first.close * (1 + entryDrag);
    const adjustedExit = last.close * (1 - exitDrag);
    const netReturn = adjustedExit / adjustedEntry - 1;
    legs.push({
      symbol: first.symbol || first.key || 'unknown',
      timeframe: first.timeframe || null,
      start: first.as_of,
      end: last.as_of,
      entry: first.close,
      exit: last.close,
      net_return: netReturn,
    });
  }

  const returns = legs.map((leg) => leg.net_return).filter(Number.isFinite);
  const sorted = [...legs].sort((a, b) => a.net_return - b.net_return);
  return {
    name: 'buy_hold_equal_weight',
    symbol_count: legs.length,
    net_return: returns.length ? mean(returns) : null,
    best: sorted.length ? sorted[sorted.length - 1] : null,
    worst: sorted.length ? sorted[0] : null,
    legs,
  };
}

function runBacktestJs(featureFrame, options = {}) {
  const strategy = options.strategy || 'cnn_momentum';
  const modelName = options.model || 'cnn_window_v0';
  const threshold = options.threshold || 0.55;
  const horizon = options.horizon || 5;
  const costBps = options.costBps != null ? options.costBps : 5;
  const feeBps = options.feeBps != null ? options.feeBps : costBps / 2;
  const slippageBps = options.slippageBps != null ? options.slippageBps : costBps / 2;
  const timeframe = options.timeframe || null;
  const from = options.from || null;
  const to = options.to || null;
  const tailAlpha = options.tailAlpha != null ? options.tailAlpha : 0.05;
  const monteCarloRuns = options.monteCarloRuns != null ? options.monteCarloRuns : 200;
  const model = resolveModel(modelName);
  const byKey = new Map();

  const filteredFrame = filterFeatureFrame(featureFrame, { timeframe, from, to });
  const benchmark = buyHoldBenchmark(filteredFrame, { costBps, feeBps, slippageBps });
  for (const feature of filteredFrame.features || []) {
    if (!byKey.has(feature.key)) byKey.set(feature.key, []);
    byKey.get(feature.key).push(feature);
  }

  const trades = [];
  const equityCurve = [{ timestamp: null, equity: 1 }];
  let equity = 1;

  for (const rows of byKey.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    for (let i = 0; i + horizon < rows.length; i += horizon) {
      const prediction = model.predict(rows[i]);
      if (prediction.direction !== 'long' || prediction.confidence < threshold) {
        continue;
      }
      const entry = rows[i].close;
      const exit = rows[i + horizon].close;
      if (!entry || !exit) continue;
      const grossReturn = exit / entry - 1;
      const entryDrag = (feeBps + slippageBps) / 10000;
      const exitDrag = (feeBps + slippageBps) / 10000;
      const adjustedEntry = entry * (1 + entryDrag);
      const adjustedExit = exit * (1 - exitDrag);
      const netReturn = adjustedExit / adjustedEntry - 1;
      equity *= 1 + netReturn;
      const trade = {
        strategy,
        model: model.name,
        symbol: rows[i].symbol,
        timeframe: rows[i].timeframe,
        provider: rows[i].provider || null,
        entry_time: rows[i].as_of,
        exit_time: rows[i + horizon].as_of,
        entry,
        exit,
        gross_return: grossReturn,
        net_return: netReturn,
        fee_bps: feeBps,
        slippage_bps: slippageBps,
        round_trip_cost_bps: feeBps * 2 + slippageBps * 2,
        cost_drag: grossReturn - netReturn,
        holding_period_bars: horizon,
        confidence: prediction.confidence,
      };
      trades.push(trade);
      equityCurve.push({ timestamp: trade.exit_time, equity });
    }
  }

  const returns = trades.map((trade) => trade.net_return);
  const weights = trades.map((trade) => tradeExposureWeight(trade));
  const wins = returns.filter((value) => value > 0).length;
  const losses = returns.filter((value) => value < 0);
  const grossProfit = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const avgWin = mean(returns.filter((value) => value > 0));
  const avgLoss = mean(losses);
  const primaryTimeframe = timeframe || (trades[0] && trades[0].timeframe) || '1d';
  const tailRisk = historicalTailRisk(returns, tailAlpha);
  const monteCarlo = monteCarloStress(returns, { runs: monteCarloRuns });
  const dailySummary = summarizeDailyTradeReturns(trades);
  const propFirm = assessPropFirmSuitability({
    net_return: equity - 1,
    max_drawdown: maxDrawdown(equityCurve),
    time_weighted_variance: weightedVariance(returns, weights),
  }, trades, options);
  return {
    generated_at: new Date().toISOString(),
    strategy,
    model: model.name,
    timeframe: primaryTimeframe,
    period: { from, to },
    threshold,
    horizon,
    cost_bps: costBps,
    fee_bps: feeBps,
    slippage_bps: slippageBps,
    metrics: {
      trades: trades.length,
      net_return: equity - 1,
      gross_return: trades.reduce((acc, trade) => acc * (1 + trade.gross_return), 1) - 1,
      max_drawdown: maxDrawdown(equityCurve),
      sharpe_ratio: annualizedSharpe(returns, primaryTimeframe, horizon),
      sortino_ratio: annualizedSortino(returns, primaryTimeframe, horizon),
      win_rate: trades.length ? wins / trades.length : 0,
      hit_rate: trades.length ? wins / trades.length : 0,
      expectancy: trades.length ? mean(returns) : 0,
      expected_value: trades.length ? mean(returns) : 0,
      average_win: avgWin,
      average_loss: avgLoss,
      payoff_ratio: avgLoss < 0 ? avgWin / Math.abs(avgLoss) : null,
      profit_factor: grossLoss > 0 ? grossProfit / grossLoss : null,
      turnover: trades.length,
      time_weighted_variance: weightedVariance(returns, weights),
      time_weighted_stddev: weightedStddev(returns, weights),
      daily_summary: dailySummary,
      prop_firm: propFirm,
      tail_risk: tailRisk,
      monte_carlo: monteCarlo,
    },
    benchmarks: {
      buy_hold_equal_weight: benchmark,
    },
    equity_curve: equityCurve,
    trade_logs: trades,
    trades,
    skipped: featureFrame.skipped || [],
  };
}

// ── C++ engine helpers ────────────────────────────────────────────────────────

function normalizeCppResult(cppResult, options, featureFrame) {
  const m = cppResult.metrics || {};
  const mc = m.monte_carlo || {};
  const cppTrades = cppResult.trades || [];
  // Compute prop-firm suitability in JS using C++ trade data
  let propFirm = null;
  try {
    propFirm = assessPropFirmSuitability(m, cppTrades, {
      propFirm: options.propFirm,
      propFirmProfile: options.propFirmProfile,
    });
  } catch {}
  // Compute tail risk from trade returns
  let tailRisk = null;
  try {
    const returns = cppTrades.map((t) => t.net_return).filter((r) => Number.isFinite(r));
    if (returns.length > 0) tailRisk = historicalTailRisk(returns, options.tailAlpha || 0.05);
  } catch {}
  const result = {
    generated_at: new Date().toISOString(),
    strategy: options.strategy || '',
    model: options.model || 'cpp_native',
    timeframe: options.timeframe || null,
    period: { from: options.from || null, to: options.to || null },
    threshold: options.threshold || 0.55,
    horizon: options.horizon || 5,
    cost_bps: options.costBps || 5,
    source_mode: 'live',
    data_quality_ok: true,
    engine: cppResult.engine || 'sovereign_cpp_core',
    cpp_mode: cppResult.mode,
    metrics: {
      trades: m.trades || 0,
      net_return: m.net_return || 0,
      gross_return: m.net_return || 0,
      max_drawdown: m.max_drawdown || 0,
      sharpe_ratio: m.sharpe_ratio || null,
      sortino_ratio: m.sortino_ratio || null,
      win_rate: m.win_rate || 0,
      hit_rate: m.win_rate || 0,
      expectancy: m.expectancy || 0,
      expected_value: m.expectancy || 0,
      average_win: null,
      average_loss: null,
      payoff_ratio: null,
      profit_factor: null,
      turnover: m.trades || 0,
      time_weighted_variance: null,
      time_weighted_stddev: null,
      daily_summary: null,
      prop_firm: propFirm,
      tail_risk: tailRisk,
      monte_carlo: mc.runs > 0 ? {
        runs: mc.runs,
        sample_size: mc.sample_size,
        mean_final_return: mc.mean_final_return,
        median_final_return: mc.median_final_return,
        p05_final_return: mc.p05_final_return,
        p95_final_return: mc.p95_final_return,
        probability_of_loss: mc.probability_of_loss,
        mean_max_drawdown: mc.mean_max_drawdown,
        p95_max_drawdown: mc.p95_max_drawdown,
        paths_available: false,
        worst_path: { final_return: mc.p05_final_return, max_drawdown: mc.p95_max_drawdown, equity_curve: [] },
        median_path: { final_return: mc.median_final_return, max_drawdown: mc.mean_max_drawdown, equity_curve: [] },
      } : null,
    },
    benchmarks: { buy_hold_equal_weight: null },
    equity_curve: cppResult.equity_curve || [],
    trade_logs: cppResult.trades || [],
    trades: cppResult.trades || [],
    skipped: featureFrame ? (featureFrame.skipped || []) : [],
  };

  // Derive data_start / data_end from equity_curve so annualizedReturn works
  const eqPts = (cppResult.equity_curve || []).filter((p) => p.timestamp && p.timestamp !== 'start');
  if (eqPts.length > 0) {
    result.data_start = eqPts[0].timestamp;
    result.data_end = eqPts[eqPts.length - 1].timestamp;
  }
  return result;
}

function runBacktestCppNative(featureFrame, options) {
  const bridge = require('../runtime/backend_bridge');
  const cachePath = path.join(STORAGE_DATA_DIR, 'cache');
  const symbols = [...new Set(
    (featureFrame.features || []).map((r) => r.symbol).filter(Boolean)
  )];
  if (symbols.length === 0) return runBacktestJs(featureFrame, options);

  const args = [
    'backtest', '--mode', 'native',
    '--input', cachePath,
    '--symbol', symbols.join(','),
    '--timeframe', options.timeframe || '1d',
    '--threshold', String(options.threshold || 0.55),
    '--horizon', String(options.horizon || 5),
    '--cost-bps', String(options.costBps || 5),
    '--monte-carlo-runs', String(options.monteCarloRuns || 200),
    '--json',
  ];
  if (options.from) args.push('--from', options.from);
  if (options.to)   args.push('--to', options.to);

  const result = bridge.runBackendCommand(args);
  if (!result || !result.engine) return runBacktestJs(featureFrame, options);
  return normalizeCppResult(result, options, featureFrame);
}

function runBacktestCppFrame(featureFrame, options) {
  const bridge = require('../runtime/backend_bridge');
  const { resolveModel: resolveMod } = require('../ml/models');
  const modelName = options.model || 'cnn_window_v0';
  const model = resolveMod(modelName);
  const threshold = options.threshold || 0.55;
  const horizon = options.horizon || 5;
  const costBps = options.costBps || 5;
  const timeframe = options.timeframe || null;
  const from = options.from || null;
  const to = options.to || null;

  // Annotate each feature row with JS model prediction
  const annotated = (featureFrame.features || [])
    .filter((row) => {
      if (timeframe && row.timeframe !== timeframe) return false;
      if (from && row.as_of < from) return false;
      if (to && row.as_of > to) return false;
      return true;
    })
    .map((row) => {
      const pred = model.predict ? model.predict(row) : { direction: 'long', confidence: 0 };
      return {
        symbol: row.symbol,
        timeframe: row.timeframe || timeframe || '1d',
        as_of: row.as_of,
        close: row.close,
        predicted_direction: pred.direction || '',
        predicted_confidence: pred.confidence || 0,
      };
    });

  if (annotated.length === 0) return runBacktestJs(featureFrame, options);

  const framePayload = JSON.stringify({
    threshold,
    horizon,
    cost_bps: costBps,
    monte_carlo_runs: options.monteCarloRuns || 200,
    tail_alpha: options.tailAlpha || 0.05,
    timeframe: timeframe || '',
    from: from || null,
    to: to || null,
    features: annotated,
  });

  const tmpPath = path.join(os.tmpdir(), `sovereign_bt_frame_${process.pid}.json`);
  try {
    fs.writeFileSync(tmpPath, framePayload, 'utf8');
    const result = bridge.runBackendCommand(['backtest', '--mode', 'frame', '--frame', tmpPath, '--json']);
    if (!result || !result.engine) return runBacktestJs(featureFrame, options);
    return normalizeCppResult(result, options, featureFrame);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

function runBacktest(featureFrame, options = {}) {
  // C++ is the default when the binary is available.
  // Set engine: 'js' or engine: 'js_model' (with no binary) to force JS path.
  const engine = options.engine || 'auto';
  if (engine !== 'js') {
    try {
      const bridge = require('../runtime/backend_bridge');
      if (bridge.backendAvailable()) {
        if (engine === 'cpp_native' || engine === 'auto') {
          return runBacktestCppNative(featureFrame, options);
        }
        if (engine === 'js_model') {
          return runBacktestCppFrame(featureFrame, options);
        }
      }
    } catch {}
  }
  return runBacktestJs(featureFrame, options);
}

module.exports = {
  filterFeatureFrame,
  historicalTailRisk,
  monteCarloStress,
  buyHoldBenchmark,
  runBacktest,
  runBacktestJs,
  rollingWalkForward,
  splitFeatureFrame,
  quantile,
  renderEquityCurveChart,
  assessPropFirmSuitability,
  summarizeDailyTradeReturns,
};
