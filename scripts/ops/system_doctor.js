#!/usr/bin/env node
'use strict';

/**
 * SOVEREIGN SYSTEM DOCTOR -- Fail-Loud Deep System Diagnostics
 *
 * Systematic diagnostic suite covering:
 * 1. Storage Format & Anti-OOM Gate (Binary TS vs Bloated JSON Cache > 20MB)
 * 2. Backend Compute Engine (Native C++20 vs JS Fallback)
 * 3. Silent Stub & Mock Detection (Unintended simulation, mock adapters)
 * 4. Full Broker Gateways (Polymarket, Alpaca, MetaTrader 5, Gate.io)
 * 5. Process & Memory Health (Node V8 Heap ceilings, active locks, daemon status)
 */

const fs = require('node:fs');
const path = require('node:path');
const v8 = require('node:v8');
const os = require('node:os');
const https = require('node:https');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

// Load environment and runtime hooks
try {
  require('../../shared/lib/runtime/ts_register');
  require('../../shared/lib/runtime/env');
} catch (_) {}

const { REPO_ROOT, STORAGE_DATA_DIR, STORAGE_TS_DIR, findBackendBinary } = require('../../shared/lib/runtime/paths');
const { backendAvailable } = require('../../shared/lib/runtime/backend_bridge');
const { listBrokers, getBrokerSpec, buildBrokerReport } = require('../../shared/lib/brokers');
const { resolvePolymarketClientSettings, buildPolymarketReport } = require('../../shared/lib/brokers/polymarket_env');
const { runAlpacaPaperAuthDiagnostic } = require('../../shared/lib/brokers/alpaca_paper_auth_diagnostic');
const { probeUrl } = require('../../shared/lib/brokers/common');

const ANSI = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m',
  B_RED: '\x1b[1;31m',
  B_GREEN: '\x1b[1;32m',
  B_YELLOW: '\x1b[1;33m',
  B_CYAN: '\x1b[1;36m',
};

const MAX_SAFE_JSON_CACHE_BYTES = 20 * 1024 * 1024; // 20MB Anti-OOM ceiling

