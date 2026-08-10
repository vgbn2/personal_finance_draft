'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { makeFakeStdin, makeFakeStdout, keys, send } = require('./_harness');

// Mocks ai_client.js's `ask()` for this whole file (each test file runs in
// its own process under node:test, so this never leaks into other test
// files). chat_llm_fallback.js destructures `ask` once at require-time, so
// the exported function must be a stable wrapper that delegates to a
// mutable `mockState.askImpl` -- that's what lets each test below swap
// behavior (LLM unavailable vs a canned resolution) without re-mocking.
const aiClientPath = require.resolve('../../../../shared/lib/ai/ai_client.js');
const mockState = { askImpl: async () => null };
// audit-ignore-loader: controlled dependency fixture restored by this test scope
require.cache[aiClientPath] = {
  id: aiClientPath,
  filename: aiClientPath,
  loaded: true,
  exports: {
    ask: (...args) => mockState.askImpl(...args),
    isAvailable: async () => true,
  },
};

async function waitUntilNotRunning(stdout, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (stdout.snapshot().includes('⌛ Running:') && Date.now() < deadline) {
    await delay(50);
  }
}

async function waitUntilVisible(stdout, pattern = /Operational/, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!pattern.test(stdout.snapshot()) && Date.now() < deadline) {
    await delay(50);
  }
}

test('chat: deterministic phrase runs immediately, no LLM call needed', async (t) => {
  mockState.askImpl = async () => { throw new Error('LLM should not be called for a deterministic match'); };

  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });
  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();
  await waitUntilVisible(stdout);

  assert.match(stdout.snapshot(), /Operational/, 'the grid is visible on boot');
  assert.match(stdout.snapshot(), /› /, 'the chat input bar is focused by default on boot');

  await send(stdin, instance, [...'backend chart AAPL 1h', keys.enter]);
  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0].argv, ['backend', 'chart', '--symbol', 'AAPL', '--timeframe', '1h', '--style', 'line', '--bars', '200']);
  assert.match(stdout.snapshot(), /Running: sovereign backend chart/);

  await waitUntilNotRunning(stdout);
});

test('chat: typing a word containing "q" does not quit the dashboard', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const instance = render(h(App, { onRun: () => {} }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [...'equity quick']);
  assert.match(stdout.snapshot(), /equity quick/, 'the dashboard is still alive and shows the typed text, not a quit');
});

test('chat: LLM fallback shows a mandatory confirm gate; nothing runs until confirmed', async (t) => {
  mockState.askImpl = async () => ({ text: JSON.stringify({ command_id: 'status', flags: {} }), source: 'mock' });

  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });
  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // A phrase guaranteed not to deterministically resolve to any real command.
  await send(stdin, instance, [...'zzqxw blorptastic nonsense', keys.enter]);
  await delay(300);
  await instance.waitUntilRenderFlush();
  assert.match(stdout.snapshot(), /Run "sovereign status"\? \[Enter\] confirm/, 'confirm row is shown');
  assert.equal(runCalls.length, 0, 'nothing runs while the confirm is pending');

  // Typing while a confirm is pending must be ignored, not buffered.
  await send(stdin, instance, ['x', 'y', 'z']);
  assert.equal(runCalls.length, 0);

  // Confirm with Enter.
  await send(stdin, instance, [keys.enter]);
  assert.equal(runCalls.length, 1, 'confirming runs exactly once');
  assert.deepEqual(runCalls[0].argv, ['status']);

  await waitUntilNotRunning(stdout);
});

test('chat: Escape cancels a pending LLM confirm without running anything', async (t) => {
  mockState.askImpl = async () => ({ text: JSON.stringify({ command_id: 'status', flags: {} }), source: 'mock' });

  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });
  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [...'zzqxw blorptastic nonsense', keys.enter]);
  await delay(300);
  await instance.waitUntilRenderFlush();
  assert.match(stdout.snapshot(), /\[Esc\] cancel/);

  await send(stdin, instance, [keys.escape]);
  assert.equal(runCalls.length, 0, 'cancelling never runs the LLM-resolved command');
  assert.match(stdout.snapshot(), /Cancelled\./);
});

