// Check on-chain USDC/pUSD balances for all Polymarket wallet addresses
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..');
const require   = createRequire(import.meta.url);

const dotenv = require(path.join(repoRoot, 'backend/gateway/node_modules/dotenv/lib/main.js'));
dotenv.config({ path: path.join(repoRoot, '.env') });

const { ethers } = require(path.join(repoRoot, 'backend/gateway/node_modules/ethers/lib/index.js'));

const provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/polygon');
const erc20 = (addr) => new ethers.Contract(addr, [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
], provider);

const TOKENS = {
  'USDC.e (bridged)': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  'USDC (native)':    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'pUSD (CTF)':       '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045', // Polymarket's pUSD
};

const WALLETS = {
  'PROXY (signing)':  '0x8010ba96136dB68D7F0eb71a30d2FC296f9283d8',
  'DEPOSIT address':  '0x0f6AAd6a042cB1F2A0F297da4238efd0252852DB',
  'BASE EOA':         '0xF67B0FC0B77d29DA5B890F78DB33dAF86d68AEaD',
};

console.log('\n=== On-chain balances (Polygon) ===\n');

for (const [walletName, walletAddr] of Object.entries(WALLETS)) {
  console.log(`${walletName} (${walletAddr}):`);
  for (const [tokenName, tokenAddr] of Object.entries(TOKENS)) {
    try {
      const contract = erc20(tokenAddr);
      const [raw, dec] = await Promise.all([contract.balanceOf(walletAddr), contract.decimals()]);
      const bal = raw.toNumber() / 10 ** dec.toNumber();
      if (bal > 0) console.log(`  ✓ ${tokenName}: ${bal.toFixed(2)}`);
      else         console.log(`    ${tokenName}: 0.00`);
    } catch (e) {
      console.log(`    ${tokenName}: (error: ${e.message})`);
    }
  }
  console.log();
}
