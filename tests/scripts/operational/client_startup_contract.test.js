'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLIENT_ROOT = path.join(REPO_ROOT, 'infra', 'client');
const LINUX_INSTALLER = path.join(CLIENT_ROOT, 'linux', 'install.sh');
const LINUX_CONNECTOR = path.join(CLIENT_ROOT, 'linux', 'sovereign-client-connector.sh');
const WINDOWS_INSTALLER = path.join(CLIENT_ROOT, 'windows', 'Install-SovereignClient.ps1');
const WINDOWS_CONNECTOR = path.join(CLIENT_ROOT, 'windows', 'SovereignClientConnector.ps1');

function source(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('client supervisors maintain only a read-only SSH tunnel and API health probe', () => {
  const combined = [
    source(LINUX_CONNECTOR),
    source(WINDOWS_CONNECTOR),
  ].join('\n');

  assert.match(combined, /api\/client\/status/);
  assert.match(combined, /ExitOnForwardFailure=yes/);
  assert.match(combined, /ConnectTimeout=10/);
  assert.match(combined, /ServerAliveInterval=30/);
  assert.match(combined, /host_unavailable/);
  assert.match(combined, /reconnecting/);
  assert.match(combined, /AUTO_OPEN/);
  assert.doesNotMatch(combined, /\b(?:backfill|ingest|bot cycle|bot sell|kill-switch|shutdown|reboot|wakeonlan|docker compose)\b/i);
  assert.doesNotMatch(combined, /SOVEREIGN_API_TOKEN/);
});

test('startup installers default CLI auto-open off and keep token text out of arguments', () => {
  const linux = source(LINUX_INSTALLER);
  const windows = source(WINDOWS_INSTALLER);

  assert.match(linux, /auto_open="false"/);
  assert.match(windows, /\[switch\]\$AutoOpen/);
  assert.match(linux, /--token-file PATH/);
  assert.match(windows, /token text is not accepted/);
  assert.match(linux, /rm -f "\$\{config_file\}" "\$\{client_json_file\}" "\$\{installed_token_file\}"/);
  assert.doesNotMatch(linux, /rm -rf "\$\{config_root\}"/);
  assert.doesNotMatch(windows, /Remove-Item -LiteralPath \$roamingRoot -Recurse/);
});

test('Linux installer can stage a disabled per-user connector in an isolated home', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-client-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const configHome = path.join(root, 'config');
  const dataHome = path.join(root, 'data');
  const stateHome = path.join(root, 'state');
  fs.mkdirSync(home, { recursive: true });
  const identity = path.join(root, 'id_ed25519');
  const token = path.join(root, 'client.token.source');
  fs.writeFileSync(identity, 'test identity fixture\n', { mode: 0o600 });
  fs.writeFileSync(token, `${'a'.repeat(64)}\n`, { mode: 0o600 });

  const result = childProcess.spawnSync('bash', [
    LINUX_INSTALLER,
    'install',
    '--host', 'central.example',
    '--user', 'sovereign',
    '--identity-file', identity,
    '--token-file', token,
    '--no-start',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: dataHome,
      XDG_STATE_HOME: stateHome,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not started \(--no-start\)/);
  assert.match(result.stdout, /Auto-open CLI: false/);

  const clientConfig = JSON.parse(fs.readFileSync(
    path.join(configHome, 'sovereign', 'client.json'),
    'utf8',
  ));
  assert.deepEqual(clientConfig, {
    base_url: 'http://127.0.0.1:8788',
    refresh_seconds: 10,
  });
  const installedToken = path.join(configHome, 'sovereign', 'client.token');
  assert.equal(fs.statSync(installedToken).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(installedToken, 'utf8').trim(), 'a'.repeat(64));

  const connectorConfig = source(path.join(configHome, 'sovereign', 'connector.conf'));
  assert.match(connectorConfig, /^AUTO_OPEN=false$/m);
  assert.match(connectorConfig, /^LOCAL_BIND=127\.0\.0\.1$/m);
  assert.doesNotMatch(connectorConfig, /a{64}/);
});

test('Linux and PowerShell startup scripts parse without executing services', (t) => {
  for (const script of [LINUX_INSTALLER, LINUX_CONNECTOR]) {
    const parsed = childProcess.spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
  }

  const pwsh = process.platform === 'win32'
    ? 'powershell.exe'
    : (fs.existsSync('/snap/bin/pwsh') ? '/snap/bin/pwsh' : null);
  if (!pwsh) {
    t.diagnostic('PowerShell parser unavailable; static contracts still ran');
    return;
  }
  for (const script of [WINDOWS_INSTALLER, WINDOWS_CONNECTOR]) {
    const parsed = childProcess.spawnSync(pwsh, [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${script.replace(/'/g, "''")}', [ref]$null, [ref]$errors) > $null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }`,
    ], { encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
  }
});
