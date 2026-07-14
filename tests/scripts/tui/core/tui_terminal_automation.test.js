const assert = require('node:assert/strict');
const test = require('node:test');

const manifest = require('../../../../backend/cli/tui/manifest');
const { createTuiSession, keys } = require('../../lib/tui_automation');

function repeat(key, count) {
  return Array.from({ length: count }, () => key);
}

async function openResearchMenu(session) {
  const researchIndex = manifest.categories.findIndex((entry) => entry.id === 'research');
  assert.ok(researchIndex >= 0, 'research category should exist');

  await session.waitFor(/Select Category:/);
  await session.send([...repeat(keys.down, researchIndex), keys.enter]);
  await session.waitFor(/Research & Backtesting:/);
}

test('TUI automation harness can navigate into the research menu', async () => {
  const session = createTuiSession();
  try {
    await openResearchMenu(session);
    const output = session.snapshot();

    assert.match(output, /Backtest \(Prop-firm fit\)/);
    assert.match(output, /Optimize Indicators/);
  } finally {
    session.kill();
  }
});

test('TUI automation harness reaches the asset picker for backtest', async () => {
  const session = createTuiSession();
  try {
    await openResearchMenu(session);

    const backtestIndex = manifest.commands.research.findIndex((entry) => entry.id === 'bt');
    assert.ok(backtestIndex >= 0, 'backtest command should exist');

    await session.send([...repeat(keys.down, backtestIndex), keys.enter]);
    await session.waitFor(/Strategy:/);
    await session.send([keys.enter]);
    await session.waitFor(/Timeframe:/);
    await session.send([keys.enter]);
    await session.waitFor(/History window \(days\):/);
    await session.send([keys.enter]);
    await session.waitFor(/Allow degraded data\?/);
    await session.send([keys.enter]);
    await session.waitFor(/Include families:/);

    const output = session.snapshot();
    assert.match(output, /Backtest \(Prop-firm fit\)/);
    assert.match(output, /Step 1 of 2: filter by family/);
    assert.doesNotMatch(output, /Prop-firm profile:/);
  } finally {
    session.kill();
  }
});

test('TUI automation harness keeps optimize free of prop-firm prompts', async () => {
  const session = createTuiSession();
  try {
    await openResearchMenu(session);

    const optimizeIndex = manifest.commands.research.findIndex((entry) => entry.id === 'optimize');
    assert.ok(optimizeIndex >= 0, 'optimize command should exist');

    await session.send([...repeat(keys.down, optimizeIndex), keys.enter]);
    await session.waitFor(/Strategy:/);

    const output = session.snapshot();
    assert.match(output, /Optimize Indicators/);
    assert.doesNotMatch(output, /Prop-firm profile:/);
  } finally {
    session.kill();
  }
});

test('TUI automation harness opens a symbol source selector in the trade desk', async () => {
  const session = createTuiSession({ args: ['trade'] });
  try {
    await session.waitFor(/Trade desk action:/);
    await session.send([...repeat(keys.down, 3), keys.enter]);
    await session.waitFor(/Symbol source:/);

    const output = session.snapshot();
    assert.match(output, /Symbol source:/);
    assert.match(output, /Favourite symbols/);
    assert.match(output, /Browse all symbols/);
  } finally {
    session.kill();
  }
});

test('TUI trade menu exposes a favourite symbols action', () => {
  const tradeMenu = manifest.commands.trade;
  assert.ok(tradeMenu.some((entry) => entry.id === 'favorites'));
});

// Phase B: ? help overlay -----------------------------------------------

test('TUI ? key shows keyboard shortcuts overlay in category menu', async () => {
  const session = createTuiSession();
  try {
    await session.waitFor(/Select Category:/);
    // Press '?' to open the help overlay
    await session.send(['?']);
    await session.waitFor(/Keyboard shortcuts/);

    const output = session.snapshot();
    assert.match(output, /Keyboard shortcuts/);
    // Standard keybinds should be listed
    assert.match(output, /Up \/ Down/);
    assert.match(output, /Enter/);
    assert.match(output, /to close help/);
  } finally {
    session.kill();
  }
});
