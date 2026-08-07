const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');

const {
  findBackendBinary,
  findNodeCli,
  REPO_ROOT,
  BACKEND_CANDIDATES,
  CLI_CANDIDATES,
} = require('../../../../shared/lib/runtime/paths');

const MEMORY_CACHE = new Map();
const MEMORY_CACHE_TTL_MS = 5000; // 5 seconds cache for dashboard snappiness
const SCORECARD_CACHE = new Map();
const SCORECARD_CACHE_TTL_MS = 30000;
const SCORECARD_CACHE_MAX_ENTRIES = 32;

function withCache(key, producer) {
  const now = Date.now();
  if (MEMORY_CACHE.has(key)) {
    const { timestamp, payload } = MEMORY_CACHE.get(key);
    if (now - timestamp < MEMORY_CACHE_TTL_MS) {
      return { ...payload, from_memory_cache: true };
    }
  }
  const payload = producer();
  MEMORY_CACHE.set(key, { timestamp: now, payload });
  return payload;
}

async function withScorecardCache(key, producer) {
  const now = Date.now();
  const cached = SCORECARD_CACHE.get(key);
  if (cached && now - cached.timestamp < SCORECARD_CACHE_TTL_MS) {
    const payload = await cached.promise;
    return { ...payload, from_memory_cache: true };
  }

  const promise = Promise.resolve()
    .then(producer)
    .catch((error) => ({ ok: false, type: 'scorecard', error: error.message }));
  SCORECARD_CACHE.set(key, { timestamp: now, promise });

  if (SCORECARD_CACHE.size > SCORECARD_CACHE_MAX_ENTRIES) {
    const oldestKey = SCORECARD_CACHE.keys().next().value;
    SCORECARD_CACHE.delete(oldestKey);
  }

  return promise;
}

function runScorecardWorker(args) {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, '../workers/scorecard_worker.js'), {
      workerData: { args },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      worker.terminate();
      finish({ ok: false, type: 'scorecard', error_code: 'scorecard_timeout', error: 'scorecard calculation timed out' });
    }, 30000);
    timeout.unref();
    worker.once('message', finish);
    worker.once('error', (error) => finish({ ok: false, type: 'scorecard', error_code: 'scorecard_worker_error', error: error.message }));
    worker.once('exit', (code) => {
      if (code !== 0) finish({ ok: false, type: 'scorecard', error_code: 'scorecard_worker_exit', error: `scorecard worker exited with code ${code}` });
    });
  });
}

function locateBackendBinary() {
  return findBackendBinary();
}

function locateNodeCli() {
  return findNodeCli();
}

function runBackend(commandArgs) {
  const binary = locateBackendBinary();
  if (!binary) {
    return {
      available: false,
      ok: false,
      error: 'C++ backend executable not found',
      searched: BACKEND_CANDIDATES,
    };
  }

  const result = spawnSync(binary, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    return {
      available: true,
      ok: false,
      path: binary,
      error: result.error.message,
    };
  }

  try {
    return {
      available: true,
      path: binary,
      exit_code: result.status,
      ...JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      available: true,
      ok: false,
      path: binary,
      exit_code: result.status,
      error: `Unable to parse backend JSON: ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

function runNodeCli(commandArgs) {
  const cliPath = locateNodeCli();
  if (!cliPath) {
    return {
      ok: false,
      error: 'Sovereign CLI entrypoint not found',
      searched: CLI_CANDIDATES,
    };
  }

  const result = spawnSync(process.execPath, [
    cliPath,
    ...commandArgs,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
    };
  }

  try {
    return {
      exit_code: result.status,
      cli_path: path.relative(REPO_ROOT, cliPath),
      ...JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      ok: false,
      exit_code: result.status,
      error: `Unable to parse CLI JSON: ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

module.exports = {
  MEMORY_CACHE,
  MEMORY_CACHE_TTL_MS,
  SCORECARD_CACHE,
  SCORECARD_CACHE_TTL_MS,
  SCORECARD_CACHE_MAX_ENTRIES,
  withCache,
  withScorecardCache,
  runScorecardWorker,
  locateBackendBinary,
  locateNodeCli,
  runBackend,
  runNodeCli,
};
