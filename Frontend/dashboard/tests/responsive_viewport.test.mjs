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

for (const width of [360, 768, 1440]) {
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

function marketPayload({
  rows = [{
    instrument_id: 'crypto:VERY_LONG_CRYPTO_SYMBOL_FOR_RESPONSIVE_PROOF',
    symbol: 'VERY_LONG_CRYPTO_SYMBOL_FOR_RESPONSIVE_PROOF',
    display_name: 'A deliberately long configured instrument name for viewport containment',
    family: 'crypto',
    market: 'global',
    base_timeframe: '1m',
    value: 64000.25,
    value_kind: 'price',
    currency_or_unit: 'USD',
    provider: 'a-provider-name-that-is-long-enough-to-require-truncation',
    observed_at: new Date(Date.now() - 3_600_000).toISOString(),
    age_ms: 3_600_000,
    freshness_threshold_ms: 60_000,
    expected_next_at: null,
    freshness_state: 'stale',
    provider_state: 'unknown',
    update_state: 'idle',
    last_update_attempt_at: null,
    last_update_error: null,
    record_count: 100,
    source_mode: 'canonical',
  }],
  malformed = false,
  empty = false,
} = {}) {
  const effectiveRows = empty ? [] : malformed ? [{ symbol: 'BROKEN', freshness_state: 'live' }] : rows;
  const total = effectiveRows.length;
  return {
    ok: true,
    type: 'market_monitor',
    schema_version: 1,
    degraded: !empty && rows.some((row) => row.freshness_state === 'stale'),
    degradation_reasons: empty ? [] : ['stale_market_rows'],
    refresh_error_code: null,
    policy_version: 'global-market-monitor-v1',
    universe_policy_version: 'configured-market-universe-v1',
    generated_at: new Date().toISOString(),
    snapshot_duration_ms: 2,
    storage_mode: 'canonical',
    counts: {
      configured_price_bearing_total: total,
      price_bearing_total: total,
      excluded_price_bearing_total: 0,
      not_price_bearing_total: 0,
      exclusion_entries: 0,
      freshness: {
        fresh: 0,
        delayed: 0,
        stale: empty ? 0 : total,
        missing: 0,
        invalid: 0,
      },
      provider: { reachable: 0, degraded: 0, unreachable: 0, unknown: total },
      update: { idle: total, queued: 0, running: 0, succeeded: 0, failed: 0 },
    },
    filters: {},
    pagination: {
      offset: 0,
      limit: 100,
      returned: effectiveRows.length,
      filtered_total: effectiveRows.length,
      has_more: false,
    },
    rows: effectiveRows,
    exclusions: [],
  };
}

async function openMarketMonitor(width, {
  status = 200,
  payload = marketPayload(),
  pending = false,
} = {}) {
  await loadViewport(browser.client, server.url, width);
  await evaluate(browser.client, `(() => {
    const monitorPayload = ${JSON.stringify(payload)};
    const responseStatus = ${status};
    const pending = ${pending};
    window.fetch = async (input) => {
      const url = String(input);
      if (url.includes('/api/market/monitor')) {
        if (pending) return new Promise(() => {});
        return new Response(JSON.stringify(monitorPayload), {
          status: responseStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/system/status')) {
        return new Response(JSON.stringify({
          ok: true,
          components: {
            quotes: {
              ok: true,
              enabled: true,
              providers: [{
                provider: 'binance',
                status: 'ok',
                configured: true,
                records: 10,
                stale_records: 0,
              }],
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    };
    const button = [...document.querySelectorAll('nav[aria-label="Dashboard views"] button')]
      .find((candidate) => candidate.textContent.includes('Quote Health'));
    button.click();
  })()`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(browser.client, `document.querySelector('[data-market-monitor-state]')?.getAttribute('data-market-monitor-state') ?? null`);
    if (state) return state;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the global market monitor panel');
}

for (const width of [360, 768, 1440]) {
  test(`${width}px global monitor uses internal table scrolling without page overflow`, async () => {
    const state = await openMarketMonitor(width);
    assert.equal(state, 'degraded');
    const layout = await evaluate(browser.client, `(() => {
      const main = document.querySelector('main');
      const table = document.querySelector('[data-market-monitor-state] table');
      const scrollContainer = table?.parentElement;
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        mainOverflow: Math.max(0, (main?.scrollWidth ?? 0) - (main?.clientWidth ?? 0)),
        tableWidth: Math.round(table?.getBoundingClientRect().width ?? 0),
        scrollClientWidth: Math.round(scrollContainer?.clientWidth ?? 0),
        scrollWidth: Math.round(scrollContainer?.scrollWidth ?? 0),
        hasLastKnown: document.body.textContent.includes('last known'),
      };
    })()`);
    assert.ok(layout.documentWidth <= width);
    assert.ok(layout.mainOverflow <= 1);
    assert.ok(layout.scrollWidth >= layout.scrollClientWidth);
    if (width === 360) assert.ok(layout.tableWidth > layout.scrollClientWidth);
    assert.equal(layout.hasLastKnown, true);
  });
}

test('global monitor renders loading, unauthorized, API-error, empty, and malformed states explicitly', async () => {
  assert.equal(await openMarketMonitor(768, { pending: true }), 'loading');
  assert.equal(await openMarketMonitor(768, { status: 401 }), 'unauthorized');
  assert.match(
    await evaluate(browser.client, `document.querySelector('[data-market-monitor-state]')?.textContent ?? ''`),
    /Authentication is required/,
  );
  assert.equal(await openMarketMonitor(768, { status: 503 }), 'error');
  assert.match(
    await evaluate(browser.client, `document.querySelector('[data-market-monitor-state]')?.textContent ?? ''`),
    /API returned an error/,
  );
  assert.equal(await openMarketMonitor(768, { payload: marketPayload({ empty: true }) }), 'degraded');
  assert.match(
    await evaluate(browser.client, `document.querySelector('[data-market-monitor-state]')?.textContent ?? ''`),
    /No configured price-bearing instruments/,
  );
  assert.equal(await openMarketMonitor(768, { payload: marketPayload({ malformed: true }) }), 'degraded');
  assert.match(
    await evaluate(browser.client, `document.querySelector('[data-market-monitor-diagnostic]')?.textContent ?? ''`),
    /malformed row/,
  );
});

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
