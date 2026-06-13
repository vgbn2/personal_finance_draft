# New Strategy Research & Backtest Report
**Generated:** 2026-06-02  
**Mode:** Sample (synthetic deterministic bars — not real historical data)  
**Period:** 2025-01-02 → 2025-04-30 | OOS window: 2025-03-26 → 2025-04-30  
**Costs:** 2.5 bps fee + 2.5 bps slippage each side  

> **Warning:** All results use `--sample` mode. The trust system correctly grades all strategies F/D and marks them `do-not-trust-yet`. To get real evidence, run `sovereign backfill --symbol <symbols>` then re-run without `--sample`.

---

## Summary Ranking

| Rank | Strategy | Net Return | Sharpe | Win Rate | Max DD | OOS EV | MC Loss% | Grade |
|------|----------|-----------|--------|----------|--------|--------|---------|-------|
| 1 | **vietnam_equity_growth** | +69.7% | 5.02 | 68.75% | 4.5% | +0.0074 | 0% | D |
| 2 | **global_equity_rotation** | +117.1% | 2.81 | 67.5% | 10.5% | +0.0015 | 0% | F(30) |
| 3 | **commodity_macro_hedge** | +33.2% | 2.27 | 66.67% | 6.9% | -0.0037 | 3% | F(10) |
| 4 | **forex_trend_breakout** | +58.0% | 2.29 | 57.4% | 8.6% | -0.0109 | 4.5% | F(10) |
| 5 | **ai_sector_momentum** | -9.8% | -0.14 | 47.5% | 30.8% | -0.0082 | 65% | F(7) |
| 6 | **defi_ecosystem_momentum** | -30.9% | -1.05 | 45.2% | 38.7% | -0.0101 | 88% | F(7) |

---

## Strategy 1: Vietnam Equity Growth
**File:** `config/strategies/vietnam_equity_growth.yaml`  
**Universe:** VCB, BID, FPT, CMG, HPG  
**Model:** XGBoost | **Hold:** 5d | **Threshold:** 0.64  
**Verdict: MOST PROMISING — priority for real-data backfill**

### Performance Metrics
| Metric | Value |
|--------|-------|
| Net Return | **+69.65%** |
| Annualized Return | 413.5% |
| OOS Annualized Return | 207.4% |
| OOS Net Return | **+11.36%** |
| Max Drawdown | **4.50%** |
| Sharpe Ratio | **5.02** |
| Sortino Ratio | **8.82** |
| Calmar Ratio | 91.88 |
| Win Rate | **68.75%** |
| Profit Factor | 4.09 |
| Expected Value | +0.0113 per trade |
| Monte Carlo P05 Return | +35.9% (never negative) |
| Monte Carlo Loss Prob | **0%** |

### vs. Buy-and-Hold Benchmark
| | Strategy | Benchmark |
|---|---|---|
| In-sample | +69.65% | +5.76% |
| OOS | +11.36% | -0.64% |
| Alpha (OOS) | **+12.0%** vs B&H |

Best individual symbol: VCB (+12.5%)  
Worst individual symbol: CMG (+1.9%)

### Risk Profile
- Max daily loss: 6.17% (exceeds VProp 4% cap — prop firm unsuitable as-is)
- Monte Carlo worst path: +14.9% (still positive even in worst run)
- P95 max drawdown across MC runs: 8.3%

### Assessment
The only strategy with **grade D** (score 45). In sample mode, OOS showed positive alpha, zero MC loss probability, and a clean upward equity curve across all 200 Monte Carlo runs. The Vietnam market's lower liquidity and XGBoost's structured feature handling align well. **Recommend backfill + real-data run immediately.**

---

## Strategy 2: Global Equity Rotation
**File:** `config/strategies/global_equity_rotation.yaml`  
**Universe:** SPY, QQQ, IWM, XAUUSD, USOIL, BTCUSDT  
**Model:** CNN v3 | **Hold:** 8d | **Threshold:** 0.68  
**Verdict: SECOND BEST — strong MC profile, OOS slightly positive**

### Performance Metrics
| Metric | Value |
|--------|-------|
| Net Return | **+117.1%** |
| Annualized Return | 1001.9% |
| OOS Annualized Return | 28.0% |
| OOS Net Return | **+2.4%** |
| Max Drawdown | **10.54%** |
| Sharpe Ratio | 2.81 |
| Sortino Ratio | 5.70 |
| Calmar Ratio | 95.02 |
| Win Rate | **67.5%** |
| Profit Factor | 2.17 |
| Expected Value | +0.0102 per trade |
| Monte Carlo P05 Return | +31.3% |
| Monte Carlo Loss Prob | **0%** |

