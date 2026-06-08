const { buildBrokerReport, getEnvValue } = require('../brokers/common');

const spec = {
  broker: 'supabase',
  displayName: 'Supabase',
  defaultHost: null,
  fields: [
    { key: 'SOVEREIGN_SUPABASE_URL', label: 'Supabase URL', required: true, secret: false },
    { key: 'SOVEREIGN_SUPABASE_PUBLISHABLE_KEY', label: 'Publishable Key', required: false, secret: true },
    { key: 'SOVEREIGN_SUPABASE_SECRET_KEY', label: 'Secret Key', required: false, secret: true },
  ],
  notes: ['Supabase values are local configuration inputs; never print the raw keys back to the terminal.'],
};

function buildSupabaseReport(env = process.env, options = {}) {
  return buildBrokerReport(spec, env, options);
}

function resolveSupabaseSettings(env = process.env, options = {}) {
  return {
    url: options.url
      || getEnvValue(env, ['SOVEREIGN_SUPABASE_URL', 'SUPABASE_URL']),
    publishableKey: options.publishableKey
      || getEnvValue(env, ['SOVEREIGN_SUPABASE_PUBLISHABLE_KEY']),
    secretKey: options.secretKey
      || getEnvValue(env, ['SOVEREIGN_SUPABASE_SECRET_KEY', 'SOVEREIGN_SUPABASE_SERVICE_ROLE_KEY']),
  };
}

module.exports = { spec, buildSupabaseReport, resolveSupabaseSettings };
