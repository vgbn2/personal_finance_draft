const fs = require('fs');
const path = require('path');
const { getAdminClient } = require('../../../shared/lib/supabase/admin');

/**
 * Sovereign Database Guardian - Backup Engine
 * Exports core tables to storage/backups/ as JSON snapshots.
 */
async function runBackup() {
  console.log('[BACKUP] Initializing Sovereign Database Backup...');

  const client = getAdminClient();
  const backupDir = path.join(__dirname, '../../../storage/backups', new Date().toISOString().split('T')[0]);  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

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
    console.log(`[BACKUP] Exporting ${table}...`);
    const { data, error } = await client.from(table).select('*');
    
    if (error) {
      console.error(`[ERROR] Failed to export ${table}:`, error.message);
      continue;
    }

    const filePath = path.join(backupDir, `${table}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[SUCCESS] Saved ${data.length} records to ${filePath}`);
  }

  console.log('[BACKUP] Backup completed successfully.');
}

if (require.main === module) {
  runBackup().catch(err => {
    console.error('[FATAL] Backup failed:', err);
    process.exit(1);
  });
}

module.exports = { runBackup };
