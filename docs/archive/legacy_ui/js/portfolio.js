window.SovereignPortfolio = (() => {
  function renderPortfolio(container, metrics) {
    container.innerHTML = '';
    container.append(
      SovereignUtils.createMetric('Equity', SovereignUtils.fmtNumber(metrics.total_equity)),
      SovereignUtils.createMetric('Unrealized PnL', SovereignUtils.fmtNumber(metrics.unrealized_pnl)),
      SovereignUtils.createMetric('Net Exposure', SovereignUtils.fmtNumber(metrics.net_exposure)),
      SovereignUtils.createMetric('Gross Exposure', SovereignUtils.fmtNumber(metrics.gross_exposure)),
    );
  }

  return { renderPortfolio };
})();
