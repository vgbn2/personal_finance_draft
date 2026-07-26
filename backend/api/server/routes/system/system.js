const { systemStatus } = require('../../services/cli_executor');
const { cacheStats, isCacheEnabled } = require('../../services/ttl_cache');
const { isConfigured } = require('../../services/supabase_client');
const {
  resolveDeploymentProfile,
} = require('../../../../../shared/lib/settings/deployment_profile');

module.exports = {
  path: '/api/system/status',
  status: () => 200,
  handle: () => {
    const payload = systemStatus();
    const deploymentProfile = resolveDeploymentProfile();
    return {
      ...payload,
      schema_version: 2,
      components: {
        ...payload.components,
        cache: {
          ...payload.components.cache,
          enabled: isCacheEnabled(),
          ttl_ms: cacheStats().ttl_ms,
        },
        database: {
          ok: isConfigured(),
          configured: isConfigured(),
          provider: 'supabase',
        },
        auth: {
          ok: isConfigured(),
          configured: isConfigured(),
          provider: 'supabase',
          access_policy: 'capability-rbac-v1',
        },
        deployment: deploymentProfile,
      },
      degraded: Boolean(payload.degraded || !isConfigured() || !deploymentProfile.ok),
    };
  },
};
