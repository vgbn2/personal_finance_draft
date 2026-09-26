'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { STORAGE_DATA_DIR } = require('../runtime/paths');

const DEFAULT_DB_PATH = path.join(STORAGE_DATA_DIR, 'relational', 'analytics.db');

class SqliteAnalyticsEngine {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(dbPath);
    this._initPragmas();
    this._initSchema();
  }

  _initPragmas() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA mmap_size = 268435456;
      PRAGMA busy_timeout = 5000;
    `);
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS derivatives_funding_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        funding_rate REAL NOT NULL,
        funding_time_ms INTEGER NOT NULL,
        mark_price REAL,
        ingested_at TEXT NOT NULL,
        UNIQUE(symbol, funding_time_ms)
      );
      CREATE INDEX IF NOT EXISTS idx_funding_symbol_time ON derivatives_funding_rates(symbol, funding_time_ms DESC);

      CREATE TABLE IF NOT EXISTS derivatives_options_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        currency TEXT NOT NULL,
        instrument_name TEXT NOT NULL,
        strike REAL,
        option_type TEXT,
        expiration_ms INTEGER,
        mark_price REAL,
        mark_iv REAL,
        delta REAL,
        gamma REAL,
        vega REAL,
        theta REAL,
        volume_usd REAL,
        open_interest REAL,
        ingested_at TEXT NOT NULL,
        UNIQUE(instrument_name, ingested_at)
      );
      CREATE INDEX IF NOT EXISTS idx_options_curr_exp ON derivatives_options_summary(currency, expiration_ms);
    `);
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }
  }

  insertFundingRates(records = []) {
    if (!Array.isArray(records) || records.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO derivatives_funding_rates (
        symbol, funding_rate, funding_time_ms, mark_price, ingested_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    return this.transaction(() => {
      let inserted = 0;
      for (const r of records) {
        if (!r || !r.symbol || !Number.isFinite(r.funding_time_ms)) continue;
        const res = stmt.run(
          String(r.symbol).toUpperCase(),
          Number(r.funding_rate || 0),
          Number(r.funding_time_ms),
          Number.isFinite(r.mark_price) ? Number(r.mark_price) : null,
          String(r.ingested_at || new Date().toISOString())
        );
        if (res && res.changes) inserted += res.changes;
      }
      return inserted;
    });
  }

  getFundingRates(symbol, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM derivatives_funding_rates
      WHERE symbol = ?
      ORDER BY funding_time_ms DESC
      LIMIT ?
    `);
    return stmt.all(String(symbol).toUpperCase(), Math.max(1, limit));
  }

  getFundingTwap(symbol, lookbackMs = 86400000) {
    const sym = String(symbol).toUpperCase();
    const stmt = this.db.prepare(`
      SELECT
        AVG(funding_rate) as twap_rate,
        MIN(funding_rate) as min_rate,
        MAX(funding_rate) as max_rate,
        COUNT(*) as sample_count,
        MAX(funding_time_ms) as latest_time_ms
      FROM derivatives_funding_rates
      WHERE symbol = ?
        AND funding_time_ms >= (
          SELECT COALESCE(MAX(funding_time_ms), 0) - ? FROM derivatives_funding_rates WHERE symbol = ?
        )
    `);
    const row = stmt.get(sym, lookbackMs, sym);
    if (!row || row.sample_count === 0) {
      return { symbol: sym, twap_rate: 0, sample_count: 0, apy_percent: 0, latest_time_ms: null };
    }
    const twap = Number(row.twap_rate || 0);
    // 8-hour funding intervals -> 3 funding payments/day * 365 days = 1095 funding cycles/year
    const apyPercent = twap * 3 * 365 * 100;
    return {
      symbol: sym,
      twap_rate: twap,
      min_rate: Number(row.min_rate || 0),
      max_rate: Number(row.max_rate || 0),
      sample_count: Number(row.sample_count || 0),
      apy_percent: apyPercent,
      latest_time_ms: row.latest_time_ms,
    };
  }

  insertOptionsSummary(records = []) {
    if (!Array.isArray(records) || records.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO derivatives_options_summary (
        currency, instrument_name, strike, option_type, expiration_ms,
        mark_price, mark_iv, delta, gamma, vega, theta, volume_usd,
        open_interest, ingested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return this.transaction(() => {
      let inserted = 0;
      for (const r of records) {
        if (!r || !r.instrument_name) continue;
        const res = stmt.run(
          String(r.currency || 'BTC').toUpperCase(),
          String(r.instrument_name),
          Number.isFinite(r.strike) ? Number(r.strike) : null,
          r.option_type ? String(r.option_type).toUpperCase() : null,
          Number.isFinite(r.expiration_ms) ? Number(r.expiration_ms) : null,
          Number.isFinite(r.mark_price) ? Number(r.mark_price) : null,
          Number.isFinite(r.mark_iv) ? Number(r.mark_iv) : null,
          Number.isFinite(r.delta) ? Number(r.delta) : null,
          Number.isFinite(r.gamma) ? Number(r.gamma) : null,
          Number.isFinite(r.vega) ? Number(r.vega) : null,
          Number.isFinite(r.theta) ? Number(r.theta) : null,
          Number.isFinite(r.volume_usd) ? Number(r.volume_usd) : null,
          Number.isFinite(r.open_interest) ? Number(r.open_interest) : null,
          String(r.ingested_at || new Date().toISOString())
        );
        if (res && res.changes) inserted += res.changes;
      }
      return inserted;
    });
  }

  getOptionsSummary(currency, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM derivatives_options_summary
      WHERE currency = ?
      ORDER BY expiration_ms ASC
      LIMIT ?
    `);
    return stmt.all(String(currency).toUpperCase(), Math.max(1, limit));
  }

  getOptionsChain(currency, expirationMs = null) {
    const curr = String(currency).toUpperCase();
    let rows;
    if (expirationMs !== null && Number.isFinite(Number(expirationMs))) {
      const stmt = this.db.prepare(`
        SELECT * FROM derivatives_options_summary
        WHERE currency = ? AND expiration_ms = ?
        ORDER BY strike ASC
      `);
      rows = stmt.all(curr, Number(expirationMs));
    } else {
      const stmt = this.db.prepare(`
        SELECT * FROM derivatives_options_summary
        WHERE currency = ?
        ORDER BY expiration_ms ASC, strike ASC
      `);
      rows = stmt.all(curr);
    }

    // Group into strike-aligned call/put matrix
    const chainsByExp = new Map();
    for (const row of rows) {
      const exp = row.expiration_ms || 0;
      if (!chainsByExp.has(exp)) chainsByExp.set(exp, new Map());
      const strikeMap = chainsByExp.get(exp);
      const strike = row.strike || 0;
      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, { strike, expiration_ms: exp, call: null, put: null });
      }
      const pair = strikeMap.get(strike);
      const optSummary = {
        instrument_name: row.instrument_name,
        mark_price: row.mark_price,
        mark_iv: row.mark_iv,
        delta: row.delta,
        gamma: row.gamma,
        vega: row.vega,
        theta: row.theta,
        volume_usd: row.volume_usd,
        open_interest: row.open_interest,
      };
      if (row.option_type === 'C') pair.call = optSummary;
      else if (row.option_type === 'P') pair.put = optSummary;
    }

    const result = [];
    for (const [exp, strikeMap] of chainsByExp.entries()) {
      result.push({
        expiration_ms: exp,
        strikes: Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike),
      });
    }
    return result;
  }

  getNetGreekExposure(currency) {
    const curr = String(currency).toUpperCase();
    const stmt = this.db.prepare(`
      SELECT
        SUM(COALESCE(delta, 0) * COALESCE(open_interest, 0)) as net_delta_oi,
        SUM(COALESCE(gamma, 0) * COALESCE(open_interest, 0)) as net_gamma_oi,
        SUM(COALESCE(vega, 0) * COALESCE(open_interest, 0)) as net_vega_oi,
        SUM(COALESCE(theta, 0) * COALESCE(open_interest, 0)) as net_theta_oi,
        SUM(COALESCE(open_interest, 0)) as total_open_interest,
        SUM(COALESCE(volume_usd, 0)) as total_volume_usd,
        COUNT(*) as contracts_count
      FROM derivatives_options_summary
      WHERE currency = ?
    `);
    const row = stmt.get(curr) || {};
    return {
      currency: curr,
      net_delta_oi: Number(row.net_delta_oi || 0),
      net_gamma_oi: Number(row.net_gamma_oi || 0),
      net_vega_oi: Number(row.net_vega_oi || 0),
      net_theta_oi: Number(row.net_theta_oi || 0),
      total_open_interest: Number(row.total_open_interest || 0),
      total_volume_usd: Number(row.total_volume_usd || 0),
      contracts_count: Number(row.contracts_count || 0),
    };
  }

  getVolatilitySmile(currency, expirationMs = null) {
    const curr = String(currency).toUpperCase();
    let targetExp = expirationMs;
    if (targetExp === null) {
      const expStmt = this.db.prepare(`
        SELECT expiration_ms FROM derivatives_options_summary
        WHERE currency = ? AND expiration_ms IS NOT NULL AND mark_iv IS NOT NULL
        ORDER BY expiration_ms ASC
        LIMIT 1
      `);
      const row = expStmt.get(curr);
      if (row) targetExp = row.expiration_ms;
    }
    if (targetExp === null) return [];

    const stmt = this.db.prepare(`
      SELECT strike, option_type, mark_iv, mark_price, delta
      FROM derivatives_options_summary
      WHERE currency = ? AND expiration_ms = ? AND strike IS NOT NULL AND mark_iv IS NOT NULL
      ORDER BY strike ASC
    `);
    const rows = stmt.all(curr, Number(targetExp));
    return rows.map((r) => ({
      strike: r.strike,
      option_type: r.option_type,
      mark_iv: r.mark_iv,
      mark_price: r.mark_price,
      delta: r.delta,
      expiration_ms: targetExp,
    }));
  }

  close() {
    try {
      this.db.close();
    } catch (_) {}
  }
}

let _defaultEngine = null;

function getDefaultAnalyticsEngine(dbPath) {
  if (!_defaultEngine || dbPath) {
    _defaultEngine = new SqliteAnalyticsEngine(dbPath);
  }
  return _defaultEngine;
}

module.exports = {
  SqliteAnalyticsEngine,
  getDefaultAnalyticsEngine,
  DEFAULT_DB_PATH,
};
