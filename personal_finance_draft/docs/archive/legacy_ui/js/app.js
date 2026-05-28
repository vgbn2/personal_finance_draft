document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('status-pill');
  const metrics = document.getElementById('metrics');
  const portfolioPanel = document.getElementById('panel-portfolio');
  const backtestPanel = document.getElementById('panel-backtest');
  const correlationPanel = document.getElementById('panel-correlation');
  const settingsPanel = document.getElementById('panel-settings');

  document.querySelectorAll('[data-tab]').forEach((node) => {
    node.addEventListener('click', () => SovereignTabs.activate(node.dataset.tab));
  });

  try {
    const system = await SovereignApi.get('/api/system/status');
    status.textContent = system.degraded ? 'degraded' : 'online';
    metrics.append(
      SovereignUtils.createMetric('CLI Records', SovereignUtils.fmtNumber(system.components.cli.records, 0)),
      SovereignUtils.createMetric('Backend OK', system.components.backend.ok ? 'yes' : 'no'),
      SovereignUtils.createMetric('Quote Providers', SovereignUtils.fmtNumber(system.components.quotes.providers.length, 0)),
      SovereignUtils.createMetric('Cache Files', SovereignUtils.fmtNumber(system.components.cache.files, 0)),
    );

    const portfolio = await SovereignApi.get('/api/backend/portfolio');
    SovereignPortfolio.renderPortfolio(portfolioPanel, portfolio);

    const backtest = await SovereignApi.get('/api/backend/stats');
    SovereignBacktest.renderBacktest(backtestPanel, backtest);

    const correlation = await SovereignApi.get('/api/correlation?symbols=AAPL,MSFT,SPX');
    SovereignCorrelation.renderCorrelation(correlationPanel, correlation);

    settingsPanel.innerHTML = `<div class="dashboard-card"><h2>Settings</h2><p>Theme: ${SovereignSettings.load('theme', 'light')}</p></div>`;
  } catch (error) {
    status.textContent = 'offline';
    metrics.innerHTML = `<div class="dashboard-card"><h2>Unavailable</h2><p>${error.message}</p></div>`;
  }
});
