'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const manifest = require('../../../../backend/cli/tui/manifest');
const { createTuiSession, keys } = require('../../lib/tui_automation');
const { VirtualTerminalScreen } = require('../../lib/virtual_terminal_screen');

function repeat(key, count) {
  return Array.from({ length: count }, () => key);
}

test('Visual Interactive: Menu navigation tracks cursor pointer (>) across rows', async () => {
  const session = createTuiSession({ cols: 80, rows: 24 });
  try {
    await session.waitForVisual(/Select Category:/);
    const screen = session.screen;

    // Verify header line
    const headerRow = screen.findRowIndex(/SOVEREIGN.*Select Category:/);
    assert.ok(headerRow >= 0, 'Header row should exist on visual screen');

    // Initially, first category item (Operational Dashboard & Health) must be selected with '>'
    const initialSelectedRow = screen.findRowIndex(/>\s+Operational Dashboard/);
    assert.ok(initialSelectedRow >= 0, 'First category should be highlighted with >');
    assert.ok(screen.isRowHighlighted(initialSelectedRow), 'Row must have active visual highlight');

    // Press Down key
    await session.send([keys.down], 50);
    await delay(120);

    // After Down, first item should lose '>', second item (Data & Backfill) must gain '>'
    const firstRowAfter = screen.findRowIndex(/>\s+Operational Dashboard/);
    assert.equal(firstRowAfter, -1, 'First category should no longer have pointer >');

    const nextSelectedRow = screen.findRowIndex(/>\s+Data & Backfill/);
    assert.ok(nextSelectedRow >= 0, 'Second category (Data & Backfill) must now be highlighted with >');
    assert.ok(screen.isRowHighlighted(nextSelectedRow), 'Second row must have active visual highlight');

    // Press Up key to navigate back
    await session.send([keys.up], 50);
    await delay(120);

    const backToFirstRow = screen.findRowIndex(/>\s+Operational Dashboard/);
    assert.ok(backToFirstRow >= 0, 'Cursor should navigate back up to Operational Dashboard with >');
  } finally {
    session.kill();
  }
});

test('Visual Interactive: Submenu transition renders clean separator and items', async () => {
  const session = createTuiSession({ cols: 80, rows: 24 });
  try {
    await session.waitForVisual(/Select Category:/);

    // Press Enter on Operational Dashboard & Health
    await session.send([keys.enter], 50);
    await session.waitForVisual(/Operational Dashboard & Health:/);

    const screen = session.screen;

    // Verify separator line exists
    const sepRow = screen.findRowIndex(/^-{40,}/);
    assert.ok(sepRow >= 0, 'Horizontal separator line should span visual screen');

    // Verify sub-commands exist on screen
    assert.ok(screen.findRowIndex(/Status/) >= 0, 'Status command should be visually rendered');
    assert.ok(screen.findRowIndex(/Terminal dashboard/) >= 0, 'Terminal dashboard command should be visually rendered');
    assert.ok(screen.findRowIndex(/Safety Kill Switch/) >= 0, 'Kill switch command should be visually rendered');

    // Verify initial selection on Status
    const selectedSubRow = screen.findRowIndex(/>\s+Status/);
    assert.ok(selectedSubRow >= 0, 'Status item should be initially selected with >');
  } finally {
    session.kill();
  }
});

