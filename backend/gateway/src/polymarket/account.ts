import { resolveSignatureType as resolvePolymarketSignatureType, resolveWalletAddress as resolvePolymarketWalletAddress } from '../../../../shared/lib/brokers/polymarket_env.js';

export function getConfiguredWalletAddress(env: Record<string, any> = process.env): string | undefined {
  return resolvePolymarketWalletAddress(env);
}

export function isValidPrivateKey(privateKey: any): boolean {
  return typeof privateKey === 'string' && /^0x[0-9a-fA-F]{64}$/.test(privateKey);
}

export function assertValidPrivateKey(privateKey: any, fieldName = 'POLYMARKET_PRIVATE_KEY'): void {
  if (!privateKey) {
    throw new Error(`${fieldName} not set`);
  }
  if (!isValidPrivateKey(privateKey)) {
    throw new Error(`${fieldName} is malformed; expected 0x followed by 64 hex characters`);
  }
}

export function getConfiguredSignatureType(
  env: Record<string, any> = process.env,
  funderAddress = getConfiguredWalletAddress(env)
): number | undefined {
  if (env.PROXY_ADDRESS && funderAddress && String(funderAddress).toLowerCase() === String(env.PROXY_ADDRESS).toLowerCase()) {
    return 1;
  }
  const resolved = resolvePolymarketSignatureType(env);
  if (resolved !== 0) {
    return resolved;
  }
  if (funderAddress) return 2;
  return undefined;
}

export interface PolymarketCandidate {
  name: string;
  signatureType: number;
  funderAddress?: string;
}

export function polymarketModeCandidates(env: Record<string, any> = process.env): PolymarketCandidate[] {
  const profile = env.PROFILE_ADDRESS || undefined;
  const relayer = env.RELAYER_API_KEY_ADDRESS || undefined;
  const proxy = env.PROXY_ADDRESS || undefined;
  const deposit = env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || undefined;
  const candidates: PolymarketCandidate[] = [
    { name: 'sig0-none', signatureType: 0, funderAddress: undefined },
    { name: 'sig1-proxy', signatureType: 1, funderAddress: proxy },
    { name: 'sig2-deposit', signatureType: 2, funderAddress: deposit },
    { name: 'sig1-profile', signatureType: 1, funderAddress: profile },
    { name: 'sig2-profile', signatureType: 2, funderAddress: profile },
    { name: 'sig1-relayer', signatureType: 1, funderAddress: relayer },
    { name: 'sig2-relayer', signatureType: 2, funderAddress: relayer },
  ];

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.signatureType}:${String(candidate.funderAddress || '')}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function polymarketProbeCandidates(targetAddress: string): PolymarketCandidate[] {
  if (!targetAddress) return [];
  return [
    { name: 'sig1-address', signatureType: 1, funderAddress: targetAddress },
    { name: 'sig2-address', signatureType: 2, funderAddress: targetAddress },
  ];
}

export function polymarketAddressRoles(env: Record<string, any> = process.env) {
  const funder = getConfiguredWalletAddress(env);
  const sigType = getConfiguredSignatureType(env, funder);
  return {
    profile: env.PROFILE_ADDRESS || null,
    relayerApiKeyAddress: env.RELAYER_API_KEY_ADDRESS || null,
    proxy: env.PROXY_ADDRESS || null,
    deposit: env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || null,
    configuredFunder: funder || null,
    configuredSignatureType: sigType ?? null,
  };
}

export function buildTradePagination(
  pagesFetched: number,
  tradesFetched: number,
  pageCap: number,
  nextCursor: string | null = null
) {
  const res: any = {
    pages_fetched: pagesFetched,
    trades_fetched: tradesFetched,
    page_cap: pageCap,
    truncated: pagesFetched >= pageCap && !!nextCursor,
  };
  if (nextCursor !== null) {
    res.next_cursor = nextCursor;
  }
  return res;
}

export function buildPolymarketDebugSnapshot(params: {
  signerAddress?: string;
  funderAddress?: string;
  signatureType?: number;
  collateral?: any;
  openOrders?: any[];
  positions?: any[];
  tradePagination?: any;
}) {
  const { signerAddress, funderAddress, signatureType, collateral, openOrders, positions, tradePagination } = params;
  const walletModeMap: Record<number, string> = {
    0: 'EOA',
    1: 'POLY_PROXY',
    2: 'POLY_GNOSIS_SAFE',
  };
  const walletMode = signatureType !== undefined ? walletModeMap[signatureType] || 'UNKNOWN' : 'UNCONFIGURED';

  let accountState = 'unknown';
  if (collateral) {
    if (collateral.balance > 0) {
      accountState = 'funded';
    } else if (collateral.allowance > 0) {
      accountState = 'allowance_present_balance_zero';
    } else {
      accountState = 'unfunded';
    }
  }

  return {
    ok: true,
    signerAddress: signerAddress || null,
    funderAddress: funderAddress || null,
    signatureType: signatureType ?? null,
    walletMode,
    accountState,
    collateral: collateral || null,
    openOrderCount: Array.isArray(openOrders) ? openOrders.length : 0,
    positionCount: Array.isArray(positions) ? positions.length : 0,
    tradePagination: tradePagination || null,
  };
}

export function buildPolymarketCollateralProbeSnapshot(params: {
  signerAddress?: string;
  funderAddress?: string;
  signatureType?: number;
  collateral?: any;
}) {
  const debug = buildPolymarketDebugSnapshot(params);
  return {
    ok: debug.ok,
    signerAddress: debug.signerAddress,
    funderAddress: debug.funderAddress,
    signatureType: debug.signatureType,
    walletMode: debug.walletMode,
    accountState: debug.accountState,
    collateral: debug.collateral,
  };
}
