'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_ROOT, 'dist', 'mcp_server', 'index.js');
const REQUIRED_TOOL_NAMES = ['get_market_bias', 'get_scorecard', 'get_market_signal'];
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_SELF_TEST_TIMEOUT_MS = 2000;

function tail(value, limit = 2000) {
  return String(value || '').slice(-limit);
}

function withTimeout(promise, timeoutMs, stage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Timed out during ${stage} after ${timeoutMs}ms`);
      error.code = `mcp_${stage}_timeout`;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function runChildStdioSelfTest(options = {}) {
  const spawnFn = options.spawnFn || spawn;
  const timeoutMs = options.timeoutMs || DEFAULT_SELF_TEST_TIMEOUT_MS;
  const token = options.token || `sovereign-child-stdio-${process.pid}`;
  const script = [
    `process.stdout.write(${JSON.stringify(`${token}:stdout`)})`,
    `process.stderr.write(${JSON.stringify(`${token}:stderr`)})`,
  ].join(';');

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child && child.exitCode === null && typeof child.kill === 'function') child.kill();
      resolve({
        ...result,
        stdout_bytes: Buffer.byteLength(stdout),
        stderr_bytes: Buffer.byteLength(stderr),
      });
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error_code: 'host_child_stdio_timeout',
        reason: 'known_good_child_did_not_exit',
        exit_code: child?.exitCode ?? null,
        signal: child?.signalCode ?? null,
      });
    }, timeoutMs);

    try {
      child = spawnFn(process.execPath, ['-e', script], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish({
        ok: false,
        error_code: 'host_child_spawn_failed',
        reason: error.message,
        exit_code: null,
        signal: null,
      });
      return;
    }

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      finish({
        ok: false,
        error_code: 'host_child_spawn_failed',
        reason: error.message,
        exit_code: child.exitCode ?? null,
        signal: child.signalCode ?? null,
      });
    });
    child.on('close', (exitCode, signal) => {
      const stdoutOk = stdout.includes(`${token}:stdout`);
      const stderrOk = stderr.includes(`${token}:stderr`);
      if (exitCode === 0 && stdoutOk && stderrOk) {
        finish({
          ok: true,
          error_code: null,
          reason: 'known_good_child_stdio_visible',
          exit_code: exitCode,
          signal: signal || null,
        });
        return;
      }
      finish({
        ok: false,
        error_code: exitCode === 0
          ? 'host_child_stdio_unavailable'
          : 'host_child_self_test_failed',
        reason: exitCode === 0
          ? 'known_good_child_output_was_not_delivered'
          : 'known_good_child_exited_nonzero',
        exit_code: exitCode,
        signal: signal || null,
      });
    });
  });
}

function extractStatusPayload(statusResult) {
  const textContent = statusResult?.content?.find((item) => item?.type === 'text');
  if (!textContent?.text) {
    const error = new Error('get_system_status returned no text content');
    error.code = 'mcp_status_missing';
    throw error;
  }
  try {
    return JSON.parse(textContent.text);
  } catch (cause) {
    const error = new Error(`get_system_status returned malformed JSON: ${cause.message}`);
    error.code = 'mcp_status_malformed';
    throw error;
  }
}

function transportProcessState(transport) {
  const child = transport?.childProcess || transport?._process || null;
  return {
    pid: transport?.pid ?? child?.pid ?? null,
    exit_code: child?.exitCode ?? null,
    signal: child?.signalCode ?? null,
  };
}

function classifyProbeError(error, stage, processState) {
  if (error?.code) return error.code;
  if (stage === 'initialize' && (processState.exit_code !== null || processState.signal)) {
    return 'mcp_child_exited_before_initialize';
  }
  if (/parse|json|malformed/i.test(error?.message || '')) return 'mcp_response_malformed';
  return `mcp_${stage}_failed`;
}

async function closeProbe(client, transport) {
  try {
    if (client && typeof client.close === 'function') {
      await withTimeout(Promise.resolve(client.close()), 1000, 'close');
    } else if (transport && typeof transport.close === 'function') {
      await withTimeout(Promise.resolve(transport.close()), 1000, 'close');
    }
  } catch {
    // The process state below is still reported; force termination if the SDK close failed.
  }
  const child = transport?.childProcess || transport?._process;
  if (child && child.exitCode === null && typeof child.kill === 'function') child.kill();
}

async function runMcpProbe(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const serverPath = path.resolve(options.serverPath || path.join(repoRoot, 'dist', 'mcp_server', 'index.js'));
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const existsSync = options.existsSync || fs.existsSync;
  const runSelfTest = options.runSelfTest || runChildStdioSelfTest;
  const createTransport = options.createTransport || ((params) => new StdioClientTransport(params));
  const createClient = options.createClient || (() => new Client(
    { name: 'sovereign-mcp-probe', version: '1.0.0' },
    { capabilities: {} }
  ));

  if (!existsSync(serverPath)) {
    return {
      ok: false,
      stage: 'entrypoint',
      error_code: 'mcp_entrypoint_missing',
      error: `Compiled MCP entrypoint is missing: ${serverPath}`,
      server_path: serverPath,
    };
  }

  const hostStdio = await runSelfTest({ timeoutMs: options.selfTestTimeoutMs });
  if (!hostStdio.ok) {
    return {
      ok: false,
      stage: 'host_stdio_self_test',
      error_code: hostStdio.error_code,
      error: hostStdio.reason,
      server_path: serverPath,
      host_stdio: hostStdio,
    };
  }

  let client;
  let transport;
  let stage = 'initialize';
  let stderr = '';

  try {
    transport = createTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: repoRoot,
      stderr: 'pipe',
    });
    if (transport.stderr?.on) {
      transport.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    }
    client = createClient();

    await withTimeout(client.connect(transport), timeoutMs, stage);
    const server = typeof client.getServerVersion === 'function'
      ? client.getServerVersion()
      : null;

    stage = 'tools_list';
    const toolResult = await withTimeout(client.listTools(), timeoutMs, stage);
    const toolNames = (toolResult?.tools || []).map((tool) => tool.name);
    const missingTools = REQUIRED_TOOL_NAMES.filter((name) => !toolNames.includes(name));
    if (missingTools.length > 0) {
      const error = new Error(`MCP tool discovery missing: ${missingTools.join(', ')}`);
      error.code = 'mcp_required_tools_missing';
      error.missingTools = missingTools;
      throw error;
    }

    stage = 'status_call';
    const statusResult = await withTimeout(
      client.callTool({ name: 'get_system_status', arguments: {} }),
      timeoutMs,
      stage
    );
    const status = extractStatusPayload(statusResult);

    return {
      ok: true,
      stage: 'complete',
      server,
      server_path: serverPath,
      tool_count: toolNames.length,
      tools: toolNames,
      status_ok: status.ok,
      status_degraded: status.degraded,
      phase: status.components?.cli?.phase,
      quote_ok: status.components?.quotes?.ok,
      host_stdio: hostStdio,
      process: transportProcessState(transport),
      stderr_tail: tail(stderr),
    };
  } catch (error) {
    const processState = transportProcessState(transport);
    return {
      ok: false,
      stage,
      error_code: classifyProbeError(error, stage, processState),
      error: error.message,
      server_path: serverPath,
      process: processState,
      stderr_tail: tail(stderr),
      host_stdio: hostStdio,
      missing_tools: error.missingTools || undefined,
    };
  } finally {
    await closeProbe(client, transport);
  }
}

async function main() {
  const result = await runMcpProbe();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      stage: 'probe',
      error_code: error.code || 'mcp_probe_failed',
      error: error.message,
    })}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  DEFAULT_SELF_TEST_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  REQUIRED_TOOL_NAMES,
  classifyProbeError,
  closeProbe,
  extractStatusPayload,
  main,
  runChildStdioSelfTest,
  runMcpProbe,
  tail,
  transportProcessState,
  withTimeout,
};
