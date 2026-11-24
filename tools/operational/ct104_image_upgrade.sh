#!/bin/bash
set -euo pipefail
umask 077

# Raw archives never pass through host extraction or host ownership mapping.
snapshot() {
  test "$(docker inspect --format '{{.State.Running}}' "$1")" = false
  mkdir -m 700 "$2"
  for directory in storage workspace configs; do
    docker cp -a "$1:/app/$directory" - > "$2/$directory.tar"
  done
}

host_inventory() {
  docker run --rm --pull never -i --network none --read-only --user 0 \
    --mount "type=bind,src=$1,dst=/snapshot,readonly" \
    --entrypoint node "$image" - /snapshot < "$backup/archive-inventory.js"
}

restore_snapshot() {
  snapshot "$2" "$3"
  docker run --rm --pull never -i --network none --read-only --user 0 \
    --mount "type=bind,src=$3,dst=/snapshot,readonly" \
    --mount "type=bind,src=$1,dst=/source,readonly" \
    --entrypoint node "$image" - /snapshot /source < "$backup/archive-inventory.js"
  # No -a: this exact raw-stdin transport was qualified on the mapped CT daemon.
  docker cp - "$2:/app/" < "$1/storage.tar"
  docker cp - "$2:/app/" < "$1/workspace.tar"
}

