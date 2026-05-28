/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');
const path = require('node:path');
const { getAdminClient } = require('./supabase_admin');

/**
 * Prunes and archives data from a Supabase table.
 * 
 * @param {string} table The table to prune.
 * @param {string} timeColumn The column to use for time filtering.
 * @param {number} daysToKeep Number of days of data to retain in the database.
 * @param {object} options Additional options (archivePath).
 * @returns {Promise<object>} Result of the pruning operation.
 */
async function pruneTable(table, timeColumn, daysToKeep, options = {}) {
  const supabase = getAdminClient();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - daysToKeep);
  const thresholdStr = threshold.toISOString();
  
  console.log(`[PRUNING] Scanning ${table} for records older than ${thresholdStr}...`);
  
  // 1. Fetch records to archive
  const { data: records, error: fetchError } = await supabase
    .from(table)
    .select('*')
    .lt(timeColumn, thresholdStr);
    
  if (fetchError) {
    throw new Error(`Failed to fetch records from ${table}: ${fetchError.message}`);
  }
  
  if (!records || records.length === 0) {
    return { table, archived: 0, deleted: 0, status: 'no_records_to_prune' };
  }
  
  console.log(`[PRUNING] Found ${records.length} records to archive from ${table}.`);
  
  // 2. Archive locally
  let archiveFile = null;
  if (options.archivePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    archiveFile = path.join(options.archivePath, `${table}_archive_${timestamp}.json`);
    fs.mkdirSync(options.archivePath, { recursive: true });
    fs.writeFileSync(archiveFile, JSON.stringify(records, null, 2), 'utf8');
    console.log(`[PRUNING] Archived ${records.length} records to ${archiveFile}`);
  }
  
  // 3. Delete from Supabase
  const { error: deleteError, count } = await supabase
    .from(table)
    .delete()
    .lt(timeColumn, thresholdStr);
    
  if (deleteError) {
    throw new Error(`Failed to delete records from ${table}: ${deleteError.message}`);
  }
  
  return {
    table,
    archived: records.length,
    deleted: count || records.length, // Fallback if count is not returned
    archiveFile,
    status: 'success'
  };
}

/**
 * Runs a full database maintenance pruning session.
 */
async function runMaintenance(daysToKeep = 30, archiveDir = null) {
  const results = [];
  const archivePath = archiveDir || path.join(process.cwd(), 'data', 'archive');
  
  try {
    // Prune macro observations
    const macroResult = await pruneTable('macro_observations', 'observed_at', daysToKeep, { archivePath });
    results.push(macroResult);
    
    // Prune orders
    const ordersResult = await pruneTable('orders', 'created_at', daysToKeep, { archivePath });
    results.push(ordersResult);
    
  } catch (error) {
    console.error(`[PRUNING] Maintenance failed: ${error.message}`);
    throw error;
  }
  
  return results;
}

module.exports = {
  pruneTable,
  runMaintenance
};
