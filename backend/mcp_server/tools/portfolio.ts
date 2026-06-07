import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const portfolioSchema = z.object({
  mode: z.enum(['balance', 'aggregate']).optional().default('balance').describe('Balance check mode'),
  live: z.boolean().optional().default(false).describe('Whether to query live account (danger)'),
});

export function getPortfolio(args: z.infer<typeof portfolioSchema>): ToolResponse {
  const action = args.mode === 'aggregate' ? 'aggregate_portfolio' : 'balance';
  const cliArgs = ['trade', action];
  if (args.live) cliArgs.push('--live');
  return invokeSovereignCli(cliArgs);
}
