const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough, Writable } = require('node:stream');
const { setTimeout: delay } = require('node:timers/promises');

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const SYNC_FRAME_START = '\x1b[?2026h';

function stripAnsi(input) {
  return String(input).replace(ANSI_RE, '');
}

// Ink wraps each repaint in a synchronized-update marker pair; isolating the
// tail after the LAST start marker gives the current frame instead of the
// whole accumulated transcript (needed for doesNotMatch assertions — content
// from an earlier frame stays in the raw buffer forever otherwise).
function lastFrame(raw) {
  const idx = raw.lastIndexOf(SYNC_FRAME_START);
  return idx === -1 ? raw : raw.slice(idx);
}

// Ink's App component pulls input via the readable-stream `.read()`/'readable'
// protocol (not bare 'data' events), so the fake stdin must be a real Readable
// (a PassThrough satisfies that) with TTY-only bits (isTTY/setRawMode/ref/unref)
// stubbed on top — the same shape ink-testing-library uses under the hood.
function makeFakeStdin() {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  return stdin;
}

function makeFakeStdout() {
  let buf = '';
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString('utf8');
      cb();
    },
  });
  stdout.isTTY = true;
  stdout.columns = 120;
  stdout.rows = 40;
  stdout.snapshot = () => stripAnsi(lastFrame(buf));
  return stdout;
}

const keys = {
  up: '[A',
  down: '[B',
  right: '[C',
  left: '[D',
  enter: '\r',
  tab: '\t',
  escape: '',
};

async function send(stdin, instance, sequence, gapMs = 25) {
  for (const key of sequence) {
    stdin.write(key);
    await delay(gapMs);
  }
  await instance.waitUntilRenderFlush();
}

test('dashboard App: navigate into a flagged command, edit flags, and trigger Run with the built argv', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });

  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());

  await instance.waitUntilRenderFlush();
  assert.match(stdout.snapshot(), /Operational/, 'sidebar shows the first category by default');

  // side -> cmd: enter the Operational category's command list
  await send(stdin, instance, [keys.enter]);
  assert.match(stdout.snapshot(), /OPERATIONAL DASHBOARD & HEALTH/);

  // side -> Data category, then into its command list
  await send(stdin, instance, [keys.escape, keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /DATA & BACKFILL/);

  // command list: status/cockpit/watch/cache-clean are Operational; Data's
  // first command is "backend integrity", second is "ingest" (has flags).
  await send(stdin, instance, [keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /› ingest/);
  assert.match(stdout.snapshot(), /▶ Run/, 'flags panel shows the trailing Run row');
  assert.match(stdout.snapshot(), /sovereign ingest --family all --timeframe 1h/,
    'live argv preview reflects ingest defaults (symbol/history-days blank, omitted)');
  // the sibling Data commands must NOT still be listed once drilled into ingest's
  // flags — showing the full list AND a multi-flag panel can exceed terminal rows
  // and corrupt Ink's cursor-repositioning redraw (reported as on-screen overlap).
  assert.doesNotMatch(stdout.snapshot(), /backfill-daemon/,
    'sibling commands collapse out of view while a flags panel is open');
  await send(stdin, instance, [keys.escape]);
  assert.match(stdout.snapshot(), /backfill-daemon/, 'full command list returns after backing out');
  // Escape only changes focus, not cmdI — cmdI is still on ingest, so a plain
  // Enter (no down) re-drills into the same command.
  await send(stdin, instance, [keys.enter]);
  assert.doesNotMatch(stdout.snapshot(), /backfill-daemon/, 're-entering ingest collapses the list again');

  // cycle --family (sel) one step forward: all -> crypto
  await send(stdin, instance, [keys.right]);
  assert.match(stdout.snapshot(), /\[crypto\]/);
  assert.match(stdout.snapshot(), /sovereign ingest --family crypto --timeframe 1h/);

  // move to --symbol (txt), enter edit mode, type a symbol, commit
  await send(stdin, instance, [keys.down, keys.enter]);
  await send(stdin, instance, ['B', 'T', 'C', 'U', 'S', 'D', 'T', keys.enter]);
  assert.match(stdout.snapshot(), /\[BTCUSDT\]/);
  assert.match(stdout.snapshot(), /sovereign ingest --family crypto --symbol BTCUSDT --timeframe 1h/);

  // move down to the Run row and trigger it
  await send(stdin, instance, [keys.down, keys.down, keys.down, keys.enter]);
  assert.equal(runCalls.length, 1, 'onRun should fire exactly once');
  assert.deepEqual(runCalls[0].argv, ['ingest', '--family', 'crypto', '--symbol', 'BTCUSDT', '--timeframe', '1h']);
  assert.deepEqual(runCalls[0].state, { catI: 1, cmdI: 1 });
});

