'use strict';

/**
 * Transcript Coherence, Semantic Reconstruction & Financial Signal Extraction.
 * Transforms fragmented YouTube auto-captions into coherent sentences and structured signals.
 *
 * ponytail: pure stdlib RegExp & lexical dictionaries. Zero heavy NLP model dependencies.
 */

const { alignEffectiveTimestamp } = require('./social_alpha');

const FILLER_REGEX = /\b(um+|uh+|er+|you know|like|i mean|sort of|kind of|literally|basically|actually|right\?)\b/gi;
const REPEAT_REGEX = /\b(\w+)\s+\1\b/gi;
const DISCOURSE_REGEX = /^(but|however|so|and then|therefore|now|meanwhile)\b/i;

const ASSET_DICTIONARY = Object.freeze({
  'bitcoin': 'BTC',
  'btc': 'BTC',
  'ether': 'ETH',
  'ethereum': 'ETH',
  'solana': 'SOL',
  'sol': 'SOL',
  'euro dollar': 'EURUSD',
  'fiber': 'EURUSD',
  'cable': 'GBPUSD',
  'gold': 'XAUUSD',
  'nasdaq': 'NAS100',
  's and p': 'SPX'
});

const PROMO_REGEX = /\b(sponsored|link in (?:the )?description|use (?:my )?code|deposit bonus|sign up (?:on|with) (?:bybit|mexc|binance|bitget)|100x gem|giveaway|airdrop)\b/i;

const HEDGE_WEIGHTS = Object.freeze({
  'might': -0.15,
  'maybe': -0.20,
  'could': -0.15,
  'if': -0.10,
  'possibly': -0.20,
  'not financial advice': -0.15
});

const BOOSTER_WEIGHTS = Object.freeze({
  'breaking out right now': 0.35,
  'confirmed': 0.25,
  'definitely': 0.25,
  'huge pump': 0.20,
  'strong breakout': 0.30,
  'absolute bottom': 0.25
});

/**
 * Reconstruct coherent sentences from raw timed subtitle chunks.
 * @param {Array<{startMs: number, durMs: number, text: string}>} chunks
 * @param {object} [opts]
 * @returns {Array<{text: string, start_ms: number, end_ms: number, word_count: number}>}
 */
function reconstructSentences(chunks, opts = {}) {
  const pauseThresholdMs = opts.pauseThresholdMs ?? 700;
  const maxSentenceWords = opts.maxSentenceWords ?? 25;

  const sentences = [];
  let buffer = [];
  let startMs = null;
  let prevEndMs = null;

  function flush() {
    if (buffer.length === 0) return;
    let text = buffer.join(' ')
      .replace(FILLER_REGEX, '')
      .replace(REPEAT_REGEX, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
      if (!/[.!?]$/.test(text)) text += '.';
      sentences.push({
        text,
        start_ms: startMs,
        end_ms: prevEndMs,
        word_count: text.split(/\s+/).length
      });
    }
    buffer = [];
    startMs = null;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = (chunk.text || '').trim();
    if (!text) continue;

    const chunkStart = Number(chunk.startMs ?? (chunk.start ? chunk.start * 1000 : 0));
    const chunkDur = Number(chunk.durMs ?? (chunk.dur ? chunk.dur * 1000 : 1500));
    const chunkEnd = chunkStart + chunkDur;

    if (startMs === null) startMs = chunkStart;

    const gap = prevEndMs !== null ? (chunkStart - prevEndMs) : 0;
    const isDiscourse = buffer.length >= 6 && DISCOURSE_REGEX.test(text);
    const isOverLength = buffer.length >= maxSentenceWords;

    if ((gap >= pauseThresholdMs || isDiscourse || isOverLength) && buffer.length > 0) {
      flush();
      startMs = chunkStart;
    }

    buffer.push(text);
    prevEndMs = chunkEnd;
  }

  flush();
  return sentences;
}

/**
 * Normalizes spoken numbers, phonetic spelled letters, and colloquial asset aliases.
 * @param {string} rawText
 * @returns {string}
 */
function normalizeFinancialText(rawText) {
  let text = ` ${rawText.toLowerCase()} `;

  // 1. Spelled letter sequence: "e u r u s d" -> "eurusd"
  text = text.replace(/(?<=\s)([a-z](?:\s+[a-z]){1,5})(?=\s)/g, match => match.replace(/\s+/g, ''));

  // 2. Asset & ticker mapping
  for (const [alias, ticker] of Object.entries(ASSET_DICTIONARY)) {
    const rx = new RegExp(`\\b${alias}\\b`, 'gi');
    text = text.replace(rx, ticker);
  }

  // 3. Price metric normalizer ($64.5k -> 64500, $64k -> 64000)
  text = text.replace(/\$?\b(\d+(?:\.\d+)?)\s*k\b/gi, (_, n) => String(parseFloat(n) * 1000));
  text = text.replace(/\$?\b(\d+(?:\.\d+)?)\s*m\b/gi, (_, n) => String(parseFloat(n) * 1_000_000));

  return text.trim();
}

/**
 * Contextual level parser for support, resistance, and invalidation stops.
 */
