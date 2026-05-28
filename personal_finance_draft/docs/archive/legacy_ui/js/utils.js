window.SovereignUtils = (() => {
  function fmtNumber(value, digits = 2) {
    return Number.isFinite(value) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
  }

  function createMetric(label, value) {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    return card;
  }

  return { fmtNumber, createMetric };
})();