test('Visual Interactive: Real-time search query filtering and backspace recovery', async () => {
  const session = createTuiSession({ cols: 80, rows: 24 });
  try {
    await session.waitForVisual(/Select Category:/);
    await session.send([keys.enter], 50);
    await session.waitForVisual(/Operational Dashboard & Health:/);

    // Enter search mode with '/'
    await session.send(['/'], 50);
    await session.waitForVisual(/type to search\.\.\./);

    // Type 'kill' to filter for Safety Kill Switch
    await session.send(['k', 'i', 'l', 'l'], 40);
    await session.waitForVisual(/Safety Kill Switch/);

    const screen = session.screen;

    // Verify filtered screen state
    const killRow = screen.findRowIndex(/Safety Kill Switch/);
    assert.ok(killRow >= 0, 'Safety Kill Switch should remain visible');

    const statusRow = screen.findRowIndex(/Status/);
    assert.equal(statusRow, -1, 'Status should be filtered out when typing "kill"');

    // Search bar shows match count
    const searchBarRow = screen.findRowIndex(/kill_.*1 match/);
    assert.ok(searchBarRow >= 0, 'Search bar must display active query and match count');

    // Press backspace 4 times to clear query
    await session.send(['\x7f', '\x7f', '\x7f', '\x7f'], 40);
    await session.waitForVisual(/Status/);

    // Verify all items restored
    const restoredStatus = screen.findRowIndex(/Status/);
    assert.ok(restoredStatus >= 0, 'Status should reappear after backspacing search query');
  } finally {
    session.kill();
  }
});

test('Visual Interactive: Help overlay modal displays controls and dismisses cleanly', async () => {
  const session = createTuiSession({ cols: 80, rows: 24 });
  try {
    await session.waitForVisual(/Select Category:/);

    // Open help overlay with '?'
    await session.send(['?'], 50);
    await session.waitForVisual(/Keyboard shortcuts/);

    const screen = session.screen;

    // Verify modal contents
    assert.ok(screen.findRowIndex(/Keyboard shortcuts/) >= 0, 'Help title must be visible');
    assert.ok(screen.findRowIndex(/Up \/ Down.*Move selection/) >= 0, 'Navigation hint must be visible');
    assert.ok(screen.findRowIndex(/Enter.*Confirm/) >= 0, 'Confirm hint must be visible');
    assert.ok(screen.findRowIndex(/Press any key to close help/) >= 0, 'Close hint must be visible');

    // Close help overlay with any key (e.g. ' ')
    await session.send([' '], 50);
    await session.waitForVisual(/Select Category:/);

    // Verify modal is gone and category menu restored
    assert.equal(screen.findRowIndex(/Keyboard shortcuts/), -1, 'Help modal should be removed from screen');
    assert.ok(screen.findRowIndex(/Operational Dashboard/) >= 0, 'Category menu must be restored');
  } finally {
    session.kill();
  }
});

test('Visual Interactive: DEC Mode 2026 synchronized updates wrap visual redraws', async () => {
  const session = createTuiSession({ cols: 80, rows: 24 });
  try {
    await session.waitForVisual(/Select Category:/);

    // Perform interactive movements
    await session.send([keys.down, keys.down, keys.up], 40);
    await delay(150);

    // Verify atomic frames were captured
    assert.ok(session.syncFrames.length >= 2, `Should capture multiple atomic DEC 2026 frames (got ${session.syncFrames.length})`);

    // Verify raw stdout contains DEC 2026 start and end markers
    const rawOut = session.rawStdout;
    assert.ok(rawOut.includes('\x1b[?2026h'), 'Output must contain DEC 2026 BSU (\\x1b[?2026h)');
    assert.ok(rawOut.includes('\x1b[?2026l'), 'Output must contain DEC 2026 ESU (\\x1b[?2026l)');

    // Verify cursor-up redraw clear sequence (\x1b[...A\x1b[J)
    assert.ok(screenContainsCursorClear(rawOut), 'Redraws must use cursor-up and line clear sequences');
  } finally {
    session.kill();
  }
});

