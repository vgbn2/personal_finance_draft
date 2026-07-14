const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');

const executorPath = require.resolve('../../../../backend/api/server/services/cli_executor');

function clearExecutor() {
  delete require.cache[executorPath];
}

function withSpawnSyncResult(result, run) {
  const originalSpawnSync = childProcess.spawnSync;
  childProcess.spawnSync = () => result;
  clearExecutor();

  try {
    return run(require(executorPath));
  } finally {
    childProcess.spawnSync = originalSpawnSync;
    clearExecutor();
  }
}

test('backendIndicators treats exit-0 CLI JSON without ok as a successful API payload', () => {
  withSpawnSyncResult({
    status: 0,
    stdout: JSON.stringify({ feature_count: 120, skipped: 193 }),
    stderr: '',
  }, ({ backendIndicators }) => {
    const payload = backendIndicators({ symbol: 'BTCUSDT', timeframe: '1d' });

    assert.equal(payload.ok, true);
    assert.equal(payload.exit_code, 0);
    assert.equal(payload.feature_count, 120);
    assert.equal(payload.skipped, 193);
  });
});

test('backendIndicators still fails closed on non-zero CLI status', () => {
  withSpawnSyncResult({
    status: 1,
    stdout: JSON.stringify({ error: 'degraded input' }),
    stderr: '',
  }, ({ backendIndicators }) => {
    const payload = backendIndicators({ symbol: 'BTCUSDT', timeframe: '1d' });

    assert.equal(payload.ok, false);
    assert.equal(payload.error, 'degraded input');
    assert.equal(payload.exit_code, 1);
  });
});
