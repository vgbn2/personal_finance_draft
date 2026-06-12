"""
RSI Signal Strength Analyzer — Cross-Timeframe Reversal Quality
v4: Regime + Bayesian + Duration + MAE + Kelly + Recovery Signal + OOS
================================================================
Outputs (in order):
  1. Main table       : frequentist stats + trust tier per asset/TF
  2. Regime breakdown : bull vs bear split, regime-dependent flag
  3. Signal flags     : REVERSAL / MOMENTUM / WEAK / NOISE
  4. Bayesian summary : posterior hit rate, P(hit>50%), P(norm>0)
  5. Duration breakdown: outcomes by episode length (1-3 / 4-10 / 11+)
  6. Heatmap          : 3 metrics × 2 conditions

Math formulas are annotated in each section header.

Core metric:
  r_norm = r_raw / ATR%_t = r_raw * C_t / ATR_t
  "how many volatility units did price move?" — comparable across all TFs
"""

import warnings; warnings.filterwarnings('ignore')

import json
import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.colors import TwoSlopeNorm
from typing import Optional
from scipy import stats

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

ASSETS = [
    # Crypto
    "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD",
    # US Equities
    "SPY", "QQQ", "IWM",
    # Bonds
    "TLT",
    # Commodities
    "GLD", "SLV", "USO",
    # FX / Macro
    "DX-Y.NYB",
]

# regime_ma: bars for MA used to split bull/bear
#   calibrated to ~200-day equivalent per timeframe
#   1h  → 4800 bars ≈ 200 days of hourly data
#   1d  → 200 bars  = 200 days
#   1wk → 52  bars  ≈ 1 year
#   1mo → 12  bars  = 1 year
TIMEFRAMES = {
    "1h":  dict(interval="1h",  period="730d", forward_bars=48, regime_ma=4800),
    "1d":  dict(interval="1d",  period="10y",  forward_bars=21, regime_ma=200),
    "1wk": dict(interval="1wk", period="20y",  forward_bars=4,  regime_ma=52),
    "1mo": dict(interval="1mo", period="30y",  forward_bars=3,  regime_ma=12),
}

RSI_PERIOD    = 14
ATR_PERIOD    = 14
OVERSOLD_TH   = 30.0
OVERBOUGHT_TH = 70.0
MIN_SIGNALS   = 5

# Bayesian priors
# Beta(2,2): centers at 0.5 hit rate — efficient market skepticism.
# Increase (e.g. Beta(5,5)) for stronger skepticism requiring more data to move the posterior.
BAYES_PRIOR_A = 2.0
BAYES_PRIOR_B = 2.0

# Trust tier thresholds
TIER_HIGH_N   = 20     # min raw N for HIGH tier
TIER_MED_N    = 10     # min raw N for MED tier
REGIME_DIV_PP = 0.15   # hit-rate pp gap above which signal is regime-dependent

# Cost model & walk-forward
# COST_PCT : round-trip cost fraction (fees + half-spread). 0.001 = 10bps = typical CEX.
# OOS_DATE : if set, results are split into in-sample (before) and out-of-sample (after).
#            Set to None to disable. Format: "YYYY-MM-DD"
COST_PCT = 0.0010
OOS_DATE = "2023-01-01"    # set to None to disable OOS split

# ══════════════════════════════════════════════════════════════════════════════
# INDICATORS
# ══════════════════════════════════════════════════════════════════════════════
#
#  RSI (Wilder's smoothing, alpha = 1/period):
#    gain_t, loss_t  = max(delta,0), max(-delta,0)
#    AG_t = EWM(gain, com=period-1)   [alpha = 1/period]
#    AL_t = EWM(loss, com=period-1)
#    RSI_t = 100 - 100 / (1 + AG_t / AL_t)
#
#  ATR:
#    TR_t  = max( H_t-L_t,  |H_t-C_{t-1}|,  |L_t-C_{t-1}| )
#    ATR_t = EWM(TR, com=period-1)
#
#  ATR% (volatility baseline, price-normalised):
#    ATR%_t = ATR_t / C_t   → comparable across assets and price levels