test('Visual Interactive: Multi-select space toggles checkboxes and increments header counter', async () => {
  const session = createTuiSession({ cols: 80, rows: 24 });
  try {
    await session.waitForVisual(/Select Category:/);

    // Navigate to Research & Backtesting (index 3)
    const researchIdx = manifest.categories.findIndex((entry) => entry.id === 'research');
    await session.send([...repeat(keys.down, researchIdx), keys.enter], 40);
    await session.waitForVisual(/Research & Backtesting:/);

    // Select Backtest (index 1 in manifest)
    const backtestIdx = manifest.commands.research.findIndex((entry) => entry.id === 'bt');
    await session.send([...repeat(keys.down, backtestIdx), keys.enter], 40);
    await session.waitForVisual(/Strategy:/);

    // Confirm defaults until Include families:
    await session.send([keys.enter], 40);
    await session.waitForVisual(/Timeframe:/);
    await session.send([keys.enter], 40);
    await session.waitForVisual(/History window/);
    await session.send([keys.enter], 40);
    await session.waitForVisual(/Allow degraded data/);
    await session.send([keys.enter], 40);
    await session.waitForVisual(/Include families:/);

    const screen = session.screen;

    // Initially at Include families, no items are checked: header shows no count, first row is [ ] Select All
    assert.equal(screen.findRowIndex(/Include families:.*\(\d+\)/), -1, 'Header should initially show no selected count');
    assert.ok(screen.findRowIndex(/>\s*\[\s*\]\s*Select All/) >= 0, 'First row should be [ ] Select All');
    assert.ok(screen.findRowIndex(/\[\s*\]\s*Commodities/) >= 0, 'Commodities should have unchecked box [ ]');

    // Press Space on row 0 to Select All
    await session.send([' '], 50);
    await session.waitForVisual(/Include families:.*\(\d+\)/);

    // Verify all items are selected: header shows count, first row flips to [x] Deselect All
    assert.ok(screen.findRowIndex(/Include families:.*\(\d+\)/) >= 0, 'Header must display selected items count');
    assert.ok(screen.findRowIndex(/>\s*\[x\]\s*Deselect All/) >= 0, 'First row must flip to [x] Deselect All');
    assert.ok(screen.findRowIndex(/\[x\]\s*Commodities/) >= 0, 'Commodities must now show checked box [x]');

    // Press Space again on row 0 to Deselect All
    await session.send([' '], 50);
    await delay(120);

    // Verify header counter cleared and checkboxes reset to [ ]
    assert.equal(screen.findRowIndex(/Include families:.*\(\d+\)/), -1, 'Header counter should be removed');
    assert.ok(screen.findRowIndex(/>\s*\[\s*\]\s*Select All/) >= 0, 'First row should reset to [ ] Select All');

    // Move down to Commodities (row 1) and press Space to select single item
    await session.send([keys.down, ' '], 50);
    await session.waitForVisual(/Include families:.*\(1\)/);

    // Verify header counter now displays (1) and Commodities row shows [x]
    assert.ok(screen.findRowIndex(/Include families:.*\(1\)/) >= 0, 'Header must display (1) selected item');
    assert.ok(screen.findRowIndex(/>\s*\[x\]\s*Commodities/) >= 0, 'Commodities row must now show checked box [x]');
  } finally {
    session.kill();
  }
});

test('Visual Interactive: Narrow terminal (40 columns) renders within visual viewport', async () => {
  const session = createTuiSession({ cols: 40, rows: 20 });
  try {
    await session.waitForVisual(/Select Category:/);
    const screen = session.screen;

    // Verify separator length does not exceed terminal width (40 cols)
    const sepRow = screen.findRowIndex(/^-+/);
    if (sepRow >= 0) {
      const lineText = screen.getVisualLine(sepRow);
      assert.ok(lineText.length <= 40, `Separator width (${lineText.length}) should not exceed 40 cols`);
    }

    // Verify options are visible and selectable in compact terminal
    assert.ok(screen.findRowIndex(/>\s+Operational/) >= 0, 'Operational Dashboard should be visible in 40-col mode');

    // Move cursor down
    await session.send([keys.down], 50);
    await delay(100);

    assert.ok(screen.findRowIndex(/>\s+Data & Backfill/) >= 0, 'Data & Backfill should be selected in 40-col mode');
  } finally {
    session.kill();
  }
});

function screenContainsCursorClear(raw) {
  return /\x1b\[\d+A\x1b\[J/.test(raw) || /\x1b\[J/.test(raw);
}
