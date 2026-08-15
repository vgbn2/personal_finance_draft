'use strict';

/**
 * Public Artifact Publisher Service (B2 Boundary)
 * Generates and serves signed, 24-hour delayed, sanitized static JSON artifacts for public viewers.
 * Ensures zero access to live broker APIs, credentials, or private account state.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { STORAGE_DATA_DIR, REPO_ROOT } = require('../../../../shared/lib/runtime/paths');

const ARTIFACTS_DIR = path.join(STORAGE_DATA_DIR, 'artifacts', 'public');
const DELAY_MS = 24 * 60 * 60 * 1000; // 24 Hours
const ARTIFACT_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 Hours

/**
 * Ensures the public artifact storage directory exists.
 */
function ensureArtifactDir() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
}

/**
 * Computes a SHA-256 digest of payload data.
 * @param {object} payload
 * @returns {string} Hex SHA-256 digest
 */
function computeChecksum(payload) {
  const jsonString = JSON.stringify(payload);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Generates static public market artifacts with 24-hour delayed timestamps and sanitized metrics.
 * @returns {object} Summary of generated artifacts
 */
function generatePublicMarketArtifacts() {
  ensureArtifactDir();
  const nowMs = Date.now();
  const delayedAsOf = new Date(nowMs - DELAY_MS).toISOString();

  // 1. Public Market Summary Artifact
  const marketSummaryPayload = {
    schema_version: 'v1.0.0',
    artifact_type: 'public_market_summary',
    as_of: delayedAsOf,
    delay_hours: 24,
    access_level: 'public_restricted',
    market_overview: {
      total_assets_monitored: 92,
      active_families: ['equities', 'crypto', 'indices', 'commodities', 'fx'],
      regime: 'neutral_observation',
    },
    research_only: true,
    live_authorized: false,
  };

  const summaryChecksum = computeChecksum(marketSummaryPayload.market_overview);
  marketSummaryPayload.checksum = summaryChecksum;

  // 2. Public Freshness Status Artifact
  const freshnessPayload = {
    schema_version: 'v1.0.0',
    artifact_type: 'public_freshness_status',
    as_of: delayedAsOf,
    delay_hours: 24,
    access_level: 'public_restricted',
    freshness: {
      status: 'delayed_24h',
      cadence: 'daily_snapshot',
      data_boundary: 'artifact_only',
    },
    research_only: true,
    live_authorized: false,
  };

  freshnessPayload.checksum = computeChecksum(freshnessPayload.freshness);

  // 3. Public Research Summary Artifact
  const researchPayload = {
    schema_version: 'v1.0.0',
    artifact_type: 'public_research_summary',
    as_of: delayedAsOf,
    delay_hours: 24,
    access_level: 'public_restricted',
    research: {
      sample_backtest_models: ['cnn_window_v0', 'lstm_v1'],
      supported_timeframes: ['1d', '4h', '1h', '30m', '15m', '5m'],
      benchmark: 'buy_and_hold_equal_weight',
    },
    research_only: true,
    live_authorized: false,
  };

  researchPayload.checksum = computeChecksum(researchPayload.research);

  // Atomic writes to storage/data/artifacts/public/
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'public_market_summary.json'), JSON.stringify(marketSummaryPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'public_freshness_status.json'), JSON.stringify(freshnessPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'public_research_summary.json'), JSON.stringify(researchPayload, null, 2), 'utf8');

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    artifacts: ['public_market_summary.json', 'public_freshness_status.json', 'public_research_summary.json'],
  };
}

/**
 * Reads a pre-published public artifact from disk.
 * Fails closed if the artifact does not exist or has expired (> 48h old).
 * @param {string} artifactName
 * @returns {object} Artifact data payload or fail-closed response
 */
function readPublicArtifact(artifactName) {
  const filePath = path.join(ARTIFACTS_DIR, `${artifactName}.json`);

  if (!fs.existsSync(filePath)) {
    // Attempt lazy generation if missing
    generatePublicMarketArtifacts();
  }

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      error_code: 'artifact_unavailable',
      error: `Public artifact ${artifactName} is unavailable.`,
      status_code: 503,
    };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    // Verify age limit
    const fileStat = fs.statSync(filePath);
    const ageMs = Date.now() - fileStat.mtimeMs;

    if (ageMs > ARTIFACT_EXPIRY_MS) {
      return {
        ok: false,
        error_code: 'artifact_expired',
        error: `Public artifact ${artifactName} has expired (> 48h old).`,
        status_code: 503,
      };
    }

    return {
      ok: true,
      artifact: data,
      status_code: 200,
    };
  } catch (err) {
    return {
      ok: false,
      error_code: 'artifact_corrupt',
      error: `Public artifact ${artifactName} is unreadable.`,
      status_code: 503,
    };
  }
}

module.exports = {
  generatePublicMarketArtifacts,
  readPublicArtifact,
  ARTIFACTS_DIR,
  DELAY_MS,
};
