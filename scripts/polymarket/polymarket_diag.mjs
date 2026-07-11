// Polymarket balance diagnostics
// Run: node --experimental-vm-modules scripts/polymarket/polymarket_diag.mjs
//  OR: cd backend/gateway && node ../../scripts/polymarket/polymarket_diag.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const { loadLocalEnv } = require(path.join(repoRoot, 'shared/lib/runtime/env.js'));
loadLocalEnv();

const { ethers } = require(path.join(repoRoot, 'backend/gateway/node_modules/ethers/lib/index.js'));

const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon PoS

const pk = process.env.POLYMARKET_PRIVATE_KEY;
if (!pk) { console.error('POLYMARKET_PRIVATE_KEY not set'); process.exit(1); }

const wallet = new ethers.Wallet(pk);
console.log('\n=== Wallet ===');
console.log('Address (EOA):', wallet.address);
console.log('(Check this matches your Polymarket wallet on polymarket.com/profile)');

// Check USDC balance on Polygon directly
const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
const erc20Abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
const usdc = new ethers.Contract(USDC_POLYGON, erc20Abi, provider);

console.log('\n=== On-chain balances (Polygon PoS) ===');
try {
  const rawBal = await usdc.balanceOf(wallet.address);
  const decimals = await usdc.decimals();
  const humanBal = rawBal.toNumber() / 10 ** decimals.toNumber();
  console.log(`USDC.e balance (EOA):    ${humanBal.toFixed(2)} USDC  (raw: ${rawBal.toString()})`);
} catch (e) {
  console.error('On-chain USDC check failed:', e.message);
  console.log('(Network issue — check Polygon RPC connectivity)');
}

// Check CLOB API balance
const apiKey        = process.env.POLYMARKET_API_KEY;
const apiSecret     = process.env.POLYMARKET_API_SECRET;
const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;
const hasL2         = apiKey && apiSecret && apiPassphrase;

console.log('\n=== Polymarket CLOB API ===');
if (!hasL2) {
  console.log('L2 credentials not set — skipping CLOB balance check');
  console.log('Run: python polymarket_client.py   (then paste the output into .env)');
} else {
  try {
    const { ClobClient } = require(path.join(repoRoot, 'backend/gateway/node_modules/@polymarket/clob-client-v2/dist/index.js'));
    const signer = new ethers.Wallet(pk);
    const client = new ClobClient({
      host: 'https://clob.polymarket.com',
      chain: 137,
      signer,
      creds: {
        key: apiKey, secret: apiSecret, passphrase: apiPassphrase,
      },
      retryOnError: true,
    });

    const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
    console.log('Raw CLOB response:', JSON.stringify(bal));
    const raw = Number(bal?.balance ?? 0);
    console.log(`pUSD balance (Polymarket): ${raw.toFixed(2)} pUSD`);
    console.log(`Allowance:                 ${Number(bal?.allowance ?? 0).toFixed(2)}`);
  } catch (e) {
    console.error('CLOB API balance check failed:', e.message);
  }
}

console.log('\n=== Next steps ===');
console.log('If on-chain USDC = 0 AND CLOB balance = 0:');
console.log('  → Wallet has no funds. Deposit USDC at polymarket.com → Profile → Deposit.');
console.log('If on-chain USDC > 0 but CLOB balance = 0:');
console.log('  → USDC is in your wallet but not inside Polymarket. Complete deposit on polymarket.com.');
console.log('If CLOB balance > 0 but bot shows 0:');
console.log('  → Unit parsing bug — see raw response above.');
console.log('If address above does NOT match polymarket.com profile:');
console.log('  → Wrong private key — double-check POLYMARKET_PRIVATE_KEY in .env.');