write_filesystem_inventory() {
  cat <<'NODE'
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = process.argv[2] || '/app';
const empty = process.argv[3] === '--empty-state';

function inventory(name, yamlOnly = false) {
  const directory = path.join(root, name);
  assert.ok(fs.statSync(directory).isDirectory(), `Missing directory: ${name}`);
  const entries = [];
  function visit(relative) {
    const absolute = path.join(directory, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) {
      if (!yamlOnly) {
        entries.push({ name: relative, type: 'directory', mode: stat.mode & 0o7777, uid: stat.uid, gid: stat.gid });
      }
      for (const child of fs.readdirSync(absolute).sort()) {
        visit(path.join(relative, child));
      }
      return;
    }
    if (yamlOnly && !/\.ya?ml$/.test(relative)) return;
    assert.ok(stat.isFile() || stat.isSymbolicLink(), `Unsupported entry: ${name}/${relative}`);
    entries.push({
      name: relative,
      type: stat.isSymbolicLink() ? 'symlink' : 'file',
      mode: stat.mode & 0o7777,
      uid: stat.uid,
      gid: stat.gid,
      ...(stat.isSymbolicLink()
        ? { target: fs.readlinkSync(absolute) }
        : { sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') }),
    });
  }
  visit('');
  return entries;
}

const storage = inventory('storage');
const workspace = inventory('workspace');
if (empty) {
  assert.ok([...storage, ...workspace].every(entry => entry.type === 'directory'), 'Replacement state is not empty');
} else {
  process.stdout.write(JSON.stringify({ storage, workspace, configYaml: inventory('configs', true) }) + '\n');
}
NODE
}

write_archive_parser() {
  cat <<'NODE'
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function archive(directory, root) {
  const fd = fs.openSync(`${directory}/${root}.tar`, 'r');
  const entries = new Map();
  let offset = 0;
  function read(size) {
    const buffer = Buffer.alloc(size);
    assert.equal(fs.readSync(fd, buffer, 0, size, offset), size);
    offset += size;
    return buffer;
  }
  function text(buffer) {
    const end = buffer.indexOf(0);
    const value = end < 0 ? buffer : buffer.subarray(0, end);
    if (end >= 0) assert.ok(buffer.subarray(end).every(byte => byte === 0));
    const result = value.toString('utf8');
    assert.ok(Buffer.from(result).equals(value));
    return result;
  }
  function number(buffer) {
    assert.ok(buffer.every(byte => byte < 128));
    const value = buffer.toString('ascii').replace(/[\0 ]+$/g, '').replace(/^ +/, '');
    assert.match(value, /^[0-7]+$/);
    const result = parseInt(value, 8);
    assert.ok(Number.isSafeInteger(result));
    return result;
  }
  try {
    while (true) {
      const header = read(512);
      if (header.every(byte => byte === 0)) {
        assert.ok(read(512).every(byte => byte === 0));
        while (offset < fs.fstatSync(fd).size) assert.ok(read(512).every(byte => byte === 0));
        break;
      }
      const checksum = number(header.subarray(148, 156));
      header.fill(32, 148, 156);
      assert.equal(header.reduce((sum, byte) => sum + byte, 0), checksum);
      assert.equal(text(header.subarray(257, 263)), 'ustar');
      const prefix = text(header.subarray(345, 500));
      const raw = `${prefix ? `${prefix}/` : ''}${text(header.subarray(0, 100))}`;
      const name = raw.replace(/\/$/, '');
      assert.ok(name === root || name.startsWith(`${root}/`));
      assert.ok(name.split('/').every(part => part && part !== '.' && part !== '..'));
      assert.ok(!entries.has(name));
      const type = header[156];
      // ponytail: ordinary USTAR files/directories only; qualify PAX/links before extending.
      assert.ok(type === 0 || type === 48 || type === 53);
      assert.equal(text(header.subarray(157, 257)), '');
      const size = number(header.subarray(124, 136));
      const entry = {
        name: name === root ? '' : name.slice(root.length + 1),
        type: type === 53 ? 'directory' : 'file',
        mode: number(header.subarray(100, 108)),
        uid: number(header.subarray(108, 116)),
        gid: number(header.subarray(116, 124)),
      };
      assert.ok(entry.mode <= 0o7777);
      if (entry.type === 'directory') assert.equal(size, 0);
      else {
        const hash = crypto.createHash('sha256');
        for (let remaining = size; remaining > 0;) {
          const chunk = read(Math.min(remaining, 65536));
          hash.update(chunk);
          remaining -= chunk.length;
        }
        entry.sha256 = hash.digest('hex');
      }
      read((512 - size % 512) % 512);
      entries.set(name, entry);
    }
    assert.equal(entries.get(root)?.type, 'directory');
    for (const name of entries.keys()) {
      if (name !== root) assert.equal(entries.get(name.slice(0, name.lastIndexOf('/')))?.type, 'directory');
    }
    // Match the canonical filesystem inventory's sorted, depth-first traversal.
    return [...entries.values()].sort((a, b) => {
      const left = a.name.split('/');
      const right = b.name.split('/');
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
      }
      return left.length - right.length;
    });
  } finally {
    fs.closeSync(fd);
  }
}

function inventory(directory) {
  return {
    storage: archive(directory, 'storage'),
    workspace: archive(directory, 'workspace'),
    configYaml: archive(directory, 'configs').filter(entry => entry.type === 'file' && /\.ya?ml$/.test(entry.name)),
  };
}

try {
  const target = inventory(process.argv[2]);
  if (process.argv[3]) {
    const source = inventory(process.argv[3]);
    // Configs are not restored: prove the entire existing tree, not only YAML.
    assert.deepEqual(archive(process.argv[2], 'configs'), archive(process.argv[3], 'configs'));
    for (const root of ['storage', 'workspace']) {
      const directories = new Set(source[root].filter(entry => entry.type === 'directory').map(entry => entry.name));
      assert.ok(target[root].every(entry => entry.type === 'directory' && directories.has(entry.name)));
    }
  } else process.stdout.write(JSON.stringify(target) + '\n');
} catch {
  process.stderr.write('Archive/invariant validation failed\n');
  process.exitCode = 1;
}
NODE
}

main() {
# This script must run inside CT104, never on a Proxmox host or remote daemon.
test "$(id -u)" = 0
test "$(cat /etc/hostname)" = sv-github-test
grep -zFx 'container=lxc' /proc/1/environ >/dev/null
test -z "${DOCKER_HOST-}${DOCKER_CONTEXT-}"
test "$(docker context show)" = default
test "$(docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock
base=/opt/sovereign-test
container=sv-github-test
exec 9>/run/lock/sv-ct104-upgrade.lock
flock -n 9

container_id() { docker inspect --format '{{.Id}}' "$1"; }
project_of() { docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$1"; }
guard_container() {
  test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$1")" = app
  test "$(docker inspect --format '{{len .Mounts}}' "$1")" = 0
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" | grep -Fx 'LIVE_TRADING=false' >/dev/null
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" | grep -Fx 'SOVEREIGN_EXECUTION_AUTHORIZED=false' >/dev/null
}
resume_timer() {
  if test "$(cat "$backup/timer-was-active")" = active; then
    systemctl start sv-test-discovery.timer
  fi
}
healthy() {
  attempts=0
  until test "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container")" = healthy; do
    attempts=$((attempts + 1))
    test "$attempts" -lt 60
    test "$(docker inspect --format '{{.State.Running}}' "$container")" = true
    sleep 2
  done
}

if test "${1-}" = --rollback; then
  backup=$2
  case "$backup" in /dev/shm/sv-rule-upgrade-*) ;; *) exit 2 ;; esac
  image=$(cat "$backup/new-image")
  original=$(cat "$backup/original-container-id")
  retained=$(cat "$backup/retained-name")
  failed=$(cat "$backup/failed-name")
  project=$(cat "$backup/new-project")
  old_image=$(cat "$backup/old-image-id")
  if docker inspect "$retained" >/dev/null 2>&1; then
    test "$(container_id "$retained")" = "$original"
    guard_container "$retained"
    test "$(docker inspect --format '{{.Image}}' "$retained")" = "$old_image"
    if docker inspect "$container" >/dev/null 2>&1; then
      guard_container "$container"
      test "$(project_of "$container")" = "$project"
      ! docker inspect "$failed" >/dev/null 2>&1
    fi
    systemctl stop sv-test-discovery.timer
    systemctl stop sv-test-discovery.service
    if docker inspect "$container" >/dev/null 2>&1; then
      docker stop "$container"
      docker rename "$container" "$failed"
    fi
    docker rename "$retained" "$container"
  else
    test "$(container_id "$container")" = "$original"
    systemctl stop sv-test-discovery.timer
    systemctl stop sv-test-discovery.service
  fi
  guard_container "$container"
  test "$(docker inspect --format '{{.Image}}' "$container")" = "$old_image"
  docker stop "$container"
  check=$(mktemp -d "$backup/rollback-check.XXXXXX")
  snapshot "$container" "$check/state"
  host_inventory "$check/state" > "$check/inventory.json"
  cmp "$backup/before.json" "$check/inventory.json"
  cp -p "$backup/compose.yml" "$base/compose.yml"
  cp -p "$backup/periodic-discovery.js" "$base/periodic-discovery.js"
  docker start "$container"
  test "$(container_id "$container")" = "$original"
  test "$(docker inspect --format '{{.Image}}' "$container")" = "$old_image"
  healthy
  docker exec -i "$container" node < "$backup/inventory.js" > "$check/running.json"
  cmp "$backup/before.json" "$check/running.json"
  resume_timer
  exit 0
