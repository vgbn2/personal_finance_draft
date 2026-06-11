const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const serverPath = path.join(repoRoot, 'dist', 'mcp_server', 'index.js');

const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const responses = new Map();

function encode(message) {
  return `${JSON.stringify(message)}\n`;
}

function send(message) {
  child.stdin.write(encode(message));
}

function drain() {
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline === -1) return;
    const line = buffer.slice(0, newline).replace(/\r$/, '');
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const parsed = JSON.parse(line);
    if (parsed.id !== undefined) responses.set(parsed.id, parsed);
  }
}

function waitFor(id, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(timer);
        resolve(responses.get(id));
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for MCP response id ${id}`));
      }
    }, 25);
  });
}

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  drain();
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

(async () => {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sovereign-mcp-probe', version: '1.0.0' },
    },
  });
  const init = await waitFor(1);
  if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);

  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = await waitFor(2);
  if (tools.error) throw new Error(`tools/list failed: ${JSON.stringify(tools.error)}`);

  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_system_status', arguments: {} },
  });
  const status = await waitFor(3);
  if (status.error) throw new Error(`get_system_status failed: ${JSON.stringify(status.error)}`);

  const toolNames = tools.result.tools.map((tool) => tool.name);
  const statusPayload = status.result.content?.[0]?.text || '';
  const parsedStatus = statusPayload ? JSON.parse(statusPayload) : {};

  console.log(JSON.stringify({
    ok: true,
    server: init.result.serverInfo,
    tool_count: toolNames.length,
    tools: toolNames,
    status_ok: parsedStatus.ok,
    status_degraded: parsedStatus.degraded,
    phase: parsedStatus.components?.cli?.phase,
    quote_ok: parsedStatus.components?.quotes?.ok,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  child.stdin.end();
  child.kill();
});
