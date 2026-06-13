const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const A = require('#shared/ansi');
const utils = require('../../lib/utils.js');
const { pageText, printPayload, hasFlag, optionValue } = utils;
const { promptSelect, promptText } = require('../../tui');
const { promptPassword } = require('../../lib/auth.js');
const { listBrokers, getBrokerSpec, buildBrokerReport } = require('../../../../shared/lib/brokers');
const { upsertEnvFile, getEnvValue } = require('../../../../shared/lib/brokers/common');

function scanTrackedFilesForSecrets(values) {
  const candidates = Object.entries(values || {})
    .filter(([, value]) => value && String(value).trim().length >= 8)
    .map(([key, value]) => ({ key, value: String(value).trim() }));

  if (!candidates.length) {
    return { ok: true, hits: [], scanned: 0 };
  }

  const hits = [];
  for (const candidate of candidates) {
    const result = spawnSync('git', ['grep', '-nF', candidate.value, '--', '.'], {
      cwd: utils.REPO_ROOT,
      encoding: 'utf8',
      shell: false,
    });
    if (result.status === 0 && result.stdout) {
      const count = String(result.stdout).trim().split(/\r?\n/).filter(Boolean).length;
      hits.push({ key: candidate.key, count });
    }
  }

  return {
    ok: hits.length === 0,
    hits,
    scanned: candidates.length,
  };
}

function renderSetupSummary(report, dryRun) {
  const lines = [
    `${A.B_CYAN}${report.display_name || report.broker}${A.RESET} ${dryRun ? A.muted('(dry run)') : ''}`,
    A.GRAY + '='.repeat(72) + A.RESET,
    `  Env file: ${report.env_path}`,
    `  Status: ${report.ok ? 'ready' : 'needs attention'}`,
  ];
  if (report.host) lines.push(`  Host: ${report.host}`);
  if (Array.isArray(report.missing) && report.missing.length) {
    lines.push(`  Missing: ${report.missing.join(', ')}`);
  }
  lines.push('');
  for (const field of report.fields || []) {
    const status = field.present ? A.GREEN + 'OK' + A.RESET : A.YELLOW + 'MISSING' + A.RESET;
    lines.push(`  [${status}] ${field.label} (${field.key})`);
    if (field.present && field.secret) {
      lines.push('      [redacted]');
    } else if (field.present) {
      lines.push(`      ${field.value}`);
    } else {
      lines.push('      not set');
    }
  }
  if (report.notes?.length) {
    lines.push('');
    lines.push('  Notes:');
    report.notes.forEach((note) => lines.push(`    - ${note}`));
  }
  return lines.join('\n');
}

function collectOverrides(args) {
  const overrides = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--set' && i + 1 < args.length) {
      const pair = args[i + 1];
      const equalsIndex = pair.indexOf('=');
      if (equalsIndex > 0) {
        const key = pair.slice(0, equalsIndex).trim();
        const value = pair.slice(equalsIndex + 1);
        if (key) overrides[key] = value;
      }
      i += 1;
      continue;
    }
    if (token.startsWith('--set=')) {
      const pair = token.slice(6);
      const equalsIndex = pair.indexOf('=');
      if (equalsIndex > 0) {
        const key = pair.slice(0, equalsIndex).trim();
        const value = pair.slice(equalsIndex + 1);
        if (key) overrides[key] = value;
      }
    }
  }
  return overrides;
}

async function promptForBrokerField(field, currentValue) {
  global.suppressLogs = true;
  const fallback = currentValue || '';
  const value = field.secret
    ? await promptPassword(`${field.label}:`)
    : await promptText(`${field.label}:`, fallback);
  global.suppressLogs = false;
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback || null;
  }
  return String(value).trim();
}

async function collectBrokerValues(spec, args) {
  const overrides = collectOverrides(args);
  const values = {};
  const interactive = !hasFlag(args, '--json') && process.stdout.isTTY;

  for (const field of spec.fields) {
    const current = getEnvValue(process.env, [field.key, ...(field.aliases || [])]);
    if (overrides[field.key] !== undefined) {
      values[field.key] = overrides[field.key];
      continue;
    }
    if (current !== null && !interactive) {
      values[field.key] = current;
      continue;
    }
    if (interactive) {
      const promptValue = await promptForBrokerField(field, current);
      if (promptValue !== null) values[field.key] = promptValue;
      continue;
    }
    if (current !== null) values[field.key] = current;
  }

  return values;
}