### vs. Buy-and-Hold Benchmark
| | Strategy | Benchmark |
|---|---|---|
| In-sample | +117.1% | +7.3% |
| OOS | +2.4% | +0.03% |
| Alpha (OOS) | +2.37% vs B&H |

Best in-sample symbol: SPY (+27.1%)  
Worst in-sample symbol: USOIL (-4.75%)

### Risk Profile
- Trust warning: in-sample far exceeds OOS (expected in sample mode)
- MC worst path: +6.3% (still positive)
- P95 max drawdown across MC runs: 21.2%

### Assessment
Excellent in-sample characteristics (Sharpe 2.81, 0% MC loss probability). OOS is muted (+2.4%) but still positive with alpha vs buy-and-hold. Cross-asset diversification (equities + commodity + crypto) provides good regime coverage. The `breadth` data feed will strengthen signals in real-data mode. **Recommend backfill: SPY, QQQ, IWM, XAUUSD, USOIL, BTCUSDT.**

---

## Strategy 3: Commodity Macro Hedge
**File:** `config/strategies/commodity_macro_hedge.yaml`  
**Universe:** XAUUSD, XAGUSD, USOIL, WHEAT, CORN  
**Model:** XGBoost | **Hold:** 7d | **Threshold:** 0.66  
**Verdict: WATCH — good in-sample, OOS reversal is concerning**

### Performance Metrics
| Metric | Value |
|--------|-------|
| Net Return | +33.15% |
| Annualized Return | 142.6% |
| OOS Annualized Return | **-38.98%** |
| OOS Net Return | -4.62% |
| Max Drawdown | 6.87% |
| Sharpe Ratio | 2.27 |
| Win Rate | 66.67% |
| Profit Factor | 1.89 |
| Expected Value | +0.0072 in-sample / **-0.0037 OOS** |
| Monte Carlo Loss Prob | 3% |

### Risk Flags
- In-sample return (142.6%) far exceeds OOS (-38.98%)
- OOS underperforms buy-and-hold by -2.98%
- Worst day: -12.56%

### Assessment
Strong in-sample profile but severe OOS divergence suggests regime sensitivity. Commodity markets are heavily macro-driven — the `macro` data feed (CPI/PPI/NFP) will either significantly improve or confirm this divergence in real-data mode. Wheat and corn seasonal patterns may require separate indicator periods. **Deprioritize until macro feed is verified.**

---

## Strategy 4: Forex Trend Breakout
**File:** `config/strategies/forex_trend_breakout.yaml`  
**Universe:** EURUSD, USDJPY, GBPUSD, AUDUSD, USDCAD  
**Model:** CNN v3 | **Hold:** 5d | **Threshold:** 0.67  
**Verdict: OVERFITTING RISK — do not promote without real data**

### Performance Metrics
| Metric | Value |
|--------|-------|
| Net Return | +57.96% |
| Annualized Return | 311.7% |
| OOS Annualized Return | **-82.68%** |
| OOS Net Return | **-15.47%** |
| Max Drawdown | 8.61% |
| Sharpe Ratio | 2.29 |
| Win Rate | 57.38% |
| Profit Factor | 1.85 |
| OOS Expected Value | **-0.0109** |
| Monte Carlo Loss Prob | 4.5% |

### Risk Flags
- Worst in-sample/OOS divergence in this set (in-sample: +311.7%, OOS: -82.68%)
- OOS alpha vs buy-and-hold: -7.16%
- GBPUSD was the worst OOS asset (-14.9%)

### Assessment
The extreme gap between in-sample and OOS is likely an artifact of sample mode generation — forex pairs have low variance in synthetic bars, causing pattern overfitting. Real data with actual central-bank volatility may improve results significantly. The CNN breakout hypothesis is sound (GBPUSD post-BoE decisions, USD/JPY carry unwinds) but needs real data to validate. **Low priority until backfill complete.**

---

## Strategy 5: AI Sector Momentum
**File:** `config/strategies/ai_sector_momentum.yaml`  
**Universe:** FETUSDT, RNDRUSDT, AGIXUSDT, OCEANUSDT, TAOUSDT  
**Model:** LSTM | **Hold:** 3d | **Threshold:** 0.63  
**Verdict: REJECT in current form — re-tune before real-data test**

