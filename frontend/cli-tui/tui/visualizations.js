const A = require('../../../shared/lib/ui/ansi.js');
const { sampleSeries } = require('../commands/research/research_render.js');

function paint(code, text) {
  return A.c(code, text);
}

function visibleLength(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '').length;
}

function fmtPrice(priceVal) {
  if (priceVal == null || !Number.isFinite(priceVal)) return '';
  if (priceVal >= 1000) return '$' + (priceVal / 1000).toFixed(1) + 'k';
  if (priceVal >= 1) return '$' + priceVal.toFixed(2);
  return '$' + priceVal.toPrecision(3);
}

function centerCell(value, width) {
  const text = String(value || '').slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function toFiniteNumber(val, fallback) {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  return fallback;
}

function applySigmaMarker(grid, colors, priceCol, height, markerColor) {
  if (priceCol < 0 || priceCol >= grid[0].length) return;
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

function writeLabel(labelRow, text, start, width) {
  for (let idx = 0; idx < text.length; idx++) {
    const targetCol = start + idx;
    if (targetCol >= 0 && targetCol < width) {
      labelRow[targetCol] = text[idx];
    }
  }
}

function buildSigmaLabelRow(mean, stddev, sigRange, width) {
  const labelRow = Array(width + 20).fill(' ');
  const labels = [
    { t: -3 }, { t: -2 }, { t: -1 }, { t: 0 }, { t: 1 }, { t: 2 }, { t: 3 }
  ];

  for (const item of labels) {
    const colPos = Math.round(((item.t + sigRange) / (2 * sigRange)) * (width - 1));
    if (colPos < 0 || colPos >= width) continue;

    const price = mean + (item.t * stddev);
    let labelText = price.toFixed(price < 1 ? 4 : 2);
    if (price > 1000000) {
      labelText = (price / 1000000).toFixed(1) + 'M';
    } else if (price > 1000) {
      labelText = (price / 1000).toFixed(1) + 'k';
    }

    const start = colPos - Math.floor(labelText.length / 2);
    writeLabel(labelRow, labelText, start, width);
  }

  return labelRow.join('');
}

function renderSigmaSparkline(mean, stddev, currentPrice, width = 64) {
  if (stddev === 0 || !Number.isFinite(mean) || !Number.isFinite(stddev)) {
    return '  [-3s ' + A.GLYPH.hline.repeat(width) + ' +3s]';
  }

  const height = 12;
  const sigRange = 3.5;
  const currentSigmas = (currentPrice - mean) / stddev;

  // Student's t-distribution (df=4) approximation: f(t) = (1 + t^2/4)^-2.5
  const getPDF = (sigmaVal) => Math.pow(1 + (sigmaVal * sigmaVal) / 4, -2.5);

  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const colors = Array.from({ length: height }, () => Array(width).fill(''));

  for (let c = 0; c < width; c++) {
    const sigmaVal = ((c / (width - 1)) * 2 * sigRange) - sigRange;
    const pdf = getPDF(sigmaVal);
    const colHeight = Math.round(pdf * (height - 1));

    let color = A.GREEN;
    if (Math.abs(sigmaVal) > 1.0) color = A.YELLOW;
    if (Math.abs(sigmaVal) > 2.0) color = A.RED;

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

  applySigmaMarker(grid, colors, priceCol, height, markerColor);

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

  const labelLine = buildSigmaLabelRow(mean, stddev, sigRange, width);
  buffer += '       ' + labelLine + '\n';
  buffer += `      ${A.muted(`${'-3s'.padStart(6)} ${'-2s'.padStart(8)} ${'-1s'.padStart(8)} ${'Mean'.padStart(8)} ${'+1s'.padStart(8)} ${'+2s'.padStart(8)} ${'+3s'.padStart(8)}`)}\n`;

  const statusLine = `   ${A.muted('Current Position: ')}${markerColor}${currentSigmas >= 0 ? '+' : ''}${currentSigmas.toFixed(2)}s${A.RESET} ${A.muted(`(@ ${currentPrice.toFixed(4)})`)}`;
  buffer += `\n${statusLine}\n`;

  return buffer;
}

function collectCorrelationPairs(labels, values) {
  const pairs = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      pairs.push({ a: labels[i], b: labels[j], val: values[i][j] });
    }
  }
  return pairs;
}

function formatCorrelationHeader(meta, defaultTitle) {
  let title = defaultTitle;
  if (meta.method === 'fx-returns') {
    title = `FX ${defaultTitle}`;
  }
  let methodTag = '';
  if (meta.method) {
    const transformSuffix = meta.transform ? `, ${meta.transform}` : '';
    methodTag = ` ${A.muted(`[${meta.method}${transformSuffix}]`)}`;
  }
  return { title, methodTag };
}

function getCorrelationAnsiColor(val) {
  if (val > 0.8) return A.B_GREEN;
  if (val > 0.1) return A.GREEN;
  if (val > -0.1) return A.GRAY;
  if (val > -0.8) return A.RED;
  return A.B_RED;
}

function renderCorrelationHeatmap(labels, values, prices = {}, meta = {}) {
  if (!labels || !values || labels.length === 0) return '';

  if (labels.length > 12) {
    const pairs = collectCorrelationPairs(labels, values);
    const topPos = [...pairs].sort((a, b) => b.val - a.val).slice(0, 10);
    const topNeg = [...pairs].sort((a, b) => a.val - b.val).slice(0, 10);

    const { title, methodTag } = formatCorrelationHeader(meta, 'Correlation Summary');
    let buffer = `${paint(A.BOLD, title)}${methodTag} ${A.muted(`(N=${labels.length} - top pairs)`)}\n\n`;
    buffer += `${paint(A.B_GREEN, 'Top 10 Positive:')}\n`;
    topPos.forEach((p) => {
      const pa = fmtPrice(prices[p.a]);
      const pb = fmtPrice(prices[p.b]);
      const labelA = (p.a + (pa ? ` ${pa}` : '')).padEnd(18);
      const labelB = (p.b + (pb ? ` ${pb}` : '')).padEnd(18);
      buffer += `  ${labelA} ${A.GLYPH.pair}  ${labelB} ${getCorrelationAnsiColor(p.val)}${p.val.toFixed(3)}${A.RESET}\n`;
    });
    buffer += `\n${paint(A.B_RED, 'Top 10 Negative:')}\n`;
    topNeg.forEach((p) => {
      const pa = fmtPrice(prices[p.a]);
      const pb = fmtPrice(prices[p.b]);
      const labelA = (p.a + (pa ? ` ${pa}` : '')).padEnd(18);
      const labelB = (p.b + (pb ? ` ${pb}` : '')).padEnd(18);
      buffer += `  ${labelA} ${A.GLYPH.pair}  ${labelB} ${getCorrelationAnsiColor(p.val)}${p.val.toFixed(3)}${A.RESET}\n`;
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
    + labels.map((l) => centerCell(l, COL) + vline).join('');
  const priceRow = ' '.repeat(LABEL_W) + vline + labels.map((l) => {
    const priceFormatted = fmtPrice(prices[l]);
    if (priceFormatted) {
      return A.muted(centerCell(priceFormatted, COL)) + vline;
    }
    return ' '.repeat(COL) + vline;
  }).join('');

  const { title, methodTag } = formatCorrelationHeader(meta, 'Correlation Heatmap');
  let buffer = `${paint(A.BOLD, title)}${methodTag}\n${symRow}\n${priceRow}\n`;
  buffer += border + '\n';

  for (let i = 0; i < labels.length; i++) {
    const rowLabel = labels[i].slice(0, LABEL_W - 1).padEnd(LABEL_W);
    let row = rowLabel + vline;
    for (let j = 0; j < labels.length; j++) {
      const val = values[i][j];
      row += getCorrelationAnsiColor(val) + centerCell(val.toFixed(2), COL) + A.RESET + vline;
    }
    buffer += row + '\n';
  }

  buffer += `\n${A.muted('Legend: ')}${paint(A.B_RED, 'Strong Neg ')}${paint(A.RED, 'Neg ')}${A.muted('Neutral ')}${paint(A.GREEN, 'Pos ')}${paint(A.B_GREEN, 'Strong Pos')}\n`;
  if (meta.note) buffer += `${A.muted(`Note: ${meta.note}`)}\n`;
  return buffer;
}

function renderPriceChart(bars, width = 64, height = 12) {
  if (!Array.isArray(bars) || bars.length === 0) {
    return `\n  ${A.muted('No bars to chart.')}\n`;
  }
  const closes = bars.map((b) => b && b.close).filter((c) => typeof c === 'number' && Number.isFinite(c));
  if (closes.length === 0) {
    return `\n  ${A.muted('No usable close prices in the loaded bars.')}\n`;
  }

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

function bucketCandles(usable, count) {
  const totalBars = usable.length;
  const candles = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * totalBars) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * totalBars) / count));
    const slice = usable.slice(start, end);
    if (slice.length === 0) continue;
    const closePrice = toFiniteNumber(slice[slice.length - 1].close, 0);
    const openPrice = toFiniteNumber(slice[0].open, toFiniteNumber(slice[0].close, closePrice));
    let highPrice = Math.max(openPrice, closePrice);
    let lowPrice = Math.min(openPrice, closePrice);
    let totalVol = 0;
    for (const bar of slice) {
      highPrice = Math.max(highPrice, toFiniteNumber(bar.high, toFiniteNumber(bar.close, closePrice)));
      lowPrice = Math.min(lowPrice, toFiniteNumber(bar.low, toFiniteNumber(bar.close, closePrice)));
      totalVol += toFiniteNumber(bar.volume, 0);
    }
    candles.push({ o: openPrice, h: highPrice, l: lowPrice, c: closePrice, v: totalVol });
  }
  return candles;
}

