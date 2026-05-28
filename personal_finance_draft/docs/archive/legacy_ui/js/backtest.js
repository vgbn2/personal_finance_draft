window.SovereignBacktest = (() => {
  function renderBacktest(container, summary) {
    container.innerHTML = `
      <div class="dashboard-card">
        <h2>Backtest Summary</h2>
        <p>Trades: ${summary.trades ?? 0}</p>
        <p>Net Return: ${SovereignUtils.fmtNumber(summary.net_return ?? 0, 4)}</p>
      </div>
    `;
  }

  return { renderBacktest };
})();
