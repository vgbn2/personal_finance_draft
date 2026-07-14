const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const DOCKER_COMPOSE = path.join(REPO_ROOT, 'infra', 'docker', 'docker-compose.yml');
const K8S_DEPLOYMENT = path.join(REPO_ROOT, 'infra', 'deployment', 'kubernetes', 'deployment.yaml');
const K8S_CONFIGMAP = path.join(REPO_ROOT, 'infra', 'deployment', 'kubernetes', 'configmap.yaml');
const DEPLOYMENT_DOC = path.join(REPO_ROOT, 'docs', 'operational', 'guides', 'DEPLOYMENT.md');
const TERRAFORM_MAIN = path.join(REPO_ROOT, 'infra', 'deployment', 'terraform', 'main.tf');
const HEROKU_PROCFILE = path.join(REPO_ROOT, 'infra', 'deployment', 'heroku', 'Procfile');
const HEROKU_APP = path.join(REPO_ROOT, 'infra', 'deployment', 'heroku', 'app.json');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function composeService(compose, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = compose.match(new RegExp(`^  ${escaped}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, 'm'));
  assert.ok(match, `missing Compose service: ${name}`);
  return match[0];
}

test('deployment manifests and docs agree on the active web bridge contract', () => {
  const compose = read(DOCKER_COMPOSE);
  const deployment = read(K8S_DEPLOYMENT);
  const configmap = read(K8S_CONFIGMAP);
  const docs = read(DEPLOYMENT_DOC);
  const terraform = read(TERRAFORM_MAIN);
  const herokuProcfile = read(HEROKU_PROCFILE);
  const herokuApp = read(HEROKU_APP);
  const web = composeService(compose, 'web');
  const bot = composeService(compose, 'bot');
  const portfolioMonitor = composeService(compose, 'portfolio-monitor');
  const hostHealth = composeService(compose, 'host-health');
  const hostBackup = composeService(compose, 'host-backup');
  const polymarketResearch = composeService(compose, 'polymarket-research');

  assert.match(compose, /SOVEREIGN_WEB_PORT:\s*8787/);
  assert.match(compose, /SOVEREIGN_CACHE_TTL_MS:\s*30000/);
  assert.match(compose, /SOVEREIGN_CACHE_MAX_ENTRIES:\s*100/);
  assert.match(web, /\$\{SOVEREIGN_WEB_BIND:-127\.0\.0\.1\}:8787:8787/);
  assert.match(portfolioMonitor, /profiles:\s*\[\s*monitoring\s*\]/);
  assert.match(portfolioMonitor, /PORTFOLIO_MONITOR_INTERVAL_SECS:-60/);
  assert.match(portfolioMonitor, /portfolio-monitor[^\n]+\|\| exit \$\$\?/);
  assert.match(portfolioMonitor, /healthcheck:\s*\n\s+disable:\s*true/);
  assert.doesNotMatch(bot, /PORTFOLIO_MONITOR_/);

  assert.match(hostHealth, /HOST_HEALTH_INTERVAL_SECS:-300/);
  assert.match(hostHealth, /host_health\.js[^\n]+\|\| exit \$\$\?/);
  assert.match(hostHealth, /healthcheck:\s*\n\s+disable:\s*true/);
  assert.doesNotMatch(hostHealth, /HOST_BACKUP_|RUNNER_MAX_AGE|runner-max-age/);

  assert.match(hostBackup, /HOST_BACKUP_INTERVAL_SECS:-86400/);
  assert.match(hostBackup, /HOST_BACKUP_RETENTION_DAYS:-30/);
  assert.match(hostBackup, /--destination "\$\$\{HOST_BACKUP_ROOT:-\/app\/storage\/backups\/host\}"/);
  assert.match(hostBackup, /STATUS=\$\$\?/);
  assert.match(hostBackup, /"\$\$STATUS" -eq 3/);
  assert.match(hostBackup, /sleep \$\$INTERVAL\s+exit \$\$STATUS/);
  assert.match(hostBackup, /healthcheck:\s*\n\s+disable:\s*true/);

  assert.match(polymarketResearch, /profiles:\s*\[\s*research\s*\]/);
  assert.match(polymarketResearch, /build:\s*\n\s+context:\s*\.\.\/\.\./);
  assert.match(polymarketResearch, /POLYMARKET_RESEARCH_SCOPE_FILE/);
  assert.match(polymarketResearch, /polymarket history schedule[^\n]+\|\| exit \$\$\?/);
  assert.match(polymarketResearch, /healthcheck:\s*\n\s+disable:\s*true/);
  assert.doesNotMatch(polymarketResearch, /^\s{6}POLYMARKET_RESEARCH_SCOPE_FILE:/m);

  assert.match(deployment, /containerPort:\s*8787/);
  assert.match(deployment, /backend\/api\/app\.js/);
  assert.doesNotMatch(deployment, /web\/app\.js/);
  assert.match(deployment, /name:\s*sovereign-supabase/);
  assert.match(deployment, /key:\s*url/);
  assert.match(deployment, /key:\s*publishable_key/);
  assert.match(deployment, /key:\s*secret_key/);

  assert.match(configmap, /SOVEREIGN_CACHE_TTL_MS:\s*"30000"/);
  assert.match(configmap, /SOVEREIGN_CACHE_MAX_ENTRIES:\s*"100"/);
  assert.match(terraform, /backend\/api\/app\.js/);
  assert.doesNotMatch(terraform, /web\/app\.js/);
  assert.match(herokuProcfile, /backend\/api\/app\.js/);
  assert.doesNotMatch(herokuProcfile, /web\/app\.js/);
  assert.match(herokuApp, /backend\/cli\/sovereign_cli\.js/);

  assert.match(docs, /Supabase-backed database\/auth available/i);
  assert.match(docs, /sovereign-supabase/i);
  assert.match(docs, /Optional Always-On Profiles/i);
  assert.match(docs, /portfolio-monitor/i);
  assert.match(docs, /polymarket-research/i);
  assert.match(docs, /persisted `polymarket` feature flag/i);
  assert.match(docs, /binds the host port to `127\.0\.0\.1` by default/i);
  assert.doesNotMatch(docs, /no database/i);
  assert.doesNotMatch(docs, /no secrets/i);

  console.log(JSON.stringify({
    type: 'deployment_manifest_contract',
    compose_port: 8787,
    cache_ttl_ms: 30000,
    supabase_secret_ref: true,
    docs_aligned: true,
  }, null, 2));
});
