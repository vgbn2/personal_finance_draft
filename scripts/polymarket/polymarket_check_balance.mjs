// Check Polymarket balance using only L2 credentials (no private key needed for reads)
// Run: node scripts/polymarket_check_balance.mjs
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..');
const require   = createRequire(import.meta.url);

const dotenv = require(path.join(repoRoot, 'backend/gateway/node_modules/dotenv/lib/main.js'));
dotenv.config({ path: path.join(repoRoot, '.env') });

const apiKey        = process.env.POLYMARKET_API_KEY;
const apiSecret     = process.env.POLYMARKET_API_SECRET;
const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;

if (!apiKey || !apiSecret || !apiPassphrase) {
  console.error('Missing L2 credentials in .env — set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_API_PASSPHRASE');
  process.exit(1);
}

console.log('API_KEY:', apiKey.slice(0, 8) + '...');

// Call CLOB balance endpoint directly with L2 auth (no private key)
const { ethers } = require(path.join(repoRoot, 'backend/gateway/node_modules/ethers/lib/index.js'));
const { ClobClient } = require(path.join(repoRoot, 'backend/gateway/node_modules/@polymarket/clob-client/dist/index.js'));

const pk = process.env.POLYMARKET_PRIVATE_KEY;
if (!pk) { console.error('POLYMARKET_PRIVATE_KEY not set in .env'); process.exit(1); }
const wallet = new ethers.Wallet(pk);
console.log('Signing as:', wallet.address);

const client = new ClobClient('https://clob.polymarket.com', 137, wallet, {
  key:        apiKey,
  secret:     apiSecret,
  passphrase: apiPassphrase,
});

try {
  const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
  console.log('\nRaw response:', JSON.stringify(bal));
  console.log('pUSD balance:', Number(bal?.balance ?? 0).toFixed(2));
  console.log('Allowance:   ', Number(bal?.allowance ?? 0).toFixed(2));
} catch (e) {
  console.error('\nFailed:', e.message);
  console.log('\nIf you get 401/403 the L2 keys are wrong/expired.');
  console.log('If you get a valid response with 0, the account has no funds.');
}
