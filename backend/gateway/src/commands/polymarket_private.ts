import type {
  GatewayPosition,
  PolymarketReadAdapter,
  PolymarketReadAdapterFactory,
  PolymarketTradePagination,
} from '../polymarket_read_adapter';

import {
  buildPolymarketCollateralProbeSnapshot,
  buildPolymarketDebugSnapshot,
  polymarketAddressRoles,
  polymarketModeCandidates,
  polymarketProbeCandidates,
  traceCsvFile,
  classifyPolymarketGatewayError,
  describeGatewayError,
} from '../polymarket';

const ansi = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', boldMagenta: '\x1b[1;35m',
} as const;

export interface PolymarketPrivateOutput {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface PolymarketPrivateCommandContext {
  args: string[];
  env: NodeJS.ProcessEnv;
  factory: PolymarketReadAdapterFactory;
  output: PolymarketPrivateOutput;
  useJson: boolean;
}

interface PolymarketSection {
  ok: boolean;
  configured: boolean;
  lastUpdated?: string;
  balance?: Record<string, number>;
  openOrders?: GatewayPosition[];
  positions?: GatewayPosition[];
  trade_pagination?: PolymarketTradePagination;
  error?: string;
}

interface PolymarketAuthStage {
  ok: boolean;
  count?: number;
  accountState?: string;
  collateral?: { balance: number; allowance: number; asset_type: string };
  tradePagination?: PolymarketTradePagination | null;
  error?: string;
  error_category?: string;
  suggestion?: string;
}

interface PolymarketAuthHealthSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  env: ReturnType<typeof buildPolymarketEnvPresence>;
  stages?: { collateral: PolymarketAuthStage; open_orders: PolymarketAuthStage; positions: PolymarketAuthStage };
  likelyFailureStage?: 'not_configured' | 'collateral' | 'open_orders' | 'positions' | null;
  note?: string;
}

interface PolymarketModeProbeResult {
  case: string;
  signatureType: number;
  funderAddress?: string;
  ok: boolean;
  signerAddress?: string | null;
  walletMode?: string | number | null;
  collateral?: { balance: number; allowance: number; asset_type: string } | null;
  openOrderCount?: number | null;
  positionCount?: number | null;
  accountState?: string | null;
  error?: string;
}

const NOT_CONFIGURED = 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)';
const PRIVATE_READ_COMMANDS = new Set([
  'portfolio', 'balance', 'debug', 'auth-health', 'collateral-probe', 'modes',
  'investigate', 'probe', 'topology', 'trace',
]);

function parseOptionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function walletModeLabel(signatureType?: number | null): string {
  if (signatureType === 3) return 'POLY_1271';
  if (signatureType === 2) return 'POLY_GNOSIS_SAFE';
  if (signatureType === 1) return 'POLY_PROXY';
  if (signatureType === 0) return 'EOA';
  return 'unknown';
}

function buildPolymarketEnvPresence(env: NodeJS.ProcessEnv) {
  return {
    hasPrivateKey: Boolean(String(env.POLYMARKET_PRIVATE_KEY || '').trim()),
    hasApiCreds: Boolean(String(env.POLYMARKET_API_KEY || '').trim()
      && String(env.POLYMARKET_API_SECRET || '').trim()
      && String(env.POLYMARKET_API_PASSPHRASE || '').trim()),
    hasDepositAddress: Boolean(String(env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || '').trim()),
    hasProxyAddress: Boolean(String(env.PROXY_ADDRESS || '').trim()),
    hasFunderAddress: Boolean(String(env.POLYMARKET_FUNDER_ADDRESS || '').trim()),
  };
}

function credentialOptions(env: NodeJS.ProcessEnv, overrides: { funderAddress?: string; signatureType?: number } = {}) {
  return {
    privateKey: env.POLYMARKET_PRIVATE_KEY,
    apiKey: env.POLYMARKET_API_KEY,
    apiSecret: env.POLYMARKET_API_SECRET,
    apiPassphrase: env.POLYMARKET_API_PASSPHRASE,
    ...overrides,
  };
}

async function fetchPortfolio(factory: PolymarketReadAdapterFactory): Promise<PolymarketSection> {
  const adapter = factory();
  if (!adapter.isConfigured()) return { ok: false, configured: false, error: NOT_CONFIGURED };
  try {
    const [balance, openOrders, positions] = await Promise.all([
      adapter.getPortfolioBalance(), adapter.getOpenOrders(), adapter.getPositions(),
    ]);
    return {
      ok: true, configured: true, lastUpdated: new Date().toISOString(), balance, openOrders, positions,
      trade_pagination: adapter.getTradePagination(),
    };
  } catch (error: any) {
    return { ok: false, configured: true, error: error.message };
  }
}

