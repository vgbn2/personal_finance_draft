import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const runBacktestSchema = z.object({
  symbol: z.string().optional().describe('Target instrument (e.g., "BTCUSDT")'),
  timeframe: z.string().optional().describe('e.g., "1d", "1h"'),
  from: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
  to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
  fee_bps: z.number().optional().describe('Commission in basis points'),
  slippage_bps: z.number().optional().describe('Slippage in basis points'),
  sample: z.boolean().optional().describe('Run deterministic validation backtest'),
});

export function runBacktest(args: z.infer<typeof runBacktestSchema>): ToolResponse {
  const cliArgs = ['bt'];
  
  if (args.sample) cliArgs.push('--sample');
  if (args.symbol) cliArgs.push('--symbol', args.symbol);
  if (args.timeframe) cliArgs.push('--timeframe', args.timeframe);
  if (args.from) cliArgs.push('--from', args.from);
  if (args.to) cliArgs.push('--to', args.to);
  if (args.fee_bps !== undefined) cliArgs.push('--fee-bps', args.fee_bps.toString());
  if (args.slippage_bps !== undefined) cliArgs.push('--slippage-bps', args.slippage_bps.toString());

  return invokeSovereignCli(cliArgs);
}
