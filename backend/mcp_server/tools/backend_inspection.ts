import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const getDataSummarySchema = z.object({
  symbol: z.string().optional().default('SPY').describe('Symbol to summarize (e.g. SPY)'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  max_bars: z.number().int().min(1).max(1000).optional().default(500).describe('Limit bars (maximum 1000)'),
});

export const getCorrelationSchema = z.object({
  symbols: z.string().optional().default('AAPL,MSFT,SPY').describe('Comma-separated symbols'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  max_bars: z.number().int().min(10).max(1000).optional().default(252).describe('Limit bars (10-1000)'),
  divergence: z.boolean().optional().default(false).describe('Include correlation divergence telemetry'),
  threshold: z.number().min(0).max(1).optional().default(0.3).describe('Divergence threshold (0.0 to 1.0)'),
});

export async function getDataSummary(args: z.infer<typeof getDataSummarySchema>): Promise<ToolResponse> {
  const cliArgs = [
    'backend', 'data', 'summary',
    '--symbol', args.symbol,
    '--timeframe', args.timeframe,
    '--max-bars', args.max_bars.toString(),
    '--json'
  ];
  return invokeSovereignCli(cliArgs);
}

export async function getCorrelation(args: z.infer<typeof getCorrelationSchema>): Promise<ToolResponse> {
  const cliArgs = [
    'backend', 'correlation',
    '--symbols', args.symbols,
    '--timeframe', args.timeframe,
    '--max-bars', args.max_bars.toString(),
    '--json'
  ];

  if (args.divergence) {
    cliArgs.push('--divergence');
    cliArgs.push('--threshold');
    cliArgs.push(args.threshold.toString());
  }

  return invokeSovereignCli(cliArgs);
}

export const getDataAvailabilitySchema = z.object({
  family: z.string().optional().describe('Filter by family: equities, crypto, indices, commodities, fx'),
});

export const getSigmaBandsSchema = z.object({
  symbol: z.string().describe('Symbol to analyze (e.g. BTCUSDT)'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  window: z.number().int().min(2).max(500).optional().default(20).describe('Rolling window size in bars (2-500)'),
});

export const getIndicatorsSchema = z.object({
  symbol: z.string().describe('Symbol to compute indicators for (e.g. AAPL)'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  max_bars: z.number().int().min(1).max(1000).optional().default(500).describe('Limit bars (maximum 1000)'),
  show_last: z.number().int().min(1).max(100).optional().default(5).describe('Number of most recent indicator rows to show'),
});

export const getPriceSchema = z.object({
  symbol: z.string().describe('Symbol to get last close for (e.g. AAPL)'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
});

export async function getDataAvailability(args: z.infer<typeof getDataAvailabilitySchema>): Promise<ToolResponse> {
  const cliArgs = ['backend', 'integrity', '--json'];
  if (args.family) cliArgs.push('--family', args.family);
  return invokeSovereignCli(cliArgs);
}

export async function getSigmaBands(args: z.infer<typeof getSigmaBandsSchema>): Promise<ToolResponse> {
  return invokeSovereignCli([
    'backend', 'visualize',
    '--symbol', args.symbol,
    '--timeframe', args.timeframe,
    '--window', args.window.toString(),
    '--json',
  ]);
}

export async function getIndicators(args: z.infer<typeof getIndicatorsSchema>): Promise<ToolResponse> {
  return invokeSovereignCli([
    'backend', 'indicators',
    '--symbol', args.symbol,
    '--timeframe', args.timeframe,
    '--max-bars', args.max_bars.toString(),
    '--show-last', args.show_last.toString(),
    '--json',
  ]);
}

export async function getPrice(args: z.infer<typeof getPriceSchema>): Promise<ToolResponse> {
  return invokeSovereignCli([
    'backend', 'data', 'summary',
    '--symbol', args.symbol,
    '--timeframe', args.timeframe,
    '--max-bars', '1',
    '--json',
  ]);
}