async function fetchDebug(factory: PolymarketReadAdapterFactory) {
  const adapter = factory();
  if (!adapter.isConfigured()) return { ok: false, configured: false, error: NOT_CONFIGURED };
  try {
    const [signerAddress, collateral, openOrders, positions] = await Promise.all([
      adapter.getSignerAddress(), adapter.getCollateralStatus(), adapter.getOpenOrders(), adapter.getPositions(),
    ]);
    const identity = adapter.getAccountIdentity();
    return buildPolymarketDebugSnapshot({
      signerAddress, funderAddress: identity.funderAddress, signatureType: identity.signatureType,
      collateral, openOrders, positions, tradePagination: adapter.getTradePagination(),
    });
  } catch (error: any) {
    return { ok: false, configured: true, error: describeGatewayError(error) };
  }
}

async function fetchCollateralProbe(
  factory: PolymarketReadAdapterFactory,
  env: NodeJS.ProcessEnv,
  options: { funderAddress?: string; signatureType?: number },
) {
  const adapter = factory(credentialOptions(env, options));
  if (!adapter.isConfigured()) return { ok: false, configured: false, error: NOT_CONFIGURED };
  try {
    const [signerAddress, collateral] = await Promise.all([
      adapter.getSignerAddress(), adapter.getCollateralStatus(),
    ]);
    const identity = adapter.getAccountIdentity();
    return buildPolymarketCollateralProbeSnapshot({
      signerAddress, funderAddress: identity.funderAddress, signatureType: identity.signatureType, collateral,
    });
  } catch (error: any) {
    return { ok: false, configured: true, error: describeGatewayError(error) };
  }
}

async function fetchAuthHealth(factory: PolymarketReadAdapterFactory, env: NodeJS.ProcessEnv): Promise<PolymarketAuthHealthSection> {
  const presence = buildPolymarketEnvPresence(env);
  const adapter = factory();
  if (!adapter.isConfigured()) {
    return {
      ok: false, configured: false, env: presence, likelyFailureStage: 'not_configured',
      note: 'Set POLYMARKET_PRIVATE_KEY plus POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE.',
    };
  }

  const identity = adapter.getAccountIdentity();
  let signerAddress: string | null = null;
  try {
    signerAddress = await adapter.getSignerAddress();
  } catch {}
  const stages: NonNullable<PolymarketAuthHealthSection['stages']> = {
    collateral: { ok: false }, open_orders: { ok: false }, positions: { ok: false },
  };
  try {
    const collateral = await adapter.getCollateralStatus();
    const snapshot = buildPolymarketCollateralProbeSnapshot({
      signerAddress, funderAddress: identity.funderAddress, signatureType: identity.signatureType, collateral,
    });
    stages.collateral = { ok: true, accountState: snapshot.accountState, collateral: snapshot.collateral };
  } catch (error: any) {
    stages.collateral = { ok: false, ...classifyPolymarketGatewayError(error) };
  }
  try {
    stages.open_orders = { ok: true, count: (await adapter.getOpenOrders()).length };
  } catch (error: any) {
    stages.open_orders = { ok: false, ...classifyPolymarketGatewayError(error) };
  }
  try {
    stages.positions = {
      ok: true, count: (await adapter.getPositions()).length,
      tradePagination: adapter.getTradePagination() ?? null,
    };
  } catch (error: any) {
    stages.positions = { ok: false, ...classifyPolymarketGatewayError(error) };
  }
  const likelyFailureStage = !stages.collateral.ok ? 'collateral'
    : !stages.open_orders.ok ? 'open_orders'
      : !stages.positions.ok ? 'positions' : null;
  return {
    ok: !likelyFailureStage, configured: true, signerAddress,
    funderAddress: identity.funderAddress ?? null, signatureType: identity.signatureType ?? null,
    walletMode: walletModeLabel(identity.signatureType), env: presence, stages, likelyFailureStage,
    note: likelyFailureStage
      ? 'This is a no-spend read-only health probe. Fix the first failing stage before retrying live orders.'
      : 'Current credentials and wallet mode passed the no-spend read surfaces.',
  };
}

