// @ts-ignore
import { createClobClient } from './clob_factory';
import {
  buildPolymarketCollateralProbeSnapshot,
  buildPolymarketDebugSnapshot,
  classifyPolymarketGatewayError,
  describeGatewayError,
  normalizePolymarketApiCreds,
  polymarketAddressRoles,
  polymarketModeCandidates,
  polymarketProbeCandidates,
  summarizePolymarketApiCredShape,
  traceCsvFile,
} from './polymarket';
import { PolymarketAdapter } from './polymarket_execution';
// @ts-ignore
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');

const ansi = {
  reset:       '\x1b[0m',
  bold:        '\x1b[1m',
  dim:         '\x1b[2m',
  red:         '\x1b[31m',
  green:       '\x1b[32m',
  yellow:      '\x1b[33m',
  magenta:     '\x1b[35m',
  boldGreen:   '\x1b[1;32m',
  boldYellow:  '\x1b[1;33m',
  boldMagenta: '\x1b[1;35m',
  boldCyan:    '\x1b[1;36m',
} as const;

export interface Position {
  symbol: string;
  assetId?: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  cost_basis_unavailable?: boolean;
  question?: string;
  outcome?: string;
  lifecycle?: 'active' | 'ended' | 'unknown';
  currentPrice?: number | null;
  valuationStatus?: 'live_quote' | 'unavailable';
  resolutionPrice?: number | null;
  historyStatus?: 'complete' | 'trade_history_truncated';
}

export interface PolymarketTradePagination {
  pages_fetched: number;
  trades_fetched: number;
  page_cap: number;
  truncated: boolean;
  next_cursor?: string;
}

export interface PolymarketSection {
  ok: boolean;
  configured: boolean;
  lastUpdated?: string;
  balance?: Record<string, number>;
  openOrders?: Position[];
  positions?: Position[];
  trade_pagination?: PolymarketTradePagination;
  error?: string;
}

export interface PolymarketDebugSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  collateral?: { balance: number; allowance: number; asset_type: string };
  openOrderCount?: number;
  positionCount?: number;
  tradePagination?: PolymarketTradePagination | null;
  accountState?: string;
  notes?: string[];
  error?: string;
}

export interface PolymarketModeProbeResult {
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

export interface PolymarketCollateralProbeSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  collateral?: { balance: number; allowance: number; asset_type: string };
  accountState?: string;
  error?: string;
}

export interface PolymarketAuthStage {
  ok: boolean;
  count?: number;
  accountState?: string;
  collateral?: { balance: number; allowance: number; asset_type: string };
  tradePagination?: PolymarketTradePagination | null;
  error?: string;
  error_category?: string;
  suggestion?: string;
}

export interface PolymarketAuthHealthSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  env: {
    hasPrivateKey: boolean;
    hasApiCreds: boolean;
    hasDepositAddress: boolean;
    hasProxyAddress: boolean;
    hasFunderAddress: boolean;
  };
  stages?: {
    collateral: PolymarketAuthStage;
    open_orders: PolymarketAuthStage;
    positions: PolymarketAuthStage;
  };
  likelyFailureStage?: 'not_configured' | 'collateral' | 'open_orders' | 'positions' | null;
  note?: string;
  error?: string;
}

export function fmtQty(n: number): string {
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
}

export function fmtUsd(n: number): string { return '$' + n.toFixed(2); }