async function commandBrokerSetup(args, brokerName) {
  const spec = getBrokerSpec(brokerName);
  if (!spec) {
    printPayload({ ok: false, error: `Unknown broker: ${brokerName}` }, args);
    return 1;
  }
  const dryRun = hasFlag(args, '--dry-run');
  const envPath = optionValue(args, '--env-path') || optionValue(args, '--env-file') || path.join(utils.REPO_ROOT, '.env');
  const values = await collectBrokerValues(spec, args);
  const updates = {};
  for (const field of spec.fields) {
    const value = values[field.key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      updates[field.key] = String(value).trim();
    }
  }
  if (spec.setupDefaults) {
    Object.assign(updates, spec.setupDefaults(process.env, values));
  }

  const report = buildBrokerReport(spec.broker, { ...process.env, ...updates });
  if (dryRun) {
    printPayload({ ok: report.ok, dry_run: true, broker: spec.broker, env_path: envPath, updated: Object.keys(updates), missing: report.missing, values: report.fields }, args);
    if (hasFlag(args, '--json')) return report.ok ? 0 : 1;
    pageText(renderSetupSummary({ ...report, env_path: envPath }, true), args);
    return report.ok ? 0 : 1;
  }

  const result = upsertEnvFile(updates, envPath);
  const finalReport = buildBrokerReport(spec.broker, process.env);
  const secretScan = scanTrackedFilesForSecrets(updates);
  const payload = {
    ok: finalReport.ok,
    broker: spec.broker,
    env_path: envPath,
    updated: result.updated,
    added: result.added,
    missing: finalReport.missing,
    mode: finalReport.mode ?? null,
    host: finalReport.host ?? null,
    fields: finalReport.fields,
    secret_scan: secretScan,
  };
  printPayload(payload, args);
  if (!hasFlag(args, '--json')) {
    pageText(renderSetupSummary({ ...finalReport, env_path: envPath }, false), args);
  }
  return finalReport.ok ? 0 : 1;
}

async function commandSetup(args) {
  const broker = args[0];
  const knownSpecials = ['runtime', 'data'];
  if (broker && knownSpecials.includes(broker)) {
    printPayload({ ok: false, error: `Use \`doctor ${broker}\` for runtime/data diagnostics` }, args);
    return 1;
  }
  if (broker && getBrokerSpec(broker)) {
    return commandBrokerSetup(args.slice(1), broker);
  }

  if (broker && broker !== '--json' && broker !== '--dry-run' && broker !== '--help') {
    printPayload({ ok: false, error: `Unknown setup target: ${broker}` }, args);
    return 1;
  }

  const options = listBrokers().map((name) => {
    const spec = getBrokerSpec(name);
    return { label: spec.displayName || spec.broker, value: spec.broker };
  });
  if (!process.stdout.isTTY) {
    printPayload({ ok: false, error: 'Select a broker: ' + listBrokers().join(', ') }, args);
    return 1;
  }
  global.suppressLogs = true;
  const selection = await promptSelect('Broker to configure:', options);
  global.suppressLogs = false;
  return commandBrokerSetup(args, selection);
}

