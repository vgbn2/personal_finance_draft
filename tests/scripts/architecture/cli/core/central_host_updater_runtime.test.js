'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const UPDATER = path.join(REPO_ROOT, 'infra', 'docker', 'update-central-host.sh');

function executable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function makeHarness(updated) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-central-updater-'));
  const bin = path.join(root, 'fake-bin');
  const dockerDir = path.join(root, 'infra', 'docker');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(dockerDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  fs.copyFileSync(UPDATER, path.join(dockerDir, 'update-central-host.sh'));
  fs.chmodSync(path.join(dockerDir, 'update-central-host.sh'), 0o755);
  fs.writeFileSync(path.join(dockerDir, 'docker-compose.yml'), 'services: {}\n');
  fs.writeFileSync(
    path.join(root, '.env.central'),
    'SOVEREIGN_API_TOKEN=test-only-token-with-24-chars\nSOVEREIGN_WEB_BIND=100.64.0.10\n',
    { mode: 0o600 },
  );

  const actionLog = path.join(root, 'docker-actions');
  fs.writeFileSync(actionLog, '');
  fs.writeFileSync(
    path.join(root, '.git', 'sovereign-central-deployed-head'),
    updated ? 'old-head\n' : 'same-head\n',
  );

  executable(path.join(bin, 'git'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "status" ]]; then exit 0; fi
if [[ "$1" == "branch" ]]; then echo main; exit 0; fi
if [[ "$1" == "fetch" || "$1" == "merge" ]]; then exit 0; fi
if [[ "$1" == "rev-parse" && "$2" == "origin/main" ]]; then
  [[ "\${FAKE_UPDATED}" == "true" ]] && echo new-head || echo same-head
  exit 0
fi
if [[ "$1" == "rev-parse" && "$2" == "HEAD" ]]; then
  [[ "\${FAKE_UPDATED}" == "true" ]] && echo new-head || echo same-head
  exit 0
fi
exit 2
`);
  executable(path.join(bin, 'docker'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${FAKE_ACTION_LOG}"
operation=""
if [[ "$1" == "inspect" ]]; then echo healthy; exit 0; fi
for argument in "$@"; do
  case "$argument" in config|ps|build|up) operation="$argument";; esac
done
if [[ "$operation" == "ps" ]]; then
  if [[ "$*" == *" -q web"* ]]; then echo web-container-id;
  elif [[ "\${!#}" == "backfill" ]]; then echo backfill;
  else printf 'web\\nbackfill\\n'; fi
fi
if [[ "$operation" == "build" && "\${FAKE_BUILD_FAIL}" == "true" ]]; then exit 42; fi
exit 0
`);
  executable(path.join(bin, 'node'), `#!/usr/bin/env bash
if [[ "\${1:-}" == "-e" ]]; then
  printf '%s' "\${FAKE_DEPLOYMENT_PROFILE:-central-host}"
fi
exit 0
`);
  executable(path.join(bin, 'curl'), '#!/usr/bin/env bash\nexit 99\n');

  return {
    root,
    run(buildFails = false, deploymentProfile = 'central-host') {
      fs.writeFileSync(actionLog, '');
      const result = spawnSync(path.join(dockerDir, 'update-central-host.sh'), [], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_ACTION_LOG: actionLog,
          FAKE_BUILD_FAIL: String(buildFails),
          FAKE_UPDATED: String(updated),
          FAKE_DEPLOYMENT_PROFILE: deploymentProfile,
          SOVEREIGN_CENTRAL_ENV_FILE: path.join(root, '.env.central'),
        },
      });
      return {
        result,
        actions: fs.readFileSync(actionLog, 'utf8').split(/\r?\n/).filter(Boolean),
      };
    },
  };
}

test('central updater no-ops at the last successful commit with a private VPN bind', (t) => {
  const harness = makeHarness(false);
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already current and deployment-ready/);
  assert.ok(actions.some((line) => line.includes(' config --quiet')));
  assert.ok(actions.some((line) => line.includes(' ps --status running --services')));
  assert.ok(!actions.some((line) => line.includes(' build web')));
  assert.ok(!actions.some((line) => line.includes(' up -d')));
});

test('central updater rebuilds and recreates web plus the sole writer after a fast-forward', (t) => {
  const harness = makeHarness(true);
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /central host update complete/);
  assert.ok(actions.some((line) => line.includes(' build web')));
  assert.ok(actions.some((line) => line.includes(' up -d --force-recreate web backfill')));
  assert.ok(!actions.some((line) => /\bbot\b/.test(line)));
  assert.equal(
    fs.readFileSync(path.join(harness.root, '.git', 'sovereign-central-deployed-head'), 'utf8').trim(),
    'new-head',
  );
});

test('central updater preserves the old success marker after build failure and retries next run', (t) => {
  const harness = makeHarness(true);
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const marker = path.join(harness.root, '.git', 'sovereign-central-deployed-head');

  const failed = harness.run(true);
  assert.equal(failed.result.status, 42);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'old-head');
  assert.ok(failed.actions.some((line) => line.includes(' build web')));
  assert.ok(!failed.actions.some((line) => line.includes(' up -d')));

  const retried = harness.run(false);
  assert.equal(retried.result.status, 0, retried.result.stderr);
  assert.ok(retried.actions.some((line) => line.includes(' build web')));
  assert.ok(retried.actions.some((line) => line.includes(' up -d --force-recreate web backfill')));
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'new-head');
});

test('central updater refuses the all-in-one rehearsal profile before starting services', (t) => {
  const harness = makeHarness(true);
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));

  const { result, actions } = harness.run(false, 'all-in-one');

  assert.equal(result.status, 78);
  assert.match(result.stderr, /refusing central updater for deployment profile all-in-one/);
  assert.equal(actions.length, 0);
});
