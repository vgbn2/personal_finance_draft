import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getSystemStatus, getSystemStatusSchema } from './tools/system_status';
import { runBacktest, runBacktestSchema } from './tools/run_backtest';
import { getMarketUniverse, getMarketUniverseSchema } from './tools/market_universe';
import { trade, tradeSchema } from './tools/trade';
import { getPortfolio, portfolioSchema } from './tools/portfolio';
import { backfill, backfillSchema, backfillFamily, backfillFamilySchema, backfillAll, backfillAllSchema } from './tools/data';
import {
  getDataSummary, getDataSummarySchema,
  getCorrelation, getCorrelationSchema,
  getDataAvailability, getDataAvailabilitySchema,
  getSigmaBands, getSigmaBandsSchema,
  getIndicators, getIndicatorsSchema,
  getPrice, getPriceSchema,
} from './tools/backend_inspection';
import { getReportResource, listReportResources } from './resources/reports';
import {
  getPolymarketMarkets, getPolymarketMarketsSchema,
  getPolymarketPortfolio, getPolymarketPortfolioSchema,
  placePolymarketOrder, placePolymarketOrderSchema,
} from './tools/polymarket';

const server = new Server(
  {
    name: 'sovereign-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * Tool Handlers
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_system_status',
      description: 'Get Sovereign system health, phase, and C++ core status',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'run_backtest',
      description: 'Execute a historical backtest for a specific symbol or strategy. Returns structured JSON with trust_assessment and walk_forward results.',
      inputSchema: {
        type: 'object',
        properties: {
          strategy: { type: 'string', description: 'Strategy file path (e.g., config/strategies/mean_reversion.yaml)' },
          symbol: { type: 'string', description: 'Target instrument (e.g., BTCUSDT)' },
          timeframe: { type: 'string', description: 'e.g., 1d, 1h' },
          days: { type: 'number', description: 'Lookback window in calendar days (e.g. 90, 365, 730). Preferred over from/to.' },
          from: { type: 'string', description: 'Start date (YYYY-MM-DD). Ignored when days is set.' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          fee_bps: { type: 'number', description: 'Fee in basis points' },
          slippage_bps: { type: 'number', description: 'Slippage in basis points' },
          sample: { type: 'boolean', description: 'Run with deterministic generated bars instead of live cache' },
          allow_degraded: { type: 'boolean', description: 'Proceed despite failed data-quality checks (default: false; research only)' },
        },
      },
    },
    {
      name: 'get_market_universe',
      description: 'List available symbols in the local cache with record counts',
      inputSchema: {
        type: 'object',
        properties: {
          max_entries: { type: 'number', description: 'Limit results' },
        },
      },
    },
    {
      name: 'trade',
      description: 'Place a buy or sell order',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['buy', 'sell'], description: 'Order side' },
          symbol: { type: 'string', description: 'Symbol to trade' },
          qty: { type: 'string', description: 'Quantity or "amount:USD"' },
          type: { type: 'string', enum: ['market', 'limit'], description: 'Order type' },
          price: { type: 'number', description: 'Limit price' },
          live: { type: 'boolean', description: 'Execute live trade (requires .env config)' },
          confirm_live: { type: 'boolean', description: 'Must be true when live=true to acknowledge real execution.' },
        },
        required: ['action', 'symbol', 'qty'],
      },
    },
    {
      name: 'get_portfolio',
      description: 'Query account balances and aggregate portfolios',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['balance', 'aggregate'], description: 'Balance mode' },
          live: { type: 'boolean', description: 'Query live account (danger)' },
        },
      },
    },
    {
      name: 'backfill',
      description: 'Trigger data backfill for a symbol',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol to backfill' },
          days: { type: 'number', description: 'Days to fetch' },
          timeframe: { type: 'string', description: 'Timeframe (e.g. 1d)' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'get_data_summary',
      description: 'Get statistics and range info for a specific symbol',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol to summarize (default: SPY)' },
          timeframe: { type: 'string', description: 'e.g., 1d, 1h' },
          max_bars: { type: 'number', description: 'Limit bars (0 for all)' },
        },
      },
    },
    {
      name: 'get_correlation',
      description: 'Generate a Pearson correlation matrix for a set of symbols',
      inputSchema: {
        type: 'object',
        properties: {
          symbols: { type: 'string', description: 'Comma-separated symbols (default: AAPL,MSFT,SPY)' },
          timeframe: { type: 'string', description: 'e.g., 1d, 1h' },
          max_bars: { type: 'number', description: 'Limit bars' },
          divergence: { type: 'boolean', description: 'Include correlation divergence telemetry' },
          threshold: { type: 'number', description: 'Divergence threshold (default: 0.3)' },
        },
      },
    },
    {
      name: 'get_data_availability',
      description: 'Check data availability per family — shows cached/missing/stale symbols and bar counts',
      inputSchema: {
        type: 'object',
        properties: {
          family: { type: 'string', description: 'Filter by family: equities, crypto, indices, commodities, fx' },
        },
      },
    },
    {
      name: 'get_sigma_bands',
      description: 'Get sigma band position for a symbol — where current price sits relative to rolling mean/stddev',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol to analyze (e.g. BTCUSDT)' },
          timeframe: { type: 'string', description: 'e.g. 1d, 1h' },
          window: { type: 'number', description: 'Rolling window size in bars (default: 20)' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'get_indicators',
      description: 'Compute technical indicators (Kalman, RSI, MACD, Bollinger, ATR) for a symbol',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol to analyze (e.g. AAPL)' },
          timeframe: { type: 'string', description: 'e.g. 1d, 1h' },
          max_bars: { type: 'number', description: 'Limit bars (0 for all)' },
          show_last: { type: 'number', description: 'Number of recent indicator rows to return (default: 5)' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'get_price',
      description: 'Get the last close price and basic stats for a symbol from the local cache',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol (e.g. AAPL, BTCUSDT)' },
          timeframe: { type: 'string', description: 'e.g. 1d, 1h' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'backfill_family',
      description: 'Trigger data backfill for an entire asset family (equities, crypto, indices, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          family: { type: 'string', description: 'Family: equities, crypto, indices, commodities, fx' },
          days: { type: 'number', description: 'Days to fetch (default: 365)' },
          timeframe: { type: 'string', description: 'e.g. 1d, 1h' },
          force: { type: 'boolean', description: 'Force re-fetch even if data is fresh' },
        },
        required: ['family'],
      },
    },
    {
      name: 'backfill_all',
      description: 'Mass backfill — every symbol in the configured universe across all specified timeframes. Use dry_run first to preview job count.',
      inputSchema: {
        type: 'object',
        properties: {
          timeframes: { type: 'string', description: 'Comma-separated timeframes (default: 1d,1h,15m)' },
          days: { type: 'number', description: 'Days of history per symbol (default: 365)' },
          concurrency: { type: 'number', description: 'Parallel jobs (default: 5)' },
          dry_run: { type: 'boolean', description: 'Preview job count without executing' },
        },
      },
    },
    {
      name: 'get_polymarket_markets',
      description: 'Browse active Polymarket prediction markets from Gamma API, grouped by section and sorted by volume',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category slug (e.g. crypto, politics, sports). Default: crypto' },
          limit: { type: 'number', description: 'Max markets to return (10, 25, 50). Default: 25' },
        },
      },
    },
    {
      name: 'get_polymarket_portfolio',
      description: 'Get Polymarket portfolio: pUSD balance, open positions, and recent fills',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'place_polymarket_order',
      description: 'Place a Polymarket prediction market order. Requires ai_agent_trading feature flag enabled for live execution.',
      inputSchema: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'CLOB token ID for the outcome (from get_polymarket_markets)' },
          size: { type: 'number', description: 'Number of shares to buy' },
          price: { type: 'number', description: 'Limit price per share (0-1). Required for live orders to match the TUI safety path.' },
          max_cost_usdc: { type: 'number', description: 'Optional safety cap. Refuse the order if size * price exceeds this amount.' },
          live: { type: 'boolean', description: 'Execute live order. Blocked unless ai_agent_trading is enabled.' },
          confirm_live: { type: 'boolean', description: 'Must be true when live=true to acknowledge real execution.' },
        },
        required: ['token_id', 'size'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
  try {
    switch (request.params.name) {
      case 'get_system_status':
        return getSystemStatus();
      case 'run_backtest': {
        const args = runBacktestSchema.parse(request.params.arguments);
        return runBacktest(args);
      }
      case 'get_market_universe': {
        const args = getMarketUniverseSchema.parse(request.params.arguments);
        return getMarketUniverse(args);
      }
      case 'trade': {
        const args = tradeSchema.parse(request.params.arguments);
        return trade(args);
      }
      case 'get_portfolio': {
        const args = portfolioSchema.parse(request.params.arguments);
        return getPortfolio(args);
      }
      case 'backfill': {
        const args = backfillSchema.parse(request.params.arguments);
        return backfill(args);
      }
      case 'get_data_summary': {
        const args = getDataSummarySchema.parse(request.params.arguments);
        return getDataSummary(args);
      }
      case 'get_correlation': {
        const args = getCorrelationSchema.parse(request.params.arguments);
        return getCorrelation(args);
      }
      case 'get_data_availability': {
        const args = getDataAvailabilitySchema.parse(request.params.arguments);
        return getDataAvailability(args);
      }
      case 'get_sigma_bands': {
        const args = getSigmaBandsSchema.parse(request.params.arguments);
        return getSigmaBands(args);
      }
      case 'get_indicators': {
        const args = getIndicatorsSchema.parse(request.params.arguments);
        return getIndicators(args);
      }
      case 'get_price': {
        const args = getPriceSchema.parse(request.params.arguments);
        return getPrice(args);
      }
      case 'backfill_family': {
        const args = backfillFamilySchema.parse(request.params.arguments);
        return backfillFamily(args);
      }
      case 'backfill_all': {
        const args = backfillAllSchema.parse(request.params.arguments);
        return backfillAll(args);
      }
      case 'get_polymarket_markets': {
        const args = getPolymarketMarketsSchema.parse(request.params.arguments);
        return getPolymarketMarkets(args);
      }
      case 'get_polymarket_portfolio':
        return getPolymarketPortfolio();
      case 'place_polymarket_order': {
        const args = placePolymarketOrderSchema.parse(request.params.arguments);
        return placePolymarketOrder(args);
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    if (error instanceof McpError) throw error;
    if (error.name === 'ZodError') {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, error.message);
  }
});

/**
 * Resource Handlers
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: listReportResources(),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (!uri.startsWith('sovereign://reports/')) {
    throw new McpError(ErrorCode.InvalidParams, `Unknown resource URI: ${uri}`);
  }

  const reportName = uri.replace('sovereign://reports/', '');
  const resource = getReportResource(reportName);

  if (!resource) {
    throw new McpError(ErrorCode.InvalidParams, `Report not found: ${reportName}`);
  }

  return {
    contents: [resource],
  };
});

/**
 * Start Server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sovereign MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
