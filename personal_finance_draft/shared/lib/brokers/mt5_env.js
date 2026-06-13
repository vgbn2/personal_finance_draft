const { buildBrokerReport, getEnvValue } = require('./common');

const spec = {
  broker: 'mt5',
  displayName: 'MetaTrader 5',
  defaultHost: null,
  fields: [
    { key: 'MT5_TERMINAL_ID', label: 'Terminal ID', required: true, secret: false },
    { key: 'MT5_METAEDITOR_PATH', label: 'MetaEditor Path', required: false, secret: false },
    { key: 'HEADWAY_MT5_QUOTES_PATH', label: 'Quotes Path', required: false, secret: false },
    { key: 'SOVEREIGN_HEADWAY_MT5_QUOTES_PATH', label: 'Sovereign Quotes Path', required: false, secret: false },
  ],
  notes: ['MT5 live execution depends on a local terminal and saved vault profile.'],
};

function buildMt5Report(env = process.env, options = {}) {
  return buildBrokerReport(spec, env, options);
}

function resolveMt5Settings(env = process.env, options = {}) {
  return {
    terminalId: options.terminalId || getEnvValue(env, ['MT5_TERMINAL_ID']),
    metaEditorPath: options.metaEditorPath || getEnvValue(env, ['MT5_METAEDITOR_PATH']),
    quotesPath: options.quotesPath || getEnvValue(env, ['HEADWAY_MT5_QUOTES_PATH', 'SOVEREIGN_HEADWAY_MT5_QUOTES_PATH']),
  };
}

module.exports = { spec, buildMt5Report, resolveMt5Settings };
