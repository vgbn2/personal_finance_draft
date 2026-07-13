'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { makeFakeStdin, makeFakeStdout, keys, send } = require('./_harness');

test('command input editing supports mid-line arrows, Backspace, Delete, Home, and End', async () => {
  const { editCommandValue } = await import('../../../../backend/cli/tui/command_input.mjs');
  let state = { value: 'statuus', cursorOffset: 7 };
  state = editCommandValue(state.value, state.cursorOffset, '', { leftArrow: true });
  state = editCommandValue(state.value, state.cursorOffset, '', { leftArrow: true });
  state = editCommandValue(state.value, state.cursorOffset, '', { backspace: true });
  assert.deepEqual(state, { value: 'status', cursorOffset: 4 });

  state = editCommandValue(state.value, state.cursorOffset, '', { home: true });
  state = editCommandValue(state.value, state.cursorOffset, 'x', {});
  assert.deepEqual(state, { value: 'xstatus', cursorOffset: 1 });
  state = editCommandValue(state.value, state.cursorOffset, '', { delete: true });
  assert.deepEqual(state, { value: 'xtatus', cursorOffset: 1 });
  state = editCommandValue(state.value, state.cursorOffset, '', { end: true });
  assert.equal(state.cursorOffset, 6);
});

test('command input window keeps graphemes intact and uses terminal-cell width', async () => {
  const { commandInputWindow, displayWidth, splitGraphemes } = await import('../../../../backend/cli/tui/command_input.mjs');
  assert.equal(splitGraphemes('A🙂界').length, 3);
  assert.equal(displayWidth('A🙂界'), 5);
  const window = commandInputWindow('abcdef🙂界', 8, 6);
  assert.ok(displayWidth(window.text) <= 6);
  assert.ok(window.cursorColumn <= 6);
  assert.doesNotMatch(window.text, /�/);
});

test('dashboard command bar corrects a command mid-line and submits the corrected argv', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');
  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout();
  const calls = [];
  const instance = render(React.createElement(App, { onRun: (argv) => calls.push(argv) }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  await send(stdin, instance, [...'statuus', keys.left, keys.left, keys.backspace, keys.enter]);
  assert.deepEqual(calls, [['status']]);
  assert.match(stdout.snapshot(), /Running: sovereign status/);
});

test('dashboard reacts to terminal height resize instead of retaining mount-time rows', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');
  const stdin = makeFakeStdin();
  const stdout = makeFakeStdout({ columns: 120, rows: 30 });
  const instance = render(React.createElement(App, { onRun: () => {} }), {
    stdin, stdout, exitOnCtrlC: false, patchConsole: false,
  });
  t.after(() => instance.unmount());
  await instance.waitUntilRenderFlush();

  stdout.rows = 12;
  stdout.emit('resize');
  await delay(50);
  await instance.waitUntilRenderFlush();
  const renderedRows = stdout.snapshot().split(/\r?\n/).length;
  assert.ok(renderedRows <= 11, `expected rows-1 or less after resize, got ${renderedRows}`);
});

test('short viewports disable the slash suggestion expansion instead of clipping cursor math', async () => {
  const { dashboardLayout, windowedRange } = require('../../../../backend/cli/tui/dashboard_layout.js');
  assert.equal(dashboardLayout(80, 12).suggestionLimit, 0);
  assert.equal(dashboardLayout(120, 24).suggestionLimit, 2);
  assert.equal(dashboardLayout(160, 40).suggestionLimit, 6);
  assert.deepEqual(windowedRange(8, 0, 3), { start: 0, end: 2, above: 0, below: 6, compact: 0 });
  assert.deepEqual(windowedRange(8, 4, 2), { start: 4, end: 5, above: 0, below: 0, compact: 7 });
  assert.deepEqual(windowedRange(8, 7, 3), { start: 6, end: 8, above: 6, below: 0, compact: 0 });
});

test('short wide viewports keep the selected category and command visible', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const { App, M } = await import('../../../../backend/cli/sovereign_dashboard.mjs');

  for (const catI of [0, Math.floor(M.length / 2), M.length - 1]) {
    const commands = M[catI].cmds;
    for (const cmdI of [0, Math.floor(commands.length / 2), commands.length - 1]) {
      const stdin = makeFakeStdin();
      const stdout = makeFakeStdout({ columns: 120, rows: 16 });
      const instance = render(React.createElement(App, { initialCatI: catI, initialCmdI: cmdI, onRun: () => {} }), {
        stdin, stdout, exitOnCtrlC: false, patchConsole: false,
      });
      t.after(() => instance.unmount());
      await instance.waitUntilRenderFlush();

      const snapshot = stdout.snapshot();
      assert.match(snapshot, new RegExp(M[catI].label), `selected category ${M[catI].label} is visible`);
      assert.match(snapshot, new RegExp(commands[cmdI].label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `selected command ${commands[cmdI].label} is visible`);
    }
  }
});

test('dashboard stays within common terminal widths and keeps output discoverable', async (t) => {
  const { render, default: React } = await Promise.all([import('ink'), import('react')])
    .then(([ink, react]) => ({ render: ink.render, default: react.default }));
  const { App } = await import('../../../../backend/cli/sovereign_dashboard.mjs');
  const { displayWidth } = await import('../../../../backend/cli/tui/command_input.mjs');

  for (const viewport of [
    { columns: 80, rows: 20 },
    { columns: 80, rows: 24 },
    { columns: 100, rows: 30 },
    { columns: 120, rows: 30 },
    { columns: 160, rows: 40 },
  ]) {
    const stdin = makeFakeStdin();
    const stdout = makeFakeStdout(viewport);
    const instance = render(React.createElement(App, { onRun: () => {} }), {
      stdin, stdout, exitOnCtrlC: false, patchConsole: false,
    });
    t.after(() => instance.unmount());
    await instance.waitUntilRenderFlush();

    const snapshot = stdout.snapshot();
    const widest = Math.max(...snapshot.split(/\r?\n/).map(displayWidth));
    assert.ok(widest <= viewport.columns,
      `${viewport.columns}x${viewport.rows} rendered ${widest} columns`);
    assert.match(snapshot, /COMMAND OUTPUT/,
      `output remains discoverable at ${viewport.columns} columns`);
    if (viewport.rows >= 30) {
      for (const category of ['Operational', 'Data', 'Backend', 'Research', 'Trade', 'Polymarket', 'Settings', 'Account']) {
        assert.match(snapshot, new RegExp(category),
          `${category} remains visible at ${viewport.columns} columns`);
      }
      for (const command of ['status', 'cockpit', 'watch', 'cache-clean']) {
        assert.match(snapshot, new RegExp(command),
          `${command} remains visible at ${viewport.columns} columns`);
      }
    } else if (viewport.columns < 120) {
      assert.match(snapshot, /[↓↕] \d+ more/, 'short stacked navigation exposes a scroll affordance');
    }
  }
});
