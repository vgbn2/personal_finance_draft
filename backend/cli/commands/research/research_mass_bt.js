'use strict';

const path = require('node:path');
const A = require('../../../../shared/lib/ui/ansi.js');
const utils = require('../../lib/utils.js');
const {
  optionValue,
  numericOption,
  hasFlag,
  printPayload,
  withLoadingAnimation,
  REPO_ROOT,
} = utils;

const DEFAULT_TIMEFRAMES = Object.freeze(['5m', '15m', '30m', '1h', '4h', '1d']);

function padCell(text, width, alignRight = false) {
  const str = String(text || '');
  if (str.length >= width) return str.slice(0, width);
  return alignRight ? str.padStart(width) : str.padEnd(width);
}

function formatReturnPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return A.muted(padCell('N/A', 9, true));
  }
  const pct = value * 100;
  let text;
  const absVal = Math.abs(value);
  if (absVal >= 1000000) {
    text = (value >= 0 ? '+' : '') + (value / 1000000).toFixed(1) + 'M';
  } else if (absVal >= 1000) {
    text = (value >= 0 ? '+' : '') + (value / 1000).toFixed(0) + 'k';
  } else if (Math.abs(pct) >= 1000) {
    text = (value >= 0 ? '+' : '') + value.toFixed(1) + 'x';
  } else {
    text = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  }
  const padded = padCell(text, 9, true);
  if (pct > 0) return A.GREEN + padded + A.RESET;
  if (pct < 0) return A.RED + padded + A.RESET;
  return A.muted(padded);
}

function renderMassBtMatrix(payload) {
  const timeframes = payload.timeframes || DEFAULT_TIMEFRAMES;
  const strategies = payload.matrix || [];
  const lineDivider = '+' + '-'.repeat(27) + timeframes.map(() => '+' + '-'.repeat(11)).join('') + '+' + '-'.repeat(11) + '+';

  const lines = [];
  lines.push('\n' + A.bold('='.repeat(80)));
  lines.push(A.bold(A.CYAN + '                    SOVEREIGN MASS BACKTEST MATRIX (EXCEL GRID)' + A.RESET));
  lines.push(A.muted(`Strategies: ${strategies.length} | Engine: ${payload.engine || 'sovereign_cpp_core'} | Runtime: ${(payload.runtime_ms / 1000).toFixed(2)}s`));
  lines.push(A.bold('='.repeat(80)));
  lines.push(lineDivider);

  // Header row
  let headerRow = '| ' + padCell('STRATEGY NAME', 25) + ' ';
  for (const tf of timeframes) {
    headerRow += '| ' + padCell(tf, 9, true) + ' ';
  }
  headerRow += '| ' + padCell('BEST TF', 9, true) + ' |';
  lines.push(A.bold(headerRow));
  lines.push(lineDivider);

  // Data rows
  for (const row of strategies) {
    let dataRow = '| ' + padCell(row.name, 25) + ' ';
    for (const tf of timeframes) {
      const cell = row.timeframes ? row.timeframes[tf] : null;
      const retVal = cell ? cell.net_return : null;
      dataRow += '| ' + formatReturnPct(retVal) + ' ';
    }
    const bestTf = row.best_tf || 'N/A';
    dataRow += '| ' + A.bold(A.YELLOW + padCell(bestTf, 9, true) + A.RESET) + ' |';
    lines.push(dataRow);
  }

  lines.push(lineDivider);
  lines.push(A.muted(`Total Evaluated: ${payload.total_evaluated || 0} strategy-timeframe pairs | Allocation: ${(payload.position_size_pct * 100).toFixed(0)}%`));
  lines.push(A.bold('='.repeat(80)) + '\n');

  return lines.join('\n');
}

