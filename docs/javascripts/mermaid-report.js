(() => {
  const reportPath = '/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT/';
  const reportClass = 'architecture-report-page';

  function setupReport() {
    const pathname = window.location.pathname;
    const isReport = pathname.endsWith(reportPath)
      || pathname.endsWith(`${reportPath}index.html`);
    document.body.classList.toggle(reportClass, isReport);
    if (window.mermaid) {
      const dark = document.body.getAttribute('data-md-color-scheme') === 'slate';
      window.mermaid.initialize({
        startOnLoad: true,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'base',
        flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: true },
      });
      if (typeof window.mermaid.run === 'function') {
        window.mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
      }
    }
  }

  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(setupReport);
  }
  document.addEventListener('DOMContentLoaded', setupReport, { once: true });
})();
