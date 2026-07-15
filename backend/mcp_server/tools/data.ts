import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const backfillSchema = z.object({
  symbol: z.string().describe('Symbol to backfill (e.g. AAPL)'),
  days: z.number().int().min(1).max(3650).optional().default(30).describe('Number of days to fetch'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  execute: z.boolean().optional().default(false).describe('Set true to acknowledge that this writes cached market data'),
});

function blockedBackfillResponse(): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({
      ok: false,
      error: 'Data backfill blocked: set execute=true to acknowledge cache writes.',
    }) }],
    isError: true,
  };
}

export async function backfill(args: z.infer<typeof backfillSchema>): Promise<ToolResponse> {
  if (!args.execute) return blockedBackfillResponse();
  const cliArgs = ['backfill', '--symbol', args.symbol, '--days', args.days.toString(), '--timeframe', args.timeframe];
  return invokeSovereignCli(cliArgs, { timeoutMs: 300_000 });
}

export const backfillFamilySchema = z.object({
  family: z.string().describe('Family to backfill: equities, crypto, indices, commodities, fx'),
  days: z.number().int().min(1).max(3650).optional().default(365).describe('Number of days to fetch'),
  timeframe: z.string().optional().default('1d').describe('e.g. 1d, 1h'),
  force: z.boolean().optional().default(false).describe('Force re-fetch even if data is fresh'),
  execute: z.boolean().optional().default(false).describe('Set true to acknowledge that this writes cached market data'),
});

export async function backfillFamily(args: z.infer<typeof backfillFamilySchema>): Promise<ToolResponse> {
  if (!args.execute) return blockedBackfillResponse();
  const cliArgs = ['backfill', '--family', args.family, '--days', args.days.toString(), '--timeframe', args.timeframe];
  if (args.force) cliArgs.push('--force');
  return invokeSovereignCli(cliArgs, { timeoutMs: 300_000 });
}

export const backfillAllSchema = z.object({
  timeframes: z.string().optional().default('1d,1h,15m').describe('Comma-separated timeframes (e.g. 1d,1h,15m)'),
  days: z.number().int().min(1).max(3650).optional().default(365).describe('Days of history to fetch per symbol'),
  concurrency: z.number().int().min(1).max(10).optional().default(5).describe('Parallel jobs (maximum 10)'),
  dry_run: z.boolean().optional().describe('Force a no-write preview, even when execute is true'),
  execute: z.boolean().optional().default(false).describe('Set true to acknowledge cache writes; otherwise this always runs as a preview'),
});

export function buildBackfillAllArgs(args: z.infer<typeof backfillAllSchema>): string[] {
  const cliArgs = [
    'mass-backfill',
    '--timeframes', args.timeframes,
    '--days', args.days.toString(),
    '--concurrency', args.concurrency.toString(),
  ];
  if (!args.execute || args.dry_run) cliArgs.push('--dry-run');
  return cliArgs;
}

export async function backfillAll(args: z.infer<typeof backfillAllSchema>): Promise<ToolResponse> {
  return invokeSovereignCli(
    buildBackfillAllArgs(args),
    { timeoutMs: args.execute && !args.dry_run ? 900_000 : 30_000 },
  );
}
