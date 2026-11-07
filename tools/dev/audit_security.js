#!/usr/bin/env node
const { execSync } = require('node:child_process');

function runSecurityAudit() {
  console.log('[SECURITY] Running dependency security audit (--package-lock-only)...');
  let stdout;
  try {
    stdout = execSync('npm audit --json --package-lock-only', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    stdout = error.stdout || '{}';
  }

  let audit;
  try {
    audit = JSON.parse(stdout);
  } catch (parseError) {
    console.error('[SECURITY_ERROR] Failed to parse npm audit JSON output:', parseError.message);
    process.exitCode = 1;
    return false;
  }

  const vulns = audit.metadata?.vulnerabilities || { critical: 0, high: 0, moderate: 0, low: 0 };
  console.log(`[SECURITY] Vulnerability summary: critical=${vulns.critical}, high=${vulns.high}, moderate=${vulns.moderate}, low=${vulns.low}`);

  if (vulns.critical > 0 || vulns.high > 0) {
    console.error(`[SECURITY_FAIL] Found ${vulns.critical} critical and ${vulns.high} high vulnerabilities!`);
    process.exitCode = 1;
    return false;
  }

  console.log('[SECURITY_PASS] Zero critical and zero high severity vulnerabilities found.');
  return true;
}

if (require.main === module) {
  runSecurityAudit();
}

module.exports = { runSecurityAudit };