fi

test "$#" = 3
image=$1
revision=$2
tree=$3
case "$image" in ghcr.io/vgbn2/personal_finance_draft@sha256:*) ;; *) exit 2 ;; esac
digest=${image##*@sha256:}
test "${#digest}" = 64
test "${#revision}" = 40
test "${#tree}" = 40
case "$digest$revision$tree" in *[!0-9a-f]*) exit 2 ;; esac
short=$(printf '%.12s' "$revision")
project=sovereign-github-rules-$short
retained=sv-github-test-pre-$revision
failed=sv-github-test-failed-$revision
backup=/dev/shm/sv-rule-upgrade-$revision
test ! -e "$backup"
! docker inspect "$retained" >/dev/null 2>&1
! docker inspect "$failed" >/dev/null 2>&1
guard_container "$container"
old_project=$(project_of "$container")
case "$old_project" in
  sovereign-github-test) ;;
  sovereign-github-rules-*)
    suffix=${old_project#sovereign-github-rules-}
    test "${#suffix}" = 12
    case "$suffix" in *[!0-9a-f]*) exit 2 ;; esac
    prior_revision=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$container")
    test "$(printf '%.12s' "$prior_revision")" = "$suffix"
    ;;
  *) exit 2 ;;
esac
test "$old_project" != "$project"
test -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")"
test "$(docker inspect --format '{{.State.Running}}' "$container")" = true
test "$(grep -Ec '^[[:space:]]+image: ghcr.io/vgbn2/personal_finance_draft@sha256:[0-9a-f]{64}[[:space:]]*$' "$base/compose.yml")" = 1

