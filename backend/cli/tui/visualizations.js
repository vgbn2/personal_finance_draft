const A = require('../../../shared/lib/ui/ansi');
const { sampleSeries } = require('../commands/research/research_render.js');

function paint(code, text) {
  return A.c(code, text);
}

function visibleLength(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '').length;
}

function fmtPrice(p) {
  if (p == null || !isFinite(p)) return '';
  if (p >= 1000) return '$' + (p / 1000).toFixed(1) + 'k';
  if (p >= 1) return '$' + p.toFixed(2);
  return '$' + p.toPrecision(3);
}

function centerCell(value, width) {
  const text = String(value || '').slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function renderSigmaSparkline(mean, stddev, currentPrice, width = 64) {
  if (stddev === 0 || !Number.isFinite(mean) || !Number.isFinite(stddev)) {
    return '  [-3s ' + A.GLYPH.hline.repeat(width) + ' +3s]';
  }

  const height = 12;
  const sigRange = 3.5;
  const currentSigmas = (currentPrice - mean) / stddev;

  // Student's t-distribution (df=4) approximation: f(t) = (1 + t^2/4)^-2.5
  const getPDF = (t) => Math.pow(1 + (t * t) / 4, -2.5);

  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const colors = Array.from({ length: height }, () => Array(width).fill(''));

  for (let c = 0; c < width; c++) {
    const t = ((c / (width - 1)) * 2 * sigRange) - sigRange;
    const pdf = getPDF(t);
    const colHeight = Math.round(pdf * (height - 1));

    let color = A.GREEN;
    if (Math.abs(t) > 1.0) color = A.YELLOW;
    if (Math.abs(t) > 2.0) color = A.RED;

    for (let r = 0; r <= colHeight; r++) {
      const rowIdx = height - 1 - r;
      grid[rowIdx][c] = A.GLYPH.block;
      colors[rowIdx][c] = color;
    }
  }

  const pricePct = (currentSigmas + sigRange) / (2 * sigRange);
  const priceCol = Math.round(pricePct * (width - 1));

  let markerColor = A.B_WHITE;
  if (Math.abs(currentSigmas) > 1.0) markerColor = A.B_YELLOW;
  if (Math.abs(currentSigmas) > 2.0) markerColor = A.B_RED;

  if (priceCol >= 0 && priceCol < width) {
    for (let r = 0; r < height; r++) {
      if (grid[r][priceCol] === A.GLYPH.block) {
        grid[r][priceCol] = A.GLYPH.vline;
        colors[r][priceCol] = markerColor;
      } else if (r === 0) {
        grid[r][priceCol] = A.GLYPH.marker;
        colors[r][priceCol] = markerColor;
      } else {
        grid[r][priceCol] = A.GLYPH.vline;
        colors[r][priceCol] = A.GRAY;
      }
    }
  }

  let buffer = `\n   ${paint(A.BOLD, "Probability Density (Student's t, df=4)")}\n`;
  for (let r = 0; r < height; r++) {
    const yVal = (1 - (r / (height - 1))).toFixed(2);
    const tick = (r % 4 === 0) ? `${yVal} |` : '     |';
    buffer += ` ${A.muted(tick)} `;
    for (let c = 0; c < width; c++) {
      buffer += colors[r][c] + grid[r][c] + A.RESET;
    }
    buffer += '\n';
  }

  buffer += `      ${A.muted('+' + A.GLYPH.hline.repeat(width))}\n`;

  const labelRow = Array(width + 20).fill(' ');
  const labels = [
    { t: -3 }, { t: -2 }, { t: -1 }, { t: 0 }, { t: 1 }, { t: 2 }, { t: 3 }
  ];

  labels.forEach(l => {
    const p = Math.round(((l.t + sigRange) / (2 * sigRange)) * (width - 1));
    if (p >= 0 && p < width) {
      const price = mean + (l.t * stddev);
      const str = price > 1000000 ? (price / 1000000).toFixed(1) + 'M' :
                  price > 1000 ? (price / 1000).toFixed(1) + 'k' :
                  price.toFixed(price < 1 ? 4 : 2);
      const start = p - Math.floor(str.length / 2);
      for (let i = 0; i < str.length; i++) {
        if (start + i >= 0 && start + i < width) labelRow[start + i] = str[i];
      }
    }
  });

  buffer += '       ' + labelRow.join('') + '\n';
  buffer += `      ${A.muted(`${'-3s'.padStart(6)} ${'-2s'.padStart(8)} ${'-1s'.padStart(8)} ${'Mean'.padStart(8)} ${'+1s'.padStart(8)} ${'+2s'.padStart(8)} ${'+3s'.padStart(8)}`)}\n`;

  const statusLine = `   ${A.muted('Current Position: ')}${markerColor}${currentSigmas >= 0 ? '+' : ''}${currentSigmas.toFixed(2)}s${A.RESET} ${A.muted(`(@ ${currentPrice.toFixed(4)})`)}`;
  buffer += `\n${statusLine}\n`;

  return buffer;
}

function renderCorrelationHeatmap(labels, values, prices = {}, meta = {}) {
  if (!labels || !values || labels.length === 0) return '';

  const getAnsiColor = (val) => {
    if (val > 0.8) return A.B_GREEN;
    if (val > 0.1) return A.GREEN;
    if (val > -0.1) return A.GRAY;
    if (val > -0.8) return A.RED;
    return A.B_RED;
  };

  if (labels.length > 12) {
    const pairs = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        pairs.push({ a: labels[i], b: labels[j], val: values[i][j] });
      }
    }
    const topPos = [...pairs].sort((a, b) => b.val - a.val).slice(0, 10);
    const topNeg = [...pairs].sort((a, b) => a.val - b.val).slice(0, 10);

    const title = meta.method === 'fx-returns' ? 'FX Correlation Summary' : 'Correlation Summary';
    const methodTag = meta.method ? ` ${A.muted(`[${meta.method}${meta.transform ? `, ${meta.transform}` : ''}]`)}` : '';
    let buffer = `${paint(A.BOLD, title)}${methodTag} ${A.muted(`(N=${labels.length} - top pairs)`)}\n\n`;
    buffer += `${paint(A.B_GREEN, 'Top 10 Positive:')}\n`;
    topPos.forEach(p => {
      const pa = fmtPrice(prices[p.a]);
      const pb = fmtPrice(prices[p.b]);
      const labelA = (p.a + (pa ? ` ${pa}` : '')).padEnd(18);
      const labelB = (p.b + (pb ? ` ${pb}` : '')).padEnd(18);
      buffer += `  ${labelA} ${A.GLYPH.pair}  ${labelB} ${getAnsiColor(p.val)}${p.val.toFixed(3)}${A.RESET}\n`;
    });
    buffer += `\n${paint(A.B_RED, 'Top 10 Negative:')}\n`;
    topNeg.forEach(p => {
      const pa = fmtPrice(prices[p.a]);
      const pb = fmtPrice(prices[p.b]);
      const labelA = (p.a + (pa ? ` ${pa}` : '')).padEnd(18);
      const labelB = (p.b + (pb ? ` ${pb}` : '')).padEnd(18);
      buffer += `  ${labelA} ${A.GLYPH.pair}  ${labelB} ${getAnsiColor(p.val)}${p.val.toFixed(3)}${A.RESET}\n`;
    });
    buffer += `\n${A.muted('Legend: ')}${paint(A.B_RED, 'Strong Neg ')}${paint(A.RED, 'Neg ')}${A.muted('Neutral ')}${paint(A.GREEN, 'Pos ')}${paint(A.B_GREEN, 'Strong Pos')}\n`;
    if (meta.note) buffer += `${A.muted(`Note: ${meta.note}`)}\n`;
    return buffer;
  }

  const COL = 9;
  const LABEL_W = 10;
  const vline = A.muted(A.GLYPH.vline);
  const hline = A.GLYPH.hline.repeat(COL);
  const border = A.GLYPH.hline.repeat(LABEL_W) + A.GLYPH.corner
    + labels.map(() => hline).join(A.GLYPH.corner)
    + A.GLYPH.corner;
  const symRow = ' '.repeat(LABEL_W) + vline
    + labels.map(l => centerCell(l, COL) + vline).join('');
  const priceRow = ' '.repeat(LABEL_W) + vline + labels.map(l => {
    const p = fmtPrice(prices[l]);
    return (p ? A.muted(centerCell(p, COL)) : ' '.repeat(COL)) + vline;
  }).join('');

  const title = meta.method === 'fx-returns' ? 'FX Correlation Heatmap' : 'Correlation Heatmap';
  const methodTag = meta.method ? ` ${A.muted(`[${meta.method}${meta.transform ? `, ${meta.transform}` : ''}]`)}` : '';
  let buffer = `${paint(A.BOLD, title)}${methodTag}\n${symRow}\n${priceRow}\n`;
  buffer += border + '\n';

  for (let i = 0; i < labels.length; i++) {
    const rowLabel = labels[i].slice(0, LABEL_W - 1).padEnd(LABEL_W);
    let row = rowLabel + vline;
    for (let j = 0; j < labels.length; j++) {
      const val = values[i][j];
      row += getAnsiColor(val) + centerCell(val.toFixed(2), COL) + A.RESET + vline;
    }
    buffer += row + '\n';
  }

  buffer += `\n${A.muted('Legend: ')}${paint(A.B_RED, 'Strong Neg ')}${paint(A.RED, 'Neg ')}${A.muted('Neutral ')}${paint(A.GREEN, 'Pos ')}${paint(A.B_GREEN, 'Strong Pos')}\n`;
  if (meta.note) buffer += `${A.muted(`Note: ${meta.note}`)}\n`;
  return buffer;
}

