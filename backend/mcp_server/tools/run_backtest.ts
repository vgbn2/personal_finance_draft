import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const runBacktestSchema = z.object({
  strategy: z.string().optional().describe('Strategy file path (e.g., "config/strategies/mean_reversion.yaml")'),
  symbol: z.string().optional().describe('Target instrument (e.g., "BTCUSDT")'),
  timeframe: z.string().optional().describe('e.g., "1d", "1h"'),
  days: z.number().optional().describe('Lookback window in calendar days (e.g. 90, 365, 730). Overrides --from.'),
  from: z.string().optional().describe('Start date filter (YYYY-MM-DD). Ignored when days is set.'),
  to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
  fee_bps: z.number().optional().describe('Commission in basis points'),
  slippage_bps: z.number().optional().describe('Slippage in basis points'),
  sample: z.boolean().optional().describe('Run with deterministic generated bars instead of live cache'),
  allow_degraded: z.boolean().optional().default(false).describe('Proceed despite failed data-quality checks (default: false; research only)'),
});

export async function runBacktest(args: z.infer<typeof runBacktestSchema>): Promise<ToolResponse> {
  const cliArgs = ['bt'];

  if (args.strategy) cliArgs.push('--strategy', args.strategy);
  if (args.symbol) cliArgs.push('--symbol', args.symbol);
  if (args.timeframe) cliArgs.push('--timeframe', args.timeframe);
  if (args.days !== undefined) {
    cliArgs.push('--days', args.days.toString());
  } else if (args.from) {
    cliArgs.push('--from', args.from);
  }
  if (args.to) cliArgs.push('--to', args.to);
  if (args.fee_bps !== undefined) cliArgs.push('--fee-bps', args.fee_bps.toString());
  if (args.slippage_bps !== undefined) cliArgs.push('--slippage-bps', args.slippage_bps.toString());
  if (args.sample) cliArgs.push('--sample');
  if (args.allow_degraded === true) cliArgs.push('--allow-degraded');

  // Always request structured JSON so the LLM receives parseable output.
  cliArgs.push('--json');

  return invokeSovereignCli(cliArgs);
}
