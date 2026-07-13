import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, description, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}`, { cause: lastError });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const forced = delay(2_000).then(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  await Promise.race([exited, forced]);
}

export async function startDashboardServer(port = 4173) {
  const child = spawn(path.resolve('node_modules/.bin/vite'), [
    'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}`);
      return response.ok;
    }, 'Vite preview server');
  } catch (error) {
    stopProcess(child);
    throw new Error(`${error.message}\n${output}`, { cause: error });
  }

  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => stopProcess(child),
  };
}

export async function startChrome() {
  const profileDir = await mkdtemp(path.join(tmpdir(), 'sovereign-responsive-'));
  const child = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const port = await waitFor(async () => {
      const value = await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
      return Number(value.split('\n')[0]);
    }, 'Chrome DevTools port');
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const values = await response.json();
      return values.find((target) => target.type === 'page');
    }, 'Chrome page target');
    const client = await createCdpClient(targets.webSocketDebuggerUrl);
    return {
      client,
      async stop() {
        await client.send('Browser.close').catch(() => {});
        client.close();
        await stopProcess(child);
        await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      },
    };
  } catch (error) {
    stopProcess(child);
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    throw error;
  }
}

async function createCdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    for (const resolve of listeners.get(message.method) ?? []) resolve(message.params);
    listeners.delete(message.method);
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const current = listeners.get(method) ?? [];
        current.push(resolve);
        listeners.set(method, current);
      });
    },
    close() { socket.close(); },
  };
}

export async function loadViewport(client, url, width, height = 900) {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 768,
  });
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
  await waitFor(async () => {
    const result = await evaluate(client, `document.querySelector('main') !== null`);
    return result;
  }, `dashboard render at ${width}px`);
}

export async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.text);
  return result.result.value;
}
