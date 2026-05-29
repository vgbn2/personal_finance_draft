const { ingestMarketData } = require('../../backend/scripts/data_ops/ingest_market_data');
const path = require('node:path');

/**
 * 20-Year Historical Data Pipeline
 * [gemini-work] Added to fulfill dev suggestion for long-term historical research.
 */
async function backfill20Years(symbol = 'SPY') {
    console.log(`[PIPELINE] Initiating 20-year backfill for ${symbol}...`);
    const days = 20 * 365; // ~7300 days
    
    try {
        await ingestMarketData({
            symbol,
            days,
            timeframe: '1d',
            provider: 'yahoo', // Yahoo is most reliable for 20y daily data
        });
        console.log(`[PIPELINE] Successfully backfilled ${symbol} for 20 years.`);
    } catch (error) {
        console.error(`[PIPELINE] Failed to backfill ${symbol}:`, error.message);
    }
}

if (require.main === module) {
    const symbol = process.argv[2] || 'SPY';
    backfill20Years(symbol);
}

module.exports = { backfill20Years };
