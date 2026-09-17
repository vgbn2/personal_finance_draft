'use strict';

/**
 * Dynamic YouTube Creator Metadata & Channel ID Resolver.
 * Resolves @handles to canonical UC... channel IDs via zero-key web endpoints.
 *
 * ponytail: pure stdlib (https/fs/path), zero external API keys or heavy packages.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Parse creators from config/research/creators/*.yaml and config/research/creators.yaml.
 * @param {string} [creatorsDir] Directory containing individual creator YAMLs.
 * @param {string} [mainYamlPath] Path to composite creators.yaml.
 * @returns {Array<object>} List of creator configuration objects.
 */
function loadCreatorsFromYaml(creatorsDir, mainYamlPath) {
  const root = process.cwd();
  const dir = creatorsDir || path.join(root, 'config', 'research', 'creators');
  const main = mainYamlPath || path.join(root, 'config', 'research', 'creators.yaml');

  const creators = [];
  const seen = new Set();

  // 1. Ingest individual creator definition files
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('_'));
    for (const f of files) {
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        const idMatch = txt.match(/id:\s*["']?([^"'\s\r\n]+)["']?/);
        const nameMatch = txt.match(/name:\s*["']?([^"'\r\n]+)["']?/);
        const handleMatch = txt.match(/channel_handle:\s*["']?([^"'\s\r\n]+)["']?/);
        const channelIdMatch = txt.match(/channel_id:\s*["']?([^"'\s\r\n]+)["']?/);
        const enabledMatch = txt.match(/enabled:\s*(true|false)/);
        const tierMatch = txt.match(/tier:\s*["']?([^"'\s\r\n]+)["']?/);

        if (idMatch && handleMatch) {
          const id = idMatch[1].trim();
          const rawChannelId = channelIdMatch ? channelIdMatch[1].trim() : null;
          const validChannelId = rawChannelId && /^UC[A-Za-z0-9_-]{22}$/.test(rawChannelId) ? rawChannelId : null;
          seen.add(id);
          creators.push({
            id,
            name: nameMatch ? nameMatch[1].trim() : id,
            handle: handleMatch[1].trim(),
            channel_id: validChannelId,
            tier: tierMatch ? tierMatch[1].trim() : 'tier_2_active',
            enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
            source_file: path.join('config', 'research', 'creators', f)
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  // 2. Ingest root composite creators.yaml for any unlisted creators
  if (fs.existsSync(main)) {
    try {
      const txt = fs.readFileSync(main, 'utf8');
      const lines = txt.split(/\r?\n/);
      let cur = null;
      for (const line of lines) {
        const matchItem = line.match(/^\s*-\s*id:\s*["']?([^"'\s]+)["']?/);
        if (matchItem) {
          if (cur && !seen.has(cur.id)) {
            seen.add(cur.id);
            creators.push(cur);
          }
          cur = { id: matchItem[1].trim(), source_file: 'config/research/creators.yaml' };
          continue;
        }
        if (cur) {
          const mProp = line.match(/^\s*([a-zA-Z0-9_]+):\s*["']?([^"'#\r\n]+)["']?/);
          if (mProp) {
            const k = mProp[1].trim();
            let v = mProp[2].trim();
            if (v === 'true') v = true;
            else if (v === 'false') v = false;
            if (k === 'channel_handle') cur.handle = v;
            else cur[k] = v;
          }
        }
      }
      if (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        creators.push(cur);
      }
    } catch {
      // Skip on read failure
    }
  }

  // 3. Merge resolved cache if present on disk
  const cachePath = path.join(root, 'storage', 'data', 'cache', 'creators_resolved.json');
  if (fs.existsSync(cachePath)) {
    try {
      const resolvedList = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const map = new Map(resolvedList.map(r => [r.id, r.resolved_channel_id]));
      for (const c of creators) {
        if (map.has(c.id) && map.get(c.id)) {
          c.channel_id = map.get(c.id);
        }
      }
    } catch {
      // Ignore cache parse failures
    }
  }

  return creators;
}

/**
 * Zero-key HTTPS resolver: maps YouTube @handle to UC... channel ID.
 * @param {string} handle e.g. "@TraderNick" or "TraderNick"
 * @param {object} [opts] Options (timeoutMs, userAgent)
 * @returns {Promise<object>} Resolved metadata object.
 */
function resolveYouTubeHandle(handle, opts = {}) {
  const timeoutMs = opts.timeoutMs || 8000;
  const userAgent = opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  return new Promise(resolve => {
    if (!handle || typeof handle !== 'string') {
      return resolve({ handle, channel_id: null, status: 400, error: 'Invalid handle' });
    }

    const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;
    const url = `https://www.youtube.com/${cleanHandle}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve({ handle: cleanHandle, channel_id: null, status: res.statusCode, redirect: res.headers.location });
        }
        if (res.statusCode !== 200) {
          return resolve({ handle: cleanHandle, channel_id: null, title: `${res.statusCode} Not Found`, status: res.statusCode });
        }

        const rssMatch = data.match(/https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[a-zA-Z0-9_-]+)/);
        const channelIdMatch = data.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) || data.match(/itemprop="channelId" content="(UC[a-zA-Z0-9_-]+)"/);
        const titleMatch = data.match(/<title>([^<]+)<\/title>/);

        const channelId = rssMatch ? rssMatch[1] : (channelIdMatch ? channelIdMatch[1] : null);
        const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : null;

        resolve({
          handle: cleanHandle,
          channel_id: channelId,
          rss_url: channelId ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` : null,
          title: title,
          status: res.statusCode
        });
      });
    });

    req.on('error', err => resolve({ handle: cleanHandle, channel_id: null, error: err.message, status: 500 }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ handle: cleanHandle, channel_id: null, error: 'Request timeout', status: 504 });
    });
  });
}

/**
 * Resolves all configured creators loaded from YAML.
 * @param {object} [opts] Options
 * @returns {Promise<Array<object>>}
 */
async function resolveAllConfiguredCreators(opts = {}) {
  const creators = loadCreatorsFromYaml(opts.creatorsDir, opts.mainYamlPath);
  const results = [];

  for (const c of creators) {
    const handle = c.handle || c.channel_handle;
    if (!handle) continue;
    const resolved = await resolveYouTubeHandle(handle, opts);
    results.push({
      ...c,
      resolved_channel_id: resolved.channel_id,
      rss_url: resolved.rss_url,
      resolved_title: resolved.title,
      http_status: resolved.status,
      is_valid: Boolean(resolved.channel_id && resolved.status === 200)
    });
    // Jitter delay between requests to remain polite
    if (opts.delayMs) {
      await new Promise(r => setTimeout(r, opts.delayMs));
    }
  }

  return results;
}

module.exports = {
  loadCreatorsFromYaml,
  resolveYouTubeHandle,
  resolveAllConfiguredCreators
};
