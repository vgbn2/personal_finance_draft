window.SovereignCharts = (() => {
  function sparkline(values) {
    const width = 160;
    const height = 48;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scaleX = values.length > 1 ? width / (values.length - 1) : width;
    const scaleY = max - min === 0 ? 1 : height / (max - min);
    const points = values.map((value, index) => `${(index * scaleX).toFixed(1)},${(height - (value - min) * scaleY).toFixed(1)}`);
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${points.join(' ')}"/></svg>`;
  }

  return { sparkline };
})();
