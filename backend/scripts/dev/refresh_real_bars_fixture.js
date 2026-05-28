const fs = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_PATH = path.join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'real_bars_btc.json');

async function refreshRealBarsFixture() {
  const symbol = 'BTCUSDT';
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`;

  console.log(`[VISIBILITY] Fetching real ${symbol} bars from Binance...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance fixture refresh failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();

  const bars = data.map((bar) => ({
    family: 'crypto',
    provider: 'binance',
    symbol,
    timeframe: '1h',
    timestamp: new Date(bar[0]).toISOString(),
    open: Number(bar[1]),
    high: Number(bar[2]),
    low: Number(bar[3]),
    close: Number(bar[4]),
    volume: Number(bar[5]),
  }));

  const payload = {
    fetched_at: new Date().toISOString(),
    sources: bars,
  };

  await fs.mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
  await fs.writeFile(FIXTURE_PATH, JSON.stringify(payload, null, 2), 'utf8');

  return {
    fixture: FIXTURE_PATH,
    records: bars.length,
    first_timestamp: bars[0]?.timestamp || null,
    last_timestamp: bars.at(-1)?.timestamp || null,
  };
}

if (require.main === module) {
  refreshRealBarsFixture()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  FIXTURE_PATH,
  refreshRealBarsFixture,
};