async function commandMassBt(args) {
  const startedAt = Date.now();
  const { readStrategyRegistry, inspectStrategyFile } = require('../strategy/strategy.js');
  const { runBacktest } = require('../../../../shared/lib/strategy/backtest.js');
  const bridge = require('../../../../shared/lib/runtime/backend_bridge.js');
  const { STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');

  const files = readStrategyRegistry();
  if (files.length === 0) {
    printPayload({ error: 'No registered strategies found in config/strategies/' }, args);
    return 1;
  }

  const rawTfs = optionValue(args, '--timeframes', null);
  const timeframes = rawTfs ? rawTfs.split(',').map(s => s.trim()).filter(Boolean) : [...DEFAULT_TIMEFRAMES];
  const positionSizePct = numericOption(args, '--position-size-pct', 0.1);
  const requestedDays = Math.max(0, Math.floor(numericOption(args, '--days', 0)));
  const maxBars = numericOption(args, '--max-bars', requestedDays > 0 ? 0 : 5000);

  const matrix = [];
  let totalEvaluated = 0;

  if (bridge.backendAvailable() && !hasFlag(args, '--sample')) {
    let cppRes;
    const metaList = files.map(inspectStrategyFile).filter(m => m && m.ok);
    const specsPayload = metaList.map(m => ({
      name: m.name,
      symbols: m.universe || [],
      threshold: m.signalThreshold || 0.65,
      horizon: m.maxHoldingDays || 5,
    }));

    await withLoadingAnimation('Evaluating strategy matrix across timeframes (C++ OpenMP)', async () => {
      const cppArgs = [
        'mass-bt',
        '--input', STORAGE_TS_DIR,
        '--position-size-pct', String(positionSizePct),
        '--timeframes', timeframes.join(','),
        '--specs-json', JSON.stringify(specsPayload),
        ...(maxBars > 0 ? ['--max-bars', String(maxBars)] : []),
      ];
      cppRes = bridge.runBackendCommand(cppArgs);
    }, args);

    if (cppRes && cppRes.ok && Array.isArray(cppRes.results)) {
      const byStrategy = new Map();
      const metaList = files.map(inspectStrategyFile);

      for (const r of cppRes.results) {
        if (!byStrategy.has(r.strategy)) {
          const meta = metaList.find(m => m.name === r.strategy) || {};
          byStrategy.set(r.strategy, {
            name: r.strategy,
            kind: meta.kind || 'momentum',
            family: meta.family || 'equities',
            universe: meta.universe || [],
            timeframes: {},
            best_tf: null,
            best_return: -Infinity,
          });
        }
        const sObj = byStrategy.get(r.strategy);
        if (r.ok && r.trades > 0) {
          sObj.timeframes[r.timeframe] = {
            trades: r.trades,
            net_return: r.net_return,
            win_rate: r.win_rate,
            max_drawdown: r.max_drawdown,
            sharpe: r.sharpe_ratio,
          };
          if (r.net_return > sObj.best_return) {
            sObj.best_return = r.net_return;
            sObj.best_tf = r.timeframe;
          }
        } else {
          sObj.timeframes[r.timeframe] = null;
        }
      }

      for (const sObj of byStrategy.values()) {
        if (!sObj.best_tf && timeframes.length > 0) {
          sObj.best_tf = timeframes[timeframes.length - 1];
        }
        matrix.push(sObj);
        totalEvaluated += Object.keys(sObj.timeframes).length;
      }

      const runtimeMs = Date.now() - startedAt;
      const payload = {
        type: 'mass_bt_matrix',
        engine: 'sovereign_cpp_core',
        position_size_pct: positionSizePct,
        timeframes,
        total_evaluated: totalEvaluated,
        runtime_ms: runtimeMs,
        matrix,
      };

      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(renderMassBtMatrix(payload));
      }
      return 0;
    }
  }

  await withLoadingAnimation('Evaluating strategy matrix across timeframes', async () => {
    for (const file of files) {
      const meta = inspectStrategyFile(file);
      if (!meta || !meta.ok) continue;

      const strategyResult = {
        name: meta.name,
        kind: meta.kind,
        family: meta.family,
        universe: meta.universe || [],
        timeframes: {},
        best_tf: null,
        best_return: -Infinity,
      };

      for (const tf of timeframes) {
        totalEvaluated += 1;
        try {
          const btOptions = {
            strategy: meta.name,
            model: meta.model || 'cnn_window_v0',
            timeframe: tf,
            positionSizePct,
            costBps: meta.risk?.cost_bps || 5,
            threshold: meta.risk?.signal_threshold || 0.55,
            horizon: meta.risk?.max_holding_days || 5,
            engine: 'cpp_native',
            monteCarloRuns: 0,
            walkForwardFolds: 0,
          };

          const featureFrame = {
            features: (meta.universe || ['SPY']).map(s => ({ symbol: s, timeframe: tf }))
          };

          const res = runBacktest(featureFrame, btOptions);

          if (res && res.metrics) {
            const trades = res.metrics.trades || 0;
            const netReturn = res.metrics.net_return || 0;
            const winRate = res.metrics.win_rate || 0;
            const maxDrawdown = res.metrics.max_drawdown || 0;
            const sharpe = res.metrics.sharpe_ratio;

            if (trades > 0) {
              strategyResult.timeframes[tf] = {
                trades,
                net_return: netReturn,
                win_rate: winRate,
                max_drawdown: maxDrawdown,
                sharpe,
              };

              if (netReturn > strategyResult.best_return) {
                strategyResult.best_return = netReturn;
                strategyResult.best_tf = tf;
              }
            } else {
              strategyResult.timeframes[tf] = null;
            }
          } else {
            strategyResult.timeframes[tf] = null;
          }
        } catch {
          strategyResult.timeframes[tf] = null;
        }
      }

      if (!strategyResult.best_tf && timeframes.length > 0) {
        strategyResult.best_tf = timeframes[timeframes.length - 1];
      }

      matrix.push(strategyResult);
    }
  }, args);

  const runtimeMs = Date.now() - startedAt;
  const payload = {
    type: 'mass_bt_matrix',
    engine: 'sovereign_cpp_core',
    position_size_pct: positionSizePct,
    timeframes,
    total_evaluated: totalEvaluated,
    runtime_ms: runtimeMs,
    matrix,
  };

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(renderMassBtMatrix(payload));
  }

  return 0;
}

module.exports = {
  commandMassBt,
  renderMassBtMatrix,
  DEFAULT_TIMEFRAMES,
};
