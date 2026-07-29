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

function makeHarness(options = {}) {
  const updated = options.updated !== false;
  const services = options.services || ['web', 'backfill'];
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
  const runtimeState = path.join(root, 'runtime-state');
  fs.writeFileSync(actionLog, '');
  fs.writeFileSync(runtimeState, updated ? 'old\n' : 'new\n');
  const stoppedBot = path.join(root, 'stopped-bot');
  if (services.includes('bot')) {
    const paperDir = path.join(root, 'storage', 'data', 'paper_trading');
    fs.mkdirSync(paperDir, { recursive: true });
    fs.writeFileSync(path.join(paperDir, 'events.jsonl'), '{"sequence":1}\n');
    fs.writeFileSync(path.join(paperDir, 'portfolio.v1.json'), '{"cash":100}\n');
  }
  fs.writeFileSync(
    path.join(root, '.git', 'sovereign-central-deployed-head'),
    updated ? 'old-head\n' : 'same-head\n',
  );
  if (!updated) fs.writeFileSync(path.join(root, '.git', 'sovereign-central-deployment.json'), '{}\n');

  executable(path.join(bin, 'git'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "status" ]]; then exit 0; fi
if [[ "$1" == "branch" ]]; then echo main; exit 0; fi
if [[ "$1" == "fetch" || "$1" == "merge" ]]; then exit 0; fi
if [[ "$1" == "rev-parse" && "$2" == "HEAD^{tree}" ]]; then echo tree-head; exit 0; fi
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

  executable(path.join(bin, 'node'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-e" ]]; then
  printf '%s' "\${FAKE_DEPLOYMENT_PROFILE:-central-host}"
  exit 0
fi
if [[ "\${1:-}" == *"deployment_evidence.js" && "\${2:-}" == "services" ]]; then
  printf 'web\\t-\\trequired\\n'
  printf 'bot\\tpaper\\toptional\\n'
  printf 'backfill\\twriter\\trequired\\n'
  printf 'portfolio-monitor\\tmonitoring\\toptional\\n'
  printf 'host-health\\tmonitoring\\toptional\\n'
  printf 'host-backup\\tmonitoring\\toptional\\n'
  printf 'polymarket-research\\tresearch\\toptional\\n'
  exit 0
fi
if [[ "\${1:-}" == *"deployment_evidence.js" && "\${2:-}" == "matches" ]]; then
  [[ "\${FAKE_EVIDENCE_MATCH:-false}" == "true" ]]
  exit
fi
if [[ "\${1:-}" == *"deployment_evidence.js" && "\${2:-}" == "write" ]]; then
  [[ "\${FAKE_EVIDENCE_WRITE_FAIL:-false}" == "true" ]] && exit 44
  evidence_path=""
  while [[ "$#" -gt 0 ]]; do
    [[ "$1" == "--path" ]] && evidence_path="$2"
    shift
  done
  printf '{"schema_version":1,"result":"verified"}\\n' > "\${evidence_path}"
  exit 0
fi
exit 0
`);

  executable(path.join(bin, 'docker'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${FAKE_ACTION_LOG}"
runtime_state="$(tr -d '\\n' < "\${FAKE_RUNTIME_STATE}")"
service_present() {
  [[ ",\${FAKE_SERVICES}," == *",$1,"* ]]
}
if [[ "$1" == "ps" ]]; then
  requested_service=""
  for argument in "$@"; do
    [[ "$argument" == label=com.docker.compose.service=* ]] && requested_service="\${argument##*=}"
  done
  if [[ -n "\${requested_service}" ]]; then
    service_present "\${requested_service}" && echo "\${requested_service}-id"
    exit 0
  fi
  IFS=',' read -ra services <<< "\${FAKE_SERVICES}"
  for service in "\${services[@]}"; do
    state=running
    [[ "\${service}" == "bot" && -f "\${FAKE_STOPPED_BOT}" ]] && state=exited
    printf '%s\\t%s\\t%s-id\\n' "\${service}" "\${state}" "\${service}"
  done
  exit 0
fi
if [[ "$1" == "inspect" ]]; then
  format="$3"
  target="\${!#}"
  service="\${target%-id}"
  if [[ "\${format}" == "{{.Image}}" ]]; then
    [[ "\${runtime_state}" == "new" ]] && echo sha256:new || echo sha256:old
  elif [[ "\${format}" == "{{.State.Status}}" ]]; then
    if [[ "\${FAKE_VERIFY_FAIL:-false}" == "true" && "\${runtime_state}" == "new" ]]; then echo exited; else echo running; fi
  elif [[ "\${format}" == *"State.Health"* ]]; then echo healthy
  elif [[ "\${format}" == "{{.RestartCount}}" ]]; then echo 0
  elif [[ "\${format}" == *"Config.Env"* ]]; then
    printf 'LIVE_TRADING=false\\nSOVEREIGN_EXECUTION_AUTHORIZED=false\\nSOVEREIGN_RUNTIME_MODE=cloud-compute\\n'
  else
    echo "\${service}"
  fi
  exit 0
fi
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  format="$4"
  target="\${!#}"
  if [[ "\${target}" == *":rollback-"* ]]; then
    [[ "\${format}" == "{{.Id}}" ]] && echo sha256:old
    exit 0
  fi
  if [[ ! -f "\${FAKE_BUILD_MARKER}" && "\${runtime_state}" != "new" ]]; then exit 1; fi
  if [[ "\${format}" == "{{.Id}}" ]]; then echo sha256:new
  elif [[ "\${format}" == *"opencontainers.image.revision"* ]]; then echo "\${SOVEREIGN_SOURCE_REVISION}"
  elif [[ "\${format}" == *"source-tree"* ]]; then
    [[ "\${FAKE_BAD_LABEL:-false}" == "true" ]] && echo mismatched-tree || echo "\${SOVEREIGN_SOURCE_TREE}"
  elif [[ "\${format}" == *"build-contract"* ]]; then echo 1
  fi
  exit 0
fi
if [[ "$1" == "image" && "$2" == "tag" ]]; then exit 0; fi

operation=""
for argument in "$@"; do
  case "$argument" in config|ps|build|up|stop) operation="$argument";; esac
done
if [[ "\${operation}" == "build" ]]; then
  [[ "\${FAKE_BUILD_FAIL:-false}" == "true" ]] && exit 42
  touch "\${FAKE_BUILD_MARKER}"
  exit 0
fi
if [[ "\${operation}" == "up" ]]; then
  [[ "\${FAKE_UP_FAIL:-false}" == "true" ]] && exit 43
  if [[ "\${SOVEREIGN_IMAGE_REF:-}" == *":rollback-"* ]]; then
    printf 'old\\n' > "\${FAKE_RUNTIME_STATE}"
  else
    printf 'new\\n' > "\${FAKE_RUNTIME_STATE}"
  fi
  [[ "$*" == *" bot"* ]] && rm -f "\${FAKE_STOPPED_BOT}"
  if [[ "$*" == *" bot"* && "\${FAKE_MUTATE_PAPER:-false}" == "true" ]]; then
    printf '{"sequence":2}\\n' >> "\${SOVEREIGN_PAPER_STORAGE_DIR}/events.jsonl"
  fi
  exit 0
fi
if [[ "\${operation}" == "stop" ]]; then
  [[ "$*" == *" bot"* ]] && touch "\${FAKE_STOPPED_BOT}"
  exit 0
fi
if [[ "\${operation}" == "config" || "\${operation}" == "ps" ]]; then exit 0; fi
exit 0
`);
  executable(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');

  return {
    root,
    actionLog,
    runtimeState,
    run(runOptions = {}) {
      fs.writeFileSync(actionLog, '');
      const buildMarker = path.join(root, 'built-image');
      if (fs.existsSync(buildMarker)) fs.unlinkSync(buildMarker);
      const result = spawnSync(path.join(dockerDir, 'update-central-host.sh'), [], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_ACTION_LOG: actionLog,
          FAKE_BUILD_MARKER: buildMarker,
          FAKE_BUILD_FAIL: String(runOptions.buildFails === true),
          FAKE_UP_FAIL: String(runOptions.upFails === true),
          FAKE_VERIFY_FAIL: String(runOptions.verifyFails === true),
          FAKE_MUTATE_PAPER: String(runOptions.mutatePaper === true),
          FAKE_UPDATED: String(updated),
          FAKE_SERVICES: services.join(','),
          FAKE_RUNTIME_STATE: runtimeState,
          FAKE_STOPPED_BOT: stoppedBot,
          FAKE_EVIDENCE_MATCH: String(!updated),
          FAKE_EVIDENCE_WRITE_FAIL: String(runOptions.evidenceWriteFails === true),
          FAKE_BAD_LABEL: String(runOptions.badLabel === true),
          FAKE_DEPLOYMENT_PROFILE: runOptions.deploymentProfile || 'central-host',
          SOVEREIGN_CENTRAL_ENV_FILE: path.join(root, '.env.central'),
          SOVEREIGN_COMPOSE_PROJECT_NAME: 'docker',
          SOVEREIGN_PAPER_STORAGE_DIR: path.join(root, 'storage', 'data', 'paper_trading'),
        },
      });
      return {
        result,
        actions: fs.readFileSync(actionLog, 'utf8').split(/\r?\n/).filter(Boolean),
      };
    },
  };
}

