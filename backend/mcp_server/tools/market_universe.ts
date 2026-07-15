import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const getMarketUniverseSchema = z.object({
  input: z.string().optional().describe('Path to the history JSON file'),
  max_entries: z.number().int().min(1).max(500).optional().describe('Limit the number of symbols returned (maximum 500)'),
});

export async function getMarketUniverse(args: z.infer<typeof getMarketUniverseSchema>): Promise<ToolResponse> {
  const cliArgs = ['backend', 'universe'];
  
  if (args.input) cliArgs.push('--input', args.input);
  if (args.max_entries !== undefined) cliArgs.push('--max-entries', args.max_entries.toString());

  return invokeSovereignCli(cliArgs);
}