# Pull and qualify the exact artifact before interrupting observation.
docker pull "$image"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$revision"
test "$(docker image inspect --format '{{index .Config.Labels "io.sovereign.source-tree"}}' "$image")" = "$tree"
new_id=$(docker image inspect --format '{{.Id}}' "$image")
docker run --rm --network none --entrypoint sh "$image" -ec \
  'ldd /app/backend/cpp_core/build/sovereign_wealth; /app/backend/cpp_core/build/sovereign_wealth --help >/dev/null'
mkdir -m 700 "$backup"
cp -p "$base/compose.yml" "$backup/compose.yml"
cp -p "$base/periodic-discovery.js" "$backup/periodic-discovery.js"
cp "$0" "$backup/upgrade.sh"
write_filesystem_inventory > "$backup/inventory.js"
write_archive_parser > "$backup/archive-inventory.js"
printf '%s\n' "$image" > "$backup/new-image"
printf '%s\n' "$project" > "$backup/new-project"
printf '%s\n' "$retained" > "$backup/retained-name"
printf '%s\n' "$failed" > "$backup/failed-name"
container_id "$container" > "$backup/original-container-id"
docker inspect --format '{{.Image}}' "$container" > "$backup/old-image-id"
if systemctl is-active --quiet sv-test-discovery.timer; then
  echo active > "$backup/timer-was-active"
else
  echo inactive > "$backup/timer-was-active"
fi
cat > "$backup/rollback.sh" <<EOF
#!/bin/sh
exec bash '$backup/upgrade.sh' --rollback '$backup'
EOF
chmod 700 "$backup/rollback.sh"
trap 'echo "Stopped on failure; retained original and evidence: $backup (rollback only after before.json exists and backup verification passed)" >&2' EXIT
systemctl stop sv-test-discovery.timer
systemctl stop sv-test-discovery.service
docker exec -i "$container" node < "$backup/inventory.js" > "$backup/before.json"
docker stop "$container"
snapshot "$container" "$backup/state"
host_inventory "$backup/state" > "$backup/copied.json"
cmp "$backup/before.json" "$backup/copied.json"

# A separate project prevents Compose from deleting its retained original.
sed "s|image: ghcr.io/vgbn2/personal_finance_draft@sha256:.*|image: $image|" \
  "$backup/compose.yml" > "$backup/new-compose.yml"
docker compose --project-directory "$base" -p "$project" -f "$backup/new-compose.yml" config --quiet
docker rename "$container" "$retained"
docker compose --project-directory "$base" -p "$project" -f "$backup/new-compose.yml" create --no-build --no-deps app
guard_container "$container"
test "$(project_of "$container")" = "$project"
test "$(docker inspect --format '{{.Image}}' "$container")" = "$new_id"
test "$(docker inspect --format '{{.State.Running}}' "$container")" = false
restore_snapshot "$backup/state" "$container" "$backup/empty"
snapshot "$container" "$backup/restored"
host_inventory "$backup/restored" > "$backup/restored.json"
cmp "$backup/before.json" "$backup/restored.json"
docker cp "$container:/app/tools/operational/ct104_research.js" "$backup/new-wrapper.js"
cp -p "$backup/new-compose.yml" "$base/compose.yml"
cp "$backup/new-wrapper.js" "$base/periodic-discovery.js"
docker start "$container"
guard_container "$container"
test "$(project_of "$container")" = "$project"
test "$(docker inspect --format '{{.Image}}' "$container")" = "$new_id"
test "$(docker inspect --format '{{.State.Running}}' "$container")" = true
test "$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$container")" = "$revision"
test "$(docker inspect --format '{{index .Config.Labels "io.sovereign.source-tree"}}' "$container")" = "$tree"
healthy
docker exec -i "$container" node < "$backup/inventory.js" > "$backup/after.json"
cmp "$backup/before.json" "$backup/after.json"
date -u +%Y-%m-%dT%H:%M:%SZ > "$backup/observation-start"
resume_timer
trap - EXIT
printf 'backup=%s\ndeployment_revision=%s\npreserved_inventory=identical\n' "$backup" "$revision"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
