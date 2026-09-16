'use strict';

/**
 * YouTube Multi-Modal Video Catalog & Subtitle Ingestor.
 * Extracts video lists and subtitle tracks keylessly using RSS and TimedText endpoints.
 *
 * ponytail: stdlib https/http/child_process. Multi-tier caption fallback.
 */

const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

/**
 * Make an HTTPS GET request with User-Agent headers.
 */
function fetchHttp(url, headers = {}) {
  return new Promise(resolve => {
    const client = url.startsWith('http:') ? http : https;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', err => resolve({ status: 500, error: err.message, data: '' }));
    req.setTimeout(12000, () => {
      req.destroy();
      resolve({ status: 504, error: 'timeout', data: '' });
    });
  });
}

/**
 * Fetches latest 15 videos from a channel via public zero-key RSS feed.
 * @param {string} channelId e.g. "UCPCPE5MoI7DS1WiVB_-mzNw"
 * @returns {Promise<Array<{video_id: string, channel_id: string, title: string, published_at: number}>>}
 */
async function fetchChannelRssVideos(channelId) {
  if (!channelId || !channelId.startsWith('UC')) return [];
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetchHttp(url);

  if (res.status !== 200 || !res.data) return [];

  const videos = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(res.data)) !== null) {
    const entryXml = match[1];
    const vidMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
    const pubMatch = entryXml.match(/<published>([^<]+)<\/published>/);

    if (vidMatch) {
      videos.push({
        video_id: vidMatch[1].trim(),
        channel_id: channelId,
        title: titleMatch ? titleMatch[1].trim() : '',
        published_at: pubMatch ? Date.parse(pubMatch[1]) : Date.now()
      });
    }
  }

  return videos;
}

/**
 * Historical video list fetcher via yt-dlp flat-playlist or channel /videos scrape.
 * @param {string} channelId
 * @param {object} [opts] { limit: 100 }
 * @returns {Promise<Array<{video_id: string, channel_id: string, title: string, published_at: number}>>}
 */
async function fetchChannelHistoricalVideos(channelId, opts = {}) {
  const limit = opts.limit || 100;
  const playlistId = channelId.replace(/^UC/, 'UU');
  const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

  // Try yt-dlp first if installed
  try {
    const proc = spawnSync('yt-dlp', [
      '--flat-playlist',
      '--max-downloads', String(limit),
      '--print', '%(id)s\t%(upload_date)s\t%(title)s',
      playlistUrl
    ], { encoding: 'utf8', timeout: 30000 });

    if (proc.status === 0 && proc.stdout) {
      const lines = proc.stdout.trim().split(/\r?\n/);
      const list = [];
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 1 && parts[0]) {
          const videoId = parts[0].trim();
          const rawDate = parts[1] ? parts[1].trim() : '';
          let publishedAt = Date.now();
          if (/^\d{8}$/.test(rawDate)) {
            const y = rawDate.slice(0, 4);
            const m = rawDate.slice(4, 6);
            const d = rawDate.slice(6, 8);
            publishedAt = Date.parse(`${y}-${m}-${d}T00:00:00.000Z`) || Date.now();
          }
          list.push({
            video_id: videoId,
            channel_id: channelId,
            title: parts[2] ? parts[2].trim() : '',
            published_at: publishedAt
          });
        }
      }
      if (list.length > 0) return list;
    }
  } catch {
    // Fall back to RSS
  }

  return fetchChannelRssVideos(channelId);
}

/**
 * Parses XML TimedText (format=srv1 / srv3) or JSON3 into unified segment chunks.
 * @param {string} rawText
 * @returns {Array<{startMs: number, durMs: number, text: string}>}
 */
function parseTimedText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // 1. Check if JSON3 format
  if (rawText.trim().startsWith('{')) {
    try {
      const json = JSON.parse(rawText);
      const events = json.events || [];
      const segments = [];
      for (const ev of events) {
        if (!ev.segs) continue;
        const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
        if (text) {
          segments.push({
            startMs: Number(ev.tStartMs || 0),
            durMs: Number(ev.dDurationMs || 1500),
            text
          });
        }
      }
      return segments;
    } catch {
      // Fall through to XML regex
    }
  }

  // 2. Parse XML <text start="..." dur="..."> ... </text>
  const textTagRegex = /<text\s+start="([0-9.]+)"\s+dur="([0-9.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  const segments = [];
  let match;

  while ((match = textTagRegex.exec(rawText)) !== null) {
    const startSec = parseFloat(match[1]);
    const durSec = parseFloat(match[2]);
    const cleanText = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim();

    if (cleanText) {
      segments.push({
        startMs: Math.round(startSec * 1000),
        durMs: Math.round(durSec * 1000),
        text: cleanText
      });
    }
  }

  return segments;
}

/**
 * Fetches transcript for a video ID using public TimedText endpoint with watch-page track discovery.
 * @param {string} videoId
 * @returns {Promise<{ok: boolean, segments?: Array<object>, fullText?: string, status: string, error?: string}>}
 */
async function fetchVideoTranscript(videoId) {
  if (!videoId) return { ok: false, status: 'INVALID_ID' };

  // Step 1: Scrape watch page for captionTracks
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageRes = await fetchHttp(watchUrl);

  if (pageRes.status === 429) {
    return { ok: false, status: 'RETRY', error: 'HTTP 429 Rate limited' };
  }

  let captionTracks = [];
  if (pageRes.status === 200 && pageRes.data) {
    const tracksMatch = pageRes.data.match(/"captionTracks":(\[[^\]]+\])/);
    if (tracksMatch) {
      try {
        captionTracks = JSON.parse(tracksMatch[1]);
      } catch {
        // Continue
      }
    }
  }

  // Step 2: If captionTracks discovered, fetch highest priority track
  if (captionTracks.length > 0) {
    const selected = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
                  || captionTracks.find(t => t.languageCode === 'en')
                  || captionTracks[0];

    if (selected && selected.baseUrl) {
      const subUrl = selected.baseUrl.includes('fmt=') ? selected.baseUrl : `${selected.baseUrl}&fmt=json3`;
      const subRes = await fetchHttp(subUrl);
      if (subRes.status === 200 && subRes.data) {
        const segments = parseTimedText(subRes.data);
        if (segments.length > 0) {
          const fullText = segments.map(s => s.text).join(' ');
          return {
            ok: true,
            status: 'COMPLETED',
            language: selected.languageCode || 'en',
            trackType: selected.kind === 'asr' ? 'asr' : 'manual',
            segments,
            fullText
          };
        }
      }
    }
  }

  // Step 3: Fallback directly to standard TimedText URL
  const directTimedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
  const directRes = await fetchHttp(directTimedTextUrl);

  if (directRes.status === 200 && directRes.data && directRes.data.includes('<text')) {
    const segments = parseTimedText(directRes.data);
    if (segments.length > 0) {
      return {
        ok: true,
        status: 'COMPLETED',
        language: 'en',
        trackType: 'asr',
        segments,
        fullText: segments.map(s => s.text).join(' ')
      };
    }
  }

  // Step 4: No captions found
  return { ok: false, status: 'NO_CAPTIONS', error: 'No caption tracks found' };
}

module.exports = {
  fetchChannelRssVideos,
  fetchChannelHistoricalVideos,
  parseTimedText,
  fetchVideoTranscript
};
