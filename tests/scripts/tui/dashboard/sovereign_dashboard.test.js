const assert = require('node:assert/strict');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { makeFakeStdin, makeFakeStdout, keys, send } = require('./_harness');
const { renderBackendUniverse } = require('../../../../backend/cli/commands/tools/backend.js');

test('dashboard App: research scorecard launches the canonical all-recorded v3 catalog', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App, M } = await import('../../../../backend/cli/sovereign_dashboard.mjs');
  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const research = M.find((category) => category.label === 'Research');
  const scorecardIndex = research.cmds.findIndex((command) => command.id === 'scorecard');
  assert.notEqual(scorecardIndex, -1, 'scorecard remains registered in the research menu');
  const instance = render(h(App, { initialCatI: 3, initialCmdI: scorecardIndex, onRun: (argv) => runCalls.push(argv) }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();
  await send(stdin, instance, [keys.enter]);
  assert.match(stdout.snapshot(), /Schema \(3 = research shadow\)/);
  await send(stdin, instance, [keys.right, keys.down, keys.right, keys.right]);
  assert.match(stdout.snapshot(), /sovereign scorecard --schema 3 --fixture all-recorded/);
  await send(stdin, instance, Array(10).fill(keys.down).concat(keys.enter));
  assert.deepEqual(runCalls[0], ['scorecard', '--schema', '3', '--fixture', 'all-recorded', '--tf', '1h,4h,1d', '--min-conf', '0.3', '--top', '50', '--no-backfill']);
});

