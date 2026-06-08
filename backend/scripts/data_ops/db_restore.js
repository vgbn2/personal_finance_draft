const fs = require('fs');
const path = require('path');
const { getAdminClient } = require('../../../shared/lib/supabase/admin');

/**
 * Sovereign Database Guardian - Restoration Engine
 * Restores a JSON snapshot from storage/backups/ to the database.
 * WARNING: This is a destructive operation.
 */
async function runRestoration(dateFolder) {
  if (!dateFolder) {
    console.error('[ERROR] Please provide a date folder (e.g., 2026-05-28)');
    process.exit(1);
  }

  const backupDir = path.join(__dirname, '../../../storage/backups', dateFolder);
  if (!fs.existsSync(backupDir)) {
    console.error(`[ERROR] Backup directory not found: ${backupDir}`);
    process.exit(1);
  }

  console.log(`[RESTORE] Initializing restoration from ${dateFolder}...`);
  const client = getAdminClient();

  const tables = [
    'profiles',
    'portfolios',
    'holdings',
    'watchlist_items',
    'saved_backtests',
    'audit_events',
    'orders',
    'macro_observations'
  ];

  for (const table of tables) {
    const filePath = path.join(backupDir, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[WARN] Snapshot for ${table} missing, skipping.`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.length === 0) {
      console.log(`[RESTORE] ${table} is empty in backup, skipping.`);
      continue;
    }

    console.log(`[RESTORE] Restoring ${data.length} records to ${table}...`);
    
    // Simple UPSERT for all records
    const { error } = await client.from(table).upsert(data);
    
    if (error) {
      console.error(`[ERROR] Failed to restore ${table}:`, error.message);
    } else {
      console.log(`[SUCCESS] Restored ${table}.`);
    }
  }

  console.log('[RESTORE] Restoration completed.');
}

if (require.main === module) {
  const arg = process.argv[2];
  runRestoration(arg).catch(err => {
    console.error('[FATAL] Restoration failed:', err);
    process.exit(1);
  });
}

module.exports = { runRestoration };
