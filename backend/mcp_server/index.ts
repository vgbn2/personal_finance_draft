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
import { backfill, backfillSchema } from './tools/data';
import { getReportResource, listReportResources } from './resources/reports';

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
      description: 'Execute a historical backtest for a specific symbol and timeframe',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Target instrument (e.g., BTCUSDT)' },
          timeframe: { type: 'string', description: 'e.g., 1d, 1h' },
          from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          fee_bps: { type: 'number', description: 'Fee in basis points' },
          slippage_bps: { type: 'number', description: 'Slippage in basis points' },
          sample: { type: 'boolean', description: 'Run deterministic sample backtest' },
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
