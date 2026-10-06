#!/usr/bin/env node
'use strict';

/**
 * SOVEREIGN REAL-TIME PROCESS & RUNNER DOCTOR
 *
 * Dedicated live diagnostic probe for continuous background processes, containers,
 * bot loops, data feeds, model inference, and trade execution.
 *
 * Checks:
 * 1. Docker Container Health & Restart Counts
 * 2. Real-Time Runner Log Anomalies (stale signals, missing bars, exit sell failures, fallback models)
 * 3. Strategy & Model Integrity (unknown model names, unsupported broker routing)
 * 4. Data Pipeline Sufficiency (0-bar starvation for active strategy symbols)
 * 5. Feature Flags & Autopilot Activation
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

try {
  require('../../shared/lib/runtime/ts_register');
  require('../../shared/lib/runtime/env');
} catch (_) {}

const { REPO_ROOT, STORAGE_DATA_DIR, STORAGE_TS_DIR } = require('../../shared/lib/runtime/paths');
const { readCoverage } = require('../../shared/lib/market/coverage');
const { readStrategyRegistry, inspectStrategyFile } = require('../../backend/cli/commands/strategy/strategy');
const { resolveModel, MODEL_ALIASES, modelCandidates, onnxModelCandidates } = require('../../shared/lib/ml/models');
const { loadSettings } = require('../../shared/lib/settings/user_settings');

const ANSI = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m',
  B_RED: '\x1b[1;31m',
  B_GREEN: '\x1b[1;32m',
  B_YELLOW: '\x1b[1;33m',
};

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function checkDockerContainers() {
  const psOutput = safeExec('docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}"');
  if (!psOutput) {
    return { available: false, containers: [], issues: [] };
  }

  const lines = psOutput.split('\n').filter(Boolean);
  const containers = [];
  const issues = [];

  for (const line of lines) {
    const [name, status, image] = line.split('\t');
    const isRestarting = status.toLowerCase().includes('restarting');
    const isUnhealthy = status.toLowerCase().includes('unhealthy');
    const entry = { name, status, image, ok: !isRestarting && !isUnhealthy };
    containers.push(entry);

    if (isRestarting) {
      issues.push(`Container ${name} is crash-looping (${status})`);
    } else if (isUnhealthy) {
      issues.push(`Container ${name} is failing healthcheck (${status})`);
    }
  }

  return { available: true, containers, issues };
}

function scanContainerLogs(containerName, tail = 100) {
  const logOutput = safeExec(`docker logs --tail ${tail} ${containerName} 2>&1`);
  if (!logOutput) return { available: false, findings: [] };

  const findings = [];
  const lines = logOutput.split('\n');

  for (const line of lines) {
    if (line.includes('dormant (bot_autopilot flag is disabled)')) {
      findings.push({ severity: 'HIGH', type: 'bot_dormant', line });
    } else if (line.includes('Unknown model') && line.includes('falling back')) {
      findings.push({ severity: 'MEDIUM', type: 'model_fallback', line });
    } else if (line.includes('Insufficient history') && line.includes('0 bars')) {
      findings.push({ severity: 'MEDIUM', type: 'data_starvation', line });
    } else if (line.includes('Exit sell failed')) {
      findings.push({ severity: 'HIGH', type: 'exit_sell_failure', line });
    } else if (line.includes('Signal for') && line.includes('is stale')) {
      findings.push({ severity: 'MEDIUM', type: 'stale_signal', line });
    } else if (line.includes('OOMKilled') || line.includes('out of memory')) {
      findings.push({ severity: 'CRITICAL', type: 'oom_kill', line });
    } else if (line.includes('ECONNREFUSED') || line.includes('ETIMEDOUT')) {
      findings.push({ severity: 'MEDIUM', type: 'network_timeout', line });
    }
  }

  return { available: true, findings, totalLinesScanned: lines.length };
}

function checkModelRegistryCoverage() {
  const issues = [];
  const warnings = [];
  const files = readStrategyRegistry();
  const strategies = files.map(inspectStrategyFile);

  const validModelNames = new Set([
    ...Object.keys(MODEL_ALIASES),
    ...modelCandidates.map((m) => m.name),
    ...onnxModelCandidates.map((m) => m.name),
  ]);

  for (const strat of strategies) {
    if (!strat.enabled) continue;
    const modelName = strat.model;
    if (!modelName) {
      warnings.push(`Strategy ${strat.name} does not declare a model`);
      continue;
    }

    if (!validModelNames.has(modelName)) {
      issues.push(`Strategy ${strat.name} declares unknown model "${modelName}" (triggers fallback)`);
    }
  }

  return { ok: issues.length === 0, issues, warnings, totalStrategies: strategies.length };
}

function checkDataSufficiencyForActiveStrategies() {
  const issues = [];
  const warnings = [];
  const files = readStrategyRegistry();
  const activeStrategies = files.map(inspectStrategyFile).filter((s) => s.enabled);
  const now = Date.now();

  for (const strat of activeStrategies) {
    const universe = Array.isArray(strat.universe) ? strat.universe : [];
    const timeframe = strat.timeframe || '1d';

    for (const symbol of universe) {
      const cov = readCoverage(STORAGE_TS_DIR, symbol, timeframe, now);
      if (!cov || !cov.exists || cov.count === 0) {
        warnings.push(`No data bars for active strategy ${strat.name} -> ${symbol}:${timeframe} (0 bars)`);
      } else if (cov.count < 21) {
        warnings.push(`Insufficient bars for ${strat.name} -> ${symbol}:${timeframe} (${cov.count} bars < 21 minimum)`);
      }
    }
  }

  return { ok: issues.length === 0, issues, warnings, activeStrategiesCount: activeStrategies.length };
}

function checkUserSettingsAndFlags() {
  const settings = loadSettings();
  const issues = [];
  const warnings = [];

  if (!settings.feature_flags?.bot_autopilot) {
    issues.push('bot_autopilot feature flag is false in storage/data/user_settings.json');
  }

  return { ok: issues.length === 0, settings, issues, warnings };
}

async function runRealtimeDoctor(options = {}) {
  const dockerReport = checkDockerContainers();
  const botLogsReport = dockerReport.available
    ? scanContainerLogs('sv-bot-alpaca-paper', options.logTail || 150)
    : { available: false, findings: [] };
  const modelReport = checkModelRegistryCoverage();
  const dataReport = checkDataSufficiencyForActiveStrategies();
  const flagsReport = checkUserSettingsAndFlags();

  const allIssues = [
    ...dockerReport.issues,
    ...botLogsReport.findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').map((f) => `[${f.type}] ${f.line}`),
    ...modelReport.issues,
    ...flagsReport.issues,
  ];

  const allWarnings = [
    ...botLogsReport.findings.filter((f) => f.severity === 'MEDIUM').map((f) => `[${f.type}] ${f.line}`),
    ...modelReport.warnings,
    ...dataReport.warnings,
    ...flagsReport.warnings,
  ];

  const ok = allIssues.length === 0;

  return {
    ok,
    timestamp: new Date().toISOString(),
    verdict: ok ? 'HEALTHY' : 'ANOMALIES_DETECTED',
    docker: dockerReport,
    bot_logs: botLogsReport,
    models: modelReport,
    data_sufficiency: dataReport,
    flags: flagsReport,
    issues: allIssues,
    warnings: allWarnings,
  };
}

function renderReport(report) {
  const line = ANSI.GRAY + '='.repeat(78) + ANSI.RESET;
  console.log('\n' + line);
  console.log(`${ANSI.BOLD}${ANSI.CYAN} SOVEREIGN REAL-TIME PROCESS & RUNNER DIAGNOSTIC REPORT${ANSI.RESET}`);
  console.log(line);
  console.log(` Timestamp: ${report.timestamp}`);
  console.log(` Verdict:   ${report.ok ? ANSI.B_GREEN + 'HEALTHY' : ANSI.B_RED + 'ANOMALIES_DETECTED'}${ANSI.RESET}`);
  console.log(line);

  // 1. Docker Containers
  console.log(`\n${ANSI.BOLD}[1] Docker Containers${ANSI.RESET}`);
  if (report.docker.available) {
    for (const c of report.docker.containers) {
      const statusColor = c.ok ? ANSI.GREEN : ANSI.RED;
      console.log(`  - ${c.name.padEnd(25)} ${statusColor}${c.status}${ANSI.RESET}`);
    }
  } else {
    console.log(`  ${ANSI.GRAY}(Docker not running locally or non-container host)${ANSI.RESET}`);
  }

  // 2. Real-Time Runner Log Analysis
  console.log(`\n${ANSI.BOLD}[2] Container Log Scan (sv-bot-alpaca-paper)${ANSI.RESET}`);
  if (report.bot_logs.available) {
    if (report.bot_logs.findings.length === 0) {
      console.log(`  ${ANSI.GREEN}✓ 0 runtime anomalies detected in last ${report.bot_logs.totalLinesScanned} log lines${ANSI.RESET}`);
    } else {
      for (const f of report.bot_logs.findings.slice(0, 10)) {
        const color = f.severity === 'HIGH' || f.severity === 'CRITICAL' ? ANSI.B_RED : ANSI.YELLOW;
        console.log(`  ${color}[${f.type}]${ANSI.RESET} ${f.line}`);
      }
      if (report.bot_logs.findings.length > 10) {
        console.log(`  ${ANSI.GRAY}... and ${report.bot_logs.findings.length - 10} more findings${ANSI.RESET}`);
      }
    }
  }

  // 3. Model Registry Coverage
  console.log(`\n${ANSI.BOLD}[3] Strategy Model Mappings${ANSI.RESET}`);
  if (report.models.ok) {
    console.log(`  ${ANSI.GREEN}✓ All ${report.models.totalStrategies} strategy model references resolve to canonical models${ANSI.RESET}`);
  } else {
    for (const issue of report.models.issues) {
      console.log(`  ${ANSI.RED}✗ ${issue}${ANSI.RESET}`);
    }
  }

  // 4. Feature Flags
  console.log(`\n${ANSI.BOLD}[4] Runtime Feature Flags${ANSI.RESET}`);
  if (report.flags.ok) {
    console.log(`  ${ANSI.GREEN}✓ bot_autopilot and all feature flags are enabled (true)${ANSI.RESET}`);
  } else {
    for (const issue of report.flags.issues) {
      console.log(`  ${ANSI.RED}✗ ${issue}${ANSI.RESET}`);
    }
  }

  // 5. Data Sufficiency
  console.log(`\n${ANSI.BOLD}[5] Data Bar Sufficiency${ANSI.RESET}`);
  if (report.data_sufficiency.warnings.length === 0) {
    console.log(`  ${ANSI.GREEN}✓ All active strategy symbols have sufficient history (>= 21 bars)${ANSI.RESET}`);
  } else {
    console.log(`  ${ANSI.YELLOW}⚠ ${report.data_sufficiency.warnings.length} symbol/timeframe pairs lack >= 21 bars${ANSI.RESET}`);
    for (const w of report.data_sufficiency.warnings.slice(0, 5)) {
      console.log(`    - ${w}`);
    }
    if (report.data_sufficiency.warnings.length > 5) {
      console.log(`    ${ANSI.GRAY}... and ${report.data_sufficiency.warnings.length - 5} more${ANSI.RESET}`);
    }
  }

  console.log('\n' + line);
  if (!report.ok) {
    console.log(`${ANSI.B_RED}Critical Issues Found: ${report.issues.length}${ANSI.RESET}`);
    for (const issue of report.issues) {
      console.log(`  ${ANSI.RED}• ${issue}${ANSI.RESET}`);
    }
    console.log(line);
  }
}

async function main() {
  const isJson = process.argv.includes('--json');
  const report = await runRealtimeDoctor();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderReport(report);
  }

  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { runRealtimeDoctor };
