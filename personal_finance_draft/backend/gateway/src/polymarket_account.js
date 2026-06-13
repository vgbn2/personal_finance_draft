const { resolveSignatureType: resolvePolymarketSignatureType, resolveWalletAddress: resolvePolymarketWalletAddress } = require('../../../shared/lib/brokers/polymarket_env.js');

function getConfiguredWalletAddress(env = process.env) {
  return resolvePolymarketWalletAddress(env);
}

function isValidPrivateKey(privateKey) {
  return typeof privateKey === 'string' && /^0x[0-9a-fA-F]{64}$/.test(privateKey);
}

function assertValidPrivateKey(privateKey, fieldName = 'POLYMARKET_PRIVATE_KEY') {
  if (!privateKey) {
    throw new Error(`${fieldName} not set`);
  }
  if (!isValidPrivateKey(privateKey)) {
    throw new Error(`${fieldName} is malformed; expected 0x followed by 64 hex characters`);
  }
}

function getConfiguredSignatureType(env = process.env, funderAddress = getConfiguredWalletAddress(env)) {
  const resolved = resolvePolymarketSignatureType(env);
  if (resolved !== 0) {
    return resolved;
  }
  if (env.PROXY_ADDRESS && funderAddress && String(funderAddress).toLowerCase() === String(env.PROXY_ADDRESS).toLowerCase()) {
    return 1;
  }
  if (funderAddress) return 2;
  return undefined;
}

function polymarketModeCandidates(env = process.env) {
  const profile = env.PROFILE_ADDRESS || undefined;
  const relayer = env.RELAYER_API_KEY_ADDRESS || undefined;
  const proxy = env.PROXY_ADDRESS || undefined;
  const deposit = env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || undefined;
  const candidates = [
    { name: 'sig0-none', signatureType: 0, funderAddress: undefined },
    { name: 'sig1-proxy', signatureType: 1, funderAddress: proxy },
    { name: 'sig2-deposit', signatureType: 2, funderAddress: deposit },
    { name: 'sig1-profile', signatureType: 1, funderAddress: profile },
    { name: 'sig2-profile', signatureType: 2, funderAddress: profile },
    { name: 'sig1-relayer', signatureType: 1, funderAddress: relayer },
    { name: 'sig2-relayer', signatureType: 2, funderAddress: relayer },
  ];

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.signatureType}:${String(candidate.funderAddress || '')}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return candidate.signatureType === 0 || Boolean(candidate.funderAddress);
  });
}

function polymarketProbeCandidates(address) {
  const normalized = String(address || '').trim();
  if (!normalized) return [];
  return [
    { name: 'sig1-address', signatureType: 1, funderAddress: normalized },
    { name: 'sig2-address', signatureType: 2, funderAddress: normalized },
  ];
}

function polymarketAddressRoles(env = process.env) {
  return {
    signer: null,
    profile: env.PROFILE_ADDRESS || null,
    relayer: env.RELAYER_API_KEY_ADDRESS || null,
    proxy: env.PROXY_ADDRESS || null,
    deposit: env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || null,
    configuredFunder: getConfiguredWalletAddress(env) || null,
    configuredSignatureType: getConfiguredSignatureType(env),
  };
}

function buildTradePagination(pagesFetched, tradesFetched, pageCap, nextCursor) {
  const truncated = Boolean(nextCursor && tradesFetched > 0 && pagesFetched >= pageCap);
  return {
    pages_fetched: pagesFetched,
    trades_fetched: tradesFetched,
    page_cap: pageCap,
    truncated,
    ...(truncated ? { next_cursor: nextCursor } : {}),
  };
}

function classifyPolymarketAccountState({
  signatureType,
  funderAddress,
  pUSDBalance,
  allowance,
  openOrderCount,
  tradeCount,
} = {}) {
  if (pUSDBalance > 0) return 'funded';
  if ((signatureType === 2 || signatureType === 3) && !funderAddress) return 'deposit_wallet_missing';
  if ((signatureType === 2 || signatureType === 3) && allowance > 0) return 'allowance_present_balance_zero';
  if ((signatureType === 2 || signatureType === 3) && openOrderCount === 0 && tradeCount === 0) return 'deposit_wallet_unfunded_or_wrong_wallet';
  if ((openOrderCount > 0 || tradeCount > 0) && pUSDBalance === 0) return 'historical_account_activity_balance_zero';
  return 'balance_zero';
}

