# Social Media & YouTube Alpha Signal Pipeline (Research Specification)

> **Research and architectural specification only; not an active execution module.** This document outlines the ingestion architecture, natural language extraction schemas, Bayesian credibility scoring, and risk gating boundaries for extracting quantitative trade signals from YouTube creator channels and social media streams.

---

## 1. Executive Summary & Problem Formulation

Financial content creators on YouTube, X (Twitter), and Reddit frequently publish market commentary containing directional biases, technical price targets, and macro theses. However, converting unstructured multi-modal media into executable trading signals presents significant challenges:

1. **High Latency & Asynchrony**: Video production, editing, and publishing lag real-time market action by hours or days.
2. **Noise & Engagement Bias**: Sensationalist titles, clickbait thumbnails, and promotional shilling distort conviction.
3. **Ambiguity in Trade Parameters**: Verbal commentary often lacks explicit numerical invalidation levels, exact position sizing, or defined time horizons.
4. **Creator Track Record Variance**: Creator predictive accuracy is non-stationary and regime-dependent (e.g., trend-followers outperform in bull runs but fail in choppy ranges).

To exploit social sentiment without exposing capital to noise, this pipeline operates as an **asynchronous alpha signal feed** that passes through **Bayesian credibility filters** and **pre-trade risk validation** before reaching the strategy engine.

---

## 2. Ingestion Topology & Architecture

```text
[ External Media Sources ]
  ├── YouTube (Channels, Live, Shorts) ──► Transcript Extractor (yt-dlp / Web API)
  ├── Twitter / X ($CASHTAG feeds)      ──► Filtered Stream Ingestor
  └── Reddit (r/wallstreetbets, etc.)   ──► RSS / JSON Ingestor
                                                     │
                                                     ▼
                                      [ Raw Text & Metadata Buffer ]
                                                     │
                                                     ▼
                                      [ NLP / LLM Information Extractor ]
                                      (Entity Resolution, Horizon, Targets)
                                                     │
                                                     ▼
                                      [ Bayesian Credibility Engine ]
                                      (Historical Brier Score, Track Record)
                                                     │
                                                     ▼
                                      [ Structured Alpha Signal Bus ]
                                                     │
                                                     ▼
                                      [ Native C++ Pre-Trade Risk Gate ]
                                                     │
                                                     ▼
                                      [ Gated Execution / Paper Ledger ]
```

---

## 3. Multi-Source Ingestion Mechanisms

### A. YouTube Transcript Extraction Subsystem
- **Primary Mechanism (Zero-Key / Direct API)**:
  Extract official / auto-generated video subtitles via native timed-text XML endpoints (`youtube-transcript-api` / HTTPS requests to `timedtext` endpoints).
- **Secondary Mechanism (Local Whisper Transcriber)**:
  For videos without closed captions: download audio stream in 16kHz mono WAV format using `yt-dlp` and transcribe locally using embedded `whisper.cpp` (tiny.en or base.en model) on CPU/GPU without external API dependency.
- **Polling & Delta Detection**:
  Monitor channel RSS feeds (`https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}`) every 15 minutes. Process only new video IDs to minimize CPU and network overhead.

### B. Microblogging & Discussion Feeds (X / Reddit)
- **Twitter/X**: Scrape or stream cashtags (`$BTC`, `$ETH`, `$SPY`, `$NVDA`) from curated watchlists of institutional desks and verified analysts.
- **Reddit**: Ingest new posts and top-level comments from financial subreddits (`r/stocks`, `r/options`, `r/cryptocurrency`) via standard public JSON endpoints (`.json` appended to subreddit URLs).

---

## 4. NLP & LLM Signal Extraction Schema

Raw transcripts and posts are segmented into semantic chunks and evaluated against a strict JSON output schema using a local or hosted LLM reasoning model.

### Extraction JSON Schema
```json
{
  "source": {
    "platform": "youtube",
    "channel_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    "creator_name": "MacroQuantDesk",
    "content_id": "dQw4w9WgXcQ",
    "published_at_utc": "2026-09-12T14:30:00Z",
    "video_duration_seconds": 742
  },
  "extracted_signals": [
    {
      "symbol": "BTCUSD",
      "asset_class": "crypto",
      "direction": "BULLISH",
      "conviction_score": 0.85,
      "time_horizon": "SWING",
      "expected_holding_days": 14,
      "price_targets": [
        { "level": 68500.0, "weight": 0.6 },
        { "level": 72000.0, "weight": 0.4 }
      ],
      "invalidation_price": 59200.0,
      "catalysts": [
        "CPI downside surprise",
        "Weekly 200 EMA golden cross"
      ],
      "hedging_notes": "Recommends trailing stop if daily candle closes below 61k",
      "is_promotional_or_sponsored": false
    }
  ],
  "macro_sentiment": {
    "us_equities": "NEUTRAL",
    "crypto": "BULLISH",
    "volatility_regime": "EXPANDING"
  }
}
```

