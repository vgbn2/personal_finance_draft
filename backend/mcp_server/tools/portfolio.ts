import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const portfolioSchema = z.object({
  mode: z.enum(['balance', 'aggregate']).optional().default('balance').describe('Balance check mode'),
});

export function getPortfolio(args: z.infer<typeof portfolioSchema>): ToolResponse {
  const action = args.mode === 'aggregate' ? 'aggregate_portfolio' : 'balance';
  return invokeSovereignCli(['trade', action]);
}
