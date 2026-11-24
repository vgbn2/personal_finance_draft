'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const helper = process.env.CT104_HELPER || path.resolve(__dirname, '../../..', 'tools/operational/ct104_image_upgrade.sh');

function command(binary, args, input, expected = 0) {
  const result = spawnSync(binary, args, {
    input,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, expected, `${binary} failed: ${result.stderr}`);
  return result.stdout;
}

test('raw numeric archives safely merge existing stopped-container state', { timeout: 240000 }, () => {
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'Local default daemon only');
  assert.equal(command('docker', ['context', 'show']).trim(), 'default');
  assert.equal(command('docker', ['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}']).trim(), 'unix:///var/run/docker.sock');
  const image = command('docker', ['image', 'inspect', '--format', '{{.Id}}', process.env.CT104_FIXTURE_IMAGE || 'node:24-bookworm-slim']).trim();
  const root = fs.mkdtempSync('/tmp/opencode/ct104-upgrade-');
  const owned = [];
  const docker = (args, input) => command('docker', args, input);
  function shell(script, args = [], expected = 0) {
    return command('bash', ['-c', 'set -euo pipefail; source "$1"; shift; ' + script, 'ct104-test', helper, ...args], undefined, expected);
  }
  function create() {
    const id = docker([
      'create', '--pull', 'never', '--network', 'none', '--user', '0',
      '--label', 'purpose=ct104-upgrade-fixture', '--entrypoint', 'node', image,
      '-e', 'setInterval(() => {}, 1000)',
    ]).trim();
    owned.push(id);
    fs.writeFileSync(path.join(root, 'owned.json'), JSON.stringify(owned));
    return id;
  }
  function snapshot(id, directory) {
    shell('snapshot "$1" "$2"', [id, directory]);
  }
  function inventory(directory, expected = 0) {
    return shell('image=$1; backup=$2; host_inventory "$3"', [image, root, directory], expected);
  }
  function restore(source, target, check, expected = 0) {
    return shell('image=$1; backup=$2; restore_snapshot "$3" "$4" "$5"', [image, root, source, target, check], expected);
  }
  function mutate(source, name, alter) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    for (const entry of ['storage', 'workspace', 'configs']) {
      fs.copyFileSync(path.join(source, `${entry}.tar`), path.join(directory, `${entry}.tar`));
    }
    const file = path.join(directory, 'storage.tar');
    const buffer = fs.readFileSync(file);
    alter(buffer);
    buffer.fill(32, 148, 156);
    const checksum = buffer.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
    buffer.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    fs.writeFileSync(file, buffer);
    return directory;
  }
  try {
    fs.writeFileSync(path.join(root, 'archive-inventory.js'), shell('write_archive_parser'));
    const source = create();
    const target = create();
    docker(['start', source]);
    const setup = `
      const fs = require('node:fs');
      for (const base of ['/app', '/seed/app']) {
        for (const name of ['storage/data', 'workspace/empty', 'configs/sub']) fs.mkdirSync(base + '/' + name, { recursive: true });
        fs.writeFileSync(base + '/configs/sub/policy.yaml', 'paper: true\\n');
        fs.writeFileSync(base + '/configs/settings.json', '{"paper":true}\\n');
      }
      fs.writeFileSync('/app/storage/data/value', 'secret-fixture-value\\n');
      fs.writeFileSync('/app/workspace/file with spaces', 'workspace\\n');
      for (const [name, uid, gid, mode] of [
        ['storage', 1000, 1000, 0o750], ['storage/data', 1001, 1002, 0o2750],
        ['storage/data/value', 1003, 1004, 0o640], ['workspace', 1005, 1006, 0o751],
        ['workspace/empty', 1007, 1008, 0o700], ['workspace/file with spaces', 1009, 1010, 0o600],
      ]) {
        fs.chownSync('/app/' + name, uid, gid);
        fs.chmodSync('/app/' + name, mode);
      }
    `;
    fs.writeFileSync(path.join(root, 'setup.js'), setup);
    docker(['exec', '-i', source, 'node'], setup);
    // Canonical ct104-inventory.js contract: sorted DFS, metadata and SHA-256, YAML configs only.
    const oracle = `
      const fs = require('node:fs');
      const crypto = require('node:crypto');
      function inventory(name, yamlOnly = false) {
        const entries = [];
        function visit(relative) {
          const absolute = '/app/' + name + (relative ? '/' + relative : '');
          const stat = fs.lstatSync(absolute);
          if (stat.isDirectory()) {
            if (!yamlOnly) entries.push({ name: relative, type: 'directory', mode: stat.mode & 0o7777, uid: stat.uid, gid: stat.gid });
            for (const child of fs.readdirSync(absolute).sort()) visit(relative ? relative + '/' + child : child);
          } else if (!yamlOnly || /\\.ya?ml$/.test(relative)) {
            entries.push({ name: relative, type: 'file', mode: stat.mode & 0o7777, uid: stat.uid, gid: stat.gid,
              sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') });
          }
        }
        visit('');
        return entries;
      }
      console.log(JSON.stringify({ storage: inventory('storage'), workspace: inventory('workspace'), configYaml: inventory('configs', true) }));
    `;
    fs.writeFileSync(path.join(root, 'oracle.js'), oracle);
    const before = docker(['exec', '-i', source, 'node'], oracle);
    const embedded = shell('write_filesystem_inventory');
    assert.equal(docker(['exec', '-i', source, 'node'], embedded), before, 'Embedded canonical inventory must equal independent oracle byte-for-byte');
    fs.writeFileSync(path.join(root, 'before.json'), before);
    docker(['stop', '--time', '1', source]);
    const seed = path.join(root, 'seed.tar');
    command('bash', ['-c', 'set -euo pipefail; docker cp -a "$1:/seed/app" - > "$2"; docker cp - "$3:/" < "$2"', 'ct104-test', source, seed, target]);
    const state = path.join(root, 'state');
    snapshot(source, state);
    assert.equal(inventory(state), before, 'Raw archive must equal actual source filesystem oracle');
    const empty = path.join(root, 'empty');
    snapshot(target, empty);
    assert.notEqual(inventory(empty), before, 'Fixture must start with existing, different destination state');

    // All malformed archives go through the production validator before any restore.
    for (const [name, alter] of [
      ['traversal', buffer => { buffer.fill(0, 0, 100); buffer.write('storage/../escape'); }],
      ['absolute', buffer => { buffer.fill(0, 0, 100); buffer.write('/storage'); }],
      ['unknown-root', buffer => { buffer.fill(0, 0, 100); buffer.write('outside'); }],
      ['symlink', buffer => { buffer[156] = 50; buffer.write('../escape', 157); }],
      ['hardlink', buffer => { buffer[156] = 49; buffer.write('storage/data/value', 157); }],
      ['unknown-type', buffer => { buffer[156] = 120; }],
      ['non-ascii-uid', buffer => { buffer[108] = 0xb1; }],
    ]) {
      const unsafe = mutate(state, name, alter);
      const stdout = restore(unsafe, target, path.join(root, `check-${name}`), 1);
      assert.equal(stdout, '', 'Validation failures must not leak archive contents');
    }
    const unchanged = path.join(root, 'unchanged');
    snapshot(target, unchanged);
    assert.equal(inventory(unchanged), inventory(empty), 'Rejections must leave destination unchanged');

    // Destination traversal hazards and unknown entries are rejected as well.
    const hazardous = create();
    command('bash', ['-c', 'set -euo pipefail; docker cp - "$1:/" < "$2"', 'ct104-test', hazardous, seed]);
    docker(['start', hazardous]);
    docker(['exec', '-i', hazardous, 'node'], "require('node:fs').symlinkSync('/tmp', '/app/storage/escape')");
    docker(['stop', '--time', '1', hazardous]);
    restore(state, hazardous, path.join(root, 'check-destination-symlink'), 1);

    const divergent = create();
    command('bash', ['-c', 'set -euo pipefail; docker cp - "$1:/" < "$2"', 'ct104-test', divergent, seed]);
    docker(['start', divergent]);
    docker(['exec', '-i', divergent, 'node'], "require('node:fs').writeFileSync('/app/configs/sub/policy.yaml', 'paper: false\\n')");
    docker(['stop', '--time', '1', divergent]);
    restore(state, divergent, path.join(root, 'check-config-mismatch'), 1);
    docker(['start', divergent]);
    docker(['exec', '-i', divergent, 'node'], "const fs = require('node:fs'); fs.writeFileSync('/app/configs/sub/policy.yaml', 'paper: true\\n'); fs.writeFileSync('/app/configs/settings.json', '{}\\n')");
    docker(['stop', '--time', '1', divergent]);
    restore(state, divergent, path.join(root, 'check-non-yaml-config-mismatch'), 1);
    docker(['start', divergent]);
    docker(['exec', '-i', divergent, 'node'], "const fs = require('node:fs'); fs.writeFileSync('/app/configs/settings.json', '{\"paper\":true}\\n'); fs.mkdirSync('/app/storage/unknown')");
    docker(['stop', '--time', '1', divergent]);
    restore(state, divergent, path.join(root, 'check-unknown-destination'), 1);

    assert.equal(restore(state, target, path.join(root, 'merge-check')), '');
    const restored = path.join(root, 'restored');
    snapshot(target, restored);
    assert.equal(inventory(restored), before, 'Stopped replacement must retain full canonical inventory');
    const targetState = JSON.parse(docker(['inspect', '--format', '{{json .State}}', target]));
    assert.equal(targetState.Running, false);
    assert.equal(targetState.StartedAt, '0001-01-01T00:00:00Z');
    const sourceAfter = path.join(root, 'source-after');
    snapshot(source, sourceAfter);
    assert.equal(inventory(sourceAfter), before, 'Retained source must remain unchanged');
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ image, targetState, passed: true }));
    console.log(`Fixture evidence: ${root}`);
  } finally {
    for (const id of owned) docker(['rm', '-f', id]);
    fs.writeFileSync(path.join(root, 'removed.json'), JSON.stringify(owned));
  }
});