function applySmaOverlay(grid, colors, candles, smaPeriod, min, max, rowForValue) {
  const cols = candles.length;
  const closesByCol = candles.map((item) => item.c);
  for (let c = smaPeriod - 1; c < cols; c += 1) {
    let sum = 0;
    for (let j = c - smaPeriod + 1; j <= c; j += 1) sum += closesByCol[j];
    const avg = sum / smaPeriod;
    if (avg < min || avg > max) continue;
    grid[rowForValue(avg)][c] = A.GLYPH.indicator;
    colors[rowForValue(avg)][c] = A.YELLOW;
  }
}

function renderVolumeRow(candles, vols, maxVol, threshold, cols) {
  let row = ` ${' '.repeat(8)} ${A.muted(A.GLYPH.vline)} `;
  for (let c = 0; c < cols; c += 1) {
    if (vols[c] / maxVol < threshold) {
      row += ' ';
      continue;
    }
    const color = candles[c].c >= candles[c].o ? A.GREEN : A.RED;
    row += color + A.GLYPH.block + A.RESET;
  }
  return row + '\n';
}

function renderVolumeSubplot(candles, cols) {
  const vols = candles.map((item) => item.v);
  const maxVol = Math.max(...vols, 0);
  if (maxVol <= 0) return '';

  const VOL_H = 3;
  let buffer = `  ${A.muted(`Volume (max ${maxVol.toLocaleString()})`)}\n`;
  for (let r = 0; r < VOL_H; r += 1) {
    const threshold = (VOL_H - r) / VOL_H;
    buffer += renderVolumeRow(candles, vols, maxVol, threshold, cols);
  }
  return buffer;
}

