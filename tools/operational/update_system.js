#!/usr/bin/env node
'use strict';

/**
 * Sovereign Unified Update & Dependency Synchronizer
 * Usage:
 *   node tools/operational/update_system.js          # local update & build
 *   node tools/operational/update_system.js --remote # local update + sync/deploy to CT 114
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(command, args, options = {}) {
  const label = options.label || `${command} ${args.join(' ')}`;
  console.log(`\x1b[36m▶ [${label}]\x1b[0m`);
  const res = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'),
  });
  if (res.status !== 0 && options.fatal !== false) {
    console.error(`\x1b[31m✖ Failed: ${label} (exit code ${res.status})\x1b[0m`);
    process.exit(res.status || 1);
  }
  return res.status === 0;
}

function updateWorkspaces() {
  const workspaces = [
    '.',
    'backend/api',
    'backend/execution',
    'backend/mcp_server',
    'frontend/dashboard',
  ];
  console.log('\n\x1b[35m=== Updating Workspace Dependencies ===\x1b[0m');
  for (const ws of workspaces) {
    const isRoot = ws === '.';
    run('npm', ['install', ...(isRoot ? [] : ['--prefix', ws])], {
      label: `npm install (${ws})`,
    });
  }
}

function ensureOpencodeBinary() {
  console.log('\n\x1b[35m=== Checking Opencode AI Engine ===\x1b[0m');
  const binCheck = spawnSync('which', ['opencode'], { encoding: 'utf8' });
  const homeBin = path.join(process.env.HOME || '', '.opencode', 'bin', 'opencode');

  if (binCheck.status === 0 || fs.existsSync(homeBin)) {
    const version = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
    console.log(`\x1b[32m✔ Opencode binary present: ${version.stdout?.trim() || 'installed'}\x1b[0m`);
    return;
  }

  console.log('\x1b[33m▶ Opencode not found. Installing via official install script...\x1b[0m');
  run('bash', ['-c', 'curl -fsSL https://opencode.ai/install | bash'], {
    label: 'Download Opencode Binary',
    fatal: false,
  });
}

function buildAll() {
  console.log('\n\x1b[35m=== Compiling Native Core & Assets ===\x1b[0m');
  run('npm', ['run', 'native:build'], { label: 'CMake Build C++20 Core' });
  run('npm', ['run', 'build', '--prefix', 'backend/execution'], { label: 'Build Execution Gateway' });
  run('npm', ['run', 'build', '--prefix', 'backend/mcp_server'], { label: 'Build MCP Server' });
  run('npm', ['run', 'build', '--prefix', 'frontend/dashboard'], { label: 'Build Vite Frontend' });
}

function runVerification() {
  console.log('\n\x1b[35m=== Running Integrity & Test Verification ===\x1b[0m');
  run('npm', ['run', 'test:structure'], { label: 'Structure & Hygiene Contract' });
  run('npm', ['run', 'test:core'], { label: 'C++ Core CTest Suite (35 tests)' });
}

function deployRemote(options = {}) {
  console.log('\n\x1b[35m=== Deploying to Remote CT 114 ===\x1b[0m');
  const deployArgs = ['tools/operational/sync_local_deploy.sh', '--rebuild'];
  if (options.quant) {
    deployArgs.push('--quant');
  }
  run('bash', deployArgs, { label: 'Sync & Rebuild CT 114 Containers' });
}

async function main(passedArgs) {
  const args = passedArgs || process.argv.slice(2);
  const isRemote = args.includes('--remote') || args.includes('-r');
  const isQuant = args.includes('--quant') || args.includes('-q');

  console.log('\x1b[1m\x1b[34m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[34m   Sovereign Platform - Unified Mass Update             \x1b[0m');
  console.log('\x1b[1m\x1b[34m========================================================\x1b[0m');

  updateWorkspaces();
  ensureOpencodeBinary();
  buildAll();
  runVerification();

  if (isRemote) {
    deployRemote({ quant: isQuant });
  }

  console.log('\n\x1b[1m\x1b[32m✔ All workspaces, dependencies, and native builds updated cleanly.\x1b[0m\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Update failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { main, updateWorkspaces, ensureOpencodeBinary, buildAll, runVerification, deployRemote };