### Signal Field Semantics
- **`direction`**: `BULLISH` (+1), `BEARISH` (-1), or `NEUTRAL` (0).
- **`conviction_score`**: Continuous float `[0.0, 1.0]` based on linguistic certainty (modal verbs, stated risk allocation).
- **`time_horizon`**:
  - `SCALP`: Intraday (< 24 hours).
  - `SWING`: 1 to 30 days.
  - `POSITION`: > 30 days.
  - `MACRO_REGIME`: Multi-month economic cycle thesis.
- **`invalidation_price`**: Explicit stop-loss level mentioned by the creator; if omitted, the pipeline computes ATR-based default invalidation.
- **`is_promotional_or_sponsored`**: Flag indicating paid promotional content, token sponsorships, or affiliate disclosures. Signals with `true` are automatically rejected.

---

## 5. Bayesian Credibility & Decay Scoring

Raw signals from social media cannot be traded naively. The pipeline maintains an ongoing, historical **Creator Track Record Ledger** stored in `storage/data/social_signals/creator_reputation.json`.

### Credibility Formula
Each creator $c$ is assigned a dynamic credibility weight $W_c(t) \in [0.0, 1.0]$ updated after each resolved trade signal:

$$W_c(t) = \alpha \cdot \text{HitRate}_c + (1 - \alpha) \cdot \frac{\text{AvgProfit}_c}{\text{AvgLoss}_c} \times e^{-\lambda \Delta t}$$

Where:
- $\text{HitRate}_c$: Proportion of signals where market moved toward target price before hitting invalidation price.
- $\frac{\text{AvgProfit}_c}{\text{AvgLoss}_c}$: Historical profit factor of creator's directional calls.
- $e^{-\lambda \Delta t}$: Time-decay penalty penalizing stale track records or sudden performance degradation.
- Minimum track record threshold: A creator must have at least 10 resolved historical calls before their signals can graduate from `observation` to `active_paper`.

### Anti-Shill & Pump-and-Dump Filter
- **Liquidity Floor**: Signal symbols must have at least $5M 24h volume on US Equities or Binance/Coinbase L1 books. Low-cap tokens or penny stocks are hard-rejected.
- **Cross-Source Consensus**: When 3+ uncorrelated creators publish identical low-cap bullish calls within 2 hours, the signal is flagged as `SUSPECT_COORDINATED_PUMP` and rejected.

---

## 6. Integration Seams & Risk Engine Boundaries

```text
  [ Social Signal Bus ] ──(NDJSON Event)──► [ Strategy Engine ]
                                                   │
                                                   ▼
                                        [ Signal Combination ]
                                (Combines Technical + Social Bias)
                                                   │
                                                   ▼
                                        [ Native Risk Engine ]
                                  (Validates Sizing, Leverage, DD)
                                                   │
                                      Pass ──► [ Execution Gateway ]
                                      Fail ──► [ Rejection Log ]
```

1. **Non-Direct Execution**: Social signals NEVER route directly to broker execution adapters (`Mt5Adapter`, `AlpacaAdapter`, `PolymarketAdapter`).
2. **Strategy Alpha Input**: Social signals serve as an optional feature input to quantitative strategies (e.g. sentiment score used as a filter in mean-reversion or momentum models).
3. **Pre-Trade Risk Constraints**:
   - Maximum capital allocation per social signal: strictly capped at $\le 1.0\%$ of portfolio equity.
   - Global circuit breaker: If daily portfolio drawdown exceeds 2.5%, all social-driven trade inputs are disabled instantly.

---

## 7. Storage Layout & Artifact Directory Tree

When implemented, the social signals module will inhabit an isolated directory tree without polluting core trading logic:

```text
backend/
├── signals/
│   ├── social/
│   │   ├── extractors/
│   │   │   ├── youtube_transcript.js   # timedtext API & yt-dlp bridge
│   │   │   ├── reddit_ingestor.js      # Subreddit JSON stream
│   │   │   └── twitter_stream.js       # Cashtag monitor
│   │   ├── nlp/
│   │   │   ├── prompt_templates.js     # LLM extraction prompts
│   │   │   └── signal_parser.js        # Schema validator
│   │   ├── reputation/
│   │   │   └── bayesian_scorer.js      # Creator PnL attribution & Brier scoring
│   │   └── social_signal_bus.js        # Event emitter for strategy engine
storage/
└── data/
    └── social_signals/
        ├── transcripts/                 # Cached raw transcripts (.txt / .json)
        ├── signals.jsonl                # Immutable log of extracted signals
        └── creator_reputation.json      # Creator accuracy weights
```

---

## 8. Verification & Safe Testing Strategy

1. **Deterministic Fixture Replay**: Store historical YouTube video transcripts and market bar data in `tests/fixtures/social/` to test signal extraction without internet access.
2. **Mock LLM Evaluator**: Test schema extraction using deterministic canned LLM responses.
3. **Walk-Forward Attribution Testing**: Run backtests over 12 months of historical transcripts to measure empirical alpha before considering live integration.