// OHLCV/line chart for the dashboard's `backend chart` command. Plots close
// price as a continuous ANSI block-grid line (same grid/colors-array idiom
// as renderSigmaSparkline above) -- downsamples via the same sampleSeries()
// research_render.js already uses for its own return-tape/stress charts, so
// a long history collapses to `width` columns instead of being truncated.
function renderPriceChart(bars, width = 64, height = 12) {
  if (!Array.isArray(bars) || bars.length === 0) {
    return `\n  ${A.muted('No bars to chart.')}\n`;
  }
  const closes = bars.map((b) => b && b.close).filter((c) => typeof c === 'number' && Number.isFinite(c));
  if (closes.length === 0) {
    return `\n  ${A.muted('No usable close prices in the loaded bars.')}\n`;
  }

  // Each rendered row is `width` data columns PLUS a fixed margin: the
  // 8-char price label, a space on each side of it, the vline separator,
  // and one more trailing space (see the row-building loop below) -- 12
  // chars of overhead. A caller-requested width wider than the real
  // terminal wraps every row mid-line, which visibly shears the price-label
  // column away from the data (reported: chart "breaks" once --width pushes
  // the line past the terminal's actual column count, e.g. width > ~90 on a
  // ~100-column window). Clamp to what the terminal can actually show.
  const CHART_OVERHEAD = 12;
  const terminalCols = process.stdout.columns;
  if (terminalCols) {
    width = Math.max(10, Math.min(width, terminalCols - CHART_OVERHEAD));
  }

  const sampled = sampleSeries(closes, width);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min;

  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const colors = Array.from({ length: height }, () => Array(width).fill(''));

  const rowForValue = (value) => {
    const pct = range > 0 ? (value - min) / range : 0.5;
    return height - 1 - Math.round(pct * (height - 1));
  };

  let prevRow = null;
  for (let c = 0; c < sampled.length; c += 1) {
    const rowIdx = rowForValue(sampled[c]);
    const color = c > 0 && sampled[c] < sampled[c - 1] ? A.RED : A.GREEN;
    // Fill the vertical span between this point and the previous one so the
    // line reads as continuous rather than a scatter of disconnected dots.
    const lo = prevRow === null ? rowIdx : Math.min(prevRow, rowIdx);
    const hi = prevRow === null ? rowIdx : Math.max(prevRow, rowIdx);
    for (let r = lo; r <= hi; r += 1) {
      grid[r][c] = A.GLYPH.block;
      colors[r][c] = color;
    }
    prevRow = rowIdx;
  }

  let buffer = `\n  ${paint(A.BOLD, 'Price Chart')} ${A.muted(`(${bars.length} bars loaded, ${closes.length} usable closes)`)}\n`;
  const midRow = Math.floor((height - 1) / 2);
  for (let r = 0; r < height; r += 1) {
    const yVal = max - (range > 0 ? (r / (height - 1)) * range : 0);
    const showTick = r === 0 || r === height - 1 || r === midRow;
    const tick = showTick ? fmtPrice(yVal).padStart(8) : ' '.repeat(8);
    buffer += ` ${A.muted(tick)} ${A.muted(A.GLYPH.vline)} `;
    for (let c = 0; c < width; c += 1) buffer += colors[r][c] + grid[r][c] + A.RESET;
    buffer += '\n';
  }
  buffer += ` ${' '.repeat(8)} ${A.muted(`+${A.GLYPH.hline.repeat(width)}`)}\n`;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;
  const changeColor = changePct >= 0 ? A.GREEN : A.RED;
  buffer += `  ${A.muted('First:')} ${fmtPrice(first)}  ${A.muted('Last:')} ${fmtPrice(last)}  `;
  buffer += `${changeColor}${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%${A.RESET}  `;
  buffer += `${A.muted('High:')} ${fmtPrice(max)}  ${A.muted('Low:')} ${fmtPrice(min)}\n`;
  return buffer;
}