test('central updater no-ops only with matching source, image, services, and evidence', (t) => {
  const harness = makeHarness({ updated: false });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already current and deployment-ready/);
  assert.ok(!actions.some((line) => line.includes(' build web')));
  assert.ok(!actions.some((line) => line.includes(' up -d')));
});

test('central updater builds one qualified image and reconciles required services', (t) => {
  const harness = makeHarness({ updated: true });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /central host update complete/);
  assert.ok(actions.some((line) => line.includes(' build web')));
  assert.ok(actions.some((line) => line.includes('up -d --no-build --force-recreate web backfill')));
  assert.equal(
    fs.readFileSync(path.join(harness.root, '.git', 'sovereign-central-deployed-head'), 'utf8').trim(),
    'new-head',
  );
  assert.equal(fs.readFileSync(harness.runtimeState, 'utf8').trim(), 'new');
});

test('central updater recreates only optional services that were previously active', (t) => {
  const harness = makeHarness({
    updated: true,
    services: ['web', 'backfill', 'bot', 'portfolio-monitor', 'host-health'],
  });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 0, result.stderr);
  const cutover = actions.find((line) => line.includes('up -d --no-build --force-recreate web backfill'));
  assert.match(cutover, /--profile paper/);
  assert.match(cutover, /--profile monitoring/);
  assert.doesNotMatch(cutover, /\bbot\b/);
  assert.match(cutover, /\bportfolio-monitor\b/);
  assert.match(cutover, /\bhost-health\b/);
  assert.doesNotMatch(cutover, /\bhost-backup\b|\bpolymarket-research\b/);
  const botCutover = actions.find((line) => line.includes('--profile paper up -d --no-build --force-recreate bot'));
  assert.ok(botCutover, 'paper bot should be recreated only after non-bot verification');
});