function renderCandlestickChart(bars, width = 64, height = 12, opts = {}) {
  const smaPeriod = Number.isFinite(opts.smaPeriod) ? Math.floor(opts.smaPeriod) : 0;
  const showVolume = !!opts.showVolume;
  if (!Array.isArray(bars) || bars.length === 0) {
    return `\n  ${A.muted('No bars to chart.')}\n`;
  }
  const usable = bars.filter((b) => b && typeof b.close === 'number' && Number.isFinite(b.close));
  if (usable.length === 0) {
    return `\n  ${A.muted('No usable close prices in the loaded bars.')}\n`;
  }

  const CHART_OVERHEAD = 12;
  const requestedWidth = Math.max(10, Math.floor(width) || 64);
  const maxVisibleWidth = opts.totalWidth ? requestedWidth : null;
  let plotWidth = requestedWidth;
  if (opts.totalWidth) {
    plotWidth = Math.max(10, requestedWidth - CHART_OVERHEAD);
  }
  const terminalCols = process.stdout.columns;
  if (terminalCols) {
    plotWidth = Math.max(10, Math.min(plotWidth, terminalCols - CHART_OVERHEAD));
  }

  const candles = bucketCandles(usable, plotWidth);
  if (candles.length === 0) {
    return `\n  ${A.muted('No usable close prices in the loaded bars.')}\n`;
  }

  const max = Math.max(...candles.map((item) => item.h));
  const min = Math.min(...candles.map((item) => item.l));
  const range = max - min;
  const rowForValue = (value) => {
    const pct = range > 0 ? (value - min) / range : 0.5;
    return height - 1 - Math.round(pct * (height - 1));
  };

  const cols = candles.length;
  const grid = Array.from({ length: height }, () => Array(cols).fill(' '));
  const colors = Array.from({ length: height }, () => Array(cols).fill(''));

  for (let c = 0; c < cols; c += 1) {
    const candle = candles[c];
    const color = candle.c >= candle.o ? A.GREEN : A.RED;
    const wickTop = rowForValue(candle.h);
    const wickBot = rowForValue(candle.l);
    for (let r = wickTop; r <= wickBot; r += 1) {
      grid[r][c] = A.GLYPH.vline;
      colors[r][c] = color;
    }
    const bodyTop = rowForValue(Math.max(candle.o, candle.c));
    const bodyBot = rowForValue(Math.min(candle.o, candle.c));
    for (let r = bodyTop; r <= bodyBot; r += 1) {
      grid[r][c] = A.GLYPH.block;
      colors[r][c] = color;
    }
  }

  if (smaPeriod > 1 && cols >= smaPeriod) {
    applySmaOverlay(grid, colors, candles, smaPeriod, min, max, rowForValue);
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

  if (showVolume) {
    buffer += renderVolumeSubplot(candles, cols);
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

function renderVolatilitySmile(smileRecords = [], width = 64, height = 12) {
  if (!Array.isArray(smileRecords) || smileRecords.length === 0) {
    return `\n  ${paint(A.GRAY, '[No Options Volatility Smile Data Available]')}\n`;
  }
  const ivs = smileRecords.map((r) => Number(r.mark_iv || 0)).filter((v) => v > 0);
  const strikes = smileRecords.map((r) => Number(r.strike || 0)).filter((v) => v > 0);
  if (ivs.length === 0 || strikes.length === 0) {
    return `\n  ${paint(A.GRAY, '[Insufficient IV Data]')}\n`;
  }
  const minIv = Math.min(...ivs);
  const maxIv = Math.max(...ivs);
  const minK = Math.min(...strikes);
  const maxK = Math.max(...strikes);
  const kRange = maxK - minK || 1;
  const ivRange = maxIv - minIv || 1;

  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const colors = Array.from({ length: height }, () => Array(width).fill(''));

  for (const rec of smileRecords) {
    if (!rec.strike || !rec.mark_iv) continue;
    const col = Math.min(width - 1, Math.max(0, Math.round(((rec.strike - minK) / kRange) * (width - 1))));
    const row = Math.min(height - 1, Math.max(0, Math.round(((rec.mark_iv - minIv) / ivRange) * (height - 1))));
    const rowIdx = height - 1 - row;

    let symbolGlyph = '●';
    let symbolColor = A.CYAN;
    if (rec.option_type === 'C') {
      symbolGlyph = 'C';
      symbolColor = A.GREEN;
    } else if (rec.option_type === 'P') {
      symbolGlyph = 'P';
      symbolColor = A.RED;
    }

    grid[rowIdx][col] = symbolGlyph;
    colors[rowIdx][col] = symbolColor;
  }

  let buffer = `\n   ${paint(A.BOLD, 'Implied Volatility Smile Surface')}\n`;
  for (let r = 0; r < height; r++) {
    const levelIv = (maxIv - (r / (height - 1)) * ivRange) * 100;
    let line = paint(A.GRAY, `${levelIv.toFixed(1).padStart(5)}% | `);
    for (let c = 0; c < width; c++) {
      line += colors[r][c] ? paint(colors[r][c], grid[r][c]) : grid[r][c];
    }
    buffer += line + '\n';
  }
  buffer += `         +${A.GLYPH.hline.repeat(width)}\n`;
  buffer += `          ${fmtPrice(minK).padEnd(Math.floor(width / 2), ' ')}${fmtPrice(maxK)}\n`;
  return buffer;
}

function renderNetGreeksTable(greeks = {}) {
  const curr = String(greeks.currency || 'BTC');
  const deltaVal = Number(greeks.net_delta_oi || 0);
  const gammaVal = Number(greeks.net_gamma_oi || 0);
  const vegaVal = Number(greeks.net_vega_oi || 0);
  const thetaVal = Number(greeks.net_theta_oi || 0);

  let buf = `\n  ${paint(A.BOLD + A.CYAN, `+--- [ ${curr} Net Greeks ] -----------------------+`)}\n`;
  buf += `  | ${paint(A.BOLD, 'Δ Delta')}: ${paint(deltaVal >= 0 ? A.GREEN : A.RED, deltaVal.toFixed(2).padStart(10))} OI`;
  buf += `  | ${paint(A.BOLD, 'Γ Gamma')}: ${paint(gammaVal >= 0 ? A.GREEN : A.YELLOW, gammaVal.toFixed(2).padStart(10))} / 1% |\n`;
  buf += `  | ${paint(A.BOLD, 'ν Vega ')}: ${paint(vegaVal >= 0 ? A.GREEN : A.YELLOW, ('$' + vegaVal.toFixed(0)).padStart(10))} / 1%`;
  buf += `  | ${paint(A.BOLD, 'Θ Theta')}: ${paint(A.RED, ('$' + thetaVal.toFixed(0)).padStart(10))} / day |\n`;
  buf += `  | OI: ${String(greeks.total_open_interest || 0).padStart(8)} contracts`;
  buf += `  | Vol 24h: $${((greeks.total_volume_usd || 0) / 1e6).toFixed(2)}M |\n`;
  buf += `  ${paint(A.CYAN, '+--------------------------------------------------+')}\n`;
  return buf;
}

module.exports = {
  fmtPrice,
  centerCell,
  renderSigmaSparkline,
  renderCorrelationHeatmap,
  renderPriceChart,
  renderCandlestickChart,
  renderVolatilitySmile,
  renderNetGreeksTable,
};