test('dashboard App: yn flag toggles and a flagless command runs immediately on Enter', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });

  // Start already inside the Operational category's command list.
  const instance = render(h(App, { initialCatI: 0, initialCmdI: 0, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // cmd 0 = status (flagless) -> Enter should run immediately, no flags panel.
  await send(stdin, instance, [keys.enter]);
  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0].argv, ['status']);

  // Wait for the status command to finish executing so the dashboard is no longer in running state
  while (stdout.snapshot().includes('⌛ Running:')) {
    await delay(50);
  }

  // cmd 3 = cache-clean (--dry-run yn, default true) -> toggle it off then run.
  await send(stdin, instance, [keys.down, keys.down, keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /\[Y\]/, 'dry-run defaults to Y');
  await send(stdin, instance, [keys.left]);
  assert.match(stdout.snapshot(), /\[N\]/);
  await send(stdin, instance, [keys.down, keys.enter]);
  assert.deepEqual(runCalls[1].argv, ['cache-clean']);
});

test('dashboard App: bt --strategy flag cycles through real registered strategies, not the manifest placeholder', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // side: Operational(0) -> Data(1) -> Backend(2) -> Research(3)
  await send(stdin, instance, [keys.down, keys.down, keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /RESEARCH & BACKTESTING/);

  // cmd list: features(0) -> models(1) -> bt(2); bt has flags, drills into them
  await send(stdin, instance, [keys.down, keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /› bt/);
  assert.doesNotMatch(stdout.snapshot(), /<registered strategies>/,
    'the literal manifest placeholder must never reach the rendered flag panel once the registry resolves');
  // --strategy defaults blank, so buildArgv omits it from the preview entirely
  assert.match(stdout.snapshot(), /sovereign bt(?! --strategy)/);

  // flagI=0 is --strategy (the manifest's first key for bt); cycle it forward twice
  await send(stdin, instance, [keys.right]);
  const afterOne = stdout.snapshot();
  assert.doesNotMatch(afterOne, /<registered strategies>/);
  assert.match(afterOne, /sovereign bt --strategy config\/strategies\/\S+\.yaml/,
    'cycling --strategy now produces a real registry file path in the argv preview');
  assert.doesNotMatch(afterOne, /\.yaml\]/,
    'the flag value box renders the resolved label, not the raw .yaml path');
  const valueAfterOne = afterOne.match(/--strategy (config\/strategies\/\S+\.yaml)/)[1];

  await send(stdin, instance, [keys.right]);
  const afterTwo = stdout.snapshot();
  const valueAfterTwo = afterTwo.match(/--strategy (config\/strategies\/\S+\.yaml)/)[1];
  assert.notEqual(valueAfterOne, valueAfterTwo, 'cycling moves to a different real strategy each step');

  // cycling back left returns to the previous value (genuine wraparound list, not a one-way placeholder edit)
  await send(stdin, instance, [keys.left]);
  const afterBack = stdout.snapshot();
  const valueAfterBack = afterBack.match(/--strategy (config\/strategies\/\S+\.yaml)/)[1];
  assert.equal(valueAfterBack, valueAfterOne);
});