test('central updater preserves the old success marker after build failure', (t) => {
  const harness = makeHarness({ updated: true });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const marker = path.join(harness.root, '.git', 'sovereign-central-deployed-head');

  const failed = harness.run({ buildFails: true });
  assert.equal(failed.result.status, 42);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'old-head');
  assert.ok(!failed.actions.some((line) => line.includes(' up -d')));
});

test('central updater rejects mismatched image provenance before stopping services', (t) => {
  const harness = makeHarness({ updated: true, services: ['web', 'backfill', 'bot'] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run({ badLabel: true });

  assert.equal(result.status, 76);
  assert.match(result.stderr, /lacks exact source provenance/);
  assert.ok(!actions.some((line) => line.includes(' stop bot')));
  assert.ok(!actions.some((line) => line.includes(' up -d')));
  assert.equal(fs.readFileSync(harness.runtimeState, 'utf8').trim(), 'old');
});

test('central updater restores the previous image after post-cutover verification failure', (t) => {
  const harness = makeHarness({ updated: true, services: ['web', 'backfill', 'bot', 'portfolio-monitor'] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const marker = path.join(harness.root, '.git', 'sovereign-central-deployed-head');

  const failed = harness.run({ verifyFails: true });
  assert.equal(failed.result.status, 1);
  assert.match(failed.result.stderr, /restoring the captured active service set/);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'old-head');
  assert.equal(fs.readFileSync(harness.runtimeState, 'utf8').trim(), 'old');
  assert.ok(failed.actions.some((line) => line.includes('--profile paper stop bot')));
  assert.ok(failed.actions.some((line) => line.includes('--profile monitoring stop portfolio-monitor')));
  assert.ok(failed.actions.some((line) => line.includes('rollback-bot')));
});

test('central updater leaves the bot stopped when paper state changes during resume', (t) => {
  const harness = makeHarness({ updated: true, services: ['web', 'backfill', 'bot'] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));

  const failed = harness.run({ mutatePaper: true });
  assert.equal(failed.result.status, 1);
  assert.match(failed.result.stderr, /bot remains stopped for manual recovery/);
  assert.equal(
    fs.readFileSync(path.join(harness.root, '.git', 'sovereign-central-deployed-head'), 'utf8').trim(),
    'old-head',
  );
  assert.ok(failed.actions.filter((line) => line.includes('--profile paper stop bot')).length >= 2);
});

test('central updater rolls back and restores old evidence when success publication fails', (t) => {
  const harness = makeHarness({ updated: true });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const evidencePath = path.join(harness.root, '.git', 'sovereign-central-deployment.json');
  fs.writeFileSync(evidencePath, '{"old":true}\n');

  const failed = harness.run({ evidenceWriteFails: true });
  assert.equal(failed.result.status, 1);
  assert.equal(fs.readFileSync(evidencePath, 'utf8'), '{"old":true}\n');
  assert.equal(fs.readFileSync(harness.runtimeState, 'utf8').trim(), 'old');
  assert.equal(
    fs.readFileSync(path.join(harness.root, '.git', 'sovereign-central-deployed-head'), 'utf8').trim(),
    'old-head',
  );
});

test('central updater refuses active provider research before building or recreating', (t) => {
  const harness = makeHarness({ updated: true, services: ['web', 'backfill', 'polymarket-research'] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 79);
  assert.match(result.stderr, /authorized maintenance window/);
  assert.ok(!actions.some((line) => line.includes(' build web')));
  assert.ok(!actions.some((line) => line.includes(' up -d')));
});

test('central updater rejects an unknown project service instead of ignoring it', (t) => {
  const harness = makeHarness({ updated: true, services: ['web', 'backfill', 'orphan-worker'] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run();

  assert.equal(result.status, 79);
  assert.match(result.stderr, /unknown Compose service: orphan-worker/);
  assert.ok(!actions.some((line) => line.includes(' build web')));
});

test('central updater refuses the all-in-one rehearsal profile before Docker actions', (t) => {
  const harness = makeHarness({ updated: true });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const { result, actions } = harness.run({ deploymentProfile: 'all-in-one' });

  assert.equal(result.status, 78);
  assert.match(result.stderr, /refusing central updater for deployment profile all-in-one/);
  assert.equal(actions.length, 0);
});
