window.SovereignApi = (() => {
  async function get(path) {
    const response = await fetch(path, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || 'request_failed');
    }
    return payload;
  }

  return { get };
})();
