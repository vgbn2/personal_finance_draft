# 02. Financial NLP & Transcript Extraction

## Purpose

This layer converts unformatted speech transcripts and social posts into strongly-typed, schema-validated financial signal payloads. It solves ticker ambiguity, extract price targets, detects invalidation criteria, and strips promotional noise.

---

## Entity Disambiguation & Ticker Mapping

1. **Cashtag Normalization**:
   - Matches standard cashtags (`$BTC`, `$NVDA`, `$TSLA`, `$ETH`).
   - Disambiguates common homographs (e.g. "Apple" vs `AAPL`, "Amazon" vs `AMZN`, "Gold" vs `XAUUSD` / `GLD`).
2. **Context Window Extraction**:
   - Extracts 120-second rolling sliding windows around ticker mentions with 15-second overlap to capture surrounding thesis rationale.
3. **Promotional Content Filter**:
   - Detects paid sponsorships, affiliate disclosures ("sponsored by", "link in description", "giveaway", "ref code"), and marks `is_promotional: true`.
   - Promotional signals are rejected by pre-trade filters.

---

## Structured Output JSON Schema

The extractor enforces the following JSON Schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SocialAlphaSignalPayload",
  "type": "object",
  "required": ["source", "extracted_signals", "macro_sentiment"],
  "properties": {
    "source": {
      "type": "object",
      "required": ["platform", "channel_id", "creator_name", "content_id", "published_at_utc"],
      "properties": {
        "platform": { "type": "string", "enum": ["youtube", "twitter", "reddit", "news_rss"] },
        "channel_id": { "type": "string" },
        "creator_name": { "type": "string" },
        "content_id": { "type": "string" },
        "published_at_utc": { "type": "string", "format": "date-time" },
        "video_duration_seconds": { "type": "integer" }
      }
    },
    "extracted_signals": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["symbol", "asset_class", "direction", "conviction_score", "time_horizon", "is_promotional"],
        "properties": {
          "symbol": { "type": "string" },
          "asset_class": { "type": "string", "enum": ["crypto", "equity", "commodity", "forex"] },
          "direction": { "type": "string", "enum": ["BULLISH", "BEARISH", "NEUTRAL"] },
          "conviction_score": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "time_horizon": { "type": "string", "enum": ["SCALP", "SWING", "POSITION", "MACRO_REGIME"] },
          "expected_holding_days": { "type": "integer" },
          "price_targets": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "level": { "type": "number" },
                "weight": { "type": "number" }
              }
            }
          },
          "invalidation_price": { "type": "number" },
          "catalysts": { "type": "array", "items": { "type": "string" } },
          "is_promotional": { "type": "boolean" }
        }
      }
    },
    "macro_sentiment": {
      "type": "object",
      "properties": {
        "us_equities": { "type": "string", "enum": ["BULLISH", "BEARISH", "NEUTRAL"] },
        "crypto": { "type": "string", "enum": ["BULLISH", "BEARISH", "NEUTRAL"] },
        "volatility_regime": { "type": "string", "enum": ["COMPRESSING", "NORMAL", "EXPANDING"] }
      }
    }
  }
}
```

---

## Zero-Lookahead Alignment

To prevent lookahead bias in backtests:
- Video published timestamp $T_{\text{pub}}$ is anchored to the opening timestamp of the first available OHLCV bar strictly **after** $T_{\text{pub}} + T_{\text{ingest\_latency}}$:
  $$T_{\text{effective}} = \text{ceil}(T_{\text{pub}} + \Delta_{\text{processing}}, \Delta_{\text{bar\_interval}})$$
- Historical backtest fixtures strictly enforce $T_{\text{data\_as\_of}} \le T_{\text{bar\_open}}$.
