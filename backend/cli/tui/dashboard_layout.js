'use strict';

function dashboardLayout(columns = 80, rows = 24) {
  const viewportColumns = Math.max(40, Number(columns) || 80);
  const viewportRows = Math.max(10, Number(rows) || 24);
  const stacked = viewportColumns < 120;
  const height = Math.max(10, viewportRows - 2);
  const showHeader = viewportRows >= 28;
  const showFooter = viewportRows >= 20;
  const showChatStatus = viewportRows >= 28;
  const fixedRows = (showHeader ? 3 : 0)
    + (showFooter ? 3 : 0)
    + 3 // command input border
    + (showChatStatus ? 1 : 0);
  const bodyRows = Math.max(3, height - fixedRows);
  const stackedOutputRows = bodyRows >= 12 ? 6 : bodyRows >= 8 ? 5 : 2;
  const stackedTopRows = stacked
    ? Math.max(3, Math.min(Math.ceil(bodyRows * 2 / 3), bodyRows - stackedOutputRows))
    : bodyRows;

  return {
    columns: viewportColumns,
    rows: viewportRows,
    height,
    stacked,
    showHeader,
    showFooter,
    showChatStatus,
    sidebarWidth: stacked ? 18 : 18,
    contentWidth: stacked
      ? undefined
      : Math.min(72, Math.max(64, viewportColumns - 50)),
    suggestionLimit: Math.max(0, Math.min(6, viewportRows - 22)),
    pickerRows: Math.max(4, stacked ? Math.floor((viewportRows - 12) / 2) : viewportRows - 18),
    stackedTopRows,
    sidebarItemRows: Math.max(1, stackedTopRows - 4),
    commandItemRows: Math.max(1, stackedTopRows - 6),
    // Reserve root header, pane heading/rule, input border/status, and footer.
    outputLines: Math.max(2, stacked ? Math.floor((viewportRows - 19) / 4) : viewportRows - 20),
  };
}

function windowedRange(total, activeIndex, capacity) {
  const count = Math.max(0, Number(total) || 0);
  const limit = Math.max(1, Math.floor(Number(capacity) || 1));
  if (count <= limit) return { start: 0, end: count, above: 0, below: 0, compact: 0 };

  const active = Math.max(0, Math.min(count - 1, Number(activeIndex) || 0));
  if (limit === 1) {
    return { start: active, end: active + 1, above: 0, below: 0, compact: 0 };
  }
  let start = Math.min(Math.max(0, active - Math.floor(limit / 2)), count - limit);
  let end = Math.min(count, start + limit);
  let above = start > 0;
  let below = end < count;
  const itemSlots = Math.max(1, limit - Number(above) - Number(below));

  start = Math.min(Math.max(0, active - Math.floor(itemSlots / 2)), count - itemSlots);
  end = Math.min(count, start + itemSlots);
  above = start > 0;
  below = end < count;
  const aboveCount = above ? start : 0;
  const belowCount = below ? count - end : 0;
  if (limit === 2 && aboveCount > 0 && belowCount > 0) {
    return { start, end, above: 0, below: 0, compact: aboveCount + belowCount };
  }
  return {
    start,
    end,
    above: aboveCount,
    below: belowCount,
    compact: 0,
  };
}

module.exports = { dashboardLayout, windowedRange };
