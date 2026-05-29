import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const getSystemStatusSchema = z.object({});

export function getSystemStatus(): ToolResponse {
  return invokeSovereignCli(['status']);
}
