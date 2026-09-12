# Social Alpha Signal Architecture & Alternative Data Research

## Purpose & Scope

This research module defines an alternative alpha generation pipeline extracting structured trading signals from multi-modal social and financial media (YouTube video transcripts, Twitter/X cashtag streams, Reddit sentiment, and financial RSS news).

> **Non-Pollution Safety Invariant**: This research subsystem operates strictly out-of-process. Social alpha signals cannot trigger direct execution on production broker gateways. All generated factor streams route solely to virtual paper simulation and offline walk-forward backtests.

---

## Research Suite Structure

1. [01. Architecture & Multi-Modal Ingestion](01_ARCHITECTURE_AND_INGESTION.md) — Media feeds, `yt-dlp` subtitle extraction, audio transcription fallback, and rate-limited worker topology.
2. [02. Financial NLP & Transcript Extraction](02_TRANSCRIPT_NLP_EXTRACTION.md) — Timed text chunking, ticker/entity disambiguation ($BTC, $ETH, NVDA, SPY), and strict JSON schema extraction.
3. [03. Sentiment Scoring & Signal Decay](03_SENTIMENT_SCORING_AND_DECAY.md) — Multi-dimensional polarity scoring, conviction normalization, and exponential half-life decay math.
4. [04. Contrarian Alpha & Backtesting Formulation](04_CONTRARIAN_ALPHA_FORMULATION.md) — Retail consensus reversal hypotheses, Bayesian creator credibility tracking, anti-shill liquidity filters, and point-in-time backtest integration.

---

## Pipeline Topology

```
[YouTube / X / RSS Feed]
           │
           ▼
[Ingestion & Caption Fetch]  ──> yt-dlp / TimedText API (Zero-Key)
           │
           ▼
[Text Chunking & Normalization] ──> Token timestamps & speaker boundaries
           │
           ▼
[Financial NLP & Disambiguation] ──> Structured JSON Signal Payload
           │
           ▼
[Bayesian Credibility Weighting] ──> Brier track-record score & volume floor
           │
           ▼
[Exponential Signal Decay] ──> S(t) = S0 * 2^(-dt / tau_half)
           │
           ▼
[Contrarian Strategy Hypothesis] ──> Sentiment extremes -> Mean-reversion bias
           │
           ▼
[Virtual Paper Ledger / Backtest] ──> Isolated paper verification
```

---

## Data Flow & Storage Contracts

- **Raw Ingestion Cache**: `storage/data/research/social/raw/` (unprocessed video metadata and transcripts, gitignored).
- **Normalized Factor Feed**: `storage/data/research/social/factors/` (NDJSON structured factor records matching `shared/contracts/analysis/constants.js`).
- **Creator Track Record Ledger**: `storage/data/research/social/ledger/creator_reputation.json` (Bayesian hit-rate and Brier accuracy matrix).
