# Architecture

> Generated for the current trading-platform prototype on 2026-05-14.

## Overview

Sovereign is organized as a trading platform, not a personal-finance app. The active architecture is now centered on validated data, feature extraction, backtesting/research, strategy cataloging, broker execution, and dashboard mirrors. Legacy compatibility files remain, but they should not define the mental model for new work.

## System Diagram

```text
market / macro / news / sentiment sources
        |
        v
ingestion adapters
        |
        v
validated market frames + data quality reports
        |
        +--> indicators / feature frames --> CNN tensor builder --> model inference --> signals
        |
        +--> backtests / research / cost model / promotion gates
        |
        v
strategy decisions
        |
        v
pre-trade risk gates
        |
        v
paper broker or live broker adapter
        |
        v
trade log -> portfolio state -> monitoring, alerts, CLI, web API
```

## Components

### C++ Core

- **Purpose:** active high-performance asset calculations, indicators, backtests, risk checks, CNN inference boundary, and execution contracts.
- **Location:** `backend/core/src`
- **Key folders:** `assets`, `data`, `ingestion`, `features`, `ml`, `backtest`, `research`, `risk`, `strategies`, `execution`, `portfolio`

### CLI

- **Purpose:** orchestration layer for data refresh, signals, backtests, strategy scaffolding, portfolio state, execution, paper trading, retraining, and alerts.
- **Location:** `backend/cli`

### Web

- **Purpose:** thin dashboard and API surface for strategies, signals, portfolio, backtests, and monitoring.
- **Location:** `backend/api` and `Frontend/dashboard`

### Config

- **Purpose:** source lists, feature windows, strategy parameters, risk limits, regime routing, app mode, and alerts.
- **Location:** `config`

### Models

- **Purpose:** starter model artifacts and metadata for CNN and regime-classifier work.
- **Location:** `models`

## Data Flow

Validated data is the boundary between ingestion and calculations. Calculations, CNN tensors, backtests, signals, and portfolio marks should only consume records that have passed data quality checks.

## Integration Points

| Provider | Type | Status | Purpose |
|----------|------|--------|---------|
| Binance | API | **Active** | Crypto spot and futures data |
| Coinbase | API | **Active** | Crypto spot data |
| Kalshi | API | **Active** | Prediction market / Event data |
| Stooq | API | **Active** | Global equity and index history |
| Polymarket | API | **Active** | Prediction market data |
| Yahoo Finance | API | **Active** | Broad market history |
| Headway MT5 | File | **Active** | Local MT5 export bridge |
| Broker/exchange | API | *Planned* | Order routing after risk gates |

## Conventions

- Empty or comment-only files are legacy compatibility files that remain until the last cleanup pass.
- New trading modules should use existing folder names instead of creating parallel structures.
- Personal-finance logic is legacy/reference context.
- Research-only strategy signals should be labeled clearly and must not be presented as executable order flow unless the gateway path is wired end to end.
- Wage data is allowed only as macro labor-market or consumer-sentiment input.
- Live execution must default off.

## Technical Debt

- [ ] Many modules still need fuller interfaces.
- [ ] Build configuration does not yet compile the trading modules.
- [ ] Existing legacy wealth files are inconsistent with the trading-platform direction.
- [ ] Any remaining empty compatibility files in `backend/api`, `backend/cli`, or `Frontend/dashboard` need package/build definitions before they are runnable.
- [ ] Real test samples are needed for data quality, indicators, CNN tensor creation, risk gates, and portfolio accounting.
