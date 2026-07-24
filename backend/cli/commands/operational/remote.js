'use strict';

const { hasFlag, optionValue, printPayload } = require('../../lib/utils.js');
const { loadRemoteConfig, requestRemote } = require('../../lib/remote_client.js');

const ENDPOINTS = {
  status: '/api/client/status',
  data: '/api/data/summary',
  universe: '/api/universe',
  signal: '/api/signal',
  scorecard: '/api/scorecard',
  bot: '/api/bot/status',
};

function endpointFor(args) {
  const view = String(args[0] || 'status').toLowerCase();
  if (view === 'bias') {
    const symbol = String(args[1] || optionValue(args, '--symbol', 'BTCUSDT')).toUpperCase();
    return { view, endpoint: `/api/bias?symbol=${encodeURIComponent(symbol)}` };
  }
  return { view, endpoint: ENDPOINTS[view] || null };
}

function renderRemoteResult(view, result) {
  const payload = result.payload || {};
  console.log(`Remote ${view}: ${result.state}`);
  if (result.error) console.log(`error: ${result.error}`);
  if (payload.generated_at) console.log(`generated_at: ${payload.generated_at}`);
  if (payload.data_as_of) console.log(`data_as_of: ${payload.data_as_of}`);
  if (payload.aggregate) {
    console.log(`bias: ${payload.aggregate.bias}`);
    console.log(`confidence: ${payload.aggregate.confidence}`);
  }
  if (payload.runtime_policy) {
    const policy = payload.runtime_policy.value || payload.runtime_policy;
    console.log(`runtime_profile: ${policy.requested_profile || 'unavailable'}`);
    console.log(`execution_allowed: ${policy.can_execute === true}`);
  }
  if (payload.data) {
    console.log(`data_available: ${payload.data.available === true}`);
    console.log(`data_stale: ${payload.data.stale === true}`);
  }
  if (payload.poller) {
    console.log(`poller: ${payload.poller.status || 'unavailable'}`);
  }
  if (payload.bot) {
    console.log(`bot_observation_only: ${payload.bot.observation_only === true}`);
  }
  if (!payload.aggregate && !payload.runtime_policy && !payload.data && result.ok) {
    printPayload(payload, []);
  }
}

async function requestView(args, options = {}) {
  const selected = endpointFor(args);
  if (!selected.endpoint) {
    return {
      view: selected.view,
      result: {
        ok: false,
        state: 'invalid_view',
        status: 0,
        error: `unknown remote view: ${selected.view}`,
      },
    };
  }

  const config = options.config || loadRemoteConfig({
    baseUrl: optionValue(args, '--host', null),
    refreshSeconds: optionValue(args, '--interval', null),
  });
  const result = await requestRemote(selected.endpoint, {
    ...options,
    config,
  });
  return { view: selected.view, result, config };
}

async function commandRemote(args = [], options = {}) {
  const json = hasFlag(args, '--json');
  const watch = hasFlag(args, '--watch');
  let previousState = null;
  const once = async () => {
    const response = await requestView(args, options);
    if (
      watch
      && response.result.state === 'host_unavailable'
      && ['connected', 'stale', 'reconnecting'].includes(previousState)
    ) {
      response.result.state = 'reconnecting';
    }
    previousState = response.result.state;
    if (json) {
      printPayload({
        ok: response.result.ok,
        state: response.result.state,
        status: response.result.status,
        ...(response.result.payload ? { data: response.result.payload } : {}),
        ...(response.result.error ? { error: response.result.error } : {}),
      }, ['--json']);
    } else {
      renderRemoteResult(response.view, response.result);
    }
    return response;
  };

  const first = await once();
  if (!watch) return first.result.ok ? 0 : 1;

  const intervalMs = first.config.refreshSeconds * 1000;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!json && process.stdout.isTTY) console.clear();
    await once();
  }
}

module.exports = {
  ENDPOINTS,
  commandRemote,
  endpointFor,
  renderRemoteResult,
  requestView,
};
