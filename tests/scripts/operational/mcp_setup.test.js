'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  REPO_ROOT,
  backendBinaryName,
  buildBackendCandidates,
} = require('../../../shared/lib/runtime/paths.js');
const {
  buildMcpConfig,
  writeMcpConfig,
} = require('../../../scripts/setup_mcp.js');

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-mcp-setup-'));
  const serverPath = path.join(root, 'dist', 'mcp_server', 'index.js');
  fs.mkdirSync(path.dirname(serverPath), { recursive: true });
  fs.writeFileSync(serverPath, "'use strict';\n");
  return { root, serverPath };
}

test('backend binary discovery is platform-aware', () => {
  assert.equal(backendBinaryName('linux'), 'sovereign_wealth');
  assert.equal(backendBinaryName('darwin'), 'sovereign_wealth');
  assert.equal(backendBinaryName('win32'), 'sovereign_wealth.exe');

  const linuxCandidates = buildBackendCandidates('/repo', 'linux');
  const windowsCandidates = buildBackendCandidates('C:\\repo', 'win32');
  assert.ok(linuxCandidates.every((candidate) => !candidate.endsWith('.exe')));
  assert.ok(windowsCandidates.every((candidate) => candidate.endsWith('.exe')));
});

test('MCP config emits absolute existing paths and the Linux native binary', () => {
  const { root, serverPath } = tempRepo();
  const backendPath = path.join(root, 'backend', 'core', 'build', 'sovereign_wealth');
  fs.mkdirSync(path.dirname(backendPath), { recursive: true });
  fs.writeFileSync(backendPath, '');

  try {
    const result = buildMcpConfig({
      repoRoot: root,
      platform: 'linux',
      env: {},
      nodePath: process.execPath,
    });
    const sovereign = result.config.mcpServers.sovereign;
    assert.equal(sovereign.args[0], serverPath);
    assert.equal(path.isAbsolute(sovereign.args[0]), true);
    assert.equal(sovereign.env.SOVEREIGN_BACKEND_BIN, backendPath);
    assert.doesNotMatch(JSON.stringify(sovereign), /\.exe/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('MCP config omits a native path when no backend exists', () => {
  const { root } = tempRepo();
  try {
    const result = buildMcpConfig({ repoRoot: root, platform: 'linux', env: {} });
    assert.equal(result.backendPath, null);
    assert.equal('env' in result.config.mcpServers.sovereign, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validation failure leaves an existing MCP config untouched', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-mcp-invalid-'));
  const configPath = path.join(root, '.mcp.json');
  const sentinel = '{"preserve":true}\n';
  fs.writeFileSync(configPath, sentinel);

  try {
    assert.throws(
      () => buildMcpConfig({ repoRoot: root, platform: 'linux', env: {} }),
      (error) => error.code === 'mcp_entrypoint_missing'
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), sentinel);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('atomic writer replaces a validated config and leaves no temporary file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-mcp-write-'));
  const configPath = path.join(root, '.mcp.json');
  try {
    writeMcpConfig(configPath, { mcpServers: { sovereign: { command: process.execPath } } });
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(parsed.mcpServers.sovereign.command, process.execPath);
    assert.deepEqual(fs.readdirSync(root), ['.mcp.json']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('current Linux checkout resolves the compiled native backend', {
  skip: process.platform === 'win32' ||
    !fs.existsSync(path.join(REPO_ROOT, 'dist', 'mcp_server', 'index.js')) ||
    !fs.existsSync(path.join(REPO_ROOT, 'backend', 'core', 'build', 'sovereign_wealth')),
}, () => {
  const result = buildMcpConfig({ repoRoot: REPO_ROOT, platform: process.platform });
  assert.equal(
    result.backendPath,
    path.join(REPO_ROOT, 'backend', 'core', 'build', 'sovereign_wealth')
  );
  assert.equal(fs.existsSync(result.serverPath), true);
  assert.equal(fs.existsSync(result.backendPath), true);
});
