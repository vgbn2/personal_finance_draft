#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const { findTool } = require('../../../shared/lib/paths');

const DEFAULT_TOOLS = [
  {
    id: 'cmake',
    label: 'CMake configure/build driver',
    required: true,
    candidates: ['cmake'],
    versionArgs: ['--version'],
  },
  {
    id: 'ctest',
    label: 'CTest native test runner',
    required: true,
    candidates: ['ctest'],
    versionArgs: ['--version'],
  },
  {
    id: 'gpp',
    label: 'C++20 compiler fallback',
    required: false,
    candidates: [
        findTool('msys64', 'SOVEREIGN_GPP') || 'g++',
        'g++'
    ],
    versionArgs: ['--version'],
  },
];

function firstLine(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function checkCandidate(candidate, versionArgs) {
  const result = spawnSync(candidate, versionArgs, {
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    candidate,
    ok: result.status === 0,
    status: result.status,
    version: result.status === 0 ? firstLine(result.stdout || result.stderr) : null,
    error: result.status === 0 ? null : firstLine(result.stderr) || result.error?.message || 'command unavailable',
  };
}

function checkTool(tool) {
  const attempts = tool.candidates.map((candidate) => checkCandidate(candidate, tool.versionArgs || ['--version']));
  const selected = attempts.find((attempt) => attempt.ok) || null;
  return {
    id: tool.id,
    label: tool.label,
    required: Boolean(tool.required),
    available: Boolean(selected),
    command: selected?.candidate || tool.candidates[0],
    version: selected?.version || null,
    attempts,
  };
}

function nativeToolchainStatus(tools = DEFAULT_TOOLS) {
  const checks = tools.map(checkTool);
  const missingRequired = checks.filter((check) => check.required && !check.available);
  const fallbackAvailable = checks.some((check) => !check.required && check.available);
  return {
    type: 'native_toolchain_status',
    ok: missingRequired.length === 0,
    can_run_cmake: missingRequired.length === 0,
    fallback_compile_available: fallbackAvailable,
    missing_required: missingRequired.map((check) => check.id),
    checks,
    guidance: missingRequired.length === 0
      ? 'CMake/CTest native verification is available.'
      : 'Install CMake and ensure cmake plus ctest are on PATH; use the reported compiler fallback only for focused local smoke tests.',
  };
}

function main(argv = process.argv.slice(2)) {
  const strict = argv.includes('--strict');
  const status = nativeToolchainStatus();
  console.log(JSON.stringify(status, null, 2));
  if (strict && !status.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TOOLS,
  nativeToolchainStatus,
};
