import { spawn } from 'node:child_process';
// @ts-ignore
import { REPO_ROOT, findNodeCli, CLI_CANDIDATES } from '../../../shared/lib/runtime/paths';
import { ToolResponse } from './schemas';
// @ts-ignore
import { buildChildEnvironment } from '../../../shared/lib/runtime/environment_manifest';
// @ts-ignore
import { classifyMcpCliCapability } from '../../../shared/lib/runtime/backend_bridge';

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

export interface InvokeSovereignCliOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

function textResponse(text: string, isError = false): ToolResponse {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function invokeSovereignCli(
  args: string[],
  options: InvokeSovereignCliOptions = {},
): Promise<ToolResponse> {
  const cliPath = findNodeCli();

  if (!cliPath) {
    return Promise.resolve(textResponse(
      `Sovereign CLI entrypoint not found. Searched: ${CLI_CANDIDATES.join(', ')}`,
      true,
    ));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const cliArgs = args.includes('--json') ? args : [...args, '--json'];
  const capability = classifyMcpCliCapability(cliArgs);
  if (capability === 'account_read' || capability === 'execution') {
    return Promise.resolve(textResponse(JSON.stringify({
      ok: false,
      error: 'environment_surface_denied',
      surface: 'mcp',
      required_capability: capability,
    }), true));
  }
  const childEnvironment = buildChildEnvironment(process.env, 'mcp', {
    overrides: {
      SOVEREIGN_SKIP_DOTENV: '1',
      SOVEREIGN_SKIP_LOCAL_ENV: '1',
    },
  });

  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let child: ReturnType<typeof spawn>;

    const finish = (response: ToolResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(response);
    };

    const appendOutput = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGTERM');
        finish(textResponse(`CLI output exceeded ${maxOutputBytes} bytes and was terminated.`, true));
        return;
      }
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(textResponse(`CLI timed out after ${timeoutMs}ms and was terminated.`, true));
    }, timeoutMs);

    try {
      child = spawn(process.execPath, [cliPath, ...cliArgs], {
        cwd: REPO_ROOT,
        env: childEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      finish(textResponse(`Bridge failure: ${err.message}`, true));
      return;
    }

    child.stdout?.on('data', (chunk: Buffer) => appendOutput('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => appendOutput('stderr', chunk));
    child.on('error', (error) => finish(textResponse(`Execution error: ${error.message}`, true)));
    child.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(textResponse(
          `CLI returned error (${signal ? `signal ${signal}` : `exit code ${code}`}):\n${stderr || stdout}`,
          true,
        ));
        return;
      }

      const parsed = extractJsonPayload(stdout);
      finish(textResponse(parsed !== null ? JSON.stringify(parsed, null, 2) : (stdout || 'No output from CLI')));
    });
  });
}
