const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const DOCKER_COMPOSE = path.join(REPO_ROOT, 'infra', 'docker', 'docker-compose.yml');
const K8S_DEPLOYMENT = path.join(REPO_ROOT, 'infra', 'deployment', 'kubernetes', 'deployment.yaml');
const K8S_CONFIGMAP = path.join(REPO_ROOT, 'infra', 'deployment', 'kubernetes', 'configmap.yaml');
const DEPLOYMENT_DOC = path.join(REPO_ROOT, 'docs', 'operational', 'guides', 'DEPLOYMENT.md');
const DOCKER_DEPLOY_DOC = path.join(REPO_ROOT, 'infra', 'docker', 'DEPLOY.md');
const CENTRAL_ENV_EXAMPLE = path.join(REPO_ROOT, '.env.central.example');
const CENTRAL_PREFLIGHT = path.join(REPO_ROOT, 'backend', 'scripts', 'ops', 'central_host_preflight.js');
const CENTRAL_UPDATER = path.join(REPO_ROOT, 'infra', 'docker', 'update-central-host.sh');
const CENTRAL_UPDATER_INSTALLER = path.join(REPO_ROOT, 'infra', 'systemd', 'install-central-updater.sh');
const CENTRAL_UPDATER_SERVICE = path.join(REPO_ROOT, 'infra', 'systemd', 'sovereign-central-update.service.in');
const CENTRAL_UPDATER_TIMER = path.join(REPO_ROOT, 'infra', 'systemd', 'sovereign-central-update.timer');
const DASHBOARD_ENV_EXAMPLE = path.join(REPO_ROOT, 'Frontend', 'dashboard', '.env.example');
const BACKEND_API_PACKAGE = path.join(REPO_ROOT, 'backend', 'api', 'package.json');
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
  const dockerDocs = read(DOCKER_DEPLOY_DOC);
  const centralEnv = read(CENTRAL_ENV_EXAMPLE);
  const centralPreflight = read(CENTRAL_PREFLIGHT);
  const centralUpdater = read(CENTRAL_UPDATER);
  const centralUpdaterInstaller = read(CENTRAL_UPDATER_INSTALLER);
  const centralUpdaterService = read(CENTRAL_UPDATER_SERVICE);
  const centralUpdaterTimer = read(CENTRAL_UPDATER_TIMER);
  const dashboardEnv = read(DASHBOARD_ENV_EXAMPLE);
  const backendApiPackage = JSON.parse(read(BACKEND_API_PACKAGE));
  const terraform = read(TERRAFORM_MAIN);
  const herokuProcfile = read(HEROKU_PROCFILE);
  const herokuApp = read(HEROKU_APP);
  const web = composeService(compose, 'web');
  const bot = composeService(compose, 'bot');
  const backfill = composeService(compose, 'backfill');
  const portfolioMonitor = composeService(compose, 'portfolio-monitor');
  const hostHealth = composeService(compose, 'host-health');
  const hostBackup = composeService(compose, 'host-backup');
  const polymarketResearch = composeService(compose, 'polymarket-research');

  assert.match(compose, /SOVEREIGN_WEB_PORT:\s*8787/);
  assert.match(compose, /SOVEREIGN_CACHE_TTL_MS:\s*30000/);
  assert.match(compose, /SOVEREIGN_CACHE_MAX_ENTRIES:\s*100/);
  assert.match(compose, /x-central-runtime:\s*&central-runtime/);
  assert.match(compose, /SOVEREIGN_RUNTIME_MODE:\s*cloud-compute/);
  assert.match(compose, /LIVE_TRADING:\s*"false"/);
  assert.match(compose, /SOVEREIGN_EXECUTION_AUTHORIZED:\s*"false"/);
  assert.doesNotMatch(compose, /SOVEREIGN_CENTRAL_ENV_FILE|central-env-files/);
  assert.match(web, /\$\{SOVEREIGN_WEB_BIND:-127\.0\.0\.1\}:8787:8787/);
  assert.match(web, /\.env\.services\/web\.env/);
  assert.match(web, /<<:\s*\*central-runtime/);
  assert.match(bot, /profiles:\s*\[\s*paper\s*\]/);
  assert.match(backfill, /profiles:\s*\[\s*writer\s*\]/);
  assert.match(bot, /environment:\s*\*central-runtime/);
  assert.match(backfill, /\.env\.services\/backfill\.env/);
  assert.match(backfill, /<<:\s*\*central-runtime/);
  assert.match(web, /\.\.\/\.\.\/storage:\/app\/storage/);
  assert.match(backfill, /\.\.\/\.\.\/storage:\/app\/storage/);
  assert.match(portfolioMonitor, /profiles:\s*\[\s*monitoring\s*\]/);
  assert.match(portfolioMonitor, /PORTFOLIO_MONITOR_INTERVAL_SECS:-60/);
  assert.match(portfolioMonitor, /portfolio-monitor/);
  assert.doesNotMatch(portfolioMonitor, /--once|while true|\|\| exit/);
  assert.match(portfolioMonitor, /healthcheck:\s*\n\s+disable:\s*true/);
  assert.doesNotMatch(bot, /PORTFOLIO_MONITOR_/);

  assert.match(hostHealth, /HOST_HEALTH_INTERVAL_SECS:-300/);
  assert.match(hostHealth, /host_health\.js/);
  assert.match(hostHealth, /--watch/);
  assert.match(hostHealth, /--no-runner/);
  assert.doesNotMatch(hostHealth, /while true|\|\| exit/);
  assert.match(hostHealth, /healthcheck:\s*\n\s+disable:\s*true/);
  assert.doesNotMatch(hostHealth, /HOST_BACKUP_|RUNNER_MAX_AGE|runner-max-age/);

  assert.match(hostBackup, /HOST_BACKUP_INTERVAL_SECS:-86400/);
  assert.match(hostBackup, /HOST_BACKUP_RETENTION_DAYS:-30/);
  assert.match(hostBackup, /--destination/);
  assert.match(hostBackup, /\$\{HOST_BACKUP_ROOT:-\/app\/storage\/backups\/host\}/);
  assert.match(hostBackup, /--watch/);
  assert.doesNotMatch(hostBackup, /while true|STATUS=\$\$|\|\| exit/);
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
  assert.match(docs, /update-central-host\.sh/i);
  assert.match(docs, /single-writer/i);
  assert.match(docs, /\.env\.central/i);
  assert.match(docs, /SSH tunnel|private VPN/i);
  assert.doesNotMatch(docs, /no database/i);
  assert.doesNotMatch(docs, /no secrets/i);

  assert.match(dockerDocs, /update-central-host\.sh/i);
  assert.match(dockerDocs, /private/i);
  assert.match(dockerDocs, /paper/i);
  assert.match(dockerDocs, /Public reverse-proxy exposure is not approved/i);
  assert.match(dockerDocs, /x86_64|amd64/i);
  assert.match(dockerDocs, /16GB is recommended/i);

  assert.match(centralEnv, /^SOVEREIGN_RUNTIME_MODE=cloud-compute$/m);
  assert.match(centralEnv, /^LIVE_TRADING=false$/m);
  assert.match(centralEnv, /^SOVEREIGN_EXECUTION_AUTHORIZED=false$/m);
  assert.doesNotMatch(centralEnv, /^SOVEREIGN_TRADE_PIN=/m);
  assert.doesNotMatch(centralEnv, /^POLYMARKET_PRIVATE_KEY=/m);

  assert.match(centralPreflight, /EXECUTION_ONLY_KEYS/);
  assert.match(centralPreflight, /docker_compose/);
  assert.match(centralPreflight, /git_clean/);
  assert.match(centralPreflight, /private_bind/);
  assert.match(centralPreflight, /architectureCheck/);
  assert.match(centralPreflight, /memoryCheck/);

  assert.match(dashboardEnv, /^VITE_API_URL=/m);
  assert.match(dashboardEnv, /^VITE_SUPABASE_URL=/m);
  assert.match(dashboardEnv, /^VITE_SUPABASE_ANON_KEY=/m);
  assert.doesNotMatch(dashboardEnv, /GEMINI_API_KEY|APP_URL/);
  assert.equal(backendApiPackage.dependencies['@supabase/supabase-js'], '2.106.2');
  assert.ok(backendApiPackage.dependencies['socket.io']);

  assert.match(centralUpdater, /flock -n 9/);
  assert.match(centralUpdater, /git status --porcelain --untracked-files=all/);
  assert.match(centralUpdater, /git branch --show-current/);
  assert.match(centralUpdater, /git merge --ff-only/);
  assert.match(centralUpdater, /HEAD does not exactly match/);
  assert.match(centralUpdater, /central_host_preflight\.js/);
  assert.match(centralUpdater, /SOVEREIGN_NODE_BIN/);
  assert.match(centralUpdater, /docker compose --env-file/);
  assert.match(centralUpdater, /deployed_head_file=/);
  assert.match(centralUpdater, /SOVEREIGN_SOURCE_REVISION="\$\(git rev-parse HEAD\)"/);
  assert.match(centralUpdater, /sovereign-central-deployment\.json/);
  assert.match(centralUpdater, /image_is_qualified/);
  assert.match(centralUpdater, /mv "\$\{deployed_head_tmp\}" "\$\{deployed_head_file\}"/);
  assert.match(centralUpdater, /capture_verified_services/);
  assert.match(centralUpdater, /SOVEREIGN_DEPLOY_FORCE/);
  assert.match(centralUpdater, /up -d --no-build --force-recreate web backfill/);
  assert.match(centralUpdater, /deployment_profile.*central-host/);
  assert.match(centralUpdater, /--profile writer/);
  assert.match(centralUpdater, /service_is_active_in bot/);
  assert.match(centralUpdater, /LIVE_TRADING=false/);
  assert.match(centralUpdater, /polymarket-research.*maintenance window/);
  assert.match(centralUpdater, /docker inspect --format/);
  assert.match(centralUpdater, /State\.Health.*healthy/);
  assert.match(centralUpdater, /rollback_cutover/);
  assert.doesNotMatch(centralUpdater, /127\.0\.0\.1:8787\/health/);

  assert.match(centralUpdaterInstaller, /systemctl enable --now sovereign-central-update\.timer/);
  assert.match(centralUpdaterInstaller, /sovereign-central-update\.service\.in/);
  assert.match(centralUpdaterInstaller, /Node\.js 20 or newer is required/);
  assert.match(centralUpdaterInstaller, /docker compose version/);
  assert.match(centralUpdaterInstaller, /absolute-node-path/);
  assert.match(centralUpdaterInstaller, /getent group docker/);
  assert.match(centralUpdaterService, /^User=@DEPLOY_USER@$/m);
  assert.match(centralUpdaterService, /^SupplementaryGroups=docker$/m);
  assert.match(centralUpdaterService, /^Environment=SOVEREIGN_NODE_BIN=@NODE_BIN@$/m);
  assert.match(centralUpdaterService, /^WorkingDirectory=@REPO_ROOT@$/m);
  assert.match(centralUpdaterService, /update-central-host\.sh/);
  assert.match(centralUpdaterTimer, /^OnUnitInactiveSec=5min$/m);
  assert.match(centralUpdaterTimer, /^Persistent=true$/m);

  console.log(JSON.stringify({
    type: 'deployment_manifest_contract',
    compose_port: 8787,
    cache_ttl_ms: 30000,
    supabase_secret_ref: true,
    central_runtime_fail_closed: true,
    central_update_contract: true,
    docs_aligned: true,
  }, null, 2));
});
