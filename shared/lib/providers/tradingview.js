let TradingView = null;
try { TradingView = require('@mathieuc/tradingview'); } catch { /* optional dep — not installed in all envs */ }
const { isFiniteNumber } = require('../market_validation');

/**
 * Fetches real-time or delayed quotes and metadata (sector/industry) for a list of symbols.
 * @param {string[]} symbols - Array of symbols with exchange prefix (e.g., ["NASDAQ:AAPL", "BINANCE:BTCUSDT"])
 * @returns {Promise<Object[]>}
 */
async function fetchTradingViewQuotes(symbols) {
  if (!TradingView) return [];
  if (!symbols || symbols.length === 0) return [];

  return new Promise((resolve, reject) => {
    const client = new TradingView.Client();
    const results = [];
    let receivedCount = 0;

    // Timeout to prevent hanging
    const timeout = setTimeout(() => {
      client.end();
      resolve(results);
    }, 15000);

    symbols.forEach(symbol => {
      const chart = new client.Session.Quote();
      const ticker = new chart.Market(symbol);

      ticker.onData((data) => {
        results.push({
          symbol: symbol.split(':').pop(),
          exchange: symbol.split(':')[0],
          full_symbol: symbol,
          provider: 'tradingview',
          timestamp: new Date().toISOString(),
          price: data.lp,
          bid: data.bid,
          ask: data.ask,
          volume: data.volume,
          sector: data.sector || null,
          industry: data.industry || null,
          description: data.description || null,
          source: 'tradingview-ws'
        });

        receivedCount++;
        ticker.close(); // Close this ticker once data is received

        if (receivedCount === symbols.length) {
          clearTimeout(timeout);
          client.end();
          resolve(results);
        }
      });

      ticker.onError((err) => {
        console.error(`[TradingView] Error for ${symbol}:`, err);
        receivedCount++;
        if (receivedCount === symbols.length) {
          clearTimeout(timeout);
          client.end();
          resolve(results);
        }
      });
    });
  });
}

/**
 * Searches the TradingView screener for symbols in a specific sector or industry.
 * @param {string} market - 'america', 'crypto', 'forex', etc.
 * @param {Object} filters - Key-value filters (e.g., { sector: 'Technology' })
 * @returns {Promise<Object[]>}
 */
async function searchTradingViewScreener(market = 'america', filters = {}) {
    // Note: The mathieunls/tradingview-api library doesn't expose the screener directly in a simple way
    // in the version commonly available. We might need a direct fetch if not supported.
    // For now, we will stub this or use the Quote session's metadata discovery.
    console.warn(`[TradingView] Screener search not fully implemented via wrapper. Use manual symbols.`);
    return [];
}

module.exports = {
  fetchTradingViewQuotes,
  searchTradingViewScreener
};