test('dashboard App: shows PIN gate for live trading and passes PIN to child process', async (t) => {
  const origPin = process.env.SOVEREIGN_TRADE_PIN;
  process.env.SOVEREIGN_TRADE_PIN = '4321';
  t.after(() => {
    if (origPin === undefined) delete process.env.SOVEREIGN_TRADE_PIN;
    else process.env.SOVEREIGN_TRADE_PIN = origPin;
  });

  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });

  // Start inside Trade category (index 4) and auto-trade command (index 4)
  const instance = render(h(App, { initialCatI: 4, initialCmdI: 4, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // Drill into flags
  await send(stdin, instance, [keys.enter]);
  assert.match(stdout.snapshot(), /› auto-trade/);

  // Move to --live (flagI = 1 is --live yn) and toggle it to true
  await send(stdin, instance, [keys.down, keys.right]);
  assert.match(stdout.snapshot(), /\[Y\]/, 'live flag is set to true');

  // Go to Run row and press enter
  await send(stdin, instance, [keys.down, keys.enter]);
  
  // It should show the PIN gate
  assert.match(stdout.snapshot(), /LIVE EXECUTION SECURITY GATE/, 'PIN gate prompt is visible');

  // Let's enter the PIN and submit
  await send(stdin, instance, ['4', '3', '2', '1', keys.enter]);

  // It should start running
  assert.match(stdout.snapshot(), /Running:/, 'Command is running after PIN entry');

  // auto-trade --live is the real automation loop (backend/cli/commands/
  // strategy/strategy.js runAutomatedStrategies) -- it only exits this fast
  // if the ai_agent_trading feature flag is disabled (a feature-gate
  // fast-fail); if someone has it enabled locally (e.g. while exercising the
  // real PIN flow by hand), this spawns the genuine infinite loop and
  // "wait for Running to clear" would hang forever. Bound the wait and abort
  // via Escape (the dashboard's own kill-switch, exercised in the next test)
  // so this test's outcome doesn't depend on that external, mutable setting.
  const deadline = Date.now() + 3000;
  while (stdout.snapshot().includes('⌛ Running:') && Date.now() < deadline) {
    await delay(50);
  }
  if (stdout.snapshot().includes('⌛ Running:')) {
    await send(stdin, instance, [keys.escape]);
    assert.match(stdout.snapshot(), /aborted[\s\S]*?user/);
  }
});

test('dashboard App: in-pane running process can be aborted via Escape', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });

  // Start inside Operational category, status command (index 0)
  const instance = render(h(App, { initialCatI: 0, initialCmdI: 0, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // Trigger Run
  await send(stdin, instance, [keys.enter]);
  assert.match(stdout.snapshot(), /Running:/);

  // Abort via Escape
  await send(stdin, instance, [keys.escape]);

  // It should show aborted message
  assert.match(stdout.snapshot(), /aborted[\s\S]*?user/);
});

test('dashboard App: --symbol flag shows a live autocomplete suggestion list and Tab accepts it (single-value)', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  // Data(1) -> ingest(1): --family(0,sel), --symbol(1,txt,pickSymbol:single)
  const instance = render(h(App, { initialCatI: 1, initialCmdI: 1, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]); // 'cmd' -> 'flags' (ingest has flags)
  assert.match(stdout.snapshot(), /› ingest/);

  await send(stdin, instance, [keys.down, keys.enter]); // move to --symbol, start editing
  await send(stdin, instance, ['B', 'T', 'C']);
  const typed = stdout.snapshot();
  assert.match(typed, /↑↓ browse · Tab autocomplete/, 'a real cached-symbol suggestion list appears while typing');
  assert.match(typed, /BTCUSDT/, 'the real cached universe surfaces a matching symbol, not just free text');

  await send(stdin, instance, [keys.tab]); // accept the highlighted suggestion
  await send(stdin, instance, [keys.enter]); // commit
  assert.match(stdout.snapshot(), /\[BTCUSDT\]/, 'Tab-autocomplete filled the flag value from the suggestion');
  assert.match(stdout.snapshot(), /sovereign ingest --family all --symbol BTCUSDT --timeframe 1h/);
});

test('dashboard App: --symbol flag autocomplete only replaces the in-progress segment for comma-sep (multi) fields', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  // Research(3) -> bt(2): --strategy(0,sel), --symbol(1,txt,pickSymbol:multi)
  const instance = render(h(App, { initialCatI: 3, initialCmdI: 2, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]); // 'cmd' -> 'flags' (bt has flags)
  assert.match(stdout.snapshot(), /› bt/);

  await send(stdin, instance, [keys.down, keys.enter]); // move to --symbol, start editing
  await send(stdin, instance, ['A', 'A', 'P', 'L', ',', 'M', 'S']);
  assert.match(stdout.snapshot(), /MSFT/, 'suggestions filter on the segment after the last comma, not the whole buffer');

  await send(stdin, instance, [keys.tab]);
  await send(stdin, instance, [keys.enter]); // commit
  assert.match(stdout.snapshot(), /\[AAPL,MSFT\]/, 'Tab only replaced the partial "MS" segment, keeping "AAPL," intact');
});

