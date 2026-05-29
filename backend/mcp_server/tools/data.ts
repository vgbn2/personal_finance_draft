import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const backfillSchema = z.object({
  symbol: z.string().describe('Symbol to backfill (e.g. AAPL)'),
  days: z.number().optional().default(30).describe('Number of days to fetch'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
});

export function backfill(args: z.infer<typeof backfillSchema>): ToolResponse {
  const cliArgs = ['backfill', '--symbol', args.symbol, '--days', args.days.toString(), '--timeframe', args.timeframe];
  return invokeSovereignCli(cliArgs);
}