// Candlestick variant of renderPriceChart: each column is one aggregated candle
// (open/high/low/close bucketed from the bars) drawn as a high-low wick with an
// open-close body, green when close>=open and red otherwise. Same width-clamp,
// y-tick axis, and summary footer as renderPriceChart so the two are visually
// interchangeable; opt-in via `backend chart --style candle`. OHLC is already
// cached per bar, so this needs no new data path.
function renderCandlestickChart(bars, width = 64, height = 12, opts = {}) {
  const smaPeriod = Number.isFinite(opts.smaPeriod) ? Math.floor(opts.smaPeriod) : 0;
  const showVolume = !!opts.showVolume;
  if (!Array.isArray(bars) || bars.length === 0) {
    return `\n  ${A.muted('No bars to chart.')}\n`;
  }
  // A candle needs at least a close; open/high/low fall back to close when a
  // provider didn't supply them (renders as a thin doji rather than crashing).
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const usable = bars.filter((b) => b && typeof b.close === 'number' && Number.isFinite(b.close));
  if (usable.length === 0) {
    return `\n  ${A.muted('No usable close prices in the loaded bars.')}\n`;
  }

  // Same +12-char label/border overhead clamp as renderPriceChart (see there).
  // By default `width` is the plot width for render-helper compatibility. CLI
  // callers can pass totalWidth so a user-facing --width means full visible row
  // width, not "data columns plus hidden axis/footer overhead".
  const CHART_OVERHEAD = 12;
  const requestedWidth = Math.max(10, Math.floor(width) || 64);
  const maxVisibleWidth = opts.totalWidth ? requestedWidth : null;
  width = opts.totalWidth ? Math.max(10, requestedWidth - CHART_OVERHEAD) : requestedWidth;
  const terminalCols = process.stdout.columns;
  if (terminalCols) {
    width = Math.max(10, Math.min(width, terminalCols - CHART_OVERHEAD));
  }

  // Bucket the bars into `width` candles (open=first, close=last, high=max,
  // low=min within each bucket) so a long history collapses to width columns
  // instead of being truncated -- the OHLC analogue of sampleSeries().
  const n = usable.length;
  const candles = [];
  for (let i = 0; i < width; i += 1) {
    const start = Math.floor((i * n) / width);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / width));
    const slice = usable.slice(start, end);
    if (slice.length === 0) continue;
    const c = num(slice[slice.length - 1].close, 0);
    const o = num(slice[0].open, num(slice[0].close, c));
    let hi = Math.max(o, c);
    let lo = Math.min(o, c);
    let vol = 0;
    for (const b of slice) {
      hi = Math.max(hi, num(b.high, num(b.close, c)));
      lo = Math.min(lo, num(b.low, num(b.close, c)));
      vol += num(b.volume, 0);
    }
    candles.push({ o, h: hi, l: lo, c, v: vol });
  }
  if (candles.length === 0) {
    return `\n  ${A.muted('No usable close prices in the loaded bars.')}\n`;
  }

  const max = Math.max(...candles.map((k) => k.h));
  const min = Math.min(...candles.map((k) => k.l));
  const range = max - min;
  const rowForValue = (value) => {
    const pct = range > 0 ? (value - min) / range : 0.5;
    return height - 1 - Math.round(pct * (height - 1));
  };

  const cols = candles.length;
  const grid = Array.from({ length: height }, () => Array(cols).fill(' '));
  const colors = Array.from({ length: height }, () => Array(cols).fill(''));

  for (let c = 0; c < cols; c += 1) {
    const k = candles[c];
    const color = k.c >= k.o ? A.GREEN : A.RED;
    // Wick (high-low) first, then overlay the body (open-close) so the thicker
    // body wins any shared cell.
    const wickTop = rowForValue(k.h);
    const wickBot = rowForValue(k.l);
    for (let r = wickTop; r <= wickBot; r += 1) {
      grid[r][c] = A.GLYPH.vline;
      colors[r][c] = color;
    }
    const bodyTop = rowForValue(Math.max(k.o, k.c));
    const bodyBot = rowForValue(Math.min(k.o, k.c));
    for (let r = bodyTop; r <= bodyBot; r += 1) {
      grid[r][c] = A.GLYPH.block;
      colors[r][c] = color;
    }
  }

  // Optional SMA overlay: simple moving average over the per-candle closes,
  // drawn as a distinct yellow marker so the line reads on top of the candles
  // (it overrides only the single cell at the average's row in each column).
  if (smaPeriod > 1 && cols >= smaPeriod) {
    const closesByCol = candles.map((k) => k.c);
    for (let c = smaPeriod - 1; c < cols; c += 1) {
      let sum = 0;
      for (let j = c - smaPeriod + 1; j <= c; j += 1) sum += closesByCol[j];
      const avg = sum / smaPeriod;
      if (avg >= min && avg <= max) {
        grid[rowForValue(avg)][c] = A.GLYPH.indicator; // '*'
        colors[rowForValue(avg)][c] = A.YELLOW;
      }
    }
  }

  const smaLabel = smaPeriod > 1 ? ` ${A.c(A.YELLOW, `SMA(${smaPeriod})`)}` : '';
  let headerLine = `  ${paint(A.BOLD, 'Candlestick Chart')} ${A.muted(`(${bars.length} bars loaded, ${cols} candles)`)}${smaLabel}`;
  if (maxVisibleWidth && visibleLength(headerLine) > maxVisibleWidth) {
    headerLine = `  ${paint(A.BOLD, 'Candles')} ${A.muted(`(${bars.length} bars, ${cols} cols)`)}${smaLabel}`;
  }
  let buffer = `\n${headerLine}\n`;
  const midRow = Math.floor((height - 1) / 2);
  for (let r = 0; r < height; r += 1) {
    const yVal = max - (range > 0 ? (r / (height - 1)) * range : 0);
    const showTick = r === 0 || r === height - 1 || r === midRow;
    const tick = showTick ? fmtPrice(yVal).padStart(8) : ' '.repeat(8);
    buffer += ` ${A.muted(tick)} ${A.muted(A.GLYPH.vline)} `;
    for (let c = 0; c < cols; c += 1) buffer += colors[r][c] + grid[r][c] + A.RESET;
    buffer += '\n';
  }
  buffer += ` ${' '.repeat(8)} ${A.muted(`+${A.GLYPH.hline.repeat(cols)}`)}\n`;

  // Optional volume subplot: a short histogram under the price grid, one bar
  // per candle column, height-scaled to the largest bucket volume and colored
  // by the candle's direction. Skipped entirely when no bar carried volume.
  if (showVolume) {
    const vols = candles.map((k) => k.v);
    const maxVol = Math.max(...vols, 0);
    if (maxVol > 0) {
      const VOL_H = 3;
      buffer += `  ${A.muted(`Volume (max ${maxVol.toLocaleString()})`)}\n`;
      for (let r = 0; r < VOL_H; r += 1) {
        const threshold = (VOL_H - r) / VOL_H; // top row needs the tallest bars
        buffer += ` ${' '.repeat(8)} ${A.muted(A.GLYPH.vline)} `;
        for (let c = 0; c < cols; c += 1) {
          if (vols[c] / maxVol >= threshold) {
            const color = candles[c].c >= candles[c].o ? A.GREEN : A.RED;
            buffer += color + A.GLYPH.block + A.RESET;
          } else {
            buffer += ' ';
          }
        }
        buffer += '\n';
      }
    }
  }

  const first = usable[0].close;
  const last = usable[usable.length - 1].close;
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;
  const changeColor = changePct >= 0 ? A.GREEN : A.RED;
  const changeText = `${changeColor}${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%${A.RESET}`;
  const summaryLine = `  ${A.muted('First:')} ${fmtPrice(first)}  ${A.muted('Last:')} ${fmtPrice(last)}  ${changeText}  ${A.muted('High:')} ${fmtPrice(max)}  ${A.muted('Low:')} ${fmtPrice(min)}`;
  if (maxVisibleWidth && visibleLength(summaryLine) > maxVisibleWidth) {
    buffer += `  ${A.muted('First:')} ${fmtPrice(first)}  ${A.muted('Last:')} ${fmtPrice(last)}  ${changeText}\n`;
    buffer += `  ${A.muted('High:')} ${fmtPrice(max)}  ${A.muted('Low:')} ${fmtPrice(min)}\n`;
  } else {
    buffer += `${summaryLine}\n`;
  }
  return buffer;
}

module.exports = {
  fmtPrice,
  centerCell,
  renderSigmaSparkline,
  renderCorrelationHeatmap,
  renderPriceChart,
  renderCandlestickChart,
};