function buildPolymarketDebugSnapshot({
  signerAddress,
  funderAddress,
  signatureType,
  collateral,
  openOrders,
  positions,
  tradePagination,
} = {}) {
  const balance = Number(collateral?.balance ?? 0);
  const allowance = Number(collateral?.allowance ?? 0);
  const openOrderCount = Array.isArray(openOrders) ? openOrders.length : 0;
  const positionCount = Array.isArray(positions) ? positions.length : 0;
  const tradeCount = Number(tradePagination?.trades_fetched ?? 0);
  const accountState = classifyPolymarketAccountState({
    signatureType,
    funderAddress,
    pUSDBalance: balance,
    allowance,
    openOrderCount,
    tradeCount,
  });

  const notes = [];
  if (signatureType === 1) {
    notes.push('POLY_PROXY mode expects balance and approvals on the proxy wallet funder address.');
  }
  if (signatureType === 2) {
    notes.push('POLY_GNOSIS_SAFE deposit-wallet mode expects pUSD and approvals on the funder wallet.');
  }
  if (signatureType === 3) {
    notes.push('POLY_1271 legacy deposit-wallet mode is kept for compatibility only.');
  }
  if (balance === 0) {
    notes.push('Zero pUSD on CLOB usually means the funded wallet or collateral sync path is wrong, or the deposit wallet is unfunded.');
  }
  if (allowance === 0) {
    notes.push((signatureType === 2 || signatureType === 3)
      ? 'Allowance is zero; deposit-wallet approvals must come from the deposit wallet, not the owner EOA.'
      : 'Allowance is zero; the active funder wallet still needs the required trading approvals for this account mode.');
  }

  return {
    ok: true,
    signerAddress: signerAddress || null,
    funderAddress: funderAddress || null,
    signatureType: signatureType ?? null,
    walletMode: signatureType === 2 ? 'POLY_GNOSIS_SAFE' : signatureType === 3 ? 'POLY_1271' : signatureType === 1 ? 'POLY_PROXY' : signatureType === 0 ? 'EOA' : signatureType ?? 'unknown',
    collateral: {
      balance,
      allowance,
      asset_type: collateral?.asset_type || 'COLLATERAL',
    },
    openOrderCount,
    positionCount,
    tradePagination: tradePagination || null,
    accountState,
    notes,
  };
}

function buildPolymarketCollateralProbeSnapshot({
  signerAddress,
  funderAddress,
  signatureType,
  collateral,
} = {}) {
  const balance = Number(collateral?.balance ?? 0);
  const allowance = Number(collateral?.allowance ?? 0);
  let accountState = 'balance_zero';
  if (balance > 0) accountState = 'funded';
  else if ((signatureType === 2 || signatureType === 3) && !funderAddress) accountState = 'deposit_wallet_missing';
  else if (allowance > 0) accountState = 'allowance_present_balance_zero';

  return {
    ok: true,
    signerAddress: signerAddress || null,
    funderAddress: funderAddress || null,
    signatureType: signatureType ?? null,
    walletMode: signatureType === 2 ? 'POLY_GNOSIS_SAFE' : signatureType === 3 ? 'POLY_1271' : signatureType === 1 ? 'POLY_PROXY' : signatureType === 0 ? 'EOA' : signatureType ?? 'unknown',
    collateral: {
      balance,
      allowance,
      asset_type: collateral?.asset_type || 'COLLATERAL',
    },
    accountState,
  };
}

module.exports = {
  assertValidPrivateKey,
  buildPolymarketCollateralProbeSnapshot,
  buildPolymarketDebugSnapshot,
  buildTradePagination,
  classifyPolymarketAccountState,
  getConfiguredSignatureType,
  getConfiguredWalletAddress,
  isValidPrivateKey,
  polymarketAddressRoles,
  polymarketModeCandidates,
  polymarketProbeCandidates,
};
