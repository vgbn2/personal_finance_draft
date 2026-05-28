window.SovereignAnalytics = (() => {
  function renderAnalytics(container, status) {
    container.innerHTML = `
      <div class="dashboard-card">
        <h2>Analytics</h2>
        <p>Backend: ${status?.components?.backend?.ok ? 'online' : 'degraded'}</p>
      </div>
    `;
  }

  return { renderAnalytics };
})();
