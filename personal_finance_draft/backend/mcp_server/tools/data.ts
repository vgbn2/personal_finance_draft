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

export const backfillFamilySchema = z.object({
  family: z.string().describe('Family to backfill: equities, crypto, indices, commodities, fx'),
  days: z.number().optional().default(365).describe('Number of days to fetch'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  force: z.boolean().optional().default(false).describe('Force re-fetch even if data is fresh'),
});

export function backfillFamily(args: z.infer<typeof backfillFamilySchema>): ToolResponse {
  const cliArgs = ['backfill', '--family', args.family, '--days', args.days.toString(), '--timeframe', args.timeframe];
  if (args.force) cliArgs.push('--force');
  return invokeSovereignCli(cliArgs);
}

export const backfillAllSchema = z.object({
  timeframes: z.string().optional().default('1d,1h,15m').describe('Comma-separated timeframes (e.g. 1d,1h,15m)'),
  days: z.number().optional().default(365).describe('Days of history to fetch per symbol'),
  concurrency: z.number().optional().default(5).describe('Parallel jobs (default 5)'),
  dry_run: z.boolean().optional().default(false).describe('Preview job count without executing'),
});

export function backfillAll(args: z.infer<typeof backfillAllSchema>): ToolResponse {
  const cliArgs = [
    'mass-backfill',
    '--timeframes', args.timeframes,
    '--days', args.days.toString(),
    '--concurrency', args.concurrency.toString(),
  ];
  if (args.dry_run) cliArgs.push('--dry-run');
  return invokeSovereignCli(cliArgs);
}
