#!/usr/bin/env node
'use strict';

/**
 * Social Alpha Ingestion & Historical Transcript Backfill Worker.
 *
 * Usage:
 *   node backend/scripts/data_ops/ingest_social_data/index.js --resolve
 *   node backend/scripts/data_ops/ingest_social_data/index.js --poll
 *   node backend/scripts/data_ops/ingest_social_data/index.js --backfill --limit 50
 *   node backend/scripts/data_ops/ingest_social_data/index.js --drain --delay 2000
 *   node backend/scripts/data_ops/ingest_social_data/index.js --nlp
 *   node backend/scripts/data_ops/ingest_social_data/index.js --stats
 */

const fs = require('fs');
const path = require('path');
const { TranscriptStore } = require('../../../../shared/lib/analysis/transcript_store');
const { resolveAllConfiguredCreators, loadCreatorsFromYaml } = require('../../../../shared/lib/analysis/creator_resolver');
const { fetchChannelRssVideos, fetchChannelHistoricalVideos, fetchVideoTranscript } = require('../../../../shared/lib/analysis/youtube_ingestor');
const { processVideoTranscript } = require('../../../../shared/lib/analysis/transcript_nlp');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runResolve(store) {
  console.log('[Social Ingest] Resolving configured creators from YAML manifests...');
  const creators = await resolveAllConfiguredCreators({ delayMs: 300 });

  for (const c of creators) {
    if (c.resolved_channel_id) {
      store.upsertChannel({
        channel_id: c.resolved_channel_id,
        handle: c.handle,
        name: c.name,
        tier: c.tier || 'tier_2_active'
      });
    }
  }

  const cacheDir = path.join(process.cwd(), 'storage', 'data', 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'creators_resolved.json'), JSON.stringify(creators, null, 2), 'utf8');

  console.table(creators.map(c => ({
    ID: c.id,
    Name: c.name,
    Handle: c.handle,
    Channel_ID: c.resolved_channel_id || 'N/A',
    Status: c.http_status,
    Valid: c.is_valid ? 'YES' : 'NO'
  })));
}

async function runPoll(store) {
  console.log('[Social Ingest] Polling latest RSS feeds for active creators...');
  const creators = loadCreatorsFromYaml();
  let totalSeeded = 0;

  for (const c of creators) {
    const channelId = c.channel_id;
    if (!channelId || !channelId.startsWith('UC')) continue;

    console.log(`  -> Polling RSS for ${c.name} (${channelId})...`);
    const videos = await fetchChannelRssVideos(channelId);
    const seeded = store.seedVideos(videos);
    totalSeeded += seeded;
    console.log(`     Found ${videos.length} videos, ${seeded} newly queued.`);
    await sleep(400);
  }

  console.log(`[Social Ingest] Polling complete. Total new videos queued: ${totalSeeded}`);
}

async function runBackfill(store, limit = 50) {
  console.log(`[Social Ingest] Running historical backfill (limit: ${limit} videos/channel)...`);
  const creators = loadCreatorsFromYaml();
  let totalSeeded = 0;

  for (const c of creators) {
    const channelId = c.channel_id;
    if (!channelId || !channelId.startsWith('UC')) continue;

    console.log(`  -> Fetching historical catalog for ${c.name} (${channelId})...`);
    const videos = await fetchChannelHistoricalVideos(channelId, { limit });
    const seeded = store.seedVideos(videos);
    totalSeeded += seeded;
    console.log(`     Retrieved ${videos.length} videos, ${seeded} new.`);
    await sleep(800);
  }

  console.log(`[Social Ingest] Backfill catalog indexed. Total new videos: ${totalSeeded}`);
}

