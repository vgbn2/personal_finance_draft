// Check open positions and any free balance
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..');
const require   = createRequire(import.meta.url);

const dotenv = require(path.join(repoRoot, 'backend/gateway/node_modules/dotenv/lib/main.js'));
dotenv.config({ path: path.join(repoRoot, '.env') });

const { ethers }    = require(path.join(repoRoot, 'backend/gateway/node_modules/ethers/lib/index.js'));
const { ClobClient } = require(path.join(repoRoot, 'backend/gateway/node_modules/@polymarket/clob-client/dist/index.js'));

const pk = process.env.POLYMARKET_PRIVATE_KEY;
const wallet = new ethers.Wallet(pk);
const client = new ClobClient('https://clob.polymarket.com', 137, wallet, {
  key:        process.env.POLYMARKET_API_KEY,
  secret:     process.env.POLYMARKET_API_SECRET,
  passphrase: process.env.POLYMARKET_API_PASSPHRASE,
});

console.log('Wallet:', wallet.address, '\n');

// Free cash (pUSD collateral)
const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
console.log('Free pUSD (cash):  ', Number(bal?.balance ?? 0).toFixed(2));

// Open orders
try {
  const orders = await client.getOpenOrders();
  const list = Array.isArray(orders) ? orders : orders?.data ?? [];
  console.log('\nOpen orders:', list.length);
  list.forEach(o => console.log(`  ${o.asset_id} ${o.side} ${o.size_remaining} @ ${o.price}`));
} catch (e) {
  console.log('Open orders: (error)', e.message);
}

// Recent trades
try {
  const trades = await client.getTrades({ maker_address: wallet.address.toLowerCase() });
  const list = Array.isArray(trades) ? trades : trades?.data ?? [];
  console.log('\nRecent trades:', list.length);
  list.slice(0, 5).forEach(t =>
    console.log(`  ${t.market} ${t.side} ${t.size} @ ${t.price} — ${t.status}`)
  );
} catch (e) {
  console.log('Recent trades: (error)', e.message);
}
