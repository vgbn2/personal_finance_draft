'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { ensureGo, installArchive, compatible } = require('../../../../../tools/dev/ensure_go');

test('Go prerequisite honors the module minimum and reuses a real compatible toolchain', async () => {
  assert.equal(compatible('go version go1.24.6 linux/amd64', '1.24'), true);
  assert.equal(compatible('go version go1.23.9 linux/amd64', '1.24'), false);
  assert.equal(compatible('go version go1.24rc1 linux/amd64', '1.24'), false);
  assert.equal(compatible('unexpected output', '1.24'), false);
  const before = process.env.PATH;
  const bin = await ensureGo({ install: false });
  assert.equal(spawnSync(path.join(bin, 'go'), ['version'], { encoding: 'utf8' }).status, 0);
  assert.equal(process.env.PATH, before);
});

test('managed installer verifies real archive bytes and publishes without replacing an existing tree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-install-test-'));
  let server;
  try {
    const goroot = spawnSync(path.join(await ensureGo({ install: false }), 'go'), ['env', 'GOROOT'], { encoding: 'utf8' });
    assert.equal(goroot.status, 0, goroot.stderr);
    fs.mkdirSync(path.join(root, 'source', 'go', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'source', 'go', 'pkg', 'tool'), { recursive: true });
    fs.copyFileSync(path.join(goroot.stdout.trim(), 'bin', 'go'), path.join(root, 'source', 'go', 'bin', 'go'));
    const archive = path.join(root, 'go.tar.gz');
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', path.join(root, 'source'), 'go']).status, 0);
    const bytes = fs.readFileSync(archive);
    const digest = createHash('sha256').update(bytes).digest('hex');
    server = http.createServer((req, res) => { res.end(bytes); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/go.tar.gz`;
    const destination = path.join(root, 'installed');
    await assert.rejects(installArchive(url, '0'.repeat(64), destination), /checksum/i);
    assert.equal(fs.existsSync(destination), false);
    await installArchive(url, digest, destination);
    const binary = path.join(destination, 'bin', 'go');
    assert.equal(spawnSync(binary, ['version'], { encoding: 'utf8' }).status, 0);
    const original = fs.readFileSync(binary);
    await assert.rejects(installArchive(url, digest, destination), /exist/i);
    assert.deepEqual(fs.readFileSync(binary), original);
    assert.deepEqual(fs.readdirSync(root).sort(), ['go.tar.gz', 'installed', 'source']);
    const cache = path.join(root, '.local', 'share', 'sovereign', 'go', 'go1.24.6-linux-amd64');
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.renameSync(destination, cache);
    const script = `require(${JSON.stringify(require.resolve('../../../../../tools/dev/ensure_go'))}).ensureGo({ install: false }).then(bin => console.log(bin)).catch(error => { console.error(error.message); process.exitCode = 1; })`;
    const cached = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', env: { ...process.env, HOME: root, PATH: '' },
    });
    assert.equal(cached.status, 0, cached.stderr);
    assert.equal(cached.stdout.trim(), path.join(cache, 'bin'));
    fs.rmSync(cache, { recursive: true });
    const absent = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', env: { ...process.env, HOME: root, PATH: '' },
    });
    assert.equal(absent.status, 1);
    assert.match(absent.stderr, /Go >= 1\.24 is required/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
