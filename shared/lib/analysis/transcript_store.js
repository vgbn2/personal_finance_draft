'use strict';

/**
 * High-performance SQLite warehouse for social transcripts and extracted signals.
 * Uses native node:sqlite DatabaseSync with WAL journal mode and node:zlib compression.
 *
 * ponytail: stdlib node:sqlite + node:zlib. Zero external database dependencies.
 */

const { DatabaseSync } = require('node:sqlite');
const { gzipSync, gunzipSync } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'storage', 'data', 'transcripts', 'warehouse.sqlite');

class TranscriptStore {
  /**
   * @param {string} [dbPath] Path to SQLite database file or ':memory:'
   */
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;

      CREATE TABLE IF NOT EXISTS channels (
        channel_id TEXT PRIMARY KEY,
        handle TEXT NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'youtube',
        tier TEXT NOT NULL DEFAULT 'tier_2_active',
        metadata_json TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS videos (
        video_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        title TEXT NOT NULL,
        published_at INTEGER NOT NULL,
        duration_sec INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, NO_CAPTIONS, UNPLAYABLE, FAILED, RETRY
        attempts INTEGER NOT NULL DEFAULT 0,
        error_msg TEXT,
        fetched_at INTEGER,
        FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_videos_channel_pub ON videos(channel_id, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status, attempts);

      CREATE TABLE IF NOT EXISTS transcripts (
        video_id TEXT PRIMARY KEY,
        language TEXT NOT NULL DEFAULT 'en',
        track_type TEXT NOT NULL DEFAULT 'asr', -- asr, manual, translated
        raw_segments_gz BLOB NOT NULL,
        full_text TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS signals (
        signal_id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL, -- BULLISH, BEARISH, NEUTRAL
        conviction_score REAL NOT NULL,
        time_horizon TEXT NOT NULL, -- SCALP, SWING, POSITION, MACRO_REGIME
        invalidation_price REAL,
        price_targets_json TEXT,
        is_promotional INTEGER NOT NULL DEFAULT 0,
        effective_time_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_signals_symbol_eff ON signals(symbol, effective_time_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_signals_channel ON signals(channel_id, effective_time_ms DESC);
    `);
  }

  upsertChannel(channel) {
    const stmt = this.db.prepare(`
      INSERT INTO channels (channel_id, handle, name, platform, tier, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET
        handle = excluded.handle,
        name = excluded.name,
        tier = excluded.tier,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `);
    const now = Date.now();
    stmt.run(
      channel.channel_id,
      channel.handle || '',
      channel.name || channel.channel_id,
      channel.platform || 'youtube',
      channel.tier || 'tier_2_active',
      JSON.stringify(channel),
      now
    );
  }

  seedVideos(videos) {
    if (!Array.isArray(videos) || videos.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO videos (video_id, channel_id, title, published_at, duration_sec, status, attempts)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0)
    `);
    let seeded = 0;
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const v of videos) {
        if (!v.video_id || !v.channel_id) continue;
        const pubMs = typeof v.published_at === 'number' ? v.published_at : Date.parse(v.published_at) || Date.now();
        const res = stmt.run(v.video_id, v.channel_id, v.title || '', pubMs, v.duration_sec || 0);
        if (res && res.changes > 0) seeded++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return seeded;
  }

  getPendingVideos(limit = 100, maxAttempts = 5) {
    const stmt = this.db.prepare(`
      SELECT video_id, channel_id, title, published_at, duration_sec, status, attempts
      FROM videos
      WHERE status = 'PENDING' OR (status = 'RETRY' AND attempts < ?)
      ORDER BY published_at DESC
      LIMIT ?
    `);
    return stmt.all(maxAttempts, limit);
  }

  saveTranscript(videoId, { language = 'en', trackType = 'asr', segments = [], fullText = '' } = {}) {
    const compressed = gzipSync(Buffer.from(JSON.stringify(segments)));
    const text = fullText || segments.map(s => s.text || '').join(' ').trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    const now = Date.now();

    const insertTrans = this.db.prepare(`
      INSERT INTO transcripts (video_id, language, track_type, raw_segments_gz, full_text, word_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET
        language = excluded.language,
        track_type = excluded.track_type,
        raw_segments_gz = excluded.raw_segments_gz,
        full_text = excluded.full_text,
        word_count = excluded.word_count,
        created_at = excluded.created_at
    `);
    const updateVideo = this.db.prepare(`
      UPDATE videos SET status = 'COMPLETED', attempts = attempts + 1, fetched_at = ?, error_msg = NULL
      WHERE video_id = ?
    `);

    this.db.exec('BEGIN TRANSACTION');
    try {
      insertTrans.run(videoId, language, trackType, compressed, text, wordCount, now);
      updateVideo.run(now, videoId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  markVideoStatus(videoId, status, errorMsg = null) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE videos SET status = ?, attempts = attempts + 1, error_msg = ?, fetched_at = ?
      WHERE video_id = ?
    `);
    stmt.run(status, errorMsg, now, videoId);
  }

  getTranscript(videoId) {
    const row = this.db.prepare('SELECT * FROM transcripts WHERE video_id = ?').get(videoId);
    if (!row) return null;
    const rawBuffer = Buffer.from(row.raw_segments_gz);
    const uncompressed = gunzipSync(rawBuffer).toString('utf8');
    return {
      videoId: row.video_id,
      language: row.language,
      trackType: row.track_type,
      segments: JSON.parse(uncompressed),
      fullText: row.full_text,
      wordCount: row.word_count,
      createdAt: row.created_at
    };
  }

  saveSignals(signals) {
    if (!Array.isArray(signals) || signals.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO signals (
        signal_id, video_id, channel_id, symbol, direction, conviction_score,
        time_horizon, invalidation_price, price_targets_json, is_promotional,
        effective_time_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(signal_id) DO UPDATE SET
        direction = excluded.direction,
        conviction_score = excluded.conviction_score,
        time_horizon = excluded.time_horizon,
        invalidation_price = excluded.invalidation_price,
        price_targets_json = excluded.price_targets_json,
        is_promotional = excluded.is_promotional,
        effective_time_ms = excluded.effective_time_ms
    `);
    const now = Date.now();
    let saved = 0;
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const s of signals) {
        stmt.run(
          s.signal_id || `${s.video_id}_${s.symbol}_${now}`,
          s.video_id,
          s.channel_id,
          s.symbol,
          s.direction,
          s.conviction_score || 0.5,
          s.time_horizon || 'SWING',
          s.invalidation_price || null,
          s.price_targets ? JSON.stringify(s.price_targets) : null,
          s.is_promotional ? 1 : 0,
          s.effective_time_ms || now,
          now
        );
        saved++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return saved;
  }

  getSignalsForAsset(symbol, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM signals WHERE symbol = ? ORDER BY effective_time_ms DESC LIMIT ?
    `);
    return stmt.all(symbol, limit);
  }

  getStats() {
    const totalVideos = this.db.prepare('SELECT COUNT(*) as c FROM videos').get().c;
    const completedVideos = this.db.prepare("SELECT COUNT(*) as c FROM videos WHERE status = 'COMPLETED'").get().c;
    const pendingVideos = this.db.prepare("SELECT COUNT(*) as c FROM videos WHERE status = 'PENDING'").get().c;
    const failedVideos = this.db.prepare("SELECT COUNT(*) as c FROM videos WHERE status IN ('FAILED', 'NO_CAPTIONS', 'UNPLAYABLE')").get().c;
    const totalSignals = this.db.prepare('SELECT COUNT(*) as c FROM signals').get().c;
    const totalChannels = this.db.prepare('SELECT COUNT(*) as c FROM channels').get().c;
    return {
      totalChannels,
      totalVideos,
      completedVideos,
      pendingVideos,
      failedVideos,
      totalSignals
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = {
  TranscriptStore,
  DEFAULT_DB_PATH
};
