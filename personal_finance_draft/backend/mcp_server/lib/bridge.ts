import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
// @ts-ignore
import { REPO_ROOT, findNodeCli, CLI_CANDIDATES } from '../../../shared/lib/paths';
import { ToolResponse } from './schemas';

export function extractJsonPayload(stdout: string): any | null {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {}

  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const candidate = line.trim();
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) continue;
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {}
  }

  return null;
}

export function invokeSovereignCli(args: string[]): ToolResponse {
  const cliPath = findNodeCli();
  
  if (!cliPath) {
    return {
      content: [{ type: 'text', text: `Sovereign CLI entrypoint not found. Searched: ${CLI_CANDIDATES.join(', ')}` }],
      isError: true,
    };
  }

  try {
    const result = spawnSync(process.execPath, [cliPath, ...args, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, SOVEREIGN_MFA_SKIP: 'true' }, // Example env override if needed
    });

    if (result.error) {
      return {
        content: [{ type: 'text', text: `Execution error: ${result.error.message}` }],
        isError: true,
      };
    }

    if (result.status !== 0) {
      return {
        content: [{ 
          type: 'text', 
          text: `CLI returned error (exit code ${result.status}):\n${result.stderr || result.stdout}` 
        }],
        isError: true,
      };
    }

    const parsed = extractJsonPayload(result.stdout);
    if (parsed !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
      };
    }

    // Fallback for non-JSON output if --json flag was ignored or failed
    return {
      content: [{ type: 'text', text: result.stdout || 'No output from CLI' }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Bridge failure: ${err.message}` }],
      isError: true,
    };
  }
}
