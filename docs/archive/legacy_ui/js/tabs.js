window.SovereignTabs = (() => {
  function activate(name) {
    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${name}`);
    });
  }

  return { activate };
})();
