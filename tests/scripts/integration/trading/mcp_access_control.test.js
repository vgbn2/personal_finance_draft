'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { CAPABILITIES } = require('../../../../shared/lib/auth/access_policy');
const { createServicePrincipal } = require('../../../../shared/lib/auth/service_principals');

test('compiled MCP access policy requires distinct scoped service identities', (t) => {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: path.resolve('backend/mcp_server'),
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-mcp-auth-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'services.json');
  const viewer = createServicePrincipal({
    id: 'mcp-viewer',
    capabilities: [CAPABILITIES.STATUS_READ, CAPABILITIES.DATA_READ, CAPABILITIES.RESEARCH_READ],
  }, { path: registryPath });
  const operator = createServicePrincipal({
    id: 'mcp-operator',
    capabilities: [
      CAPABILITIES.STATUS_READ,
      CAPABILITIES.DATA_READ,
      CAPABILITIES.RESEARCH_READ,
      CAPABILITIES.RESEARCH_RUN,
      CAPABILITIES.PORTFOLIO_READ,
      CAPABILITIES.PAPER_OPERATE,
      CAPABILITIES.DATA_WRITE,
    ],
  }, { path: registryPath });

  const modulePath = path.resolve('dist/mcp_server/lib/access_control.js');
  delete require.cache[modulePath];
  const policy = require(modulePath);
  const viewerEnv = {
    SOVEREIGN_SERVICE_PRINCIPALS_PATH: registryPath,
    SOVEREIGN_MCP_SERVICE_TOKEN: viewer.token,
  };
  const operatorEnv = {
    SOVEREIGN_SERVICE_PRINCIPALS_PATH: registryPath,
    SOVEREIGN_MCP_SERVICE_TOKEN: operator.token,
  };

  assert.equal(policy.authorizeMcpTool('get_system_status', {}, viewerEnv).allowed, true);
  assert.equal(policy.authorizeMcpTool('get_combined_analysis', {}, viewerEnv).allowed, true);
  assert.equal(policy.authorizeMcpTool('run_backtest', {}, viewerEnv).allowed, false);
  assert.equal(policy.authorizeMcpTool('trade', { live: false }, viewerEnv).allowed, false);
  assert.equal(policy.authorizeMcpTool('trade', { live: false }, operatorEnv).allowed, true);
  assert.equal(policy.authorizeMcpTool('trade', { live: true }, operatorEnv).allowed, false);
  assert.equal(policy.authorizeMcpTool('unknown_tool', {}, operatorEnv).reason, 'unclassified_mcp_tool');
  assert.equal(policy.authorizeMcpResource(viewerEnv).allowed, true);
  assert.equal(policy.resolveMcpPrincipal({}), null);
});