async function runDrain(store, baseDelayMs = 2500, batchSize = 100) {
  console.log(`[Social Ingest] Starting rate-limited transcript drain worker...`);
  let processedCount = 0;

  while (true) {
    const pending = store.getPendingVideos(batchSize);
    if (!pending || pending.length === 0) {
      console.log('[Social Ingest] Queue empty. No pending transcripts remaining.');
      break;
    }

    for (const v of pending) {
      console.log(`  -> [${v.video_id}] Fetching subtitles for "${v.title.slice(0, 45)}"...`);
      const result = await fetchVideoTranscript(v.video_id);

      if (result.ok && result.segments && result.segments.length > 0) {
        store.saveTranscript(v.video_id, {
          language: result.language || 'en',
          trackType: result.trackType || 'asr',
          segments: result.segments,
          fullText: result.fullText || ''
        });
        console.log(`     [SUCCESS] Saved ${result.segments.length} segments (${result.fullText ? result.fullText.split(/\s+/).length : 0} words).`);
      } else if (result.status === 'RETRY') {
        store.markVideoStatus(v.video_id, 'RETRY', result.error);
        const backoffMs = Math.min(60000, 5000 * Math.pow(2, v.attempts) + Math.random() * 2000);
        console.warn(`     [RETRY] Rate limited. Backing off for ${(backoffMs / 1000).toFixed(1)}s...`);
        await sleep(backoffMs);
        continue;
      } else {
        store.markVideoStatus(v.video_id, result.status || 'NO_CAPTIONS', result.error);
        console.log(`     [SKIPPED] ${result.status} (${result.error || 'no captions'})`);
      }

      processedCount++;
      // Gaussian rate-limit jitter (baseDelay + 0..1500ms)
      const jitterMs = baseDelayMs + Math.floor(Math.random() * 1500);
      await sleep(jitterMs);
    }
  }

  console.log(`[Social Ingest] Drain session completed. Processed ${processedCount} videos.`);
}

async function runNlp(store) {
  console.log('[Social Ingest] Running NLP sentiment and level extraction over completed transcripts...');
  const creators = loadCreatorsFromYaml();
  const creatorMap = new Map(creators.map(c => [c.channel_id, c]));

  const rows = store.db.prepare(`
    SELECT t.video_id, v.channel_id, v.published_at, v.title, t.raw_segments_gz
    FROM transcripts t
    JOIN videos v ON t.video_id = v.video_id
    WHERE t.video_id NOT IN (SELECT DISTINCT video_id FROM signals)
  `).all();

  console.log(`Found ${rows.length} transcripts requiring NLP processing.`);
  let totalSignals = 0;

  for (const row of rows) {
    const stored = store.getTranscript(row.video_id);
    if (!stored || !stored.segments) continue;

    const creatorConfig = creatorMap.get(row.channel_id) || {};
    const signals = processVideoTranscript({
      video_id: row.video_id,
      channel_id: row.channel_id,
      published_at: row.published_at
    }, stored.segments, creatorConfig);

    if (signals.length > 0) {
      store.saveSignals(signals);
      totalSignals += signals.length;
      console.log(`  -> [${row.video_id}] Extracted ${signals.length} signals (${signals.map(s => `${s.symbol}:${s.direction}`).join(', ')}).`);
    }
  }

  console.log(`[Social Ingest] NLP extraction complete. Total signals generated: ${totalSignals}`);
}

function printStats(store) {
  const stats = store.getStats();
  console.log('\n=== Social Alpha Warehouse Stats ===');
  console.table([stats]);
}

async function main() {
  const args = process.argv.slice(2);
  const store = new TranscriptStore();

  try {
    if (args.includes('--resolve')) {
      await runResolve(store);
    }
    if (args.includes('--poll')) {
      await runPoll(store);
    }
    if (args.includes('--backfill')) {
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 50;
      await runBackfill(store, limit);
    }
    if (args.includes('--drain')) {
      const delayIdx = args.indexOf('--delay');
      const delay = delayIdx !== -1 && args[delayIdx + 1] ? parseInt(args[delayIdx + 1], 10) : 2500;
      await runDrain(store, delay);
    }
    if (args.includes('--nlp')) {
      await runNlp(store);
    }
    if (args.includes('--stats') || args.length === 0) {
      printStats(store);
    }
  } finally {
    store.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Ingestion worker error:', err);
    process.exit(1);
  });
}