function parseLevels(text) {
  const levels = { support: null, resistance: null, invalidation: null, targets: [] };

  const invMatch = text.match(/(?:stop(?:\s+loss)?|invalidation|cut below|exit under|risk)\D{0,20}\$?(\d+(?:\.\d+)?)/i);
  if (invMatch) levels.invalidation = parseFloat(invMatch[1]);

  const targetMatch = text.match(/(?:target(?:ing)?|take profit|tp|aiming for|move to)\D{0,20}\$?(\d+(?:\.\d+)?)/i);
  if (targetMatch) levels.targets.push({ level: parseFloat(targetMatch[1]), weight: 1.0 });

  const supMatch = text.match(/(?:support|bounce off|holding)\D{0,20}\$?(\d+(?:\.\d+)?)/i);
  if (supMatch) levels.support = parseFloat(supMatch[1]);

  const resMatch = text.match(/(?:resistance|rejection at|ceiling)\D{0,20}\$?(\d+(?:\.\d+)?)/i);
  if (resMatch) levels.resistance = parseFloat(resMatch[1]);

  return levels;
}

/**
 * Extracts structured signal events from cleaned text.
 */
function extractSignal(normalizedText, creatorConfig = {}) {
  const isPromotional = PROMO_REGEX.test(normalizedText);

  // Time Horizon
  let timeHorizon = creatorConfig.default_time_horizon || 'SWING';
  if (/\b(scalp|1m|5m|15m|intraday|today)\b/i.test(normalizedText)) timeHorizon = 'SCALP';
  else if (/\b(weekly|monthly|macro|months|cycle|position)\b/i.test(normalizedText)) timeHorizon = 'POSITION';

  // Direction with 3-word negation window
  let direction = 'NEUTRAL';
  const hasBull = /\b(breakout|breaking out|pumping|bullish|higher high|bounce|long|uptrend)\b/i.test(normalizedText);
  const hasBear = /\b(breakdown|breaking down|dumping|bearish|lower low|reject|short|downtrend)\b/i.test(normalizedText);
  const hasNegation = /\b(not|fail(?:ed)? to|cannot|won't|hardly)\s+(?:\w+\s+){0,2}(?:breakout|pump|bullish|bounce|hold|climb)/i.test(normalizedText);

  if (hasBull && !hasBear) direction = hasNegation ? 'BEARISH' : 'BULLISH';
  else if (hasBear && !hasBull) direction = hasNegation ? 'BULLISH' : 'BEARISH';

  // Conviction scoring
  let conviction = 0.50;
  for (const [phrase, delta] of Object.entries(HEDGE_WEIGHTS)) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(normalizedText)) conviction += delta;
  }
  for (const [phrase, delta] of Object.entries(BOOSTER_WEIGHTS)) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(normalizedText)) conviction += delta;
  }
  conviction = Math.max(0.0, Math.min(1.0, conviction));

  const levels = parseLevels(normalizedText);

  return {
    direction,
    conviction_score: Number(conviction.toFixed(2)),
    time_horizon: timeHorizon,
    invalidation_price: levels.invalidation,
    price_targets: levels.targets,
    is_promotional: isPromotional
  };
}

/**
 * Processes full transcript chunks for a video and returns discrete signal events.
 * @param {object} videoMeta { video_id, channel_id, published_at }
 * @param {Array<{startMs: number, durMs: number, text: string}>} rawChunks
 * @param {object} [creatorConfig]
 * @returns {Array<object>} Formatted signals ready for social_alpha.js
 */
function processVideoTranscript(videoMeta, rawChunks, creatorConfig = {}) {
  if (!Array.isArray(rawChunks) || rawChunks.length === 0) return [];

  const sentences = reconstructSentences(rawChunks);
  const fullText = sentences.map(s => s.text).join(' ');
  const normalized = normalizeFinancialText(fullText);

  // Extract detected symbols
  const tickerRegex = new RegExp(creatorConfig.ticker_regex || '\\b(BTC|ETH|SOL|EURUSD|GBPUSD|USDJPY|XAUUSD|SPX|NAS100)\\b', 'gi');
  const matchedTickers = Array.from(new Set((normalized.match(tickerRegex) || []).map(t => t.toUpperCase())));

  if (matchedTickers.length === 0) return [];

  const pubTime = videoMeta.published_at || Date.now();
  const effectiveTimeMs = alignEffectiveTimestamp(pubTime, '1h', 300_000); // 5 min delay
  const baseSignal = extractSignal(normalized, creatorConfig);

  return matchedTickers.map(symbol => ({
    signal_id: `${videoMeta.video_id}_${symbol}_${effectiveTimeMs}`,
    video_id: videoMeta.video_id,
    channel_id: videoMeta.channel_id,
    symbol,
    direction: baseSignal.direction,
    conviction_score: baseSignal.conviction_score,
    time_horizon: baseSignal.time_horizon,
    invalidation_price: baseSignal.invalidation_price,
    price_targets: baseSignal.price_targets,
    is_promotional: baseSignal.is_promotional,
    effective_time_ms: effectiveTimeMs,
    created_at: Date.now()
  }));
}

module.exports = {
  reconstructSentences,
  normalizeFinancialText,
  parseLevels,
  extractSignal,
  processVideoTranscript
};
