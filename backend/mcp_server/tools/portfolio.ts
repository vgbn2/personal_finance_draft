import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const portfolioSchema = z.object({
  mode: z.enum(['balance', 'aggregate']).optional().default('balance').describe('Balance check mode'),
  broker: z.enum(['alpaca', 'deribit', 'polymarket', 'mt5', 'gateio', 'gate_io']).optional().describe('Broker name to query (alpaca, deribit, polymarket, mt5, gateio)'),
  live: z.boolean().optional().default(false).describe('Whether to query live account (danger)'),
});

export async function getPortfolio(args: z.infer<typeof portfolioSchema>): Promise<ToolResponse> {
  const action = args.mode === 'aggregate' ? 'aggregate_portfolio' : 'balance';
  const cliArgs = ['trade', action];
  if (args.broker) cliArgs.push('--broker', args.broker);
  if (args.live) cliArgs.push('--live');
  return invokeSovereignCli(cliArgs);
}