export function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${fmtUsd(n)}`;
}

export function walletModeLabel(signatureType?: number | null): string {
  if (signatureType === 3) return 'POLY_1271';
  if (signatureType === 2) return 'POLY_GNOSIS_SAFE';
  if (signatureType === 1) return 'POLY_PROXY';
  if (signatureType === 0) return 'EOA';
  return 'unknown';
}

export function buildPolymarketEnvPresence(env = process.env) {
  return {
    hasPrivateKey: Boolean(String(env.POLYMARKET_PRIVATE_KEY || '').trim()),
    hasApiCreds: Boolean(
      String(env.POLYMARKET_API_KEY || '').trim()
      && String(env.POLYMARKET_API_SECRET || '').trim()
      && String(env.POLYMARKET_API_PASSPHRASE || '').trim()
    ),
    hasDepositAddress: Boolean(String(env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || '').trim()),
    hasProxyAddress: Boolean(String(env.PROXY_ADDRESS || '').trim()),
    hasFunderAddress: Boolean(String(env.POLYMARKET_FUNDER_ADDRESS || '').trim()),
  };
}

export function renderPolymarketSection(pm: PolymarketSection) {
  console.log(`\n${ansi.boldMagenta}Polymarket Portfolio${ansi.reset}`);
  if (!pm.configured) {
    console.log(`  ${ansi.yellow}Not configured — set POLYMARKET_PRIVATE_KEY + API credentials${ansi.reset}`);
    return;
  }
  if (!pm.ok) {
    console.log(`  ${ansi.red}Error: ${pm.error}${ansi.reset}`);
    return;
  }

  const pusdBalance = pm.balance?.pUSD ?? 0;
  const ts = pm.lastUpdated ? new Date(pm.lastUpdated).toLocaleTimeString() : '?';
  console.log(`  ${ansi.bold}Balance${ansi.reset}  ${ansi.green}${fmtUsd(pusdBalance)}${ansi.reset}  ${ansi.dim}pUSD · ${ts}${ansi.reset}`);

  if (pm.openOrders && pm.openOrders.length > 0) {
    console.log(`\n  ${ansi.bold}Open Orders${ansi.reset}`);
    pm.openOrders.forEach((p) => {
      const label = p.symbol.length > 44 ? p.symbol.slice(0, 44) + '…' : p.symbol;
      console.log(`  ${ansi.dim}·${ansi.reset} ${label.padEnd(46)}  qty ${fmtQty(p.quantity).padStart(8)}  ${fmtUsd(p.marketValue).padStart(8)}`);
    });
  }

  const all = pm.positions ?? [];
  const named   = all.filter((p) => p.symbol.includes('…') || p.symbol.length > 6);
  const unknown = all.filter((p) => !p.symbol.includes('…') && p.symbol.length <= 6);

  if (named.length > 0) {
    const totalValue = named.reduce((s, p) => s + p.marketValue, 0);
    const totalPnl   = named.reduce((s, p) => s + p.unrealizedPl, 0);
    const pnlColor   = totalPnl >= 0 ? ansi.green : ansi.red;
    console.log(`\n  ${ansi.bold}Active Positions${ansi.reset}  ${ansi.dim}(${named.length} markets · total ${fmtUsd(totalValue)} · PnL ${pnlColor}${fmtPnl(totalPnl)}${ansi.reset}${ansi.dim})${ansi.reset}`);
    named.forEach((p) => {
      const plColor = p.unrealizedPl > 0 ? ansi.green : p.unrealizedPl < 0 ? ansi.red : ansi.dim;
      const label = p.symbol.length > 50 ? p.symbol.slice(0, 50) + '…' : p.symbol;
      console.log(
        `  ${ansi.dim}·${ansi.reset} ${label.padEnd(52)}` +
        `  ${ansi.dim}qty${ansi.reset} ${fmtQty(p.quantity).padStart(7)}` +
        `  ${fmtUsd(p.marketValue).padStart(7)}` +
        `  ${plColor}${fmtPnl(p.unrealizedPl).padStart(8)}${ansi.reset}`
      );
    });
  }

  if (unknown.length > 0) {
    const unValue = unknown.reduce((s, p) => s + p.marketValue, 0);
    console.log(`\n  ${ansi.dim}+ ${unknown.length} unnamed positions  (total ${fmtUsd(unValue)})${ansi.reset}`);
  }

  if (named.length === 0 && unknown.length === 0) {
    console.log('  No positions.');
  }
}

export async function fetchPolymarketPortfolio(): Promise<PolymarketSection> {
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return { ok: false, configured: false, error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const [balance, openOrders, filledPositions] = await Promise.all([
      adapter.getPortfolioBalance(),
      adapter.getOpenOrders(),
      adapter.getPositions(),
    ]);
    return { ok: true, configured: true, lastUpdated: new Date().toISOString(), balance, openOrders, positions: filledPositions, trade_pagination: adapter.getTradePagination() };
  } catch (e: any) {
    return { ok: false, configured: true, error: e.message };
  }
}

export function renderPolymarketDebugSection(snapshot: PolymarketDebugSection) {
  console.log(`\n${ansi.boldMagenta}--- POLYMARKET DEBUG ---${ansi.reset}`);
  if (!snapshot.configured) {
    console.log(`  ${ansi.yellow}Not configured — set POLYMARKET_PRIVATE_KEY + POLYMARKET_API_KEY/SECRET/PASSPHRASE${ansi.reset}`);
    return;
  }
  if (!snapshot.ok) {
    console.log(`  ${ansi.red}Error: ${snapshot.error}${ansi.reset}`);
    return;
  }
  console.log(`  Signer: ${snapshot.signerAddress}`);
  console.log(`  Funder: ${snapshot.funderAddress ?? 'none'}`);
  console.log(`  Signature Type: ${snapshot.signatureType ?? 'unset'} (${snapshot.walletMode})`);
  console.log(`  Collateral: balance=${snapshot.collateral?.balance ?? 0} allowance=${snapshot.collateral?.allowance ?? 0}`);
  console.log(`  Open Orders: ${snapshot.openOrderCount ?? 0}`);
  console.log(`  Filled Positions: ${snapshot.positionCount ?? 0}`);
  console.log(`  Account State: ${snapshot.accountState}`);
  if (snapshot.notes && snapshot.notes.length > 0) {
    snapshot.notes.forEach((note) => console.log(`  Note: ${note}`));
  }
}

export function renderPolymarketAuthHealthSection(health: PolymarketAuthHealthSection) {
  console.log(`\n${ansi.boldMagenta}--- POLYMARKET AUTH HEALTH ---${ansi.reset}`);
  console.log(`  Configured: ${health.configured ? ansi.green + 'yes' : ansi.red + 'no'}${ansi.reset}`);
  console.log(`  Env: private_key=${health.env.hasPrivateKey ? 'yes' : 'no'} api_creds=${health.env.hasApiCreds ? 'yes' : 'no'} funder=${health.env.hasFunderAddress ? 'yes' : 'no'} deposit=${health.env.hasDepositAddress ? 'yes' : 'no'} proxy=${health.env.hasProxyAddress ? 'yes' : 'no'}`);
  if (!health.configured) {
    if (health.note) console.log(`  Note: ${health.note}`);
    return;
  }
  console.log(`  Signer: ${health.signerAddress ?? 'none'}`);
  console.log(`  Funder: ${health.funderAddress ?? 'none'}`);
  console.log(`  Signature Type: ${health.signatureType ?? 'unset'} (${health.walletMode ?? walletModeLabel(health.signatureType)})`);
  if (health.stages) {
    const stages: Array<[string, PolymarketAuthStage]> = [
      ['collateral', health.stages.collateral],
      ['open_orders', health.stages.open_orders],
      ['positions', health.stages.positions],
    ];
    for (const [name, stage] of stages) {
      const okLabel = stage.ok ? `${ansi.green}ok${ansi.reset}` : `${ansi.red}fail${ansi.reset}`;
      const parts = [`  ${name}: ${okLabel}`];
      if (typeof stage.count === 'number') parts.push(`count=${stage.count}`);
      if (stage.accountState) parts.push(`state=${stage.accountState}`);
      if (stage.collateral) {
        parts.push(`balance=${stage.collateral.balance}`);
        parts.push(`allowance=${stage.collateral.allowance}`);
      }
      console.log(parts.join('  '));
      if (!stage.ok && stage.error) console.log(`    error: ${stage.error}`);
      if (!stage.ok && stage.suggestion) console.log(`    suggestion: ${stage.suggestion}`);
    }
  }
  if (health.likelyFailureStage) {
    console.log(`  Likely failure stage: ${health.likelyFailureStage}`);
  }
  if (health.note) console.log(`  Note: ${health.note}`);
}

export async function fetchPolymarketDebug(): Promise<PolymarketDebugSection> {
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return { ok: false, configured: false, error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    const [collateral, openOrders, filledPositions] = await Promise.all([
      adapter.getCollateralStatus(),
      adapter.getOpenOrders(),
      adapter.getPositions(),
    ]);
    const identity = adapter.getAccountIdentity();
    return buildPolymarketDebugSnapshot({
      signerAddress,
      funderAddress: identity.funderAddress,
      signatureType: identity.signatureType,
      collateral,
      openOrders,
      positions: filledPositions,
      tradePagination: adapter.getTradePagination(),
    });
  } catch (e: any) {
    return { ok: false, configured: true, error: describeGatewayError(e) };
  }
}

export async function fetchPolymarketCollateralProbe(options: { funderAddress?: string; signatureType?: number } = {}): Promise<PolymarketCollateralProbeSection> {
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return { ok: false, configured: false, error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    if (options.funderAddress !== undefined) {
      (adapter as any).funderAddress = options.funderAddress;
    }
    if (options.signatureType !== undefined) {
      (adapter as any).signatureType = options.signatureType;
    }
    const collateral = await adapter.getCollateralStatus();
    const identity = adapter.getAccountIdentity();
    return buildPolymarketCollateralProbeSnapshot({
      signerAddress,
      funderAddress: identity.funderAddress,
      signatureType: identity.signatureType,
      collateral,
    });
  } catch (e: any) {
    return { ok: false, configured: true, error: describeGatewayError(e) };
  }
}

export async function fetchPolymarketAuthHealth(): Promise<PolymarketAuthHealthSection> {
  const env = buildPolymarketEnvPresence(process.env);
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return {
      ok: false,
      configured: false,
      env,
      likelyFailureStage: 'not_configured',
      note: 'Set POLYMARKET_PRIVATE_KEY plus POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE.',
    };
  }

  const identity = adapter.getAccountIdentity();
  let signerAddress: string | null = null;
  try {
    const { Wallet } = await import('ethers');
    signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
  } catch {}

  const stages: PolymarketAuthHealthSection['stages'] = {
    collateral: { ok: false },
    open_orders: { ok: false },
    positions: { ok: false },
  };

  try {
    const collateral = await adapter.getCollateralStatus();
    const snapshot = buildPolymarketCollateralProbeSnapshot({
      signerAddress,
      funderAddress: identity.funderAddress,
      signatureType: identity.signatureType,
      collateral,
    });
    stages.collateral = {
      ok: true,
      accountState: snapshot.accountState,
      collateral: snapshot.collateral,
    };
  } catch (e: any) {
    stages.collateral = { ok: false, ...classifyPolymarketGatewayError(e) };
  }

  try {
    const openOrders = await adapter.getOpenOrders();
    stages.open_orders = { ok: true, count: openOrders.length };
  } catch (e: any) {
    stages.open_orders = { ok: false, ...classifyPolymarketGatewayError(e) };
  }

  try {
    const positions = await adapter.getPositions();
    stages.positions = {
      ok: true,
      count: positions.length,
      tradePagination: adapter.getTradePagination() ?? null,
    };
  } catch (e: any) {
    stages.positions = { ok: false, ...classifyPolymarketGatewayError(e) };
  }

  const likelyFailureStage = !stages.collateral.ok
    ? 'collateral'
    : !stages.open_orders.ok
      ? 'open_orders'
      : !stages.positions.ok
        ? 'positions'
        : null;

  return {
    ok: !likelyFailureStage,
    configured: true,
    signerAddress,
    funderAddress: identity.funderAddress ?? null,
    signatureType: identity.signatureType ?? null,
    walletMode: walletModeLabel(identity.signatureType),
    env,
    stages,
    likelyFailureStage,
    note: likelyFailureStage
      ? 'This is a no-spend read-only health probe. Fix the first failing stage before retrying live orders.'
      : 'Current credentials and wallet mode passed the no-spend read surfaces.',
  };
}

export async function fetchPolymarketModes(options: { collateralOnly?: boolean } = {}): Promise<{ ok: boolean; signerAddress?: string | null; results: PolymarketModeProbeResult[]; error?: string }> {
  const baseAdapter = new PolymarketAdapter();
  const configured = baseAdapter['hasCredentials']();
  if (!configured) {
    return { ok: false, results: [], error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    const candidates = polymarketModeCandidates(process.env);
    const results: PolymarketModeProbeResult[] = [];
    for (const candidate of candidates) {
      const adapter = new PolymarketAdapter({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        apiKey: process.env.POLYMARKET_API_KEY,
        apiSecret: process.env.POLYMARKET_API_SECRET,
        apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE,
      });
      (adapter as any).funderAddress = candidate.funderAddress;
      (adapter as any).signatureType = candidate.signatureType;
      try {
        const collateral = await adapter.getCollateralStatus();
        const [openOrders, positions] = options.collateralOnly
          ? [[], []]
          : await Promise.all([
            adapter.getOpenOrders(),
            adapter.getPositions(),
          ]);
        const snapshot = buildPolymarketDebugSnapshot({
          signerAddress,
          funderAddress: candidate.funderAddress,
          signatureType: candidate.signatureType,
          collateral,
          openOrders,
          positions,
          tradePagination: adapter.getTradePagination(),
        });
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: true,
          signerAddress,
          walletMode: snapshot.walletMode,
          collateral: snapshot.collateral,
          openOrderCount: options.collateralOnly ? null : snapshot.openOrderCount,
          positionCount: options.collateralOnly ? null : snapshot.positionCount,
          accountState: snapshot.accountState,
        });
      } catch (e: any) {
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: false,
          signerAddress,
          error: describeGatewayError(e),
        });
      }
    }
    return { ok: true, signerAddress, results };
  } catch (e: any) {
    return { ok: false, results: [], error: describeGatewayError(e) };
  }
}

export async function fetchPolymarketProbe(address: string): Promise<{ ok: boolean; signerAddress?: string | null; address: string; results: PolymarketModeProbeResult[]; error?: string }> {
  const baseAdapter = new PolymarketAdapter();
  const configured = baseAdapter['hasCredentials']();
  if (!configured) {
    return { ok: false, address, results: [], error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    const results: PolymarketModeProbeResult[] = [];
    for (const candidate of polymarketProbeCandidates(address)) {
      const adapter = new PolymarketAdapter({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        apiKey: process.env.POLYMARKET_API_KEY,
        apiSecret: process.env.POLYMARKET_API_SECRET,
        apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE,
      });
      (adapter as any).funderAddress = candidate.funderAddress;
      (adapter as any).signatureType = candidate.signatureType;
      try {
        const [collateral, openOrders, positions] = await Promise.all([
          adapter.getCollateralStatus(),
          adapter.getOpenOrders(),
          adapter.getPositions(),
        ]);
        const snapshot = buildPolymarketDebugSnapshot({
          signerAddress,
          funderAddress: candidate.funderAddress,
          signatureType: candidate.signatureType,
          collateral,
          openOrders,
          positions,
          tradePagination: adapter.getTradePagination(),
        });
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: true,
          signerAddress,
          walletMode: snapshot.walletMode,
          collateral: snapshot.collateral,
          openOrderCount: snapshot.openOrderCount,
          positionCount: snapshot.positionCount,
          accountState: snapshot.accountState,
        });
      } catch (e: any) {
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: false,
          signerAddress,
          error: describeGatewayError(e),
        });
      }
    }
    return { ok: true, signerAddress, address, results };
  } catch (e: any) {
    return { ok: false, address, results: [], error: describeGatewayError(e) };
  }
}

export async function probeCandidateSet(addresses: string[]): Promise<{ ok: boolean; signerAddress?: string | null; probes: any[]; error?: string }> {
  const unique = Array.from(new Set(addresses.map((value) => String(value || '').trim()).filter(Boolean)));
  if (unique.length === 0) return { ok: true, probes: [] };
  const first = await fetchPolymarketProbe(unique[0]);
  const signerAddress = first.signerAddress;
  const probes = [first];
  for (const address of unique.slice(1)) {
    probes.push(await fetchPolymarketProbe(address));
  }
  return { ok: true, signerAddress, probes };
}

export async function fetchPolymarketTopology(): Promise<any> {
  const roles = polymarketAddressRoles(process.env);
  try {
    const { Wallet } = await import('ethers');
    roles.signer = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
  } catch {
    roles.signer = null;
  }
  return {
    ok: true,
    roles,
    modeCandidates: polymarketModeCandidates(process.env),
  };
}

export function parseOptionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

export async function withCapturedSdkRequestErrors<T>(run: () => Promise<T>): Promise<{ result: T; requestErrors: any[] }> {
  const originalConsoleError = console.error;
  const requestErrors: any[] = [];
  console.error = (...args: any[]) => {
    if (args[0] === 'request error' && args[1] && typeof args[1] === 'object') {
      requestErrors.push(args[1]);
      return;
    }
    originalConsoleError(...args);
  };
  try {
    const result = await run();
    return { result, requestErrors };
  } finally {
    console.error = originalConsoleError;
  }
}

export async function derivePolymarketApiCreds(client: any): Promise<{
  creds: { key: string; secret: string; passphrase: string };
  source: 'created' | 'derived';
  createRequestErrors: any[];
  deriveRequestErrors: any[];
}> {
  const createAttempt = await withCapturedSdkRequestErrors(() => client.createApiKey());
  const createdCreds = normalizePolymarketApiCreds(createAttempt.result);
  if (createdCreds) {
    return {
      creds: createdCreds,
      source: 'created',
      createRequestErrors: createAttempt.requestErrors,
      deriveRequestErrors: [],
    };
  }

  const deriveAttempt = await withCapturedSdkRequestErrors(() => client.deriveApiKey());
  const derivedCreds = normalizePolymarketApiCreds(deriveAttempt.result);
  if (derivedCreds) {
    return {
      creds: derivedCreds,
      source: 'derived',
      createRequestErrors: createAttempt.requestErrors,
      deriveRequestErrors: deriveAttempt.requestErrors,
    };
  }

  const createError = (createAttempt.result as any)?.error;
  const deriveError = (deriveAttempt.result as any)?.error;
  const createShape = summarizePolymarketApiCredShape(createAttempt.result);
  const deriveShape = summarizePolymarketApiCredShape(deriveAttempt.result);
  throw new Error(`Polymarket auth did not return usable credentials (createError=${JSON.stringify(createError ?? null)}, deriveError=${JSON.stringify(deriveError ?? null)}, createShape=${JSON.stringify(createShape)}, deriveShape=${JSON.stringify(deriveShape)})`);
}

export function inferRootAddressFromCsvPath(csvPath: string): string | undefined {
  const match = String(csvPath).match(/export-(0x[a-fA-F0-9]{40})\.csv$/i);
  return match ? match[1] : undefined;
}

export function fetchPolymarketTrace(args: string[]): any {
  const csvPath = parseOptionValue(args, '--csv');
  if (!csvPath) {
    return { ok: false, error: 'Missing --csv <path>' };
  }
  const rootAddress = parseOptionValue(args, '--address') || inferRootAddressFromCsvPath(csvPath);
  if (!rootAddress) {
    return { ok: false, error: 'Unable to infer root address; pass --address <0x...>' };
  }
  const summary = traceCsvFile(csvPath, rootAddress);
  return { ok: true, csvPath, ...summary };
}

export async function fetchPolymarketOrderBook(tokenId: string): Promise<any> {
  if (!tokenId) return { ok: false, error: 'Missing --token <id>' };
  try {
    const client = await createClobClient({});
    const book = await client.getOrderBook(tokenId);
    return { ok: true, tokenId, book };
  } catch (e: any) {
    const diagnostic = classifyPolymarketGatewayError(e);
    return { ok: false, tokenId, ...diagnostic };
  }
}

export async function fetchPolymarketPriceHistory(tokenId: string, interval = '1h', fidelity?: number): Promise<any> {
  if (!tokenId) return { ok: false, error: 'Missing --token <id>' };
  try {
    const client = await createClobClient({});
    const params: Record<string, any> = { market: tokenId, interval };
    if (typeof fidelity === 'number' && Number.isFinite(fidelity)) params.fidelity = fidelity;
    const history = await client.getPricesHistory(params);
    return { ok: true, tokenId, interval, fidelity: params.fidelity ?? null, history };
  } catch (e: any) {
    const diagnostic = classifyPolymarketGatewayError(e);
    return { ok: false, tokenId, ...diagnostic };
  }
}

export async function fetchPolymarketInvestigate(args: string[]): Promise<any> {
  const trace = fetchPolymarketTrace(args);
  if (!trace.ok) return trace;
  const rawLimit = parseOptionValue(args, '--limit');
  const limit = rawLimit ? Math.max(1, Number.parseInt(rawLimit, 10) || 3) : 3;
  const addresses = (trace.recommendedProbeAddresses || []).slice(0, limit);
  const probe = await probeCandidateSet(addresses);
  return {
    ok: true,
    trace,
    probe,
    summary: {
      candidateCount: addresses.length,
      fundedCandidates: (probe.probes || []).filter((entry: any) => Array.isArray(entry.results) && entry.results.some((result: any) => Number(result?.collateral?.balance ?? 0) > 0 || Number(result?.collateral?.allowance ?? 0) > 0)),
    },
  };
}