test('dashboard App: navigate into a flagged command, edit flags, and trigger Run with the built argv', async (t) => {
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
  // The grid is always visible; the chat box is a thin input bar underneath
  // it, not a separate page, and the chat input box has keyboard focus by
  // default on boot.
  assert.match(stdout.snapshot(), /Operational/, 'the grid is visible immediately on boot');
  assert.match(stdout.snapshot(), /› /, 'the chat input bar is visible underneath the grid');

  // Tab moves keyboard focus from the chat bar into the grid.
  await send(stdin, instance, [keys.tab]);
  assert.match(stdout.snapshot(), /Operational/, 'Tab moves focus into the grid (still visible)');

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

  // move to --symbol (pickSymbol:single), open the picker, search, commit
  await send(stdin, instance, [keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /Select symbol — --symbol/);
  await send(stdin, instance, ['B', 'T', 'C', 'U', 'S', 'D', 'T']);
  assert.match(stdout.snapshot(), /BTCUSDT/);
  await send(stdin, instance, [keys.enter]);
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
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

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
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  const instance = render(h(App, { onRun }), { stdin, stdout, exitOnCtrlC: false, patchConsole: false });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // Tab out of the chat box (the new default) into the grid view.
  await send(stdin, instance, [keys.tab]);

  // side: Operational(0) -> Data(1) -> Backend(2) -> Research(3)
  await send(stdin, instance, [keys.down, keys.down, keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /RESEARCH & BACKTESTING/);

  // cmd list: features(0) -> bt(1); bt has flags, drills into them
  await send(stdin, instance, [keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /› bt/);
  assert.doesNotMatch(stdout.snapshot(), /<registered strategies>/,
    'the literal manifest placeholder must never reach the rendered flag panel once the registry resolves');
  // --strategy defaults blank, so buildArgv omits it from the preview entirely
  assert.match(stdout.snapshot(), /sovereign bt(?! --strategy)/);

  // flagI=0 is --strategy (the manifest's first key for bt); cycle it forward twice
  await send(stdin, instance, [keys.right]);
  const afterOne = stdout.snapshot();
  assert.doesNotMatch(afterOne, /<registered strategies>/);
  assert.match(afterOne, /sovereign bt --strategy config\/strategies\/[A-Za-z0-9_-]+/,
    'cycling --strategy now produces a real registry path in the bounded argv preview');
  assert.doesNotMatch(afterOne, /\.yaml\]/,
    'the flag value box renders the resolved label, not the raw .yaml path');
  const valueAfterOne = afterOne.match(/--strategy (config\/strategies\/[A-Za-z0-9_-]+)/)[1];

  await send(stdin, instance, [keys.right]);
  const afterTwo = stdout.snapshot();
  const valueAfterTwo = afterTwo.match(/--strategy (config\/strategies\/[A-Za-z0-9_-]+)/)[1];
  assert.notEqual(valueAfterOne, valueAfterTwo, 'cycling moves to a different real strategy each step');

  // cycling back left returns to the previous value (genuine wraparound list, not a one-way placeholder edit)
  await send(stdin, instance, [keys.left]);
  const afterBack = stdout.snapshot();
  const valueAfterBack = afterBack.match(/--strategy (config\/strategies\/[A-Za-z0-9_-]+)/)[1];
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
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });

  // Start inside Trade category (index 5) and auto-trade command (index 4)
  const instance = render(h(App, { initialCatI: 5, initialCmdI: 4, onRun }), {
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
  // Unconditional, not "only if still running after the deadline": a real
  // auto-trade --live child process got spawned the moment the PIN was
  // submitted above, regardless of how this wait loop turns out. Relying
  // on the "⌛ Running:" text alone to decide whether to abort left 8 real
  // orphaned auto-trade processes running after repeated test runs during
  // the chat-box feature's development (discovered via tasklist, not by
  // this suite) -- Escape is the dashboard's own kill-switch and is safe to
  // send even if the process already exited on its own.
  await send(stdin, instance, [keys.escape]);
  await delay(100);
});

test('dashboard App: in-pane running process can be aborted via Escape', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const runCalls = [];
  const onRun = (argv, state) => runCalls.push({ argv, state });

  // Start inside Operational category on "watch" (index 2) -- a genuinely
  // never-completing poller (unlike flagless "status", which can finish for
  // real before the Escape keystroke arrives under heavy system load,
  // racing this assertion; watch can't, so the abort path is exercised
  // deterministically rather than depending on subprocess timing).
  const instance = render(h(App, { initialCatI: 0, initialCmdI: 2, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  // Drill into watch's flags, move to the trailing Run row, trigger it.
  // watch now has 4 flags (--family, --interval, --symbol, --timeframe --
  // the latter two added for the optional live-chart mode), so the Run row
  // sits 4 downs past the first flag instead of 2.
  await send(stdin, instance, [keys.enter]);
  await send(stdin, instance, [keys.down, keys.down, keys.down, keys.down, keys.enter]);
  assert.match(stdout.snapshot(), /Running:/);

  // Wait for the child process to be spawned (so childRef.current is populated)
  await delay(100);

  // Abort via Escape
  await send(stdin, instance, [keys.escape]);

  // Wait for the abort to register and re-render
  await delay(50);

  // It should show aborted message
  assert.match(stdout.snapshot(), /aborted[\s\S]*?user/);
});

test('dashboard App: symbol picker (single) searches the real universe and Enter selects the highlighted match', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  // Backend(2) -> backend visualize(3): --symbol(0,txt,pickSymbol:single,required)
  const instance = render(h(App, { initialCatI: 2, initialCmdI: 3, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]); // 'cmd' -> 'flags' (backend visualize has flags)
  assert.match(stdout.snapshot(), /› backend visualize/);

  await send(stdin, instance, [keys.enter]); // flagI=0 is --symbol -> opens the picker
  assert.match(stdout.snapshot(), /Select symbol — --symbol/, 'the picker overlay opens instead of a bare text box');

  await send(stdin, instance, ['B', 'T', 'C', 'U', 'S', 'D', 'T']);
  const typed = stdout.snapshot();
  assert.match(typed, /Search: BTCUSDT/, 'typed characters are echoed in the picker\'s own search box');
  assert.match(typed, /BTCUSDT/, 'the real universe surfaces a matching symbol grouped under its category/sector header');

  await send(stdin, instance, [keys.enter]); // exact-match query auto-lands on the item row, not its header
  assert.match(stdout.snapshot(), /\[BTCUSDT\]/, 'Enter committed the highlighted symbol');
  assert.match(stdout.snapshot(), /sovereign backend visualize --symbol BTCUSDT/);
});

test('dashboard App: symbol picker (multi) groups by family/sector and a header toggle selects every symbol in that group at once', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  // Research(3) -> bt(1): --strategy(0,sel), --symbol(1,txt,pickSymbol:multi)
  const instance = render(h(App, { initialCatI: 3, initialCmdI: 1, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]); // 'cmd' -> 'flags'
  await send(stdin, instance, [keys.down, keys.enter]); // move to --symbol, open the picker

  // Narrow to one real sector ("layer1") so the group is small/deterministic.
  // Row 0 is always a "custom" row for a query with no exact symbol match
  // (here, the literal text "layer1" isn't itself a symbol) -- Down once
  // reaches the real header.
  await send(stdin, instance, ['l', 'a', 'y', 'e', 'r', '1']);
  await send(stdin, instance, [keys.down]);
  const filtered = stdout.snapshot();
  assert.match(filtered, /CRYPTO: GLOBAL — layer1/, 'results are grouped under real family/market — sector headers, like the legacy picker');
  assert.match(filtered, /BTCUSDT/);
  assert.match(filtered, /\[0\/11\]/, 'the header shows a 0/N selected-count badge before anything is toggled');

  // Toggle the whole layer1 group on via the header row.
  await send(stdin, instance, [' ']);
  const afterToggle = stdout.snapshot();
  assert.match(afterToggle, /\[11\/11\]/, 'toggling the header checks every symbol in its group');
  assert.match(afterToggle, /\[x\] BTCUSDT/, 'individual symbol rows reflect the group toggle as checked');

  await send(stdin, instance, [keys.enter]); // confirm the whole multi-selection
  const finalSnap = stdout.snapshot();
  assert.match(finalSnap, /sovereign bt --symbol \S*BTCUSDT\S*/, 'the comma-joined selection reached the real argv preview');
});

test('dashboard App: symbol picker accepts a typed value that is not in the cached universe (e.g. for ingest, which can fetch new symbols)', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  // Data(1) -> ingest(1): --family(0,sel), --symbol(1,txt,pickSymbol:single)
  const instance = render(h(App, { initialCatI: 1, initialCmdI: 1, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]);
  await send(stdin, instance, [keys.down, keys.enter]); // open the picker for --symbol

  await send(stdin, instance, ['Z', 'Z', 'Z', 'N', 'E', 'W', 'C', 'O', 'I', 'N']);
  assert.match(stdout.snapshot(), /\+ "ZZZNEWCOIN" \(not cached\)/,
    'a query matching nothing in the universe still offers itself as a selectable row -- this is an enhanced browser, not a restriction');

  await send(stdin, instance, [keys.enter]); // the custom row is index 0 for an unmatched query
  assert.match(stdout.snapshot(), /\[ZZZNEWCOIN\]/);
  assert.match(stdout.snapshot(), /sovereign ingest --family all --symbol ZZZNEWCOIN --timeframe 1h/);
});

test('dashboard App: symbol picker Escape cancels without changing the flag\'s previous value', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  const instance = render(h(App, { initialCatI: 1, initialCmdI: 1, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]);
  await send(stdin, instance, [keys.down, keys.enter]); // open the picker for --symbol (currently blank)
  await send(stdin, instance, ['A', 'A', 'P', 'L']);
  assert.match(stdout.snapshot(), /Search: AAPL/);

  await send(stdin, instance, [keys.escape]);
  assert.doesNotMatch(stdout.snapshot(), /Select symbol/, 'the picker overlay closed');
  assert.match(stdout.snapshot(), /sovereign ingest --family all --timeframe 1h/,
    '--symbol stayed blank -- the typed-but-not-confirmed search query never reached flagValues');
});

test('dashboard App: backend correlation exposes a --symbols flag (was previously missing from the manifest entirely)', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const onRun = () => {};

  // Backend(2) -> backend correlation(2): status(0), stats(1), correlation(2)
  const instance = render(h(App, { initialCatI: 2, initialCmdI: 2, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]);
  assert.match(stdout.snapshot(), /› backend correlation/);
  assert.match(stdout.snapshot(), /--symbols/,
    'a --symbols flag is now present (the real handler reads --symbols and silently fell back to a default equity universe without it)');

  await send(stdin, instance, [keys.enter]); // flagI=0 is --symbols -> opens the picker
  assert.match(stdout.snapshot(), /Select symbols — --symbols/, 'multi-select picker, matching its comma-sep contract');
});

test('dashboard App: backend chart resolves to the expected argv with a typed symbol', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  let ranArgv = null;
  const onRun = (argv) => { ranArgv = argv; };

  // Backend(2) -> backend chart(6): status(0), stats(1), correlation(2),
  // visualize(3), universe(4), risk(5), chart(6) -- appended last, see the manifest
  // comment for why (preserves universe's hardcoded index in another test).
  const instance = render(h(App, { initialCatI: 2, initialCmdI: 6, onRun }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]);
  assert.match(stdout.snapshot(), /› backend chart/);
  assert.match(stdout.snapshot(), /--symbol/);

  // flagI=0 is --symbol (txt, pickSymbol:'single') -> Enter opens the inline
  // text editor, not the dedicated symbol-picker overlay (no pickAssets
  // import in this fake-TTY harness) -- type a value and commit it.
  await send(stdin, instance, [keys.enter]);
  await send(stdin, instance, [...'BTCUSDT', keys.enter]);

  // Cycle down to the trailing "Run" row and trigger it. The chart command has
  // 6 flag rows (symbol, timeframe, style, sma, volume, bars) above Run.
  await send(stdin, instance, [keys.down, keys.down, keys.down, keys.down, keys.down, keys.down, keys.enter]);

  assert.deepEqual(ranArgv, ['backend', 'chart', '--symbol', 'BTCUSDT', '--timeframe', '1d', '--style', 'line', '--bars', '200']);
});

test('dashboard App: COMMAND OUTPUT panel is scrollable -- PageUp scrolls through a non-empty inventory fixture, End jumps to the live tail', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const h = React.createElement;
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout({ rows: 20 });
  const onRun = () => {};
  const inventoryEntries = Array.from({ length: 16 }, (_, index) => ({
    symbol: `FIXTURE_${String(index + 1).padStart(2, '0')}`,
    records: 1,
    timeframes: index % 2 === 0 ? ['1d', '1h'] : ['1d'],
  }));
  const inventoryOutput = renderBackendUniverse({
    available: true,
    ok: true,
    input: 'fixture://scroll',
    entries: inventoryEntries,
    quality: { rejected_records: 2 },
  });
  const executions = [];
  const executeInPane = async (argv) => {
    executions.push(argv);
    return { exitCode: 0, stdout: inventoryOutput, stderr: '' };
  };

  // Backend(2) -> backend universe(4). The synthetic contract fixture is
  // intentionally non-empty and long enough to exceed the panel's viewport;
  // using the host command here previously let `Symbols: 0` pass as a green
  // scrolling test when the native backend executable was unavailable.
  const instance = render(h(App, { initialCatI: 2, initialCmdI: 4, onRun, executeInPane }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [keys.enter]); // flagless -> runs immediately
  let snap = stdout.snapshot();
  while (snap.includes('⌛ Running:')) {
    await delay(50);
    snap = stdout.snapshot();
  }
  assert.deepEqual(executions, [['backend', 'universe']], 'the fixture went through the real dashboard command-selection seam');

  // The panel column is narrow enough to word-wrap long lines (including
  // the indicator text itself) across multiple display rows -- flatten
  // newlines before parsing it out, and match a short content fragment
  // guaranteed to survive wrapping intact rather than a full sentence.
  const flat = (s) => s.replace(/\n/g, ' ');
  assert.match(flat(snap), /backend integrity/, 'the fixture report tail reached the panel');
  assert.doesNotMatch(snap, /Backend Universe/, 'the report\'s opening header is off the bottom-pinned view -- proves this is really scrolled, not just short output that fits in one page');
  const totalMatch = flat(snap).match(/\[lines (\d+)-(\d+)\/(\d+)\]/);
  assert.ok(totalMatch, 'a scroll-position indicator appears once output exceeds one page');
  const total = Number(totalMatch[3]);
  assert.equal(Number(totalMatch[2]), total, 'auto-follow starts pinned to the tail (last line shown == total)');
  assert.match(flat(snap), /PgUp/);

  await send(stdin, instance, [keys.pageUp]);
  const afterPageUp = stdout.snapshot();
  const upMatch = flat(afterPageUp).match(/\[lines (\d+)-(\d+)\/(\d+)\]/);
  assert.ok(Number(upMatch[1]) < Number(totalMatch[1]), 'PageUp moved the visible window earlier');
  assert.match(flat(afterPageUp), /PgDn\/End/, 'no longer pinned to the tail');

  let afterTop = stdout.snapshot();
  let topReached = false;
  for (let i = 0; i < 20; i += 1) {
    if (/\[lines 1-/.test(flat(afterTop))) {
      topReached = true;
      break;
    }
    await send(stdin, instance, [keys.pageUp]);
    afterTop = stdout.snapshot();
  }
  assert.ok(topReached || /\[lines 1-/.test(flat(afterTop)), 'repeated PageUp reveals the beginning of the report');
  assert.match(afterTop, /Backend Universe/, 'the report header is reachable at the top');

  await send(stdin, instance, [keys.pageDown]);
  const sourcePage = stdout.snapshot();
  assert.match(flat(sourcePage), /Source: fixture:\/\/scroll/, 'the rendered output came from the injected contract fixture');

  await send(stdin, instance, [keys.pageDown]);
  const countPage = stdout.snapshot();
  assert.match(flat(countPage), /Symbols: 16 \| Records: 16/, 'the fixture proves positive inventory and record counts');
  assert.doesNotMatch(flat(afterTop + sourcePage + countPage), /unavailable|Symbols:\s*0\b/i, 'backend errors and zero-inventory output are not accepted as scroll evidence');

  await send(stdin, instance, [keys.end]);
  const afterEnd = stdout.snapshot();
  const endMatch = flat(afterEnd).match(/\[lines (\d+)-(\d+)\/(\d+)\]/);
  assert.equal(Number(endMatch[2]), total, 'End jumps back to the live tail');
  assert.match(flat(afterEnd), /PgUp/, 'auto-follow re-armed');
});
