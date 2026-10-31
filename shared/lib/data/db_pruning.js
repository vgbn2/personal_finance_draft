/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Prunes and archives data from a table (no-op in zero-cloud local mode).
 *
 * @param {string} table The table to prune.
 * @param {string} timeColumn The column to use for time filtering.
 * @param {number} daysToKeep Number of days of data to retain in the database.
 * @param {object} options Additional options (archivePath).
 * @returns {Promise<object>} Result of the pruning operation.
 */
async function pruneTable(table, timeColumn, daysToKeep, options = {}) {
  return {
    table,
    archived: 0,
    deleted: 0,
    status: 'skipped_no_database'
  };
}

const { pruneQuarantineRecords } = require('./quarantine');

/**
 * Runs a full database and filesystem maintenance pruning session.
 */
async function runMaintenance(daysToKeep = 30, archiveDir = null, options = {}) {
  const results = [];
  const archivePath = archiveDir || path.join(process.cwd(), 'data', 'archive');

  try {
    // Prune macro observations
    const macroResult = await pruneTable('macro_observations', 'observed_at', daysToKeep, { archivePath });
    results.push(macroResult);

    // Prune orders
    const ordersResult = await pruneTable('orders', 'created_at', daysToKeep, { archivePath });
    results.push(ordersResult);

    // Prune quarantined market observation logs
    const quarantineResult = pruneQuarantineRecords(daysToKeep, options);
    results.push({
      table: 'storage/data/quarantine',
      archived: 0,
      deleted: quarantineResult.pruned_files,
      freed_bytes: quarantineResult.freed_bytes,
      status: 'success',
    });

  } catch (error) {
    console.error(`[PRUNING] Maintenance failed: ${error.message}`);
    throw error;
  }

  return results;
}

module.exports = {
  pruneTable,
  runMaintenance,
  pruneQuarantineRecords,
};
