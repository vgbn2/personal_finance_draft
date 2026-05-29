const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { server, io, DEFAULT_SNAPSHOT } = require('../app');

const REQUIRED_UI_ENDPOINTS = [
  '/api/system/status',
  '/api/signal',
  '/api/backtest',
  '/api/backend/portfolio',
  '/api/correlation',
];
const RETIRED_SIGNAL_ENDPOINT = `/api/${'hybrid'}/signals`;
const RETIRED_STATUS_COPY = `not ${'implemented'}`;

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(DEFAULT_SNAPSHOT)) {
      fs.unwatchFile(DEFAULT_SNAPSHOT);
    }
    io.close();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function bundlePathFromHtml(html) {
  const match = html.match(/<script type="module"[^>]*src="([^"]+)"/i);
  return match ? match[1] : null;
}

test('served dashboard shell and active app bundle reference the current local API contract', async () => {
  const baseUrl = await listen();
  try {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);

    const html = await response.text();
    assert.equal(html.includes(RETIRED_SIGNAL_ENDPOINT), false);
    assert.equal(html.includes(RETIRED_STATUS_COPY), false);
    assert.match(html, /Sovereign Web Dashboard/i);
    const bundlePath = bundlePathFromHtml(html);
    assert.ok(bundlePath, 'Expected served HTML to include a module script');

    const appBundleResponse = await fetch(`${baseUrl}${bundlePath}`);
    assert.equal(appBundleResponse.status, 200);
    assert.match(appBundleResponse.headers.get('content-type'), /javascript/);

    const appBundle = await appBundleResponse.text();
    for (const endpoint of REQUIRED_UI_ENDPOINTS) {
      assert.ok(appBundle.includes(endpoint), `Expected active app bundle to reference ${endpoint}`);
    }
    assert.equal(appBundle.includes(RETIRED_SIGNAL_ENDPOINT), false);

    console.log(JSON.stringify({
      type: 'served_dashboard_contract',
      endpoint_count: REQUIRED_UI_ENDPOINTS.length,
      stale_hybrid_signal_endpoint: false,
      html_bytes: html.length,
      app_bundle_bytes: appBundle.length,
    }, null, 2));
  } finally {
    await close();
  }
});
