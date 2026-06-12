const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../../shared/lib/env.js');
const {
  buildLegacyEnvBridge,
  normalizeLegacyPolymarketEnv,
} = require('./legacy_clob.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js');

function toJson(stdout, label) {
  const cleaned = String(stdout || '').replace(/\u001b\[[0-9;]*m/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`No JSON found for ${label}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function runCli(args, env) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30000,
  });
  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
      status: result.status,
      timedOut: result.error.code === 'ETIMEDOUT',
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  try {
    return { ok: true, status: result.status, payload: toJson(result.stdout, args.join(' ')) };
  } catch (error) {
    return { ok: false, status: result.status, error: error.message, stdout: result.stdout, stderr: result.stderr };
  }
}

function buildEnvVariants() {
  const current = normalizeLegacyPolymarketEnv(process.env);
  const legacy = buildLegacyEnvBridge(process.env);
  return [
    { name: 'current', env: current },
    { name: 'legacy', env: legacy },
  ];
}

function summarizeDebug(payload) {
  if (!payload || !payload.ok) return { ok: false, error: payload && payload.error ? payload.error : 'unknown' };
  return {
    ok: true,
    signer: payload.signerAddress,
    funder: payload.funderAddress,
    signatureType: payload.signatureType,
    balance: payload.collateral && payload.collateral.balance,
    allowance: payload.collateral && payload.collateral.allowance,
    accountState: payload.accountState,
  };
}

function summarizeCollateralProbe(payload) {
  if (!payload || !payload.ok) return { ok: false, error: payload && payload.error ? payload.error : 'unknown' };
  return {
    ok: true,
    signer: payload.signerAddress,
    funder: payload.funderAddress,
    signatureType: payload.signatureType,
    balance: payload.collateral && payload.collateral.balance,
    allowance: payload.collateral && payload.collateral.allowance,
    accountState: payload.accountState,
  };
}

function main() {
  const schemaArg = process.argv.find((arg) => arg === '--schema');
  const schemaIndex = schemaArg ? process.argv.indexOf(schemaArg) : -1;
  const schema = schemaIndex >= 0 ? String(process.argv[schemaIndex + 1] || 'both') : 'both';
  const variants = buildEnvVariants().filter((variant) => schema === 'both' || variant.name === schema);

  const results = [];
  for (const variant of variants) {
    const collateralProbe = runCli(['polymarket', 'collateral-probe', '--json'], variant.env);
    results.push({
      variant: variant.name,
      env: {
        privateKey: Boolean(variant.env.POLYMARKET_PRIVATE_KEY),
        funder: variant.env.POLYMARKET_FUNDER_ADDRESS || null,
        signatureType: variant.env.POLYMARKET_SIGNATURE_TYPE || null,
      },
      collateralProbe: collateralProbe.ok ? summarizeCollateralProbe(collateralProbe.payload) : { ok: false, error: collateralProbe.error },
    });
  }

  console.log(JSON.stringify({ ok: true, variants: results }, null, 2));
}

if (require.main === module) {
  main();
}
