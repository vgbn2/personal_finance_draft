const A = require('../../../shared/lib/ui/ansi');

function paint(code, text) {
  return A.c(code, text);
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

module.exports = {
  fmtPrice,
  centerCell,
  renderSigmaSparkline,
  renderCorrelationHeatmap,
};
