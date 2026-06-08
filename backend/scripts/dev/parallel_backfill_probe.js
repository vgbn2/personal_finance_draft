const { fetchParallelBackfill } = require('../../../shared/lib/data/backfill');

async function probeParallelBackfill(options = {}) {
  const symbol = options.symbol || 'BTCUSDT';
  const timeframe = options.timeframe || '5m';
  const days = Number(options.days || 10);
  const providers = options.providers || ['binance', 'binance'];
  const fetcher = options.fetcher || fetchParallelBackfill;

  console.log(`[VISIBILITY] Parallel backfill probe ${symbol}:${timeframe} days=${days} providers=${providers.join(',')}`);
  const candles = await fetcher(symbol, timeframe, days, 'crypto', providers);
  const expectedLowerBound = Math.floor((days * 24 * 60) / 5 * 0.8);
  const ok = candles.length >= expectedLowerBound;

  return {
    ok,
    symbol,
    timeframe,
    days,
    providers,
    candles: candles.length,
    expected_lower_bound: expectedLowerBound,
    first_timestamp: candles[0]?.timestamp || null,
    last_timestamp: candles.at(-1)?.timestamp || null,
  };
}

if (require.main === module) {
  probeParallelBackfill()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  probeParallelBackfill,
};