async function probeOneCandidate(
  candidate: { name: string; funderAddress?: string; signatureType: number },
  adapter: PolymarketReadAdapter,
  signerAddress: string | null,
  collateralOnly: boolean,
): Promise<PolymarketModeProbeResult> {
  try {
    const collateral = await adapter.getCollateralStatus();
    const [openOrders, positions] = collateralOnly
      ? [[], []]
      : await Promise.all([adapter.getOpenOrders(), adapter.getPositions()]);
    const snapshot = buildPolymarketDebugSnapshot({
      signerAddress, funderAddress: candidate.funderAddress, signatureType: candidate.signatureType,
      collateral, openOrders, positions, tradePagination: adapter.getTradePagination(),
    });
    return {
      case: candidate.name, signatureType: candidate.signatureType,
      funderAddress: candidate.funderAddress, ok: true, signerAddress,
      walletMode: snapshot.walletMode, collateral: snapshot.collateral,
      openOrderCount: collateralOnly ? null : snapshot.openOrderCount,
      positionCount: collateralOnly ? null : snapshot.positionCount,
      accountState: snapshot.accountState,
    };
  } catch (error: any) {
    return {
      case: candidate.name, signatureType: candidate.signatureType,
      funderAddress: candidate.funderAddress, ok: false, signerAddress,
      error: describeGatewayError(error),
    };
  }
}

async function probeModeCandidates(
  candidates: Array<{ name: string; funderAddress?: string; signatureType: number }>,
  factory: PolymarketReadAdapterFactory,
  env: NodeJS.ProcessEnv,
  collateralOnly: boolean,
): Promise<{ ok: boolean; signerAddress?: string | null; results: PolymarketModeProbeResult[]; error?: string }> {
  const baseAdapter = factory();
  if (!baseAdapter.isConfigured()) return { ok: false, results: [], error: NOT_CONFIGURED };
  try {
    const signerAddress = await baseAdapter.getSignerAddress();
    const results: PolymarketModeProbeResult[] = [];
    for (const candidate of candidates) {
      const adapter = factory(credentialOptions(env, candidate));
      results.push(await probeOneCandidate(candidate, adapter, signerAddress, collateralOnly));
    }
    return { ok: true, signerAddress, results };
  } catch (error: any) {
    return { ok: false, results: [], error: describeGatewayError(error) };
  }
}

async function fetchProbe(address: string, factory: PolymarketReadAdapterFactory, env: NodeJS.ProcessEnv) {
  const result = await probeModeCandidates(polymarketProbeCandidates(address), factory, env, false);
  return { ...result, address };
}

function inferRootAddressFromCsvPath(csvPath: string): string | undefined {
  return String(csvPath).match(/export-(0x[a-fA-F0-9]{40})\.csv$/i)?.[1];
}

function fetchTrace(args: string[]) {
  const csvPath = parseOptionValue(args, '--csv');
  if (!csvPath) return { ok: false, error: 'Missing --csv <path>' };
  const rootAddress = parseOptionValue(args, '--address') || inferRootAddressFromCsvPath(csvPath);
  if (!rootAddress) return { ok: false, error: 'Unable to infer root address; pass --address <0x...>' };
  return { ok: true, csvPath, ...traceCsvFile(csvPath, rootAddress) };
}

async function fetchInvestigate(args: string[], factory: PolymarketReadAdapterFactory, env: NodeJS.ProcessEnv) {
  const trace = fetchTrace(args);
  if (!trace.ok) return trace;
  const rawLimit = parseOptionValue(args, '--limit');
  const limit = rawLimit ? Math.max(1, Number.parseInt(rawLimit, 10) || 3) : 3;
  const addresses = (trace.recommendedProbeAddresses || []).slice(0, limit);
  const unique = Array.from(new Set<string>(addresses.map((value: unknown) => String(value || '').trim()).filter(Boolean)));
  const probes = [];
  for (const address of unique) probes.push(await fetchProbe(address, factory, env));
  const probe = { ok: true, signerAddress: probes[0]?.signerAddress, probes };
  return {
    ok: true, trace, probe,
    summary: {
      candidateCount: addresses.length,
      fundedCandidates: probes.filter((entry: any) => Array.isArray(entry.results)
        && entry.results.some((result: any) => Number(result?.collateral?.balance ?? 0) > 0
          || Number(result?.collateral?.allowance ?? 0) > 0)),
    },
  };
}

function fmtQty(value: number): string { return value.toFixed(4).replace(/\.?0+$/, '') || '0'; }
function fmtUsd(value: number): string { return `$${value.toFixed(2)}`; }
function fmtPnl(value: number): string { return `${value >= 0 ? '+' : ''}${fmtUsd(value)}`; }

