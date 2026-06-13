/**
 * LEGACY ADAPTER BRIDGE
 *
 * Canonical live fetch/backfill logic now lives in shared/lib/providers/
 * and shared/lib/backfill.js.
 *
 * This module remains only as a compatibility shim for older callers that
 * still import the historical path.
 */

const providers = require('../providers');
const backfill = require('../data/backfill');

function fetchText(url, accept = 'text/plain') {
  return providers.cachedFetch(url, {
    headers: {
      accept,
      'user-agent': 'sovereign-market-ingestor/2.0',
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Request to ${url} failed: ${response.status}`);
    }
    return response.text();
  });
}

module.exports = {
  ...providers,
  fetchText,
  fetchPaginated: backfill.fetchPaginated,
  fetchParallelBackfill: backfill.fetchParallelBackfill,
  BARS_PER_DAY: backfill.BARS_PER_DAY,
  windowText: backfill.windowText,
};
