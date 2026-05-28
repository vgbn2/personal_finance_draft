#!/usr/bin/env node

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Database Pruning and Archiving Script
 * Usage: node scripts/data_ops/db_pruning.js [--days 30] [--archive ./data/archive]
 */

const { runMaintenance } = require('../../../shared/lib/db_pruning');

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

async function main() {
  const days = Number(getArg('--days', 30));
  const archive = getArg('--archive', null);
  
  console.log(`[MAINTENANCE] Starting database pruning (Retention: ${days} days)...`);
  
  try {
    const results = await runMaintenance(days, archive);
    
    console.log('\n[MAINTENANCE] Results:');
    results.forEach(res => {
      console.log(` - ${res.table}: ${res.deleted} records deleted (${res.archived} archived to ${res.archiveFile || 'N/A'})`);
    });
    
    console.log('\n[MAINTENANCE] Database pruning completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error(`\n[MAINTENANCE] ERROR: ${error.message}`);
    process.exit(1);
  }
}

main();
