'use strict';

const fs = require('node:fs');
const path = require('node:path');
const bridge = require('../../shared/lib/runtime/backend_bridge');

const strategies = [
  { name: 'crypto_layer1_momentum', file: 'crypto_layer1_momentum.yaml', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT'], threshold: 0.55, horizon: 3 },
  { name: 'defi_ecosystem_momentum', file: 'defi_ecosystem_momentum.yaml', symbols: ['UNIUSDT', 'AAVEUSDT', 'MKRUSDT', 'LINKUSDT'], threshold: 0.55, horizon: 3 },
  { name: 'mean_reversion', file: 'mean_reversion.yaml', symbols: ['BTCUSDT', 'ETHUSDT'], threshold: 0.55, horizon: 3 },
  { name: 'trend_following', file: 'trend_following.yaml', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], threshold: 0.55, horizon: 3 },
  { name: 'volume_profile', file: 'volume_profile.yaml', symbols: ['BTCUSDT', 'ETHUSDT'], threshold: 0.55, horizon: 3 },
  { name: 'tech_alpha_xgboost', file: 'tech_alpha_xgboost.yaml', symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL'], threshold: 0.55, horizon: 3 },
  { name: 'ai_sector_momentum', file: 'ai_sector_momentum.yaml', symbols: ['NVDA', 'AMD', 'MSFT'], threshold: 0.55, horizon: 3 },
  { name: 'global_equity_rotation', file: 'global_equity_rotation.yaml', symbols: ['AAPL', 'MSFT', 'AMZN'], threshold: 0.55, horizon: 3 },
  { name: 'forex_trend_breakout', file: 'forex_trend_breakout.yaml', symbols: ['EURUSD', 'GBPUSD', 'USDJPY'], threshold: 0.55, horizon: 3 },
  { name: 'commodity_macro_hedge', file: 'commodity_macro_hedge.yaml', symbols: ['GLD', 'SLV', 'USO'], threshold: 0.55, horizon: 3 }
];

console.log('='.repeat(110));
console.log(' 1-MINUTE TIMEFRAME 10-STRATEGY NATIVE BACKTEST BENCHMARK LEADERBOARD');
console.log('='.repeat(110));
console.log(
  `| ${'#'.padStart(2)} | ${'Strategy'.padEnd(25)} | ${'Universe'.padEnd(22)} | ${'Trades'.padStart(9)} | ${'Net Return'.padStart(12)} | ${'Max DD'.padStart(8)} | ${'Sharpe'.padStart(7)} | ${'Status'.padEnd(9)} | ${'Time'.padStart(6)} |`
);
console.log('-'.repeat(110));

let rank = 1;
for (const strat of strategies) {
  const args = [
    'backtest', '--mode', 'native',
    '--input', 'storage/data/ts',
    '--symbol', strat.symbols.join(','),
    '--timeframe', '1m',
    '--threshold', String(strat.threshold),
    '--horizon', String(strat.horizon),
    '--monte-carlo-runs', '0',
    '--json'
  ];

  const startTime = Date.now();
  const res = bridge.runBackendCommand(args);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

  const m = res?.metrics || {};
  const trades = m.trades || 0;
  const netRet = m.net_return != null ? (m.net_return > 99 ? '>9999%' : (m.net_return * 100).toFixed(2) + '%') : '0.00%';
  const maxDD = m.max_drawdown != null ? (m.max_drawdown * 100).toFixed(2) + '%' : '0.00%';
  const sharpe = m.sharpe_ratio != null ? m.sharpe_ratio.toFixed(2) : 'n/a';

  const symsStr = strat.symbols.slice(0, 3).join(',') + (strat.symbols.length > 3 ? `+${strat.symbols.length-3}` : '');
  const status = trades > 0 ? (m.net_return > 0 ? 'PROFITABLE' : 'LOSS') : 'NO_BARS';

  console.log(
    `| ${String(rank).padStart(2)} | ${strat.name.padEnd(25)} | ${symsStr.padEnd(22)} | ${String(trades).padStart(9)} | ${netRet.padStart(12)} | ${maxDD.padStart(8)} | ${sharpe.padStart(7)} | ${status.padEnd(9)} | ${elapsed.padStart(6)} |`
  );
  rank++;
}
console.log('='.repeat(110));
