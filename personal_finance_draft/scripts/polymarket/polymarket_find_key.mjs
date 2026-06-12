// Find which derivation path of your mnemonic produces the Polymarket auth wallet.
// Run: node scripts/polymarket_find_key.mjs "<your 12/24 word mnemonic here>"
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..');
const require   = createRequire(import.meta.url);
const { ethers } = require(path.join(repoRoot, 'backend/gateway/node_modules/ethers/lib/index.js'));

// From browser console: ctf_v2 migration_gate_evaluated → accountProfileAddress
const TARGETS = new Set([
  '0xf67b0fc0b77d29da5b890f78db33daf86d68aead',
  '0x8010ba96136db68d7f0eb71a30d2fc296f9283d8',
].map(a => a.toLowerCase()));

const mnemonic = process.argv[2];
if (!mnemonic) {
  console.error('Usage: node scripts/polymarket_find_key.mjs "<mnemonic phrase>"');
  process.exit(1);
}

// Validate mnemonic
if (!ethers.utils.isValidMnemonic(mnemonic)) {
  console.error('Invalid mnemonic — check spelling and word count (12 or 24 words).');
  process.exit(1);
}

const root = ethers.utils.HDNode.fromMnemonic(mnemonic);

const paths = [
  // Standard BIP44 Ethereum paths
  ...Array.from({ length: 10 }, (_, i) => `m/44'/60'/0'/0/${i}`),
  // Account variations
  ...Array.from({ length: 5 }, (_, i) => `m/44'/60'/${i}'/0/0`),
  // Polygon chain id (137)
  ...Array.from({ length: 5 }, (_, i) => `m/44'/137'/0'/0/${i}`),
  // Legacy / non-hardened paths
  `m/44'/60'/0'`,
  `m/44'/60'/0'/0`,
  `m/44'/60'/0'/1/0`,
  // Magic-specific: they sometimes use the root key directly
  `m`,
];

console.log(`\nSearching for: ${[...TARGETS].join(' or ')}`);
console.log('─'.repeat(60));

let found = false;
for (const derivPath of paths) {
  try {
    const node = root.derivePath(derivPath);
    const addr = node.address.toLowerCase();
    const match = TARGETS.has(addr);
    if (match) {
      console.log(`\n✓ FOUND at path: ${derivPath}`);
      console.log(`  Address:     ${node.address}`);
      console.log(`  Private key: ${node.privateKey}`);
      console.log('\nAdd to .env:');
      console.log(`  POLYMARKET_PRIVATE_KEY=${node.privateKey}`);
      found = true;
      break;
    }
    console.log(`  ${derivPath.padEnd(28)} → ${node.address}`);
  } catch (e) {
    console.log(`  ${derivPath.padEnd(28)} → (error: ${e.message})`);
  }
}

if (!found) {
  console.log('\n✗ Target address not found in any common derivation path.');
  console.log('\nThis means one of:');
  console.log('  1. The mnemonic is for a different wallet entirely.');
  console.log('  2. Magic uses MPC key shares — the "phrase" is not a standard BIP39 mnemonic.');
  console.log('  3. Polymarket\'s proxy wallet (0x8010ba...) was created by a contract, not derived.');
  console.log('\nAlternative: export the private key directly from Magic.');
  console.log('  → Go to polymarket.com → click your profile → Settings → Export Private Key');
  console.log('     (available on some Magic wallet versions via the "reveal key" flow)');
}
