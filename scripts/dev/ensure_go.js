'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const CACHE = path.join(os.homedir(), '.local', 'share', 'sovereign', 'go');
const MINIMUM = fs.readFileSync(path.join(ROOT, 'backend/go/go.mod'), 'utf8').match(/^go (\d+\.\d+(?:\.\d+)?)$/m)[1];

function compatible(output, minimum = MINIMUM) {
  const version = output.match(/\bgo(\d+)\.(\d+)\.(\d+)(?:\s|$)/);
  if (!version) return false;
  const required = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const delta = Number(version[i + 1]) - (required[i] || 0);
    if (delta) return delta > 0;
  }
  return true;
}

function usable(bin) {
  const result = spawnSync(path.join(bin, 'go'), ['version'], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env, GOTOOLCHAIN: 'local' },
  });
  return result.status === 0 && compatible(result.stdout);
}

async function installArchive(url, digest, destination) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid Go archive checksum');
  if (fs.existsSync(destination)) throw new Error(`Go destination already exists: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.go-install-'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'go-download-'));
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Go download failed: HTTP ${response.status}`);
    const hash = createHash('sha256');
    const archive = path.join(scratch, 'go.tar.gz');
    const fd = fs.openSync(archive, 'wx', 0o600);
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 150 * 1024 * 1024) throw new Error('Go archive exceeds 150 MiB limit');
        hash.update(chunk);
        fs.writeFileSync(fd, chunk);
      }
    } finally {
      fs.closeSync(fd);
    }
    if (hash.digest('hex') !== digest) throw new Error('Go archive checksum mismatch');
    const unpack = spawnSync('tar', ['-xzf', archive, '-C', staging], { encoding: 'utf8', timeout: 120000 });
    if (unpack.status !== 0) throw new Error(`Go extraction failed: ${unpack.error?.message || unpack.stderr}`);
    const tree = path.join(staging, 'go');
    if (!usable(path.join(tree, 'bin'))) throw new Error(`Downloaded Go does not satisfy ${MINIMUM}`);
    if (fs.existsSync(destination)) throw new Error(`Go destination already exists: ${destination}`);
    fs.renameSync(tree, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function ensureGo({ install = true } = {}) {
  for (const bin of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    if (usable(bin)) return path.resolve(bin);
  }
  if (fs.existsSync(CACHE)) {
    for (const entry of fs.readdirSync(CACHE).filter(name => /^go\d+\.\d+\.\d+-/.test(name)).sort().reverse()) {
      const bin = path.join(CACHE, entry, 'bin');
      if (usable(bin)) return bin;
    }
  }
  if (!install) throw new Error(`Go >= ${MINIMUM} is required; run npm run setup:dev to install the managed toolchain`);
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!arch || !['linux', 'darwin'].includes(process.platform)) {
    throw new Error(`Managed Go installation supports Linux/macOS amd64/arm64; install Go >= ${MINIMUM} on PATH`);
  }
  const response = await fetch('https://go.dev/dl/?mode=json', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Go release metadata failed: HTTP ${response.status}`);
  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error('Invalid Go release metadata');
  for (const release of releases) {
    if (!release.stable || !/^go\d+\.\d+\.\d+$/.test(release.version) || !compatible(`${release.version} `)) continue;
    const filename = `${release.version}.${process.platform}-${arch}.tar.gz`;
    const file = release.files?.find(item => item.filename === filename && item.kind === 'archive');
    if (!file || !/^[a-f0-9]{64}$/.test(file.sha256)) continue;
    const destination = path.join(CACHE, `${release.version}-${process.platform}-${arch}`);
    console.log(`Installing checksum-verified ${release.version} into ${destination}`);
    await installArchive(`https://go.dev/dl/${filename}`, file.sha256, destination);
    return path.join(destination, 'bin');
  }
  throw new Error(`No stable Go archive satisfies ${MINIMUM} for ${process.platform}/${arch}`);
}

module.exports = { ensureGo, installArchive, compatible };
