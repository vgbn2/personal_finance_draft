const { parentPort, workerData } = require('node:worker_threads');

const { buildScorecard } = require('../../../cli/commands/research/scorecard');

buildScorecard(workerData.args)
  .then((payload) => parentPort.postMessage(payload))
  .catch((error) => parentPort.postMessage({
    ok: false,
    type: 'scorecard',
    error_code: 'scorecard_calculation_failed',
    error: error.message,
  }));