def calc_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    d = close.diff()
    g = d.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
    l = (-d.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
    return 100 - 100 / (1 + g / l.replace(0, np.nan))


def calc_atr(high: pd.Series, low: pd.Series, close: pd.Series,
             period: int = 14) -> pd.Series:
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low  - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(com=period - 1, min_periods=period).mean()


def calc_ma(close: pd.Series, period: int) -> pd.Series:
    return close.rolling(period, min_periods=max(10, period // 4)).mean()

# ══════════════════════════════════════════════════════════════════════════════
# REGIME
# ══════════════════════════════════════════════════════════════════════════════
#
#  MA_{equiv200d}(t) = rolling_mean(Close, k)
#    k: 4800 (1h), 200 (1d), 52 (1wk), 12 (1mo)  — all ≈ 200 calendar days
#
#  regime_t = bull    if C_t >  MA_t
#             bear    if C_t <= MA_t
#             unknown if MA_t = NaN  (not yet converged)

def tag_regime(close: pd.Series, ma_period: int) -> pd.Series:
    """
    'bull' = price above MA(ma_period)
    'bear' = price below MA(ma_period)
    'unknown' = MA not yet converged
    Regime MA period is calibrated to ~200-day equivalent per TF (see CONFIG).
    """
    ma = calc_ma(close, ma_period)
    regime = pd.Series('unknown', index=close.index, dtype=object)
    valid  = ma.notna()
    regime[valid] = np.where(close[valid] > ma[valid], 'bull', 'bear')
    return regime

# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL DETECTION
# ══════════════════════════════════════════════════════════════════════════════
#
#  Crossover (oversold entry):
#    signal_t = 1  iff  RSI_t < threshold  AND  RSI_{t-1} >= threshold
#  Crossover (overbought entry):
#    signal_t = 1  iff  RSI_t > threshold  AND  RSI_{t-1} <= threshold
#
#  One signal per episode — no double-counting of extended zone stays.

def crossover_signals(s: pd.Series, level: float, direction: str) -> pd.Index:
    """
    Returns index where RSI crosses the level.
    'below': was >= level, now < level  (oversold entry)
    'above': was <= level, now > level  (overbought entry)
    """
    prev = s.shift(1)
    mask = (s < level) & (prev >= level) if direction == 'below' \
      else (s > level) & (prev <= level)
    return s.index[mask.fillna(False)]

# ══════════════════════════════════════════════════════════════════════════════
# CLUSTER-ADJUSTED N
# ══════════════════════════════════════════════════════════════════════════════
#
#  Two signals at positions i < j belong to the same cluster iff:
#    j - i <= forward_bars   (their measurement windows overlap)
#
#  N_eff = count of distinct clusters
#
#  Corrects for burst clustering: N_raw=289 (BTC 1h) may collapse to
#  N_eff~60 when signals bunch during volatile episodes.

def count_clusters(positions: list, fwd_bars: int) -> int:
    """
    Signals within fwd_bars of each other share the same trade window
    and are NOT independent observations. Count distinct clusters instead.

    Example: 10 signals each 6 bars apart with fwd_bars=48
    → all within the same event → 1 cluster, not 10.
    """
    if not positions:
        return 0
    clusters = 1
    for i in range(1, len(positions)):
        if positions[i] - positions[i - 1] > fwd_bars:
            clusters += 1
    return clusters


# ══════════════════════════════════════════════════════════════════════════════
# DURATION PRECOMPUTATION  O(N) → replaces O(S×N) inner loops
# ══════════════════════════════════════════════════════════════════════════════
#
#  forward_dur[i]  = consecutive bars FROM i where RSI stays in zone
#                    used by crossover signals (signal fires at zone entry)
#  backward_dur[i] = consecutive bars BEFORE i where RSI was in zone
#                    used by recovery signals (signal fires at zone exit)
#
#  Both arrays computed in a single O(N) scan each.
#  All episode length lookups in measure_outcomes become O(1).

def precompute_durations(rsi: pd.Series, threshold: float,
                         direction: str) -> tuple:
    """
    O(N) precomputation. direction: 'below' or 'above'.
    Returns (forward_dur, backward_dur) as int32 numpy arrays.
    """
    vals = rsi.values.astype(float)
    n    = len(vals)
    in_zone = (vals < threshold) if direction == 'below' else (vals > threshold)
    in_zone[np.isnan(vals)] = False

    # forward: scan right-to-left
    fwd = np.zeros(n, dtype=np.int32)
    for i in range(n - 2, -1, -1):
        if in_zone[i]:
            fwd[i] = 1 + fwd[i + 1]
        # else stays 0
    if in_zone[n - 1]:
        fwd[n - 1] = 1

    # backward: scan left-to-right
    bwd = np.zeros(n, dtype=np.int32)
    for i in range(1, n):
        if in_zone[i - 1]:
            bwd[i] = 1 + bwd[i - 1]
        # else stays 0

    return fwd, bwd


# ══════════════════════════════════════════════════════════════════════════════
# OUTCOME MEASUREMENT
# ══════════════════════════════════════════════════════════════════════════════
#
#  Raw return (long / oversold bounce):
#    r_raw = (C_{t+n} - C_t) / C_t
#  Raw return (short / overbought fade):
#    r_raw = (C_t - C_{t+n}) / C_t        [positive if price fell]
#
#  ATR-normalised return  [primary cross-TF metric]:
#    r_norm = r_raw / ATR%_t = r_raw * C_t / ATR_t
#    Interpretation: "how many volatility units did price move?"
#    1h ATR× and 1wk ATR× are directly comparable.
#
#  Max excursion (best achievable in window):
#    r_max      = (max(H_{t+1..t+n}) - C_t) / C_t        [long]
#    r_max_norm = r_max / ATR%_t
#    r_norm / r_max_norm = fraction of available move captured at t+n
#
#  Score  =  hit_rate * avg(r_norm)   [expected-value proxy]
#
#  Episode duration  d_t:
#    d_t = number of consecutive bars RSI stays in zone from signal bar
#    Buckets: short (1-3), medium (4-10), extended (11+)
#    Tests hypothesis: longer episodes → stronger OR weaker reversal?

def measure_outcomes(df: pd.DataFrame, signals: pd.Index, fwd: int,
                     atr_s: pd.Series, mode: str,
                     regime_s: pd.Series,
                     rsi_s: pd.Series = None,
                     threshold: float = None,
                     cost_pct: float = 0.0,
                     signal_type: str = 'crossover',
                     _fwd_dur: np.ndarray = None,
                     _bwd_dur: np.ndarray = None) -> pd.DataFrame:
    """
    mode='long'  : oversold  → expect rise
    mode='short' : overbought → expect fall
    signal_type : 'crossover' = RSI enters zone (forward duration)
                  'recovery'  = RSI exits zone  (backward duration)

    Columns returned:
      raw_ret, net_raw_ret, norm_ret, net_norm_ret,
      max_ret, max_norm, mae, mae_norm,
      atr_pct, hit, net_hit, regime, pos, duration, dur_bucket, signal_type

    mae        : max adverse excursion as % of entry price
    mae_norm   : mae / atr_pct  — "how many ATRs against you before exit"
    net_*      : after subtracting cost_pct round-trip
    duration   : bars in zone (forward for crossover, backward for recovery)
    """
    close = df['Close']
    high  = df['High']
    low   = df['Low']
    rows  = []

    for dt in signals:
        try:
            i = df.index.get_loc(dt)
        except KeyError:
            continue
        if i + fwd >= len(df):
            continue

        ep      = float(close.iloc[i])
        xp      = float(close.iloc[i + fwd])
        atr_val = float(atr_s.iloc[i])

        if ep <= 0 or np.isnan(atr_val) or atr_val <= 0:
            continue

        atr_pct = atr_val / ep

        if mode == 'long':
            raw_ret = (xp - ep) / ep
            max_ret = (float(high.iloc[i + 1:i + fwd + 1].max()) - ep) / ep
            mae     = (ep - float(low.iloc[i + 1:i + fwd + 1].min())) / ep
        else:
            raw_ret = (ep - xp) / ep
            max_ret = (ep - float(low.iloc[i + 1:i + fwd + 1].min())) / ep
            mae     = (float(high.iloc[i + 1:i + fwd + 1].max()) - ep) / ep

        net_raw_ret = raw_ret - cost_pct
        regime      = str(regime_s.iloc[i]) if i < len(regime_s) else 'unknown'

        # ── Episode duration  (O(1) lookup via precomputed arrays)
        duration = 0
        if _fwd_dur is not None and signal_type == 'crossover':
            duration = int(_fwd_dur[i])
        elif _bwd_dur is not None and signal_type == 'recovery':
            duration = int(_bwd_dur[i])
        elif rsi_s is not None and threshold is not None:
            # fallback O(D) scan if arrays not supplied
            in_zone = (lambda v: v < threshold) if mode == 'long' \
                 else (lambda v: v > threshold)
            if signal_type == 'crossover':
                for k in range(i, len(rsi_s)):
                    rv = float(rsi_s.iloc[k])
                    if np.isnan(rv): break
                    if in_zone(rv): duration += 1
                    else: break
            else:
                for k in range(i - 1, -1, -1):
                    rv = float(rsi_s.iloc[k])
                    if np.isnan(rv): break
                    if in_zone(rv): duration += 1
                    else: break

        if duration <= 3:
            dur_bucket = '1-3 bars'
        elif duration <= 10:
            dur_bucket = '4-10 bars'
        else:
            dur_bucket = '11+ bars'

        rows.append(dict(
            dt           = dt,
            pos          = i,
            raw_ret      = raw_ret,
            net_raw_ret  = net_raw_ret,
            max_ret      = max_ret,
            mae          = mae,
            norm_ret     = raw_ret      / atr_pct,
            net_norm_ret = net_raw_ret  / atr_pct,
            max_norm     = max_ret      / atr_pct,
            mae_norm     = mae          / atr_pct,
            atr_pct      = atr_pct,
            hit          = int(raw_ret > 0),
            net_hit      = int(net_raw_ret > 0),
            regime       = regime,
            duration     = duration,
            dur_bucket   = dur_bucket,
            signal_type  = signal_type,
        ))

    return pd.DataFrame(rows) if rows else pd.DataFrame()

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARIZE
# ══════════════════════════════════════════════════════════════════════════════
#
#  Beta-Binomial (hit rate):
#    Prior:     p ~ Beta(α₀, β₀)   [default Beta(2,2)]
#    Posterior: p|data ~ Beta(α₀+h, β₀+n-h)
#    Post mean: (α₀+h) / (α₀+β₀+n)   shrinks toward 0.5 when N is small
#    P(p>0.5):  1 - CDF_Beta(0.5; α₀+h, β₀+n-h)
#
#  t-posterior (mean normalised return, non-informative prior p(μ,σ²) ∝ 1/σ²):
#    μ|x ~ t_{n-1}( x̄,  s/√n )
#    P(μ>0):  1 - CDF_t_{n-1}( -x̄ / (s/√n) )
#    95% CI:  [ t_{n-1}.ppf(0.025),  t_{n-1}.ppf(0.975) ]

def summarize(df: pd.DataFrame) -> dict:
    if len(df) < MIN_SIGNALS:
        return dict(n=len(df), ok=False)
    bhr = bayes_hit_rate(int(df['hit'].sum()), len(df))
    bnr = bayes_norm_return(df['norm_ret'].dropna().values)

    # Win/loss split
    wins   = df[df['hit'] == 1]['norm_ret']
    losses = df[df['hit'] == 0]['norm_ret']
    avg_win_norm  = float(wins.mean())   if len(wins)   > 0 else np.nan
    avg_loss_norm = float(losses.mean()) if len(losses) > 0 else np.nan  # negative
    avg_loss_abs  = abs(avg_loss_norm)   if not np.isnan(avg_loss_norm) else np.nan

    # Payoff ratio  b = |avg_win| / |avg_loss|
    payoff = avg_win_norm / avg_loss_abs              if not np.isnan(avg_win_norm) and avg_loss_abs > 0 else np.nan

    # Kelly fraction  f* = p - (1-p)/b
    p = df['hit'].mean()
    kelly = (p - (1 - p) / payoff) if not np.isnan(payoff) and payoff > 0 else np.nan

    # MAE stats
    mae_col = df['mae_norm'] if 'mae_norm' in df.columns else pd.Series(dtype=float)
    avg_mae  = float(mae_col.mean())              if not mae_col.empty else np.nan
    p95_mae  = float(mae_col.quantile(0.95))      if not mae_col.empty else np.nan

    # Net (after costs)
    net_col = df['net_norm_ret'] if 'net_norm_ret' in df.columns else df['norm_ret']
    bnet    = bayes_norm_return(net_col.dropna().values)

    return dict(
        n            = len(df),
        ok           = True,
        hit_rate     = p,
        avg_raw      = df['raw_ret'].mean(),
        med_raw      = df['raw_ret'].median(),
        avg_norm     = df['norm_ret'].mean(),
        med_norm     = df['norm_ret'].median(),
        avg_maxnorm  = df['max_norm'].mean(),
        avg_atr_pct  = df['atr_pct'].mean(),
        std_norm     = df['norm_ret'].std(),
        score        = p * df['norm_ret'].mean(),
        # Win/loss
        avg_win_norm  = avg_win_norm,
        avg_loss_norm = avg_loss_norm,
        payoff        = payoff,
        kelly         = kelly,
        expectancy    = p * avg_win_norm + (1 - p) * avg_loss_norm
                        if not np.isnan(avg_win_norm) and not np.isnan(avg_loss_norm)
                        else np.nan,
        # MAE
        avg_mae_norm  = avg_mae,
        p95_mae_norm  = p95_mae,
        # Net after costs
        avg_net_norm  = float(net_col.mean()),
        p_net_pos     = bnet['p_positive'],
        # Bayesian (gross)
        b_hit_mean    = bhr['post_mean'],
        b_hit_ci      = (bhr['ci_low'], bhr['ci_high']),
        p_above_50    = bhr['p_above_50'],
        b_norm_mean   = bnr['post_mean'],
        b_norm_ci     = (bnr['ci_low'], bnr['ci_high']),
        p_positive    = bnr['p_positive'],
    )


def summarize_by_regime(df: pd.DataFrame) -> pd.DataFrame:
    """
    Splits signal DataFrame by regime (bull/bear/unknown) and summarizes each.
    Returns a DataFrame with one row per regime.
    Regime-dependent flag: hit_rate gap > REGIME_DIV_PP or norm sign flips.
    """
    if df.empty or 'regime' not in df.columns:
        return pd.DataFrame()

    rows = []
    known = df[df['regime'].isin(['bull', 'bear'])]
    if known.empty:
        return pd.DataFrame()

    regime_stats = {}
    for regime, grp in known.groupby('regime'):
        s = summarize(grp)
        if s['ok']:
            regime_stats[regime] = s
            rows.append(dict(regime=regime, **s))

    result = pd.DataFrame(rows)

    # regime-dependent flag
    if 'bull' in regime_stats and 'bear' in regime_stats:
        bull_hit  = regime_stats['bull']['hit_rate']
        bear_hit  = regime_stats['bear']['hit_rate']
        bull_norm = regime_stats['bull']['avg_norm']
        bear_norm = regime_stats['bear']['avg_norm']
        hit_gap   = abs(bull_hit - bear_hit)
        sign_flip = (bull_norm * bear_norm) < 0

        result['regime_dependent'] = (hit_gap > REGIME_DIV_PP) or sign_flip
        result['hit_gap_pp']       = round(hit_gap * 100, 1)
    else:
        result['regime_dependent'] = False
        result['hit_gap_pp']       = 0.0

    return result


# ══════════════════════════════════════════════════════════════════════════════
# BAYESIAN ESTIMATION
# ══════════════════════════════════════════════════════════════════════════════

def bayes_hit_rate(h: int, n: int) -> dict:
    """
    Beta-Binomial conjugate update.

    Prior    : Beta(α₀, β₀)  [configured by BAYES_PRIOR_A/B]
    Posterior: Beta(α₀+h, β₀+n-h)
    Post mean: (α₀+h) / (α₀+β₀+n)  — shrinks toward 0.5 when N is small

    p_above_50 = P(true hit rate > 0.5 | data)
               = 1 - CDF_Beta(0.5; α₀+h, β₀+n-h)
    """
    a = BAYES_PRIOR_A + h
    b = BAYES_PRIOR_B + (n - h)
    d = stats.beta(a, b)
    return dict(
        post_mean  = float(d.mean()),
        ci_low     = float(d.ppf(0.025)),
        ci_high    = float(d.ppf(0.975)),
        p_above_50 = float(1 - d.cdf(0.5)),
    )


def bayes_norm_return(values: np.ndarray) -> dict:
    """
    t-posterior for mean normalized return under non-informative prior.

    Prior    : p(μ, σ²) ∝ 1/σ²
    Posterior: μ | x ~ t_{n-1}( x̄, s/√n )

    p_positive = P(true mean > 0 | data)
               = 1 - CDF_t_{n-1}( (0 - x̄) / (s/√n) )

    This penalizes high variance and small N automatically.
    Same mean norm return on N=8 vs N=80 gets very different p_positive.
    """
    n = len(values)
    if n < 2:
        v = float(np.nanmean(values)) if n == 1 else np.nan
        return dict(post_mean=v, ci_low=np.nan, ci_high=np.nan, p_positive=np.nan)
    xbar = float(np.mean(values))
    s    = float(np.std(values, ddof=1))
    se   = s / np.sqrt(n)
    if se == 0:
        return dict(post_mean=xbar, ci_low=xbar, ci_high=xbar,
                    p_positive=1.0 if xbar > 0 else 0.0)
    d = stats.t(df=n - 1, loc=xbar, scale=se)
    return dict(
        post_mean  = xbar,
        ci_low     = float(d.ppf(0.025)),
        ci_high    = float(d.ppf(0.975)),
        p_positive = float(1 - d.cdf(0)),
    )

# ══════════════════════════════════════════════════════════════════════════════
# EPISODE DURATION ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
#
#  d_t = consecutive bars RSI stays in zone starting at signal bar t
#
#  Buckets:
#    short    1-3 bars  : quick touch, may be noise or fast rejection
#    medium   4-10 bars : RSI stuck in zone — moderate persistence
#    extended 11+ bars  : prolonged episode — potential capitulation (OS)
#                         or blow-off top (OB)
#
#  Hypothesis test: does longer duration → stronger or weaker reversal?
#    If extended > short in avg_norm: exhaustion/capitulation thesis holds.
#    If extended < short in avg_norm: trend continuation / duration = weakness.

_BUCKET_ORDER = {'1-3 bars': 0, '4-10 bars': 1, '11+ bars': 2}


def summarize_by_duration(df: pd.DataFrame) -> pd.DataFrame:
    """
    Splits signal DataFrame by episode duration bucket and summarises each.
    Includes Bayesian estimates per bucket.
    Rows with duration=0 (rsi_s not passed) are all binned to '1-3 bars'.
    """
    if df.empty or 'dur_bucket' not in df.columns:
        return pd.DataFrame()

    rows = []
    for bucket in sorted(df['dur_bucket'].unique(),
                         key=lambda x: _BUCKET_ORDER.get(x, 99)):
        grp = df[df['dur_bucket'] == bucket]
        s   = summarize(grp)
        if s['ok']:
            rows.append(dict(
                bucket       = bucket,
                n            = s['n'],
                avg_duration = float(grp['duration'].mean()),
                hit_rate     = s['hit_rate'],
                avg_norm     = s['avg_norm'],
                med_norm     = s['med_norm'],
                p_above_50   = s.get('p_above_50', np.nan),
                p_positive   = s.get('p_positive', np.nan),
                score        = s['score'],
                avg_maxnorm  = s['avg_maxnorm'],
            ))
    return pd.DataFrame(rows)


# ══════════════════════════════════════════════════════════════════════════════
# TRUST TIER
# ══════════════════════════════════════════════════════════════════════════════

def trust_tier(n_raw: int, n_eff: int, tf: str) -> str:
    """
    HIGH  : multi-regime data, N sufficient, TF has long history
    MED   : moderate confidence
    LOW   : single-regime window, low N, or 1h (structural limit)
    DISCARD: N too small to draw conclusions
    """
    if n_raw < MIN_SIGNALS:
        return 'DISCARD'
    if tf == '1h':
        # 1h is always capped at 730 days = ~1 macro regime
        # effective N corrects for clustering
        if n_eff < 8:
            return 'DISCARD'
        return 'LOW'
    if n_raw < TIER_MED_N:
        return 'LOW'
    if n_raw >= TIER_HIGH_N and tf in ('1d', '1wk', '1mo'):
        return 'HIGH'
    return 'MED'


TIER_ICON = {'HIGH': '✅', 'MED': '🟡', 'LOW': '🔴', 'DISCARD': '⬛'}

# ══════════════════════════════════════════════════════════════════════════════
# DOWNLOAD + ANALYZE
# ══════════════════════════════════════════════════════════════════════════════

def _flatten(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = df.columns.get_level_values(0)
    return df


def analyze(ticker: str, tf: str, cfg: dict) -> Optional[dict]:
    try:
        raw = yf.Ticker(ticker).history(
            period      = cfg['period'],
            interval    = cfg['interval'],
            auto_adjust = True,
            raise_errors = False,
        )
    except Exception as e:
        print(f"    [ERR] {e}")
        return None

    if raw is None or raw.empty or len(raw) < RSI_PERIOD * 3:
        return None

    # .history() returns flat columns — no MultiIndex issue
    df = raw.copy()
    df.columns = [c.title() if c.lower() in
                  ('open', 'high', 'low', 'close', 'volume')
                  else c for c in df.columns]
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if col in df.columns:
            df[col] = df[col].squeeze()

    rsi_s    = calc_rsi(df['Close'], RSI_PERIOD)
    atr_s    = calc_atr(df['High'], df['Low'], df['Close'], ATR_PERIOD)
    regime_s = tag_regime(df['Close'], cfg['regime_ma'])
    fwd      = cfg['forward_bars']

    os_sigs = crossover_signals(rsi_s, OVERSOLD_TH,   'below')
    ob_sigs = crossover_signals(rsi_s, OVERBOUGHT_TH, 'above')

    # Precompute episode durations once O(N) → all lookups O(1)
    os_fwd, os_bwd = precompute_durations(rsi_s, OVERSOLD_TH,   'below')
    ob_fwd, ob_bwd = precompute_durations(rsi_s, OVERBOUGHT_TH, 'above')

    os_df = measure_outcomes(df, os_sigs, fwd, atr_s, 'long',  regime_s,
                             rsi_s, OVERSOLD_TH, COST_PCT, 'crossover',
                             _fwd_dur=os_fwd)
    ob_df = measure_outcomes(df, ob_sigs, fwd, atr_s, 'short', regime_s,
                             rsi_s, OVERBOUGHT_TH, COST_PCT, 'crossover',
                             _fwd_dur=ob_fwd)

    os_rec_sigs = crossover_signals(rsi_s, OVERSOLD_TH,   'above')
    ob_rec_sigs = crossover_signals(rsi_s, OVERBOUGHT_TH, 'below')
    os_rec_df   = measure_outcomes(df, os_rec_sigs, fwd, atr_s, 'long',  regime_s,
                                   rsi_s, OVERSOLD_TH,   COST_PCT, 'recovery',
                                   _bwd_dur=os_bwd)
    ob_rec_df   = measure_outcomes(df, ob_rec_sigs, fwd, atr_s, 'short', regime_s,
                                   rsi_s, OVERBOUGHT_TH, COST_PCT, 'recovery',
                                   _bwd_dur=ob_bwd)

    # cluster-adjusted effective N
    os_n_eff = count_clusters(list(os_df['pos']) if not os_df.empty else [], fwd)
    ob_n_eff = count_clusters(list(ob_df['pos']) if not ob_df.empty else [], fwd)

    os_stats = summarize(os_df)
    ob_stats = summarize(ob_df)

    # attach trust tier
    os_stats['tier'] = trust_tier(os_stats['n'], os_n_eff, tf)
    ob_stats['tier'] = trust_tier(ob_stats['n'], ob_n_eff, tf)
    os_stats['n_eff'] = os_n_eff
    ob_stats['n_eff'] = ob_n_eff

    # OOS split
    def oos_split(full_df):
        if not OOS_DATE or full_df.empty:
            return summarize(pd.DataFrame()), summarize(pd.DataFrame())
        oos_dt = pd.Timestamp(OOS_DATE, tz='UTC')
        dt_col = full_df['dt']
        # normalise: if dt column is tz-aware use as-is, else localise
        if dt_col.dt.tz is None:
            dt_col = dt_col.dt.tz_localize('UTC')
        is_df  = full_df[dt_col <  oos_dt]
        oos_df = full_df[dt_col >= oos_dt]
        return summarize(is_df), summarize(oos_df)

    os_is,  os_oos  = oos_split(os_df)
    ob_is,  ob_oos  = oos_split(ob_df)
    os_rec_is,  os_rec_oos  = oos_split(os_rec_df)
    ob_rec_is,  ob_rec_oos  = oos_split(ob_rec_df)

    return dict(
        ticker       = ticker,
        tf           = tf,
        fwd          = fwd,
        bars         = len(df),
        oversold     = os_stats,
        overbought   = ob_stats,
        os_regime    = summarize_by_regime(os_df),
        ob_regime    = summarize_by_regime(ob_df),
        os_duration  = summarize_by_duration(os_df),
        ob_duration  = summarize_by_duration(ob_df),
        # Recovery signals
        os_recovery  = summarize(os_rec_df),
        ob_recovery  = summarize(ob_rec_df),
        # OOS splits
        os_is        = os_is,      os_oos       = os_oos,
        ob_is        = ob_is,      ob_oos       = ob_oos,
        os_rec_is    = os_rec_is,  os_rec_oos   = os_rec_oos,
        ob_rec_is    = ob_rec_is,  ob_rec_oos   = ob_rec_oos,
    )

# ══════════════════════════════════════════════════════════════════════════════
# PRINT: MAIN TABLE
# ══════════════════════════════════════════════════════════════════════════════

_COLS = ['Asset', 'TF', 'FwdBars', 'N', 'N_eff',
         'HitRate%', 'AvgRaw%', 'AvgNorm(ATR×)', 'MedNorm(ATR×)',
         'MaxExc(ATR×)', 'AvgATR%', 'Score', 'Trust']


def _fmt_row(r: dict, cond: str) -> list:
    s    = r[cond]
    tier = s.get('tier', '—')
    icon = TIER_ICON.get(tier, '')
    base = [r['ticker'], r['tf'], r['fwd'], s['n'], s.get('n_eff', '—')]
    if s['ok']:
        return base + [
            f"{s['hit_rate']:.1%}",
            f"{s['avg_raw']:+.2%}",
            f"{s['avg_norm']:+.2f}",
            f"{s['med_norm']:+.2f}",
            f"{s['avg_maxnorm']:.2f}",
            f"{s['avg_atr_pct']:.2%}",
            f"{s['score']:+.3f}",
            f"{icon} {tier}",
        ]
    else:
        return base + ['—'] * (len(_COLS) - len(base) - 1) + [f"{icon} {tier}"]


def print_table(results: list, cond: str, title: str):
    rows = [_fmt_row(r, cond) for r in results if r is not None]
    df   = pd.DataFrame(rows, columns=_COLS)
    print(f"\n{'═'*90}")
    print(f"  {title}")
    print('═' * 90)
    print(df.to_string(index=False))

# ══════════════════════════════════════════════════════════════════════════════
# PRINT: REGIME BREAKDOWN
# ══════════════════════════════════════════════════════════════════════════════

def print_regime_breakdown(results: list):
    """
    For each asset/TF/condition, shows stats split by bull vs bear regime.
    Flags signal as regime-dependent if hit_rate gap > REGIME_DIV_PP
    or if the norm_ret sign flips between regimes.

    This answers: "does this signal work in BOTH regimes, or only one?"
    A regime-dependent signal needs a regime filter before firing.
    """
    print(f"\n{'═'*90}")
    print(f"  REGIME BREAKDOWN  (bull = above MA-200d equivalent, bear = below)")
    print(f"  ⚠  = regime-dependent (hit-rate gap > {REGIME_DIV_PP:.0%} or norm sign flips)")
    print(f"  Regime-dependent signals require checking current regime before entry.")
    print('═' * 90)

    rcols = ['Asset', 'TF', 'Condition', 'Regime', 'N',
             'HitRate%', 'AvgNorm(ATR×)', 'MedNorm(ATR×)', 'Score', 'Flag']

    rows = []
    for r in results:
        if r is None:
            continue
        for cond, key in [('oversold', 'os_regime'), ('overbought', 'ob_regime')]:
            reg_df = r.get(key)
            if reg_df is None or reg_df.empty:
                continue
            for _, row in reg_df.iterrows():
                if not row.get('ok', False) or row['n'] < MIN_SIGNALS:
                    continue
                regime_dep = row.get('regime_dependent', False)
                hit_gap    = row.get('hit_gap_pp', 0.0)
                flag = f"⚠  ({hit_gap:.0f}pp gap)" if regime_dep else '✓'
                rows.append([
                    r['ticker'], r['tf'], 'OS' if cond == 'oversold' else 'OB',
                    row['regime'], int(row['n']),
                    f"{row['hit_rate']:.1%}",
                    f"{row['avg_norm']:+.2f}",
                    f"{row['med_norm']:+.2f}",
                    f"{row['score']:+.3f}",
                    flag,
                ])

    if rows:
        df = pd.DataFrame(rows, columns=rcols)
        # sort: asset → TF → condition → regime for readability
        print(df.to_string(index=False))
    else:
        print("  No regime data available.")

# ══════════════════════════════════════════════════════════════════════════════
# PRINT: SIGNAL FLAGS
# ══════════════════════════════════════════════════════════════════════════════

def print_signal_flags(results: list):
    """
    Auto-classifies each signal row:
      ✅ REVERSAL  : signal works as labeled (score > +0.5, hit > 55%)
      ⚠  MOMENTUM  : overbought/oversold → continuation (score < -0.5)
      🔵 WEAK      : marginal evidence
      ⬜ NOISE     : |score| < 0.15, no edge
    Discarded rows (trust=DISCARD) are omitted.
    """
    print(f"\n{'═'*90}")
    print("  SIGNAL FLAGS")
    print('═' * 90)

    fcols = ['Asset', 'TF', 'Condition', 'Score', 'HitRate%',
             'AvgNorm(ATR×)', 'Trust', 'Signal Type']
    rows  = []

    for r in results:
        if r is None:
            continue
        for cond in ('oversold', 'overbought'):
            s    = r[cond]
            tier = s.get('tier', 'DISCARD')
            if tier == 'DISCARD' or not s['ok']:
                continue

            score = s['score']
            hit   = s['hit_rate']
            norm  = s['avg_norm']

            if score > 0.5 and hit > 0.55:
                sig = '✅ REVERSAL'
            elif score < -0.5:
                sig = '⚠  MOMENTUM (trade opposite)'
            elif abs(score) < 0.15:
                sig = '⬜ NOISE'
            else:
                sig = '🔵 WEAK'

            rows.append([
                r['ticker'], r['tf'], cond,
                f"{score:+.3f}",
                f"{hit:.1%}",
                f"{norm:+.2f}",
                tier,
                sig,
            ])

    if rows:
        df = pd.DataFrame(rows, columns=fcols)
        print(df.to_string(index=False))
    else:
        print("  No flaggable signals found.")

    print(f"""
  Reading guide:
    REVERSAL         → signal historically precedes a move in the expected direction.
    MOMENTUM         → signal historically precedes CONTINUATION, not reversal.
                       Trade the opposite of the label (or skip).
    WEAK             → some edge but inconsistent. Needs regime filter.
    NOISE            → no detectable edge. Ignore.

  Trust tiers:
    ✅ HIGH    multi-regime, N ≥ {TIER_HIGH_N}, long history (1d/1wk/1mo)
    🟡 MED     moderate confidence
    🔴 LOW     1h only OR low N — treat as indicative, not statistical
    ⬛ DISCARD insufficient signals (N < {MIN_SIGNALS}) or 1h with N_eff < 8
""")


# ══════════════════════════════════════════════════════════════════════════════
# PRINT: BAYESIAN SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

_BCOLS = ['Asset', 'TF', 'Cond', 'N',
          'FreqHit', 'BayesHit', 'Hit95CI', 'P(hit>50%)',
          'FreqNorm', 'BayesNorm', 'Norm95CI', 'P(norm>0)', 'Trust']


def print_bayesian_summary(results: list):
    """
    Bayesian estimates for hit rate and mean normalized return.

    FreqHit vs BayesHit:
      Frequentist = h/n (no prior).
      Bayesian    = (α₀+h)/(α₀+β₀+n) — shrinks toward 0.5 when N is small.
      Difference is largest when N < 20. Converges as N grows.

    P(hit>50%)  : probability true hit rate beats chance given the data.
                  > 0.90 → strong Bayesian evidence for an edge.
                  < 0.50 → more likely noise or momentum continuation.

    P(norm>0)   : probability true mean ATR-normalized return is positive.
                  Accounts for sample variance — high dispersion lowers this
                  even when the sample mean is positive.
    """
    print(f"\n{'═'*105}")
    print(f"  BAYESIAN ESTIMATES")
    print(f"  Prior: Beta({BAYES_PRIOR_A:.0f},{BAYES_PRIOR_B:.0f}) on hit rate  ·  "
          f"Non-informative t-posterior on mean normalized return")
    print('═' * 105)

    rows = []
    for r in results:
        if r is None:
            continue
        for cond in ('oversold', 'overbought'):
            s    = r[cond]
            tier = s.get('tier', 'DISCARD')
            if tier == 'DISCARD' or not s['ok']:
                continue
            p50  = s.get('p_above_50', np.nan)
            ppos = s.get('p_positive',  np.nan)
            bhi  = s.get('b_hit_ci',   (np.nan, np.nan))
            bni  = s.get('b_norm_ci',  (np.nan, np.nan))
            rows.append([
                r['ticker'], r['tf'], 'OS' if cond == 'oversold' else 'OB', s['n'],
                f"{s['hit_rate']:.1%}",
                f"{s.get('b_hit_mean', np.nan):.1%}",
                f"[{bhi[0]:.1%},{bhi[1]:.1%}]",
                f"{p50:.3f}" if not np.isnan(p50) else '—',
                f"{s['avg_norm']:+.2f}",
                f"{s.get('b_norm_mean', np.nan):+.2f}",
                f"[{bni[0]:+.2f},{bni[1]:+.2f}]",
                f"{ppos:.3f}" if not np.isnan(ppos) else '—',
                tier,
            ])

    if rows:
        df = pd.DataFrame(rows, columns=_BCOLS)
        print(df.to_string(index=False))
    else:
        print("  No data.")

    print(f"""
  P(hit>50%) interpretation       P(norm>0) interpretation
  ────────────────────────         ────────────────────────
  > 0.95  overwhelming evidence   > 0.95  strong positive edge
  0.80–0.95  strong evidence      0.75–0.95  probable edge
  0.60–0.80  moderate evidence    0.50–0.75  uncertain
  < 0.60  weak / no evidence      < 0.50  likely no edge or momentum
""")

# ══════════════════════════════════════════════════════════════════════════════
# PRINT: DURATION BREAKDOWN
# ══════════════════════════════════════════════════════════════════════════════

_DCOLS = ['Asset', 'TF', 'Cond', 'Bucket', 'N', 'AvgDur',
          'HitRate%', 'AvgNorm(ATR×)', 'MedNorm(ATR×)',
          'MaxExc(ATR×)', 'P(hit>50%)', 'P(norm>0)', 'Score']


def print_duration_breakdown(results: list):
    """
    Shows outcome stats split by how many consecutive bars RSI stayed in
    the oversold/overbought zone (episode duration).

    Directly tests:
      short episodes  (1-3 bars)  : quick RSI touch — often noise
      medium episodes (4-10 bars) : moderate zone stay
      extended episodes (11+ bars): prolonged — capitulation vs continuation?

    Key question: does avg_norm INCREASE with duration (exhaustion holds)
                  or DECREASE (trend continuation, zone = weakness)?
    """
    print(f"\n{'═'*105}")
    print("  EPISODE DURATION BREAKDOWN")
    print("  (consecutive bars RSI stayed in zone from signal bar)")
    print("  short=1-3  medium=4-10  extended=11+")
    print('═' * 105)

    rows = []
    for r in results:
        if r is None:
            continue
        for cond, key in [('oversold', 'os_duration'), ('overbought', 'ob_duration')]:
            dur_df = r.get(key)
            if dur_df is None or dur_df.empty:
                continue
            tier = r[cond].get('tier', 'DISCARD')
            if tier == 'DISCARD':
                continue
            for _, row in dur_df.iterrows():
                p50  = row.get('p_above_50', np.nan)
                ppos = row.get('p_positive',  np.nan)
                rows.append([
                    r['ticker'], r['tf'], 'OS' if cond == 'oversold' else 'OB', row['bucket'],
                    int(row['n']),
                    f"{row['avg_duration']:.1f}",
                    f"{row['hit_rate']:.1%}",
                    f"{row['avg_norm']:+.2f}",
                    f"{row['med_norm']:+.2f}",
                    f"{row['avg_maxnorm']:.2f}",
                    f"{p50:.3f}"  if not np.isnan(p50)  else '—',
                    f"{ppos:.3f}" if not np.isnan(ppos) else '—',
                    f"{row['score']:+.3f}",
                ])

    if rows:
        df = pd.DataFrame(rows, columns=_DCOLS)
        # sort so same asset/TF/cond groups are contiguous, buckets in order
        bucket_rank = {'1-3 bars': 0, '4-10 bars': 1, '11+ bars': 2}
        df['_brank'] = df['Bucket'].map(bucket_rank)
        df = df.sort_values(['Asset', 'TF', 'Cond', '_brank']).drop(columns='_brank')
        print(df.to_string(index=False))
        print("""
  Reading: compare AvgNorm(ATR×) across buckets for the same asset/TF/cond.
    extended > short → exhaustion/capitulation thesis: longer = stronger reversal
    extended < short → trend continuation: duration signals weakness, not recovery
    extended ≈ short → duration has no predictive value for this signal
""")
    else:
        print("  No duration data available.")



# ══════════════════════════════════════════════════════════════════════════════
# PRINT: STRATEGY SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
#
#  Kelly fraction:  f* = p - (1-p)/b    b = avg_win_norm / |avg_loss_norm|
#  Practical sizing: use f*/4 (quarter-Kelly) for safety
#
#  MAE 95th pct: the "worst reasonable stop distance" in ATR units.
#    Set stop at this distance from entry to survive 95% of episodes.
#
#  Expectancy: p * avg_win_norm + (1-p) * avg_loss_norm
#    Positive = edge exists in gross ATR units per trade
#
#  Net norm: avg return after COST_PCT round-trip, ATR-normalised
#
#  Verdict logic:
#    DEPLOY   : Kelly > 0.10, P(net>0) > 0.80, HIGH trust, OOS consistent
#    CAUTION  : Kelly > 0.0,  P(net>0) > 0.60  (or trust < HIGH)
#    SKIP     : Kelly <= 0 or P(net>0) < 0.50
#    MOMENTUM : score < -0.5 (signal is continuation, not reversal — fade it)

_SCOLS = ['Asset', 'TF', 'Cond', 'Entry', 'N',
          'Kelly f*', '1/4 Kelly', 'Payoff b', 'Expectancy',
          'MAE 95%(ATR×)', 'NetNorm', 'P(net>0)',
          'IS→OOS', 'Trust', 'Verdict']


def _verdict(s: dict, oos: dict, tier: str) -> str:
    kelly = s.get('kelly', np.nan)
    pnet  = s.get('p_net_pos', np.nan)
    score = s.get('score', 0)

    if score < -0.5 and not np.isnan(s.get('p_positive', np.nan)) and s['p_positive'] < 0.3:
        return '⚠ MOMENTUM'

    if np.isnan(kelly) or np.isnan(pnet):
        return '— INSUFFICIENT'

    # OOS consistency check
    oos_ok = '?'
    if oos.get('ok'):
        oos_net = oos.get('avg_net_norm', np.nan)
        is_net  = s.get('avg_net_norm', np.nan)
        if not np.isnan(oos_net) and not np.isnan(is_net):
            if oos_net > 0 and is_net > 0:
                oos_ok = '✓'
            elif oos_net <= 0 < is_net:
                oos_ok = '✗ degraded'
            else:
                oos_ok = '~'

    if kelly > 0.10 and pnet > 0.80 and tier == 'HIGH':
        verdict = '✅ DEPLOY'
    elif kelly > 0.0 and pnet > 0.60:
        verdict = '🟡 CAUTION'
    elif kelly <= 0 or pnet < 0.50:
        verdict = '⬛ SKIP'
    else:
        verdict = '🔵 WEAK'

    return f'{verdict}  OOS:{oos_ok}'


def print_strategy_summary(results: list):
    """
    Combines crossover and recovery signals into one strategy-ready table.
    Shows Kelly sizing, MAE stop distance, net return after costs, and
    in-sample vs out-of-sample consistency check.

    Quarter-Kelly sizing is the practical position size fraction.
    MAE 95th pct is the recommended stop distance — covers 95% of adverse moves.
    IS→OOS: whether net return stays positive out-of-sample (real-world validity check).
    """
    oos_label = OOS_DATE if OOS_DATE else "disabled"
    print(f"\n{'═'*110}")
    print(f"  STRATEGY SUMMARY")
    print(f"  Cost: {COST_PCT:.2%} round-trip  ·  OOS split: {oos_label}")
    print(f"  Kelly f* = p - (1-p)/b  ·  Use 1/4 Kelly for practical sizing")
    print(f"  MAE 95%: recommended stop distance (ATR×) — survives 95% of adverse moves")
    print('═' * 110)

    rows = []
    for r in results:
        if r is None:
            continue
        for cond, is_key, oos_key, rec_key, rec_is_key, rec_oos_key in [
            ('oversold',   'os_is',     'os_oos',     'os_recovery', 'os_rec_is',  'os_rec_oos'),
            ('overbought', 'ob_is',     'ob_oos',     'ob_recovery', 'ob_rec_is',  'ob_rec_oos'),
        ]:
            tier = r[cond].get('tier', 'DISCARD')

            for entry_label, s_key, oos_s_key in [
                ('crossover', cond,    oos_key),
                ('recovery',  rec_key, rec_oos_key),
            ]:
                s   = r.get(s_key, {})
                oos = r.get(oos_s_key, {})
                if not s.get('ok') or tier == 'DISCARD':
                    continue

                kelly = s.get('kelly', np.nan)
                payoff = s.get('payoff', np.nan)
                exp    = s.get('expectancy', np.nan)
                p95m   = s.get('p95_mae_norm', np.nan)
                pnet   = s.get('p_net_pos', np.nan)
                nnet   = s.get('avg_net_norm', np.nan)

                # IS→OOS direction consistency
                is_net  = s.get('avg_net_norm', np.nan)
                oos_net = oos.get('avg_net_norm', np.nan) if oos.get('ok') else np.nan
                if np.isnan(oos_net):
                    oos_arrow = 'N/A'
                elif is_net > 0 and oos_net > 0:
                    oos_arrow = f'+{is_net:.2f}→+{oos_net:.2f}'
                elif is_net > 0 and oos_net <= 0:
                    oos_arrow = f'+{is_net:.2f}→{oos_net:.2f} ✗'
                else:
                    oos_arrow = f'{is_net:.2f}→{oos_net:.2f}'

                rows.append([
                    r['ticker'], r['tf'],
                    'OS' if cond == 'oversold' else 'OB',
                    entry_label,
                    s['n'],
                    f'{kelly:+.3f}' if not np.isnan(kelly) else '—',
                    f'{kelly/4:+.3f}' if not np.isnan(kelly) else '—',
                    f'{payoff:.2f}'  if not np.isnan(payoff) else '—',
                    f'{exp:+.2f}'    if not np.isnan(exp)    else '—',
                    f'{p95m:.2f}'    if not np.isnan(p95m)   else '—',
                    f'{nnet:+.2f}'   if not np.isnan(nnet)   else '—',
                    f'{pnet:.3f}'    if not np.isnan(pnet)   else '—',
                    oos_arrow,
                    tier,
                    _verdict(s, oos, tier),
                ])

    if rows:
        df = pd.DataFrame(rows, columns=_SCOLS)
        print(df.to_string(index=False))
        print(f"""
  LEGEND
  ──────
  Kelly f*    fraction of bankroll with positive expected growth (negative = no edge)
  1/4 Kelly   practical position size — reduces variance, still captures most growth
  Payoff b    avg_win_norm / avg_loss_norm  (> 1 = wins larger than losses on average)
  Expectancy  p*avg_win + (1-p)*avg_loss in ATR units (positive = edge exists)
  MAE 95%     set stop here — tolerates 95% of adverse moves before exiting
  IS→OOS      in-sample net norm → out-of-sample net norm (✗ = degraded out-of-sample)
  OOS split   {oos_label}
""")
    else:
        print("  No strategy-ready signals found.")

# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL FILTERING & EXPORT
# ══════════════════════════════════════════════════════════════════════════════
#
#  Filters strategy results to only actionable signals:
#    DEPLOY : Kelly > 0.10, P(net>0) > 0.80, HIGH trust, OOS not degraded
#    CAUTION: Kelly > 0.0,  P(net>0) > 0.60  (lower bar, still net-positive)
#
#  Excludes: SKIP, MOMENTUM, OOS:✗ degraded, trust=DISCARD
#
#  JSON export schema maps directly to the Sovereign Trading Platform
#  signal library format — each entry is one tradeable setup.

_ACTION_COLS = ['Asset', 'TF', 'Cond', 'Entry', 'N',
                'Kelly f*', '1/4 Kelly', 'Payoff b',
                'MAE 95%(ATR×)', 'NetNorm(ATR×)', 'P(net>0)',
                'Trust', 'IS→OOS', 'Verdict']


def _is_actionable(verdict: str) -> bool:
    if 'MOMENTUM' in verdict or 'SKIP' in verdict or 'INSUFFICIENT' in verdict:
        return False
    if 'OOS:✗' in verdict:
        return False
    return 'DEPLOY' in verdict or 'CAUTION' in verdict


def _oos_str(s: dict, oos: dict) -> str:
    is_net  = s.get('avg_net_norm', np.nan)
    oos_net = oos.get('avg_net_norm', np.nan) if oos.get('ok') else np.nan
    if np.isnan(oos_net):
        return 'N/A'
    arrow = '✓' if oos_net > 0 and is_net > 0 else ('✗' if is_net > 0 and oos_net <= 0 else '~')
    return f'{is_net:+.2f}→{oos_net:+.2f} {arrow}'


def extract_actionable(results: list) -> list:
    """Returns sorted list of actionable signal dicts for export/display."""
    out = []
    for r in results:
        if r is None:
            continue
        for cond, oos_key, rec_key, rec_oos_key in [
            ('oversold',   'os_oos', 'os_recovery', 'os_rec_oos'),
            ('overbought', 'ob_oos', 'ob_recovery', 'ob_rec_oos'),
        ]:
            tier = r[cond].get('tier', 'DISCARD')
            for entry_label, s_key, oos_s_key in [
                ('crossover', cond,    oos_key),
                ('recovery',  rec_key, rec_oos_key),
            ]:
                s   = r.get(s_key, {})
                oos = r.get(oos_s_key, {})
                if not s.get('ok') or tier == 'DISCARD':
                    continue
                v = _verdict(s, oos, tier)
                if not _is_actionable(v):
                    continue
                kelly = s.get('kelly', np.nan)
                out.append(dict(
                    asset        = r['ticker'],
                    timeframe    = r['tf'],
                    condition    = cond,
                    entry        = entry_label,
                    n            = s['n'],
                    kelly        = round(kelly, 4) if not np.isnan(kelly) else None,
                    quarter_kelly= round(kelly / 4, 4) if not np.isnan(kelly) else None,
                    payoff       = round(s.get('payoff', np.nan), 3),
                    expectancy   = round(s.get('expectancy', np.nan), 3),
                    mae_95_atr   = round(s.get('p95_mae_norm', np.nan), 2),
                    net_norm     = round(s.get('avg_net_norm', np.nan), 3),
                    p_net_pos    = round(s.get('p_net_pos', np.nan), 4),
                    p_above_50   = round(s.get('p_above_50', np.nan), 4),
                    hit_rate     = round(s.get('hit_rate', np.nan), 4),
                    trust        = tier,
                    verdict      = v.split('  OOS:')[0].strip(),
                    oos_str      = _oos_str(s, oos),
                    oos_ok       = 'N/A' not in _oos_str(s, oos) and '✓' in _oos_str(s, oos),
                ))
    # sort: DEPLOY first, then by Kelly descending
    out.sort(key=lambda x: (
        0 if 'DEPLOY' in x['verdict'] else 1,
        -(x['kelly'] or -999)
    ))
    return out


def print_top_signals(results: list):
    """
    Filtered strategy table — only DEPLOY and CAUTION, OOS-consistent.
    Sorted: DEPLOY first, then by Kelly f* descending.
    This is the integration-ready view for the trading platform.
    """
    signals = extract_actionable(results)
    if not signals:
        print("\n  No actionable signals found.")
        return

    rows = []
    for s in signals:
        kelly = s['kelly']
        payoff= s['payoff']
        p95m  = s['mae_95_atr']
        nnet  = s['net_norm']
        pnet  = s['p_net_pos']
        rows.append([
            s['asset'], s['timeframe'],
            'OS' if s['condition'] == 'oversold' else 'OB',
            s['entry'], s['n'],
            f'{kelly:+.3f}' if kelly is not None else '—',
            f'{kelly/4:+.3f}' if kelly is not None else '—',
            f'{payoff:.2f}' if payoff and not np.isnan(payoff) else '—',
            f'{p95m:.2f}'  if p95m  and not np.isnan(p95m)  else '—',
            f'{nnet:+.2f}' if nnet  and not np.isnan(nnet)  else '—',
            f'{pnet:.3f}'  if pnet  and not np.isnan(pnet)  else '—',
            s['trust'],
            s['oos_str'],
            s['verdict'],
        ])

    df = pd.DataFrame(rows, columns=_ACTION_COLS)
    n_deploy  = sum(1 for s in signals if 'DEPLOY'  in s['verdict'])
    n_caution = sum(1 for s in signals if 'CAUTION' in s['verdict'])

    print(f"\n{'═'*110}")
    print(f"  TOP SIGNALS  ({n_deploy} DEPLOY  {n_caution} CAUTION)")
    print(f"  Filtered: DEPLOY/CAUTION only · OOS-degraded removed · sorted by Kelly f*")
    print(f"  Ready for integration: export_signal_library() → signal_library.json")
    print('═' * 110)
    print(df.to_string(index=False))


def export_signal_library(results: list,
                           path: str = 'signal_library.json') -> dict:
    """
    Exports actionable signals as JSON for the Sovereign Trading Platform.

    Schema per signal:
      asset, timeframe, condition, entry        → what and when
      kelly, quarter_kelly, payoff, expectancy  → sizing inputs
      mae_95_atr                               → stop distance (in ATR units)
      net_norm, p_net_pos, p_above_50          → edge confidence
      trust, verdict, oos_ok                  → data quality flags

    Integration note:
      - Multiply quarter_kelly by account_equity and ATR to get dollar position size
      - Set stop = entry_price ± (mae_95_atr × ATR_at_signal)
      - Check current regime before firing (bull/bear filter from regime_breakdown)
      - Only fire crossover signals on 1-3 bar episodes (see duration_breakdown)
    """
    signals  = extract_actionable(results)
    clean    = []
    for s in signals:
        row = {k: (None if (v is not None and isinstance(v, float) and np.isnan(v)) else v)
               for k, v in s.items()}
        clean.append(row)

    output = {
        'generated'   : pd.Timestamp.now(tz='UTC').isoformat(),
        'config'      : {
            'oversold_threshold'  : OVERSOLD_TH,
            'overbought_threshold': OVERBOUGHT_TH,
            'rsi_period'          : RSI_PERIOD,
            'atr_period'          : ATR_PERIOD,
            'cost_pct'            : COST_PCT,
            'oos_split_date'      : OOS_DATE,
            'forward_bars'        : {k: v['forward_bars'] for k, v in TIMEFRAMES.items()},
        },
        'summary'     : {
            'total'  : len(clean),
            'deploy' : sum(1 for s in clean if 'DEPLOY'  in (s.get('verdict') or '')),
            'caution': sum(1 for s in clean if 'CAUTION' in (s.get('verdict') or '')),
        },
        'signals'     : clean,
        'integration_notes': {
            'position_size'  : 'quarter_kelly × account_equity / (mae_95_atr × ATR)',
            'stop_distance'  : 'entry_price ± (mae_95_atr × ATR_at_signal)',
            'regime_filter'  : 'check regime_breakdown: fire only in validated regime',
            'duration_filter': 'prefer 1-3 bar episodes (from duration_breakdown)',
            'recheck_after'  : 'rerun analysis quarterly to detect regime shifts',
        },
    }

    with open(path, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Signal library exported → {path}  ({len(clean)} signals)")
    return output


# ══════════════════════════════════════════════════════════════════════════════
# HEATMAP
# ══════════════════════════════════════════════════════════════════════════════

def plot_heatmap(results: list):
    """
    3 metrics × 2 conditions displayed as heatmaps.
    Cells with DISCARD trust tier shown as hatched.
    No file saved — display only.
    """
    tfs     = list(TIMEFRAMES.keys())
    metrics = [
        ('avg_norm', 'Avg Norm Return (ATR×)', True,  'RdYlGn'),
        ('hit_rate', 'Hit Rate',               False, 'YlGn'),
        ('score',    'Score (HitRate × Norm)', True,  'RdYlGn'),
    ]
    conditions = [('oversold',   f'OVERSOLD < {OVERSOLD_TH}'),
                  ('overbought', f'OVERBOUGHT > {OVERBOUGHT_TH}')]

    fig = plt.figure(figsize=(5.5 * len(metrics), 4.2 * len(conditions)))
    fig.patch.set_facecolor('#0e0e0e')
    gs  = gridspec.GridSpec(len(conditions), len(metrics), hspace=0.45, wspace=0.35)

    for ci, (cond, clabel) in enumerate(conditions):
        for mi, (metric, mlabel, signed, cmap) in enumerate(metrics):
            ax = fig.add_subplot(gs[ci, mi])
            ax.set_facecolor('#1a1a1a')

            mat    = np.full((len(ASSETS), len(tfs)), np.nan)
            tiers  = [[None] * len(tfs) for _ in range(len(ASSETS))]

            for ai, asset in enumerate(ASSETS):
                for ti, tf in enumerate(tfs):
                    for r in results:
                        if r and r['ticker'] == asset and r['tf'] == tf:
                            s = r[cond]
                            tiers[ai][ti] = s.get('tier', 'DISCARD')
                            if s['ok'] and s.get('tier') != 'DISCARD':
                                mat[ai, ti] = s.get(metric, np.nan)
                            break

            valid = mat[~np.isnan(mat)]
            if len(valid) == 0:
                ax.text(0.5, 0.5, 'No data', transform=ax.transAxes,
                        ha='center', va='center', color='gray')
                continue

            vmin, vmax = np.nanmin(mat), np.nanmax(mat)
            if signed and not np.isnan(vmin) and not np.isnan(vmax) and vmin < 0 < vmax:
                norm_obj = TwoSlopeNorm(vmin=vmin, vcenter=0, vmax=vmax)
                im = ax.imshow(mat, cmap=cmap, norm=norm_obj, aspect='auto')
            else:
                im = ax.imshow(mat, cmap=cmap, aspect='auto',
                               vmin=vmin, vmax=vmax)

            for ai in range(len(ASSETS)):
                for ti in range(len(tfs)):
                    v    = mat[ai, ti]
                    tier = tiers[ai][ti]
                    if tier == 'DISCARD':
                        ax.add_patch(plt.Rectangle(
                            (ti - 0.5, ai - 0.5), 1, 1,
                            fill=False, hatch='///', edgecolor='#444', linewidth=0
                        ))
                        ax.text(ti, ai, '—', ha='center', va='center',
                                fontsize=9, color='#555')
                    elif not np.isnan(v):
                        fmt = f"{v:.1%}" if metric == 'hit_rate' else f"{v:+.2f}"
                        tc  = 'white' if abs(v - (vmin + vmax) / 2) > (vmax - vmin) * 0.3 \
                              else '#cccccc'
                        ax.text(ti, ai, fmt, ha='center', va='center',
                                fontsize=8, color=tc, fontweight='bold')

            ax.set_xticks(range(len(tfs)))
            ax.set_xticklabels(tfs, color='#aaaaaa', fontsize=9)
            ax.set_yticks(range(len(ASSETS)))
            ax.set_yticklabels(ASSETS, color='#aaaaaa', fontsize=9)
            ax.tick_params(colors='#555555', length=0)
            for sp in ax.spines.values():
                sp.set_edgecolor('#333333')

            cb = plt.colorbar(im, ax=ax, pad=0.02)
            cb.ax.yaxis.set_tick_params(color='#aaaaaa', labelsize=7)
            plt.setp(cb.ax.yaxis.get_ticklabels(), color='#aaaaaa')

            row_label = '🔻 Bounce (Long)' if cond == 'oversold' else '🔺 Fade (Short)'
            ax.set_title(f"{clabel}  {row_label}\n{mlabel}",
                         color='#e0e0e0', fontsize=9, pad=8)

    fig.suptitle(
        f"RSI Signal Strength  ·  OS<{OVERSOLD_TH}  OB>{OVERBOUGHT_TH}  "
        f"·  RSI/ATR={RSI_PERIOD}  ·  ATR-Normalized  ·  hatched=DISCARD",
        color='white', fontsize=11, fontweight='bold', y=0.98
    )

    plt.show()

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print(f"\n{'━'*60}")
    print(f"  RSI Signal Strength Analyzer  v4")
    print(f"  Oversold < {OVERSOLD_TH}  │  Overbought > {OVERBOUGHT_TH}")
    print(f"  RSI/ATR period = {RSI_PERIOD}  │  Min signals = {MIN_SIGNALS}")
    print(f"{'━'*60}\n")

    results = []
    for ticker in ASSETS:
        for tf, cfg in TIMEFRAMES.items():
            print(f"  {ticker:<12s} {tf:<5s}", end=' … ', flush=True)
            r = analyze(ticker, tf, cfg)
            results.append(r)
            if r:
                os = r['oversold']
                ob = r['overbought']
                print(
                    f"✓  {r['bars']} bars  │  "
                    f"OS: {os['n']} raw / {os['n_eff']} eff  "
                    f"OB: {ob['n']} raw / {ob['n_eff']} eff"
                )
            else:
                print("✗  skipped")

    valid = [r for r in results if r is not None]

    print_table(valid, 'oversold',
                f"OVERSOLD (RSI < {OVERSOLD_TH}) → BOUNCE  [mode=long]")
    print_table(valid, 'overbought',
                f"OVERBOUGHT (RSI > {OVERBOUGHT_TH}) → FADE  [mode=short]")

    print_regime_breakdown(valid)
    print_signal_flags(valid)
    print_bayesian_summary(valid)
    print_duration_breakdown(valid)
    print_strategy_summary(valid)
    print_top_signals(valid)
    export_signal_library(valid)

    plot_heatmap(valid)
    return valid


if __name__ == "__main__":
    results = main()