export function renderPolymarketSection(pm: PolymarketSection, output: PolymarketPrivateOutput): void {
  output.log(`\n${ansi.boldMagenta}Polymarket Portfolio${ansi.reset}`);
  if (!pm.configured) {
    output.log(`  ${ansi.yellow}Not configured — set POLYMARKET_PRIVATE_KEY + API credentials${ansi.reset}`);
    return;
  }
  if (!pm.ok) {
    output.log(`  ${ansi.red}Error: ${pm.error}${ansi.reset}`);
    return;
  }
  const balance = pm.balance?.pUSD ?? 0;
  const timestamp = pm.lastUpdated ? new Date(pm.lastUpdated).toLocaleTimeString() : '?';
  output.log(`  ${ansi.bold}Balance${ansi.reset}  ${ansi.green}${fmtUsd(balance)}${ansi.reset}  ${ansi.dim}pUSD · ${timestamp}${ansi.reset}`);
  if (pm.openOrders?.length) {
    output.log(`\n  ${ansi.bold}Open Orders${ansi.reset}`);
    pm.openOrders.forEach((position) => {
      const label = position.symbol.length > 44 ? `${position.symbol.slice(0, 44)}…` : position.symbol;
      output.log(`  ${ansi.dim}·${ansi.reset} ${label.padEnd(46)}  qty ${fmtQty(position.quantity).padStart(8)}  ${fmtUsd(position.marketValue).padStart(8)}`);
    });
  }
  const positions = pm.positions ?? [];
  const named = positions.filter((position) => position.symbol.includes('…') || position.symbol.length > 6);
  const unknown = positions.filter((position) => !position.symbol.includes('…') && position.symbol.length <= 6);
  if (named.length) {
    const totalValue = named.reduce((sum, position) => sum + position.marketValue, 0);
    const totalPnl = named.reduce((sum, position) => sum + position.unrealizedPl, 0);
    const pnlColor = totalPnl >= 0 ? ansi.green : ansi.red;
    output.log(`\n  ${ansi.bold}Active Positions${ansi.reset}  ${ansi.dim}(${named.length} markets · total ${fmtUsd(totalValue)} · PnL ${pnlColor}${fmtPnl(totalPnl)}${ansi.reset}${ansi.dim})${ansi.reset}`);
    named.forEach((position) => {
      const plColor = position.unrealizedPl > 0 ? ansi.green : position.unrealizedPl < 0 ? ansi.red : ansi.dim;
      const label = position.symbol.length > 50 ? `${position.symbol.slice(0, 50)}…` : position.symbol;
      output.log(`  ${ansi.dim}·${ansi.reset} ${label.padEnd(52)}  ${ansi.dim}qty${ansi.reset} ${fmtQty(position.quantity).padStart(7)}  ${fmtUsd(position.marketValue).padStart(7)}  ${plColor}${fmtPnl(position.unrealizedPl).padStart(8)}${ansi.reset}`);
    });
  }
  if (unknown.length) output.log(`\n  ${ansi.dim}+ ${unknown.length} unnamed positions  (total ${fmtUsd(unknown.reduce((sum, position) => sum + position.marketValue, 0))})${ansi.reset}`);
  if (!named.length && !unknown.length) output.log('  No positions.');
}

function renderDebug(snapshot: any, output: PolymarketPrivateOutput): void {
  output.log(`\n${ansi.boldMagenta}--- POLYMARKET DEBUG ---${ansi.reset}`);
  if (!snapshot.configured) {
    output.log(`  ${ansi.yellow}Not configured — set POLYMARKET_PRIVATE_KEY + POLYMARKET_API_KEY/SECRET/PASSPHRASE${ansi.reset}`);
    return;
  }
  if (!snapshot.ok) {
    output.log(`  ${ansi.red}Error: ${snapshot.error}${ansi.reset}`);
    return;
  }
  output.log(`  Signer: ${snapshot.signerAddress}`);
  output.log(`  Funder: ${snapshot.funderAddress ?? 'none'}`);
  output.log(`  Signature Type: ${snapshot.signatureType ?? 'unset'} (${snapshot.walletMode})`);
  output.log(`  Collateral: balance=${snapshot.collateral?.balance ?? 0} allowance=${snapshot.collateral?.allowance ?? 0}`);
  output.log(`  Open Orders: ${snapshot.openOrderCount ?? 0}`);
  output.log(`  Filled Positions: ${snapshot.positionCount ?? 0}`);
  output.log(`  Account State: ${snapshot.accountState}`);
  snapshot.notes?.forEach((note: string) => output.log(`  Note: ${note}`));
}

