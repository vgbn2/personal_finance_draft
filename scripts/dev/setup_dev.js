#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(command, args, options = {}) {
  const label = options.label || `${command} ${args.join(' ')}`;
  console.log(`\n\x1b[36m▶ [${label}]\x1b[0m`);
  const res = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'),
  });
  if (res.status !== 0) {
    console.error(`\x1b[31m✖ Failed: ${label} (exit code ${res.status})\x1b[0m`);
    if (options.fatal !== false) {
      process.exit(res.status || 1);
    }
    return false;
  }
  console.log(`\x1b[32m✔ Completed: ${label}\x1b[0m`);
  return true;
}

function ensureEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  const examplePath = path.join(REPO_ROOT, '.env.example');
  if (!fs.existsSync(envPath)) {
    console.log('\n\x1b[33m▶ Initializing .env from .env.example (safe zero-key defaults)\x1b[0m');
    fs.copyFileSync(examplePath, envPath);
    console.log('\x1b[32m✔ Created .env\x1b[0m');
  } else {
    console.log('\n\x1b[32m✔ .env file already exists\x1b[0m');
  }
}

function installWorkspaces() {
  const workspaces = [
    '.',
    'backend/api',
    'backend/gateway',
    'backend/mcp_server',
    'Frontend/dashboard'
  ];

  for (const ws of workspaces) {
    const wsPath = path.join(REPO_ROOT, ws);
    const hasNodeModules = fs.existsSync(path.join(wsPath, 'node_modules'));
    const isRoot = ws === '.';
    if (!hasNodeModules || isRoot) {
      run('npm', ['install', ...(isRoot ? [] : ['--prefix', ws])], { label: `Install dependencies (${ws})` });
    } else {
      console.log(`\x1b[32m✔ Dependencies already installed for ${ws}\x1b[0m`);
    }
  }
}

function buildNative() {
  run('npm', ['run', 'native:build'], { label: 'Build C++ Analytics Core (CMake)' });
  run('npm', ['run', 'test:prepare'], { label: 'Seed Master Test Fixtures' });
}

function verifySuites() {
  console.log('\n\x1b[35m=== Running Verification Gates ===\x1b[0m');
  run('npm', ['run', 'test:data'], { label: 'Data & Indicator Tests' });
  run('npm', ['run', 'test:structure'], { label: 'Repository Structure Contract' });
  run('npm', ['run', 'test:core'], { label: 'C++ Core Unit & Integration Tests' });
}

function main() {
  console.log('\x1b[1m\x1b[34m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[34m   Sovereign Trading Platform - Developer Setup        \x1b[0m');
  console.log('\x1b[1m\x1b[34m========================================================\x1b[0m');
  console.log('Stack: Node.js (v20+) + C++20 (CMake). No Python venv required.');
  console.log('Mode: Zero-key local development (all fixtures & ledgers simulated).');

  ensureEnv();
  installWorkspaces();
  buildNative();
  verifySuites();

  console.log('\n\x1b[1m\x1b[32m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[32m   🎉 Developer environment setup successfully!          \x1b[0m');
  console.log('\x1b[1m\x1b[32m========================================================\x1b[0m');
  console.log('\nNext steps:');
  console.log('  • Inspect status:       \x1b[36mnode backend/cli/sovereign_cli.js status --json\x1b[0m');
  console.log('  • Interactive Cockpit:  \x1b[36mnode backend/cli/sovereign_cli.js\x1b[0m');
  console.log('  • Run full test suite:  \x1b[36mnpm test\x1b[0m');
  console.log('  • Web API & Dashboard:  \x1b[36mnpm run start:api\x1b[0m / \x1b[36mnpm run start:frontend\x1b[0m\n');
}

if (require.main === module) {
  main();
}

module.exports = { main, ensureEnv, installWorkspaces, buildNative };
