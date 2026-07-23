'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  runChildStdioSelfTest,
  runMcpProbe,
} = require('../../../scripts/mcp_stdio_probe.js');

const REQUIRED_TOOLS = [
  { name: 'get_market_bias' },
  { name: 'get_scorecard' },
  { name: 'get_market_signal' },
  { name: 'get_system_status' },
];

function fakeChild({ stdout = '', stderr = '', exitCode = 0, signal = null }) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {};
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.exitCode = exitCode;
    child.signalCode = signal;
    child.emit('close', exitCode, signal);
  });
  return child;
}

function successfulClient(overrides = {}) {
  let closed = false;
  const client = {
    async connect() {},
    getServerVersion() { return { name: 'sovereign-mcp', version: '1.0.0' }; },
    async listTools() { return { tools: REQUIRED_TOOLS }; },
    async callTool() {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            degraded: false,
            components: { cli: { phase: 'research' }, quotes: { ok: true } },
          }),
        }],
      };
    },
    async close() { closed = true; },
    wasClosed() { return closed; },
    ...overrides,
  };
  return client;
}

function probeOptions(client, transport = { pid: 42, stderr: new EventEmitter() }) {
  return {
    serverPath: __filename,
    runSelfTest: async () => ({
      ok: true,
      error_code: null,
      reason: 'known_good_child_stdio_visible',
      exit_code: 0,
      signal: null,
      stdout_bytes: 10,
      stderr_bytes: 10,
    }),
    createTransport: () => transport,
    createClient: () => client,
  };
}

test('child stdio self-test detects output suppression separately from MCP', async () => {
  const result = await runChildStdioSelfTest({
    token: 'known-token',
    spawnFn: () => fakeChild({ exitCode: 0 }),
    timeoutMs: 100,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error_code, 'host_child_stdio_unavailable');
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout_bytes, 0);
  assert.equal(result.stderr_bytes, 0);
});

test('child stdio self-test accepts a known-good visible child', async () => {
  const result = await runChildStdioSelfTest({
    token: 'known-token',
    spawnFn: () => fakeChild({
      stdout: 'known-token:stdout',
      stderr: 'known-token:stderr',
      exitCode: 0,
    }),
    timeoutMs: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'known_good_child_stdio_visible');
});

test('SDK probe initializes, lists required tools, calls read-only status, and closes', async () => {
  const client = successfulClient();
  const result = await runMcpProbe(probeOptions(client));
  assert.equal(result.ok, true);
  assert.equal(result.stage, 'complete');
  assert.equal(result.tool_count, REQUIRED_TOOLS.length);
  assert.equal(result.status_ok, true);
  assert.equal(result.phase, 'research');
  assert.equal(client.wasClosed(), true);
});

test('SDK probe reports a child exit before initialize and still closes', async () => {
  const transport = {
    pid: 43,
    stderr: new EventEmitter(),
    _process: { pid: 43, exitCode: 1, signalCode: null, kill() {} },
  };
  const client = successfulClient({
    async connect() { throw new Error('Connection closed'); },
  });
  const result = await runMcpProbe(probeOptions(client, transport));
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'initialize');
  assert.equal(result.error_code, 'mcp_child_exited_before_initialize');
  assert.equal(result.process.exit_code, 1);
  assert.equal(client.wasClosed(), true);
});

test('SDK probe identifies malformed status JSON at the call stage', async () => {
  const client = successfulClient({
    async callTool() {
      return { content: [{ type: 'text', text: '{malformed' }] };
    },
  });
  const result = await runMcpProbe(probeOptions(client));
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'status_call');
  assert.equal(result.error_code, 'mcp_status_malformed');
  assert.match(result.error, /malformed JSON/);
  assert.equal(client.wasClosed(), true);
});
