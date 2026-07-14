// Show which address the current POLYMARKET_PRIVATE_KEY corresponds to
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..', '..');
const require   = createRequire(import.meta.url);

const { loadLocalEnv } = require(path.join(repoRoot, 'shared/lib/runtime/env.js'));
loadLocalEnv();

const { ethers } = require(path.join(repoRoot, 'backend/gateway/node_modules/ethers/lib/index.js'));

const pk = process.env.POLYMARKET_PRIVATE_KEY;
if (!pk) { console.error('POLYMARKET_PRIVATE_KEY not set'); process.exit(1); }

const wallet = new ethers.Wallet(pk);
console.log('POLYMARKET_PRIVATE_KEY address:', wallet.address);
console.log('BASE_EOA (needed):              0xF67B0FC0B77d29DA5B890F78DB33dAF86d68AEaD');
console.log('Match:', wallet.address.toLowerCase() === '0xf67b0fc0b77d29da5b890f78db33daf86d68aead');
