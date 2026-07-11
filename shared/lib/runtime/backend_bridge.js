'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { findBackendBinary, REPO_ROOT } = require('./paths');

function backendAvailable() {
  return Boolean(findBackendBinary());
}

function spawnResultHasFatalError(result) {
  return Boolean(result.error) && !Number.isInteger(result.status);
}

/**
 * Returns a copy of args with every occurrence of a value-taking flag (and its
 * following value) removed. Used to keep secrets like --pin out of a spawned
 * subprocess's argv (visible in OS process listings) once they've been consumed
 * in-process.
 */
function stripFlagValue(args, name) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) {
      i++; // skip the flag's value too
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

/**
 * Robust execution of a command with REPO_ROOT context and environment merging.
 */
function executeSovereignCommand(command, args, options = {}) {
  const spawnOptions = {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: options.shell ?? false,
    stdio: options.stdio ?? 'pipe',
    env: { ...process.env, ...(options.env || {}) },
  };
  if (options.timeout !== undefined) {
    spawnOptions.timeout = options.timeout;
  }

  const result = spawnSync(command, args, spawnOptions);

  if (process.argv.includes('--verbose') && result.stderr && options.stdio !== 'inherit') {
    process.stderr.write(result.stderr);
  }

  // Some runtimes can report a post-run spawnSync error even though the child
  // exited and produced usable output. A numeric status proves it did run.
  if (spawnResultHasFatalError(result)) {
    return { ok: false, error: result.error.message, exit_code: result.status };
  }

  if (options.stdio === 'inherit') {
    return { ok: result.status === 0, exit_code: result.status };
  }

  const raw = (result.stdout || '').trim();
  if (options.json === false) {
    return { ok: result.status === 0, raw, exit_code: result.status, stderr: result.stderr };
  }

  try {
    // Smart JSON extraction: find the first { and last } to skip leading/trailing logs
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = raw.substring(firstBrace, lastBrace + 1);
      const payload = JSON.parse(jsonStr);
      const merged = { ...payload };
      merged.ok = (result.status === 0) && (payload.ok !== false);
      merged.exit_code = result.status;
      return merged;
    }
    return JSON.parse(raw);
  } catch {
    return { ok: result.status === 0, error: 'Non-JSON output', raw: raw.slice(0, 500), exit_code: result.status, stderr: result.stderr };
  }
}

/**
 * Builds the launch configuration for the execution gateway.
 * @param {string[]} args Command line arguments.
 * @returns {object} Launch object with command and args.
 */
function buildTradeGatewayLaunch(args = []) {
  // Strip --pin unconditionally here (not just at the commandTrade call site)
  // so every one of this function's callers is covered for free, including
  // any future one -- a secret consumed in-process must never reach a
  // spawned subprocess's argv (visible in OS process listings).
  args = stripFlagValue(args, '--pin');
  // Suppress DEP0180 and similar Node deprecation warnings in gateway subprocesses
  if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('--no-deprecation')) {
    process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || '') + ' --no-deprecation').trim();
  }
  const gatewayPath = path.join(REPO_ROOT, 'backend', 'gateway', 'src', 'index.ts');
  const gatewayBootstrapPath = path.join(REPO_ROOT, 'backend', 'cli', 'lib', 'run_trade_gateway.js');
  const tsxCandidates = [
    path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
    path.join(REPO_ROOT, 'backend', 'gateway', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
  ];
  const tsxPath = tsxCandidates.find((candidate) => fs.existsSync(candidate));
  if (tsxPath) {
    if (process.platform === 'win32' && tsxPath.toLowerCase().endsWith('.cmd')) {
      const quoteForPowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-Command', `& ${[tsxPath, gatewayPath, ...args].map(quoteForPowerShell).join(' ')}`],
        shell: false,
      };
    }
    return { command: tsxPath, args: [gatewayPath, ...args], shell: false };
  }
  if (fs.existsSync(gatewayBootstrapPath)) {
    return {
      command: process.execPath,
      args: [gatewayBootstrapPath, ...args],
      shell: false,
    };
  }
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/c', 'npx', 'tsx', gatewayPath, ...args], shell: false };
  }
  return { command: 'npx', args: ['tsx', gatewayPath, ...args], shell: false };
}

/**
 * Standard interface for C++ backend execution.
 */
function runBackendCommand(commandArgs, options = {}) {
  const binary = findBackendBinary();
  if (!binary) {
    return { available: false, ok: false, error: 'C++ backend executable not found' };
  }
  return executeSovereignCommand(binary, commandArgs, options);
}

/**
 * Standard interface for gateway (TS) execution.
 */
function runGatewayCommand(gatewayArgs, options = {}) {
  const launch = buildTradeGatewayLaunch(gatewayArgs);
  return executeSovereignCommand(launch.command, launch.args, { ...options, shell: launch.shell ?? false });
}

module.exports = {
  backendAvailable,
  spawnResultHasFatalError,
  stripFlagValue,
  buildTradeGatewayLaunch,
  runBackendCommand,
  runGatewayCommand,
  executeSovereignCommand
};