function renderAuthHealth(health: PolymarketAuthHealthSection, output: PolymarketPrivateOutput): void {
  output.log(`\n${ansi.boldMagenta}--- POLYMARKET AUTH HEALTH ---${ansi.reset}`);
  output.log(`  Configured: ${health.configured ? ansi.green + 'yes' : ansi.red + 'no'}${ansi.reset}`);
  output.log(`  Env: private_key=${health.env.hasPrivateKey ? 'yes' : 'no'} api_creds=${health.env.hasApiCreds ? 'yes' : 'no'} funder=${health.env.hasFunderAddress ? 'yes' : 'no'} deposit=${health.env.hasDepositAddress ? 'yes' : 'no'} proxy=${health.env.hasProxyAddress ? 'yes' : 'no'}`);
  if (!health.configured) {
    if (health.note) output.log(`  Note: ${health.note}`);
    return;
  }
  output.log(`  Signer: ${health.signerAddress ?? 'none'}`);
  output.log(`  Funder: ${health.funderAddress ?? 'none'}`);
  output.log(`  Signature Type: ${health.signatureType ?? 'unset'} (${health.walletMode ?? walletModeLabel(health.signatureType)})`);
  if (health.stages) {
    for (const [name, stage] of Object.entries(health.stages)) {
      const parts = [`  ${name}: ${stage.ok ? `${ansi.green}ok${ansi.reset}` : `${ansi.red}fail${ansi.reset}`}`];
      if (typeof stage.count === 'number') parts.push(`count=${stage.count}`);
      if (stage.accountState) parts.push(`state=${stage.accountState}`);
      if (stage.collateral) parts.push(`balance=${stage.collateral.balance}`, `allowance=${stage.collateral.allowance}`);
      output.log(parts.join('  '));
      if (!stage.ok && stage.error) output.log(`    error: ${stage.error}`);
      if (!stage.ok && stage.suggestion) output.log(`    suggestion: ${stage.suggestion}`);
    }
  }
  if (health.likelyFailureStage) output.log(`  Likely failure stage: ${health.likelyFailureStage}`);
  if (health.note) output.log(`  Note: ${health.note}`);
}

function emit(payload: unknown, context: PolymarketPrivateCommandContext, render?: () => void): void {
  if (context.useJson || !render) context.output.log(context.useJson ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  else render();
}

export async function collectPolymarketPortfolio(factory: PolymarketReadAdapterFactory): Promise<PolymarketSection> {
  return fetchPortfolio(factory);
}

export async function runPolymarketPrivateReadCommand(
  subcommand: string,
  context: PolymarketPrivateCommandContext,
): Promise<boolean> {
  if (!PRIVATE_READ_COMMANDS.has(subcommand)) return false;
  const subArgs = context.args.slice(2);
  if (subcommand === 'portfolio' || subcommand === 'balance') {
    const payload = await fetchPortfolio(context.factory);
    emit(payload, context, () => renderPolymarketSection(payload, context.output));
  } else if (subcommand === 'debug') {
    const payload = await fetchDebug(context.factory);
    emit(payload, context, () => renderDebug(payload, context.output));
  } else if (subcommand === 'auth-health') {
    const payload = await fetchAuthHealth(context.factory, context.env);
    emit(payload, context, () => renderAuthHealth(payload, context.output));
  } else if (subcommand === 'collateral-probe') {
    const rawSignatureType = parseOptionValue(subArgs, '--signature-type');
    const parsedSignatureType = rawSignatureType === undefined ? undefined : Number(rawSignatureType);
    const payload = await fetchCollateralProbe(context.factory, context.env, {
      funderAddress: parseOptionValue(subArgs, '--address'),
      signatureType: Number.isInteger(parsedSignatureType) ? parsedSignatureType : undefined,
    });
    emit(payload, context);
  } else if (subcommand === 'modes') {
    const payload = await probeModeCandidates(
      polymarketModeCandidates(context.env), context.factory, context.env,
      context.args.includes('--collateral-only') || context.args.includes('--light'),
    );
    emit(payload, context);
  } else if (subcommand === 'probe') {
    const address = parseOptionValue(subArgs, '--address');
    const payload = address
      ? await fetchProbe(address, context.factory, context.env)
      : { ok: false, address: '', results: [], error: 'Missing --address <0x...>' };
    emit(payload, context);
  } else if (subcommand === 'investigate') {
    emit(await fetchInvestigate(subArgs, context.factory, context.env), context);
  } else if (subcommand === 'topology') {
    const adapter = context.factory();
    const roles = polymarketAddressRoles(context.env);
    try {
      roles.signer = await adapter.getSignerAddress();
    } catch {
      roles.signer = null;
    }
    emit({ ok: true, roles, modeCandidates: polymarketModeCandidates(context.env) }, context);
  } else if (subcommand === 'trace') {
    emit(fetchTrace(subArgs), context);
  }
  return true;
}
