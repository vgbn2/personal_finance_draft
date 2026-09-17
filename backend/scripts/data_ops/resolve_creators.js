#!/usr/bin/env node
'use strict';

/**
 * CLI Tool: Resolve YouTube Creator Channel IDs from YAML configurations.
 * Usage: node backend/scripts/data_ops/resolve_creators.js [--save]
 */

const fs = require('fs');
const path = require('path');
const { resolveAllConfiguredCreators } = require('../../../shared/lib/analysis/creator_resolver');

async function main() {
  console.log('Resolving configured creators from YAML manifests...');
  const results = await resolveAllConfiguredCreators({ delayMs: 400 });

  console.table(results.map(r => ({
    ID: r.id,
    Name: r.name,
    Handle: r.handle,
    Channel_ID: r.resolved_channel_id || 'N/A',
    Status: r.http_status,
    Valid: r.is_valid ? 'YES' : 'NO'
  })));

  if (process.argv.includes('--save')) {
    const cacheDir = path.join(process.cwd(), 'storage', 'data', 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const outPath = path.join(cacheDir, 'creators_resolved.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Saved resolved creator mapping to: ${outPath}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Resolution failed:', err);
    process.exit(1);
  });
}