async function commandDoctor(args) {
  const section = args[0] && ['runtime', 'data'].includes(args[0]) ? args[0] : null;
  if (section === 'runtime') {
    const payload = {
      ok: true,
      section: 'runtime',
      node: process.version,
      platform: process.platform,
      repo_root: utils.REPO_ROOT,
      cli_entry: path.join(utils.REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js'),
      gateway_launcher: fs.existsSync(path.join(utils.REPO_ROOT, 'backend', 'cli', 'lib', 'run_trade_gateway.js')),
      package_json: fs.existsSync(path.join(utils.REPO_ROOT, 'package.json')),
      node_modules: fs.existsSync(path.join(utils.REPO_ROOT, 'node_modules')),
    };
    printPayload(payload, args);
    if (!hasFlag(args, '--json')) {
      pageText([
        `${A.B_CYAN}Runtime Doctor${A.RESET}`,
        A.GRAY + '='.repeat(72) + A.RESET,
        `  Node: ${payload.node}`,
        `  Platform: ${payload.platform}`,
        `  CLI: ${payload.cli_entry}`,
        `  Gateway launcher: ${payload.gateway_launcher ? 'present' : 'missing'}`,
        `  node_modules: ${payload.node_modules ? 'present' : 'missing'}`,
      ].join('\n'), args);
    }
    return payload.ok ? 0 : 1;
  }

  if (section === 'data') {
    const storageRoot = path.join(utils.REPO_ROOT, 'storage', 'data');
    const paperTrading = path.join(storageRoot, 'paper_trading');
    fs.mkdirSync(paperTrading, { recursive: true });
    const payload = {
      ok: true,
      section: 'data',
      storage_root: storageRoot,
      writable: true,
      paper_trading: {
        path: paperTrading,
        exists: fs.existsSync(paperTrading),
      },
    };
    printPayload(payload, args);
    if (!hasFlag(args, '--json')) {
      pageText([
        `${A.B_CYAN}Data Doctor${A.RESET}`,
        A.GRAY + '='.repeat(72) + A.RESET,
        `  Storage root: ${storageRoot}`,
        `  Paper trading: ${paperTrading}`,
        `  Writable: yes`,
      ].join('\n'), args);
    }
    return 0;
  }

  const probeNetwork = !hasFlag(args, '--no-network');
  const broker = args[0] && getBrokerSpec(args[0]) ? args[0] : null;
  const targets = broker ? [broker] : listBrokers();
  const reports = [];
  const scanValues = {};

  for (const name of targets) {
    const spec = getBrokerSpec(name);
    if (!spec) continue;
    const report = buildBrokerReport(name, process.env);
    for (const field of report.fields || []) {
      if (field.secret) {
        const rawValue = getEnvValue(process.env, [field.key, ...(spec.fields.find((candidate) => candidate.key === field.key)?.aliases || [])]);
        if (rawValue) {
          scanValues[field.key] = rawValue;
        }
      }
    }
    if (probeNetwork && report.host) {
      report.reachability = await require('../../../../shared/lib/brokers/common').probeUrl(report.host);
    } else {
      report.reachability = { attempted: false, ok: null, reason: 'skipped' };
    }
    reports.push(report);
  }

  const secretScan = scanTrackedFilesForSecrets(scanValues);

  const payload = {
    ok: reports.every((report) => report.ok && (report.reachability.ok !== false)),
    env_path: path.join(utils.REPO_ROOT, '.env'),
    node: process.version,
    platform: process.platform,
    brokers: reports,
    secret_scan: secretScan,
  };

  printPayload(payload, args);
  if (!hasFlag(args, '--json')) {
    const lines = [
      `${A.B_CYAN}Local-first Doctor${A.RESET}`,
      A.GRAY + '='.repeat(72) + A.RESET,
      `  Node: ${process.version}`,
      `  Platform: ${process.platform}`,
      `  Env: ${payload.env_path}`,
      '',
    ];
    for (const report of reports) {
      const status = report.ok ? A.GREEN + 'OK' + A.RESET : A.YELLOW + 'MISSING' + A.RESET;
      lines.push(`  ${report.display_name}: ${status}`);
      if (report.missing?.length) lines.push(`      Missing: ${report.missing.join(', ')}`);
      if (report.reachability?.attempted) {
        const reach = report.reachability.ok ? A.GREEN + 'REACHABLE' + A.RESET : A.RED + 'UNREACHABLE' + A.RESET;
        lines.push(`      Endpoint: ${reach}`);
      }
    }
    lines.push('');
    lines.push(`  Secret scan: ${secretScan.ok ? 'clean' : 'hits detected'}`);
    if (!secretScan.ok) {
      secretScan.hits.forEach((hit) => lines.push(`      ${hit.key}: ${hit.count} tracked matches`));
    }
    pageText(lines.join('\n'), args);
  }
  return payload.ok ? 0 : 1;
}

module.exports = {
  commandSetup,
  commandDoctor,
  scanTrackedFilesForSecrets,
};


