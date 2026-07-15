import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const getSystemStatusSchema = z.object({});

export async function getSystemStatus(): Promise<ToolResponse> {
  return invokeSovereignCli(['status']);
}