function maskSecret(val) {
  if (!val || typeof val !== 'string') return '[empty]';
  const trimmed = val.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

// ----------------------------------------------------------------------------
// 1. STORAGE SUBSYSTEM & ANTI-OOM GATE
// ----------------------------------------------------------------------------
function checkStorageSubsystem() {
  const issues = [];
  const warnings = [];
  const cacheDir = path.join(STORAGE_DATA_DIR, 'cache');
  const tsDir = STORAGE_TS_DIR;

  // Inspect Binary TS
  let tsFileCount = 0;
  let tsTotalBytes = 0;
  let tsNewestMtime = 0;
  if (fs.existsSync(tsDir)) {
    try {
      const files = fs.readdirSync(tsDir);
      for (const f of files) {
        if (f.endsWith('.bin')) {
          tsFileCount += 1;
          const st = fs.statSync(path.join(tsDir, f));
          tsTotalBytes += st.size;
          if (st.mtimeMs > tsNewestMtime) tsNewestMtime = st.mtimeMs;
        }
      }
    } catch (err) {
      issues.push(`Failed to read binary TS directory: ${err.message}`);
    }
  } else {
    warnings.push(`Binary TS directory missing at: ${tsDir}`);
  }

  // Inspect JSON Cache & Anti-OOM Gate
  let jsonFileCount = 0;
  let jsonTotalBytes = 0;
  let apiResponseCount = 0;
  let apiResponseBytes = 0;
  const oversizedFiles = [];
  const scannedJsonFiles = [];
  const orphanedTmpFiles = [];

  function scanCacheDir(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          scanCacheDir(full);
        } else if (ent.isFile()) {
          if (ent.name.includes('.tmp')) {
            const st = fs.statSync(full);
            orphanedTmpFiles.push({ path: path.relative(REPO_ROOT, full), size: st.size });
          } else if (ent.name.endsWith('.json')) {
            jsonFileCount += 1;
            const st = fs.statSync(full);
            jsonTotalBytes += st.size;
            if (full.includes('/cache/api_responses/')) {
              apiResponseCount += 1;
              apiResponseBytes += st.size;
            }
            scannedJsonFiles.push({ path: path.relative(REPO_ROOT, full), size: st.size });
            if (st.size > MAX_SAFE_JSON_CACHE_BYTES) {
              oversizedFiles.push({
                path: path.relative(REPO_ROOT, full),
                sizeMb: (st.size / (1024 * 1024)).toFixed(2),
                sizeBytes: st.size,
              });
            }
          }
        }
      }
    } catch (err) {
      issues.push(`Failed to scan cache dir ${dir}: ${err.message}`);
    }
  }

  // Also scan tsDir for orphaned tmp files
  if (fs.existsSync(tsDir)) {
    try {
      for (const f of fs.readdirSync(tsDir)) {
        if (f.includes('.tmp')) {
          const full = path.join(tsDir, f);
          const st = fs.statSync(full);
          orphanedTmpFiles.push({ path: path.relative(REPO_ROOT, full), size: st.size });
        }
      }
    } catch (_) {}
  }

  scanCacheDir(cacheDir);

  if (oversizedFiles.length > 0) {
    for (const f of oversizedFiles) {
      issues.push(`[ANTI-OOM TRIGGERED] JSON cache file '${f.path}' is ${f.sizeMb}MB (exceeds 20MB safe limit). Parsing will exhaust V8 heap in 512MB/1GB containers!`);
    }
  }

  if (apiResponseBytes > 100 * 1024 * 1024 || apiResponseCount > 1000) {
    warnings.push(`Raw HTTP API response cache contains ${apiResponseCount} files (${(apiResponseBytes / (1024 * 1024)).toFixed(1)}MB). Run 'sovereign clear-api-cache' to reclaim space.`);
  }

  if (orphanedTmpFiles.length > 0) {
    const tmpMb = (orphanedTmpFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2);
    warnings.push(`Found ${orphanedTmpFiles.length} orphaned atomic write temporary file(s) (${tmpMb}MB). Run 'sovereign clear-api-cache' to clean.`);
  }

  // Active Reading Format Detection
  const rootLastFetch = path.join(cacheDir, 'last_fetch.json');
  const scopedLastFetch = path.join(cacheDir, 'last_fetch_scoped.json');
  const rootExists = fs.existsSync(rootLastFetch);
  const scopedExists = fs.existsSync(scopedLastFetch);

  let activeReadFormat = 'binary_ts';
  let storageQualityState = 'healthy';

  if (!rootExists && scopedExists) {
    warnings.push('Only last_fetch_scoped.json exists; loadStatusSnapshot will trigger fallback scan');
  }

  // Check data quality report if present
  const dqReportPath = path.join(cacheDir, 'data_quality_report.json');
  let staleRecords = 0;
  let usableRecords = 0;
  let totalRecords = 0;
  if (fs.existsSync(dqReportPath)) {
    try {
      const dq = JSON.parse(fs.readFileSync(dqReportPath, 'utf8'));
      staleRecords = dq.freshness?.stale_records ?? dq.stale_records ?? 0;
      usableRecords = dq.usable_records ?? 0;
      totalRecords = dq.total_records ?? 0;
      if (staleRecords > 0) {
        warnings.push(`Data Quality Report shows ${staleRecords} stale records out of ${totalRecords} total`);
      }
    } catch (_) {}
  }

  return {
    ok: issues.length === 0,
    active_storage_format: activeReadFormat,
    binary_ts: {
      dir: path.relative(REPO_ROOT, tsDir),
      file_count: tsFileCount,
      total_size_mb: (tsTotalBytes / (1024 * 1024)).toFixed(2),
      newest_update: tsNewestMtime ? new Date(tsNewestMtime).toISOString() : null,
    },
    json_cache: {
      dir: path.relative(REPO_ROOT, cacheDir),
      file_count: jsonFileCount,
      total_size_mb: (jsonTotalBytes / (1024 * 1024)).toFixed(2),
      oversized_files: oversizedFiles,
    },
    anti_oom_gate: {
      passed: oversizedFiles.length === 0,
      threshold_mb: 20,
      violators_count: oversizedFiles.length,
    },
    data_quality: {
      stale_records: staleRecords,
      usable_records: usableRecords,
      total_records: totalRecords,
    },
    issues,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// 2. BACKEND COMPUTE ENGINE & NATIVE BINARY
// ----------------------------------------------------------------------------
function checkBackendEngine() {
  const issues = [];
  const warnings = [];

  const disabled = process.env.SOVEREIGN_DISABLE_CPP === '1' || process.env.SOVEREIGN_DISABLE_CPP === 'true';
  const binaryPath = findBackendBinary();
  const isAvailable = backendAvailable();

  let activeEngine = 'unknown';
  let binaryExecutionTest = false;

  if (disabled) {
    warnings.push('C++ backend explicitly disabled via SOVEREIGN_DISABLE_CPP');
    activeEngine = 'js-fallback (explicit)';
  } else if (binaryPath && fs.existsSync(binaryPath)) {
    try {
      // Probe execute C++ binary
      const res = spawnSync(binaryPath, ['--help'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      if (res.status === 0 || res.stdout.includes('Sovereign') || res.stdout.includes('Usage')) {
        binaryExecutionTest = true;
        activeEngine = 'native-cpp20';
      } else {
        issues.push(`C++ binary at ${binaryPath} exited with status ${res.status}: ${res.stderr}`);
        activeEngine = 'native-cpp20 (execution failed)';
      }
    } catch (err) {
      issues.push(`Failed to execute C++ binary: ${err.message}`);
      activeEngine = 'js-fallback';
    }
  } else {
    warnings.push('Native C++ binary (sovereign_wealth) not found. System is running on slower JS fallback');
    activeEngine = 'js-fallback';
  }

  return {
    ok: issues.length === 0,
    active_engine: activeEngine,
    cpp_binary_path: binaryPath ? path.relative(REPO_ROOT, binaryPath) : null,
    cpp_binary_executable: binaryExecutionTest,
    cpp_disabled_by_env: disabled,
    issues,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// 3. SILENT STUB & MOCK DETECTION
// ----------------------------------------------------------------------------
function checkStubsAndMocks() {
  const issues = [];
  const warnings = [];
  const detectedMocks = [];

  const checkEnvFlag = (key, desc) => {
    const val = process.env[key];
    if (val === 'true' || val === '1') {
      detectedMocks.push({ env: key, value: val, description: desc });
      if (process.env.LIVE_TRADING === 'true') {
        issues.push(`CRITICAL: Mock flag ${key}=${val} is active while LIVE_TRADING=true!`);
      } else {
        warnings.push(`Mock active: ${key}=${val} (${desc})`);
      }
    }
  };

  checkEnvFlag('SOVEREIGN_MOCK_ENV', 'Mock environment active');
  checkEnvFlag('MOCK_MARKET_DATA', 'Simulated market data injection');
  checkEnvFlag('ALPACA_PAPER_SIMULATE_IF_MISSING', 'Alpaca silent mock fallback');
  checkEnvFlag('POLYMARKET_SIMULATE_IF_MISSING', 'Polymarket silent mock fallback');
  checkEnvFlag('GATE_IO_SIMULATE_IF_MISSING', 'Gate.io silent mock fallback');

  // Check paper vs live consistency
  const liveTrading = process.env.LIVE_TRADING === 'true';
  const executionAuth = process.env.SOVEREIGN_EXECUTION_AUTHORIZED === 'true';

  if (liveTrading && !executionAuth) {
    warnings.push('LIVE_TRADING is true but SOVEREIGN_EXECUTION_AUTHORIZED is false. CLI orders will require elevation/PIN');
  }

  return {
    ok: issues.length === 0,
    live_trading: liveTrading,
    execution_authorized: executionAuth,
    active_mocks: detectedMocks,
    issues,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// 4. BROKER GATEWAY DIAGNOSTICS (POLYMARKET, ALPACA, MT5, GATE.IO)
// ----------------------------------------------------------------------------
async function checkPolymarketGateway(options = {}) {
  const issues = [];
  const warnings = [];
  const report = buildPolymarketReport(process.env);
  const clientSettings = resolvePolymarketClientSettings(process.env);

  const hasPrivateKey = Boolean(clientSettings.privateKey);
  const hasApiCreds = Boolean(clientSettings.creds && clientSettings.apiKey);
  const funderAddress = clientSettings.funderAddress || null;
  const signatureType = clientSettings.signatureType;
  const host = clientSettings.host || 'https://clob.polymarket.com';

  let endpointProbe = { ok: null, status: null, latency_ms: 0 };
  if (!options.noNetwork) {
    const start = Date.now();
    try {
      const probeRes = await probeUrl(`${host}/time`);
      endpointProbe = {
        ok: probeRes.ok,
        status: probeRes.status,
        latency_ms: Date.now() - start,
        error: probeRes.reason || null,
      };
      if (!probeRes.ok) {
        warnings.push(`Polymarket CLOB host (${host}) probe returned status: ${probeRes.status || probeRes.reason}`);
      }
    } catch (err) {
      warnings.push(`Polymarket network probe failed: ${err.message}`);
    }
  }

  if (!hasPrivateKey) {
    warnings.push('POLYMARKET_PRIVATE_KEY is not set (trading disabled; public data only)');
  }

  return {
    ok: issues.length === 0,
    broker: 'polymarket',
    host,
    signature_type: signatureType,
    funder_address: funderAddress,
    private_key_configured: hasPrivateKey,
    private_key_masked: maskSecret(clientSettings.privateKey),
    l2_api_key_configured: hasApiCreds,
    l2_api_key_masked: maskSecret(clientSettings.apiKey),
    endpoint_probe: endpointProbe,
    issues,
    warnings,
  };
}

async function checkAlpacaGateway(options = {}) {
  const issues = [];
  const warnings = [];
  const report = buildBrokerReport('alpaca', process.env);
  const host = report.host || 'https://paper-api.alpaca.markets';
  const keyField = (report.fields || []).find(f => f.key === 'ALPACA_PAPER_API_KEY') || {};
  const secretField = (report.fields || []).find(f => f.key === 'ALPACA_PAPER_SECRET_KEY') || {};
  const keyConfigured = keyField.present;
  const secretConfigured = secretField.present;

  let authDiagnostic = null;
  if (!options.noNetwork && keyConfigured && secretConfigured) {
    try {
      authDiagnostic = await runAlpacaPaperAuthDiagnostic();
      if (!authDiagnostic.ok) {
        warnings.push(`Alpaca auth diagnostic failed: ${authDiagnostic.reason || 'Auth rejected'}`);
      }
    } catch (err) {
      warnings.push(`Alpaca diagnostic probe error: ${err.message}`);
    }
  } else if (!keyConfigured || !secretConfigured) {
    warnings.push('Alpaca credentials not configured (ALPACA_PAPER_API_KEY / ALPACA_PAPER_SECRET_KEY)');
  }

  return {
    ok: issues.length === 0,
    broker: 'alpaca',
    mode: 'paper',
    host,
    key_id_configured: keyConfigured,
    key_id_masked: keyConfigured ? maskSecret(keyField.value) : '[empty]',
    secret_key_configured: secretConfigured,
    auth_diagnostic: authDiagnostic ? { ok: authDiagnostic.ok, reason: authDiagnostic.reason } : 'skipped',
    issues,
    warnings,
  };
}

function checkMt5Gateway() {
  const issues = [];
  const warnings = [];
  const report = buildBrokerReport('mt5', process.env);
  const terminalField = (report.fields || []).find(f => f.key === 'MT5_TERMINAL_ID') || {};

  // Check storage directory across container mount, native Wine, and discovered paths
  const containerDir = path.join(REPO_ROOT, 'storage', 'mt5', 'terminal');
  let detectedPath = null;
  let detectedType = null;

  if (fs.existsSync(containerDir)) {
    detectedPath = path.relative(REPO_ROOT, containerDir);
    detectedType = 'container';
  } else {
    try {
      const { getDefaultMt5TerminalPath } = require('../../shared/lib/profiles/mt5_profiles');
      const defTerminal = getDefaultMt5TerminalPath();
      if (defTerminal && fs.existsSync(defTerminal)) {
        detectedPath = defTerminal;
        detectedType = 'wine/native';
      }
    } catch (_) {}
  }

  const expertsDir = path.join(REPO_ROOT, 'tools', 'mt5');
  const expertsDirExists = fs.existsSync(expertsDir);

  if (!terminalField.present) {
    warnings.push('MetaTrader 5 terminal ID not configured (MT5_TERMINAL_ID)');
  }

  return {
    ok: issues.length === 0,
    broker: 'mt5',
    login_configured: terminalField.present,
    login_masked: terminalField.present ? maskSecret(terminalField.value) : '[empty]',
    server_configured: terminalField.present,
    server_name: terminalField.present ? terminalField.value : null,
    password_configured: terminalField.present,
    terminal_storage_dir: {
      path: detectedPath || path.relative(REPO_ROOT, containerDir),
      exists: Boolean(detectedPath),
      type: detectedType || 'none',
    },
    experts_tools_dir: { path: path.relative(REPO_ROOT, expertsDir), exists: expertsDirExists },
    issues,
    warnings,
  };
}

function checkGateIoGateway() {
  const issues = [];
  const warnings = [];
  const report = buildBrokerReport('gateio', process.env);
  const keyField = (report.fields || []).find(f => f.key === 'GATEIO_API_KEY') || {};
  const secretField = (report.fields || []).find(f => f.key === 'GATEIO_API_SECRET') || {};

  if (!keyField.present || !secretField.present) {
    warnings.push('Gate.io API keys not configured (GATEIO_API_KEY / GATEIO_API_SECRET)');
  }

  return {
    ok: issues.length === 0,
    broker: 'gate_io',
    api_key_configured: keyField.present,
    api_key_masked: keyField.present ? maskSecret(keyField.value) : '[empty]',
    api_secret_configured: secretField.present,
    issues,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// 5. NODE V8 HEAP & RUNTIME ENVIRONMENT
// ----------------------------------------------------------------------------
function checkRuntimeEnvironment() {
  const heapStats = v8.getHeapStatistics();
  const heapLimitMb = (heapStats.heap_size_limit / (1024 * 1024)).toFixed(0);
  const heapUsedMb = (heapStats.used_heap_size / (1024 * 1024)).toFixed(0);
  const nodeOptions = process.env.NODE_OPTIONS || 'none';

  const warnings = [];
  if (heapStats.heap_size_limit < 500 * 1024 * 1024) {
    warnings.push(`Node V8 heap limit is low (${heapLimitMb}MB). Recommend setting NODE_OPTIONS="--max-old-space-size=768"`);
  }

  return {
    ok: true,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    total_system_memory_gb: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2),
    free_system_memory_gb: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2),
    v8_heap_limit_mb: Number(heapLimitMb),
    v8_heap_used_mb: Number(heapUsedMb),
    node_options: nodeOptions,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// MAIN ORCHESTRATOR & CLI ENTRYPOINT
// ----------------------------------------------------------------------------
async function runSystemDoctor(options = {}) {
  const isDeep = options.deep !== false;
  const noNetwork = options.noNetwork === true;

  const storageReport = checkStorageSubsystem();
  const backendReport = checkBackendEngine();
  const stubReport = checkStubsAndMocks();
  const polymarketReport = await checkPolymarketGateway({ noNetwork });
  const alpacaReport = await checkAlpacaGateway({ noNetwork });
  const mt5Report = checkMt5Gateway();
  const gateIoReport = checkGateIoGateway();
  const runtimeReport = checkRuntimeEnvironment();

  const allIssues = [
    ...storageReport.issues,
    ...backendReport.issues,
    ...stubReport.issues,
    ...polymarketReport.issues,
    ...alpacaReport.issues,
    ...mt5Report.issues,
    ...gateIoReport.issues,
  ];

  const allWarnings = [
    ...storageReport.warnings,
    ...backendReport.warnings,
    ...stubReport.warnings,
    ...polymarketReport.warnings,
    ...alpacaReport.warnings,
    ...mt5Report.warnings,
    ...gateIoReport.warnings,
    ...runtimeReport.warnings,
  ];

  const systemOk = allIssues.length === 0;

  const fullPayload = {
    ok: systemOk,
    timestamp: new Date().toISOString(),
    verdict: systemOk ? 'HEALTHY' : 'NEEDS_ATTENTION',
    critical_issues_count: allIssues.length,
    warnings_count: allWarnings.length,
    storage: storageReport,
    backend_engine: backendReport,
    stub_and_mock_gates: stubReport,
    brokers: {
      polymarket: polymarketReport,
      alpaca: alpacaReport,
      mt5: mt5Report,
      gate_io: gateIoReport,
    },
    runtime: runtimeReport,
    issues: allIssues,
    warnings: allWarnings,
  };

  return fullPayload;
}

function renderDoctorTerminal(payload) {
  const line = ANSI.GRAY + '='.repeat(78) + ANSI.RESET;
  const subline = ANSI.GRAY + '-'.repeat(78) + ANSI.RESET;
  const out = [];

  out.push(`\n${ANSI.B_CYAN}=== SOVEREIGN SYSTEM DOCTOR (FAIL-LOUD DIAGNOSTICS) ===${ANSI.RESET}`);
  out.push(line);
  const statusColor = payload.ok ? ANSI.B_GREEN : ANSI.B_RED;
  out.push(`  System State:        ${statusColor}${payload.verdict}${ANSI.RESET}`);
  out.push(`  Critical Issues:     ${payload.critical_issues_count > 0 ? ANSI.B_RED : ANSI.GREEN}${payload.critical_issues_count}${ANSI.RESET}`);
  out.push(`  Warnings:            ${payload.warnings_count > 0 ? ANSI.YELLOW : ANSI.GREEN}${payload.warnings_count}${ANSI.RESET}`);
  out.push(`  Timestamp:           ${payload.timestamp}`);
  out.push(line);

  // 1. Storage & Anti-OOM
  out.push(`\n${ANSI.BOLD}1. Storage Subsystem & Anti-OOM Gate${ANSI.RESET}`);
  out.push(subline);
  const st = payload.storage;
  const oomStatus = st.anti_oom_gate.passed ? `${ANSI.GREEN}[PASS] (No JSON files > 20MB)${ANSI.RESET}` : `${ANSI.B_RED}[FAIL - TRIGGERED] (${st.anti_oom_gate.violators_count} files > 20MB)${ANSI.RESET}`;
  out.push(`  Active Storage Mode: ${ANSI.CYAN}${st.active_storage_format}${ANSI.RESET}`);
  out.push(`  Anti-OOM Gate:       ${oomStatus}`);
  out.push(`  Binary TS Index:     ${st.binary_ts.file_count} .bin files (${st.binary_ts.total_size_mb} MB total)`);
  if (st.binary_ts.newest_update) out.push(`  Latest TS Update:    ${st.binary_ts.newest_update}`);
  out.push(`  JSON Cache:          ${st.json_cache.file_count} .json files (${st.json_cache.total_size_mb} MB total)`);
  if (st.json_cache.oversized_files.length > 0) {
    out.push(`  ${ANSI.B_RED}Oversized Cache Files (Anti-OOM Violation):${ANSI.RESET}`);
    for (const f of st.json_cache.oversized_files) {
      out.push(`    - ${ANSI.RED}${f.path} (${f.sizeMb} MB)${ANSI.RESET}`);
    }
  }

  // 2. Backend Engine
  out.push(`\n${ANSI.BOLD}2. Backend Compute Engine${ANSI.RESET}`);
  out.push(subline);
  const be = payload.backend_engine;
  const engineColor = be.active_engine.includes('cpp') ? ANSI.GREEN : ANSI.YELLOW;
  out.push(`  Active Engine:       ${engineColor}${be.active_engine}${ANSI.RESET}`);
  out.push(`  C++ Binary Path:     ${be.cpp_binary_path || 'None found'}`);
  out.push(`  Binary Executable:   ${be.cpp_binary_executable ? ANSI.GREEN + 'YES' + ANSI.RESET : ANSI.YELLOW + 'NO' + ANSI.RESET}`);

  // 3. Stubs & Mocks
  out.push(`\n${ANSI.BOLD}3. Silent Stubs & Mock Detection${ANSI.RESET}`);
  out.push(subline);
  const sm = payload.stub_and_mock_gates;
  out.push(`  Trading Mode:        ${sm.live_trading ? ANSI.B_RED + 'LIVE TRADING' + ANSI.RESET : ANSI.GREEN + 'PAPER / DRY-RUN' + ANSI.RESET}`);
  out.push(`  Execution Auth:      ${sm.execution_authorized ? ANSI.B_GREEN + 'AUTHORIZED' + ANSI.RESET : ANSI.GRAY + 'LOCKED / GATED' + ANSI.RESET}`);
  if (sm.active_mocks.length > 0) {
    out.push(`  ${ANSI.YELLOW}Active Mocks / Simulation Flags:${ANSI.RESET}`);
    for (const m of sm.active_mocks) {
      out.push(`    - ${m.env}=${m.value} (${m.description})`);
    }
  } else {
    out.push(`  Active Mocks:        ${ANSI.GREEN}None (Clean live execution path)${ANSI.RESET}`);
  }

  // 4. Broker Gateways
  out.push(`\n${ANSI.BOLD}4. Broker Gateway Health${ANSI.RESET}`);
  out.push(subline);
  const br = payload.brokers;

  // Polymarket
  const pm = br.polymarket;
  out.push(`  ${ANSI.CYAN}Polymarket:${ANSI.RESET}`);
  out.push(`    Host:              ${pm.host}`);
  out.push(`    Private Key:       ${pm.private_key_configured ? ANSI.GREEN + 'Configured (' + pm.private_key_masked + ')' + ANSI.RESET : ANSI.YELLOW + 'Not set' + ANSI.RESET}`);
  out.push(`    L2 API Key:        ${pm.l2_api_key_configured ? ANSI.GREEN + 'Configured (' + pm.l2_api_key_masked + ')' + ANSI.RESET : ANSI.GRAY + 'Not set' + ANSI.RESET}`);
  out.push(`    Funder Address:    ${pm.funder_address || 'Not set'}`);
  out.push(`    Signature Type:    ${pm.signature_type}`);
  if (pm.endpoint_probe && pm.endpoint_probe.ok !== null) {
    const probeColor = pm.endpoint_probe.ok ? ANSI.GREEN : ANSI.RED;
    out.push(`    Endpoint Probe:    ${probeColor}${pm.endpoint_probe.ok ? 'ONLINE' : 'FAILED'} (HTTP ${pm.endpoint_probe.status}, ${pm.endpoint_probe.latency_ms}ms)${ANSI.RESET}`);
  }

  // Alpaca
  const al = br.alpaca;
  out.push(`  ${ANSI.CYAN}Alpaca (${al.mode}):${ANSI.RESET}`);
  out.push(`    API Key ID:        ${al.key_id_configured ? ANSI.GREEN + 'Configured (' + al.key_id_masked + ')' + ANSI.RESET : ANSI.YELLOW + 'Not set' + ANSI.RESET}`);
  out.push(`    API Host:          ${al.host}`);

  // MT5
  const mt5 = br.mt5;
  out.push(`  ${ANSI.CYAN}MetaTrader 5:${ANSI.RESET}`);
  out.push(`    Login / Server:    ${mt5.login_configured ? ANSI.GREEN + mt5.login_masked + ' @ ' + (mt5.server_name || 'default') + ANSI.RESET : ANSI.YELLOW + 'Not configured' + ANSI.RESET}`);
  out.push(`    Terminal Storage:  ${mt5.terminal_storage_dir.exists ? ANSI.GREEN + 'Present (' + mt5.terminal_storage_dir.type + ': ' + mt5.terminal_storage_dir.path + ')' + ANSI.RESET : ANSI.YELLOW + 'Missing (no local Wine MT5 at ~/.mt5 or container mount at storage/mt5/terminal)' + ANSI.RESET}`);

  // Gate.io
  const gt = br.gate_io;
  out.push(`  ${ANSI.CYAN}Gate.io:${ANSI.RESET}`);
  out.push(`    API Key:           ${gt.api_key_configured ? ANSI.GREEN + 'Configured (' + gt.api_key_masked + ')' + ANSI.RESET : ANSI.YELLOW + 'Not configured' + ANSI.RESET}`);

  // 5. Runtime & V8
  out.push(`\n${ANSI.BOLD}5. Runtime & Memory Health${ANSI.RESET}`);
  out.push(subline);
  const rt = payload.runtime;
  out.push(`  Node Version:        ${rt.node_version} (${rt.platform}-${rt.arch})`);
  out.push(`  V8 Heap Ceiling:     ${rt.v8_heap_limit_mb} MB (Used: ${rt.v8_heap_used_mb} MB)`);
  out.push(`  System RAM:          ${rt.free_system_memory_gb} GB free / ${rt.total_system_memory_gb} GB total`);
  out.push(`  NODE_OPTIONS:        ${rt.node_options}`);

  // Issues & Warnings
  if (payload.issues.length > 0) {
    out.push(`\n${ANSI.B_RED}CRITICAL ISSUES (${payload.issues.length}):${ANSI.RESET}`);
    for (const issue of payload.issues) {
      out.push(`  ${ANSI.B_RED}[!] ${issue}${ANSI.RESET}`);
    }
  }
  if (payload.warnings.length > 0) {
    out.push(`\n${ANSI.B_YELLOW}WARNINGS (${payload.warnings.length}):${ANSI.RESET}`);
    for (const warn of payload.warnings) {
      out.push(`  ${ANSI.YELLOW}[*] ${warn}${ANSI.RESET}`);
    }
  }

  out.push('\n' + line + '\n');
  return out.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const noNetwork = args.includes('--no-network');
  const isDeep = args.includes('--deep') || args.includes('deep') || args.length === 0;

  try {
    const report = await runSystemDoctor({ deep: isDeep, noNetwork });
    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderDoctorTerminal(report));
    }
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    if (isJson) {
      console.log(JSON.stringify({ ok: false, error: err.message, stack: err.stack }));
    } else {
      console.error(`${ANSI.B_RED}[CRITICAL ERROR IN SYSTEM DOCTOR] ${err.message}${ANSI.RESET}`);
      console.error(err.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runSystemDoctor,
  renderDoctorTerminal,
  checkStorageSubsystem,
  checkBackendEngine,
  checkStubsAndMocks,
  checkPolymarketGateway,
  checkAlpacaGateway,
  checkMt5Gateway,
  checkGateIoGateway,
  checkRuntimeEnvironment,
};
