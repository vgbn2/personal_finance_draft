# 01. Architecture & Multi-Modal Ingestion

## System Overview

The ingestion tier aggregates asynchronous media broadcasts from high-influence financial content creators and market commentators. It decouples audio/video acquisition from natural language understanding and downstream alpha calculation.

---

## Multi-Modal Ingestion Sources

| Provider Type | Ingestion Mechanism | Ingestion Latency | Key Requirements | Fallback Strategy |
|---|---|---|---|---|
| **YouTube Channels** | RSS feed polling (`feeds/videos.xml?channel_id=...`) | 5–15 minutes | Zero-key public RSS endpoint | Direct channel HTML scrape |
| **YouTube Captions** | TimedText XML via `youtube-transcript-api` / `yt-dlp` | 2–5 seconds / video | Zero-key auto-caption endpoint | Local Whisper.cpp 16kHz audio transcription |
| **Financial Tweets / X** | Filtered streaming API / Nitter mirror | Real-time (&lt; 30s) | Cashtag regex matching | RSS feed aggregation |
| **Financial News / RSS** | Atom/RSS syndication (Reuters, Bloomberg, PR Newswire) | 1–3 minutes | Zero-key XML parsing | Local scraper daemon |

---

## Ingestion Architecture & Storage Layout

```
                         INGESTION WORKER POOL
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
┌────────▼─────────┐      ┌────────▼────────┐      ┌─────────▼────────┐
│ YouTube Ingestor │      │ Cashtag Stream  │      │ News RSS Worker  │
│ (Channel Poller) │      │ (Twitter / X)   │      │ (Syndication)    │
└────────┬─────────┘      └────────┬────────┘      └─────────┬────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                         ┌─────────▼────────┐
                         │ Raw Media Cache  │
                         │ (storage/data/   │
                         │  research/raw/)  │
                         └─────────┬────────┘
                                   │
                         ┌─────────▼────────┐
                         │ Audio Extraction │
                         │ (yt-dlp -x)      │
                         └─────────┬────────┘
                                   │
                         ┌─────────▼────────┐
                         │ Transcription    │
                         │ (Whisper.cpp)    │
                         └──────────────────┘
```

---

## Zero-Key Captions Extraction Protocol

To maintain the platform's **Zero-Key Development** guarantee:
1. **Primary Ingestion**: Fetch timed subtitle tracks directly from YouTube's public TimedText endpoint using `yt-dlp`:
   ```bash
   yt-dlp --skip-download --write-auto-subs --sub-lang en --sub-format ttml -o "%(id)s" "https://www.youtube.com/watch?v=VIDEO_ID"
   ```
2. **Audio Fallback**: When subtitles are disabled or unavailable, extract 16kHz mono audio and transcribe locally using `whisper.cpp`:
   ```bash
   yt-dlp -x --audio-format wav --audio-quality 16K -o "sample.wav" "VIDEO_URL"
   ./whisper.cpp/main -m models/ggml-base.en.bin -f sample.wav -oj
   ```

---

## Rate Limiting & Resource Constraints

- **Concurrency Ceiling**: Max 2 concurrent transcription workers to prevent CPU exhaustion on constrained hosts.
- **Cache Invalidation**: Videos older than 72 hours are pruned from local raw audio storage; parsed transcript JSONs are permanently retained in NDJSON format.
- **Failure Handling**: Network timeouts (HTTP 429 / 503) trigger exponential backoff with jitter:
  $$T_{\text{backoff}} = \min(300, 2^{\text{retries}} \times 5) \pm \text{jitter}$$
