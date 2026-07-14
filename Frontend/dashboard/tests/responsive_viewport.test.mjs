import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  evaluate,
  loadViewport,
  startChrome,
  startDashboardServer,
} from './helpers/chrome_cdp.mjs';

let browser;
let server;

before(async () => {
  server = await startDashboardServer();
  browser = await startChrome();
});

after(async () => {
  await browser?.stop();
  await server?.stop();
});

async function snapshot(width) {
  await loadViewport(browser.client, server.url, width);
  return evaluate(browser.client, `(() => {
    const sidebar = document.querySelector('aside');
    const main = document.querySelector('main');
    const grid = main?.querySelector('.grid');
    const toggle = document.querySelector('[aria-controls="dashboard-sidebar"]');
    const nav = document.querySelector('nav');
    const visible = (node) => {
      if (!node || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    };
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainWidth: Math.round(main?.getBoundingClientRect().width ?? 0),
      sidebarVisible: visible(sidebar),
      sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width ?? 0),
      toggleVisible: visible(toggle),
      toggleExpanded: toggle?.getAttribute('aria-expanded') ?? null,
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      navLabel: nav?.getAttribute('aria-label') ?? null,
      navButtons: [...(nav?.querySelectorAll('button') ?? [])].map((button) => ({
        name: button.textContent.trim(),
        current: button.getAttribute('aria-current'),
      })),
    };
  })()`);
}

for (const width of [375, 768, 1440]) {
  test(`${width}px keeps navigation reachable without page overflow`, async () => {
    const state = await snapshot(width);
    assert.equal(state.viewport, width);
    assert.ok(state.documentWidth <= width, `${state.documentWidth}px document overflows ${width}px viewport`);
    assert.equal(state.navLabel, 'Dashboard views');
    assert.equal(state.navButtons.length, 10, 'nine panels plus settings must share one reachable navigation');
    assert.equal(state.navButtons.filter((button) => button.current === 'page').length, 1);
    const visited = await evaluate(browser.client, `(async () => {
      const buttons = [...document.querySelectorAll('nav[aria-label="Dashboard views"] button')];
      const active = [];
      for (const button of buttons) {
        button.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const main = document.querySelector('main');
        active.push({
          name: document.querySelector('nav[aria-label="Dashboard views"] [aria-current="page"]')?.textContent.trim(),
          overflow: Math.max(0, (main?.scrollWidth ?? 0) - (main?.clientWidth ?? 0)),
        });
      }
      return active;
    })()`);
    assert.deepEqual(visited.map((entry) => entry.name), state.navButtons.map((button) => button.name));
    assert.deepEqual(visited.filter((entry) => entry.overflow > 1), [], 'active panels must not overflow the main viewport');
  });
}

test('375px collapses and can reopen the research controls', async () => {
  let state = await snapshot(375);
  assert.equal(state.sidebarVisible, false);
  assert.equal(state.toggleVisible, true);
  assert.equal(state.toggleExpanded, 'false');
  await evaluate(browser.client, `document.querySelector('[aria-controls="dashboard-sidebar"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  state = await evaluate(browser.client, `(() => {
    const sidebar = document.querySelector('aside');
    const toggle = document.querySelector('[aria-controls="dashboard-sidebar"]');
    return {
      sidebarVisible: Boolean(sidebar && sidebar.getBoundingClientRect().right > 0),
      sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width ?? 0),
      toggleExpanded: toggle?.getAttribute('aria-expanded') ?? null,
    };
  })()`);
  assert.equal(state.sidebarVisible, true);
  assert.equal(state.toggleExpanded, 'true');
  assert.ok(state.sidebarWidth <= 375);
});

test('768px uses a two-column overview and collapsed controls', async () => {
  const state = await snapshot(768);
  assert.equal(state.gridColumns, 2);
  assert.equal(state.sidebarVisible, false);
  assert.equal(state.toggleVisible, true);
});

test('1440px restores four overview columns and persistent controls', async () => {
  const state = await snapshot(1440);
  assert.equal(state.gridColumns, 4);
  assert.equal(state.sidebarVisible, true);
  assert.equal(state.sidebarWidth, 260);
  assert.equal(state.toggleVisible, false);
});