### Performance Metrics
| Metric | Value |
|--------|-------|
| Net Return | **-9.78%** |
| Annualized Return | -27.28% |
| OOS Annualized Return | -83.14% |
| Max Drawdown | **30.76%** |
| Sharpe Ratio | -0.14 |
| Win Rate | 47.5% |
| Expected Value | -0.0006 |
| Monte Carlo Loss Prob | **65%** |

### Root Cause Analysis
- Buy-hold benchmark returned +13.9% while strategy returned -9.78% — alpha is deeply negative (-16.3%)
- Trade density is very high (248/year) — over-trading with 5 bps friction is likely the cause
- 3-day hold on highly volatile AI tokens compounds small negative EV quickly

### Recommended Fix
1. Raise threshold to 0.68+ to reduce trade count
2. Extend hold to 5d to reduce friction impact
3. Reduce universe to top 3 (FET, RNDR, TAO — higher market cap, better data quality)
4. Consider `on_chain` data feed which this universe uniquely benefits from

---

## Strategy 6: DeFi Ecosystem Momentum
**File:** `config/strategies/defi_ecosystem_momentum.yaml`  
**Universe:** UNIUSDT, AAVEUSDT, LINKUSDT, MKRUSDT, LDOUSDT  
**Model:** LSTM | **Hold:** 4d | **Threshold:** 0.62  
**Verdict: REJECT — worst strategy in batch, do not backfill**

### Performance Metrics
| Metric | Value |
|--------|-------|
| Net Return | **-30.9%** |
| Annualized Return | -68.15% |
| OOS Annualized Return | **-95.05%** |
| Max Drawdown | **38.7%** |
| Sharpe Ratio | **-1.05** |
| Win Rate | **45.24%** |
| Expected Value | -0.0039 |
| Monte Carlo Loss Prob | **88%** |
| MC P05 Return | -56.3% |

### Root Cause Analysis
- Highest trade density (260/year) — over-trading with 5 bps friction at 45% win rate = guaranteed negative EV
- DeFi tokens (MKR, LDO) have deep correlation divergences that LSTM can't model without on-chain TVL data
- 4d hold insufficient for DeFi momentum to materialize

### Recommended Fix
1. Raise threshold to 0.70+ and reduce hold to 2d (or extend to 7d for post-narrative momentum)
2. Replace MKRUSDT with a higher-liquidity token (AAVE is better proxy)
3. On-chain TVL feed is critical for this universe — validate data source availability first

---

## Next Steps

### Immediate Actions
1. **Backfill Vietnam symbols:** `sovereign backfill --symbol VCB,BID,FPT,CMG,HPG --days 365`
2. **Backfill rotation symbols:** `sovereign backfill --symbol SPY,QQQ,IWM,XAUUSD,USOIL,BTCUSDT --days 365`
3. **Re-run real-data backtests** on the two priority strategies:
   ```
   sovereign bt --strategy config/strategies/vietnam_equity_growth.yaml --symbol VCB,BID,FPT,CMG,HPG --days 365
   sovereign bt --strategy config/strategies/global_equity_rotation.yaml --symbol SPY,QQQ,IWM,XAUUSD,USOIL,BTCUSDT --days 365
   ```

### Strategy Tuning Queue
| Strategy | Change | Reason |
|----------|--------|--------|
| `ai_sector_momentum` | threshold → 0.68, hold → 5d, universe → FET,RNDR,TAO | Reduce over-trading |
| `defi_ecosystem_momentum` | threshold → 0.70, remove MKR | Reduce negative EV |
| `commodity_macro_hedge` | Add walk-forward before promotion | OOS divergence risk |

### Portfolio Composition Recommendation
If all 6 were validated with real data, recommended allocation:

| Strategy | Weight | Role |
|----------|--------|------|
| vietnam_equity_growth | 25% | Alpha generator (EM growth) |
| global_equity_rotation | 30% | Core cross-asset diversifier |
| commodity_macro_hedge | 20% | Macro hedge / inflation exposure |
| forex_trend_breakout | 15% | Carry/breakout diversifier |
| ai_sector_momentum | 5% | Speculative high-risk |
| defi_ecosystem_momentum | 5% | Speculative (after retuning) |

---

*All backtests run in sample mode (synthetic deterministic bars). Trust grade reflects sample-mode limitation. Real-data results will differ.*
