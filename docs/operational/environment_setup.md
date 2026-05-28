# Environment Checklist

Use this file as the short onboarding list for external keys and credentials. The repo already contains source contracts for market data, macro, sentiment, on-chain, prediction markets, and future broker access. Check the items you actually have in place.

## Core Market And Macro

- [X] `FRED_API_KEY` for macro series such as CPI, PPI, rates, unemployment, GDP, retail sales, and consumer confidence
- [ ] `TRUFLATION_API_KEY` for alternative inflation and macro series
- [ ] `SPGLOBAL_API_KEY` for PMI-style commercial macro data
- [X] `ALPHA_VANTAGE_API_KEY` for an extra market data source
- [X] `POLYGON_API_KEY` for richer market, options, or breadth data
- [X] `ALPACA_API_KEY` and `ALPACA_API_SECRET` for Alpaca market data or paper trading
- [ ] `IBKR_API_KEY` or broker credentials for Interactive Brokers demo or paper access

## Crypto

- [X] `BINANCE_API_KEY` and `BINANCE_API_SECRET` for authenticated Binance access
- [X] `COINBASE_API_KEY` and `COINBASE_API_SECRET` for Coinbase access
- [ ] `BLOCKCHAIR_API_KEY` for on-chain and transaction data

## Sentiment And News

- [ ] `ALTERNATIVE_ME_API_KEY` for fear-and-greed and market sentiment
- [X] `NEWSAPI_API_KEY` for news headlines and article-driven sentiment
- [ ] `CRYPTOPANIC_API_KEY` for crypto news and sentiment
- [X] `GOOGLE_API_KEY` and/or `GOOGLE_CSE_ID` for search-interest and custom search features

## Prediction Markets

- [ ] `KALSHI_API_KEY` and `KALSHI_API_SECRET` for Kalshi data and trading
- [X] `POLYMARKET_API_KEY` if you later add authenticated Polymarket access

## FX, Weather, And Aviation-Adjacency

- [ ] `FXAPI_API_KEY` for FX market data
- [X] `NASA_POWER_API_KEY` if your NASA POWER usage requires a key
- [ ] `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` for flight and aviation data
- [ ] `MARINETRAFFIC_API_KEY` for cargo and shipping data

## Broker Or Execution Later

- [ ] `BROKER_API_KEY` or broker-specific credentials for any live or demo execution path
- [ ] `BROKER_API_SECRET` or equivalent secret for that broker
- [ ] `BROKER_PAPER_MODE=true` or an equivalent safe-mode flag
- [ ] `BROKER_LIVE_MODE=false` until live execution is explicitly approved

## Good Practices

- [ ] Put secrets in `.env`, not in committed config files
- [ ] Redact secrets from logs, URLs, and generated JSON artifacts
- [ ] Prefer paper or demo accounts first
- [ ] Add only the providers you are ready to validate
- [ ] Keep live broker keys out of the CLI unless execution is intentionally enabled

## Suggested First Wave

- [X] `FRED_API_KEY`
- [X] `ALPACA_API_KEY` and `ALPACA_API_SECRET`
- [X] `BINANCE_API_KEY` and `BINANCE_API_SECRET`
- [X] `COINBASE_API_KEY` and `COINBASE_API_SECRET`
- [ ] `ALTERNATIVE_ME_API_KEY`
- [X] `NEWSAPI_API_KEY`
- [X] `POLYGON_API_KEY`
- [ ] `TRUFLATION_API_KEY`

## Notes

- `config/data_sources.yaml` is the main source map for which providers the repo expects.
- Some providers may offer public endpoints for limited data, but authenticated access is usually needed for reliable production use.
- If you only want OHLCV and sample research, you can start with the free/public paths already in the CLI and add keys later.