test('chat: LLM unavailable degrades to a safe message, never hangs or runs anything', async (t) => {
  mockState.askImpl = async () => null; // mirrors ai_client.ask()'s real behavior when Ollama is unreachable

  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });
  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [...'zzqxw blorptastic nonsense', keys.enter]);
  await delay(300);
  await instance.waitUntilRenderFlush();
  assert.match(stdout.snapshot(), /Couldn't match that to a command/);
  assert.equal(runCalls.length, 0);
});

test('chat: a --live command resolved via chat still triggers the PIN gate', async (t) => {
  const origPin = process.env.SOVEREIGN_TRADE_PIN;
  process.env.SOVEREIGN_TRADE_PIN = '4321';
  t.after(() => {
    if (origPin === undefined) delete process.env.SOVEREIGN_TRADE_PIN;
    else process.env.SOVEREIGN_TRADE_PIN = origPin;
  });

  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });
  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // auto-trade --live is in the manifest with a --live yn flag; resolve it
  // deterministically via the chat box (no LLM needed for this one).
  await send(stdin, instance, [...'auto-trade --live', keys.enter]);
  assert.match(stdout.snapshot(), /LIVE EXECUTION SECURITY GATE/,
    'a chat-resolved --live command hits the exact same PIN gate the grid UI uses -- proves runOrGatePin, not handleRun, is the only entry point');
  assert.equal(runCalls.length, 0, 'nothing runs until the PIN is entered');

  await send(stdin, instance, ['4', '3', '2', '1', keys.enter]);
  assert.equal(runCalls.length, 1);
  assert.ok(runCalls[0].argv.includes('--live'));

  // handleRun's onRun callback above is mocked, but handleRun itself is the
  // REAL production function -- confirming the PIN spawns a genuine
  // `sovereign_cli.js auto-trade --live` child process for real, which (per
  // the ai_agent_trading feature flag's live state) may not exit on its
  // own. Unconditionally abort it via Escape (the dashboard's own kill
  // switch -- exercised deliberately, not just as a timeout fallback) so
  // this test can never leave a real --live process running regardless of
  // that flag. A bounded text-based wait here is not reliable: relying on
  // it left 8 real auto-trade child processes orphaned across repeated test
  // runs during this feature's development.
  await send(stdin, instance, [keys.escape]);
  await delay(100);
});

test('chat: Tab moves keyboard focus between the chat bar and the grid; the status line persists', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const instance = render(h(App, { onRun: () => {} }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [...'status', keys.enter]);
  assert.match(stdout.snapshot(), /Running: sovereign status/, 'chat status line echoes the resolved command immediately');
  // The grid is always visible, including its Output panel, so unlike the
  // old full-screen chat view there IS a "⌛ Running:" signal to poll for
  // here -- but `status` is fast enough that it can still finish within one
  // render tick. A short fixed delay covers the real subprocess exit either
  // way; the real production safeguard (Escape aborts it) is exercised by
  // the dedicated --live PIN-gate test above.
  await delay(800);

  await send(stdin, instance, [keys.tab]);
  // The chat input is now an ink-text-input <TextInput> (it owns the real
  // hardware cursor) rather than a hand-drawn `█`, so focus is asserted via the
  // footer hint that switches with focus, not a literal cursor glyph.
  assert.doesNotMatch(stdout.snapshot(), /type a command {2}⏎ run/, 'chat footer hint is gone once focus moves into the grid');
  assert.match(stdout.snapshot(), /↑↓ category/, 'footer hint switches to grid controls');
  assert.match(stdout.snapshot(), /Operational/, 'the grid was already visible and still is');

  await send(stdin, instance, [keys.tab]);
  assert.match(stdout.snapshot(), /type a command {2}⏎ run/, 'chat footer hint returns once focus is back on it');
  assert.match(stdout.snapshot(), /Running: sovereign status/, 'the status line survived the round trip');
});
