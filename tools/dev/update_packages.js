'use strict';

const { spawnSync } = require('node:child_process');

const env = { ...process.env };
// npm run exports npmrc policy as an env override, which npm rejects for local installs.
// Remove that duplicate so npm reads the original project/user/global npmrc policy.
for (const key of Object.keys(env)) {
  if (/^npm_config_allow[_-]scripts$/i.test(key)) delete env[key];
}
const result = spawnSync(process.execPath, [
  process.env.npm_execpath, 'update', '--workspaces', '--include-workspace-root', ...process.argv.slice(2),
], { env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
