#include "indicator_engine.hpp"
#include <span>

#include "kalman_filter.hpp"
#include "macd.hpp"
#include "moving_averages.hpp"
#include "rsi.hpp"
#include "stochastic.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>
#include <vector>

namespace sovereign::indicators {

namespace {

double mean(std::span<const double> values) {
    if (values.empty()) {
        return 0.0;
    }
    double total = 0.0;
    for (const double value : values) {
        total += value;
    }
    return total / static_cast<double>(values.size());
}

double stddev(std::span<const double> values) {
    if (values.size() < 2U) {
        return 0.0;
    }
    const double avg = mean(values);
    double variance = 0.0;
    for (const double value : values) {
        const double delta = value - avg;
        variance += delta * delta;
    }
    return std::sqrt(variance / static_cast<double>(values.size() - 1U));
}

template<typename T>
T getParam(const ParameterMap& params, const std::string& key, T fallback) {
    auto it = params.find(key);
    if (it != params.end()) {
        return static_cast<T>(it->second);
    }
    return fallback;
}

} // namespace

std::vector<double> IndicatorEngine::rateOfChangeSeries(const std::vector<double>& closes, std::size_t lookback) {
    std::vector<double> res(closes.size(), std::numeric_limits<double>::quiet_NaN());
    if (lookback == 0U || closes.size() <= lookback) {
        return res;
    }
    
    for (std::size_t i = lookback; i < closes.size(); ++i) {
        const double previous = closes[i - lookback];
        if (previous != 0.0) {
            res[i] = closes[i] / previous - 1.0;
        }
    }
    return res;
}

std::vector<double> IndicatorEngine::rollingVolatilitySeries(const std::vector<double>& closes, std::size_t period) {
    std::vector<double> res(closes.size(), std::numeric_limits<double>::quiet_NaN());
    if (period < 2U || closes.size() <= period) {
        return res;
    }

    for (std::size_t i = period; i < closes.size(); ++i) {
        std::vector<double> returns;
        returns.reserve(period);
        for (std::size_t j = i + 1 - period; j <= i; ++j) {
            const double previous = closes[j - 1];
            if (previous != 0.0) {
                returns.push_back(closes[j] / previous - 1.0);
            }
        }
        if (returns.size() >= 2U) {
            res[i] = stddev(returns);
        }
    }
    return res;
}

std::vector<KalmanResult> IndicatorEngine::kalmanSeriesWithVariance(const std::vector<double>& closes, double process_noise, double measurement_noise) {
    std::vector<KalmanResult> res(closes.size(), {std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::quiet_NaN()});
    if (closes.empty()) return res;

    KalmanFilter kf(process_noise, measurement_noise, closes[0], 1.0);
    
    for (std::size_t i = 0; i < closes.size(); ++i) {
        res[i].estimate = kf.update(closes[i]);
        res[i].variance = kf.getVariance();
    }
    return res;
}

IndicatorFrame IndicatorEngine::buildFrame(std::span<const OhlcvBar> bars, const ParameterMap& params) {
    IndicatorFrame frame;
    frame.rows.reserve(bars.size());
    if (bars.empty()) {
        return frame;
    }

    // Pre-allocate and extract scalar arrays for vectorized processing
    std::vector<double> closes;
    closes.reserve(bars.size());
    for (const auto& bar : bars) {
        closes.push_back(bar.close);
    }

    // 1. Vectorized Series Calculations (No Branching)
    const std::size_t period_ret_fast = getParam(params, "ret_fast", constants::PERIOD_RETURN_FAST);
    const std::size_t period_ret_slow = getParam(params, "ret_slow", constants::PERIOD_RETURN_SLOW);
    const std::size_t period_vol = getParam(params, "vol_period", constants::PERIOD_VOLATILITY);
    const std::size_t period_rsi = getParam(params, "rsi_period", constants::PERIOD_RSI);
    const double kalman_q = getParam(params, "kalman_q", 0.001);
    const double kalman_r = getParam(params, "kalman_r", 1.0);
    const std::size_t period_macd_fast = getParam(params, "macd_fast", constants::PERIOD_MACD_FAST);
    const std::size_t period_macd_slow = getParam(params, "macd_slow", constants::PERIOD_MACD_SLOW);
    const std::size_t period_sma_slow = getParam(params, "sma_slow", constants::PERIOD_SMA_SLOW);
    const std::size_t period_atr = getParam(params, "atr_period", constants::PERIOD_ATR);
    const std::size_t period_bb = getParam(params, "bb_period", constants::PERIOD_BOLLINGER);
    const std::size_t period_stoch = getParam(params, "stoch_period", constants::PERIOD_STOCHASTIC);
    const std::size_t period_stoch_signal = getParam(params, "stoch_signal", constants::PERIOD_STOCHASTIC_SIGNAL);

    auto r1_series = rateOfChangeSeries(closes, period_ret_fast);
    auto r5_series = rateOfChangeSeries(closes, period_ret_slow);
    auto vol_series = rollingVolatilitySeries(closes, period_vol);
    auto rsi_series = relativeStrengthIndexSeries(closes, period_rsi);
    auto kalman_results = kalmanSeriesWithVariance(closes, kalman_q, kalman_r);
    auto macd_series = macdSeries(closes, period_macd_fast, period_macd_slow);
    auto ema_fast_series = exponentialMovingAverageSeries(closes, period_macd_fast);
    auto ema_slow_series = exponentialMovingAverageSeries(closes, period_macd_slow);
    auto sma_20_series = simpleMovingAverageSeries(closes, period_bb);
    auto sma_50_series = simpleMovingAverageSeries(closes, period_sma_slow);
    auto atr_series = averageTrueRangeSeries(bars, period_atr);
    auto bb_series = bollingerBandsSeries(closes, period_bb);
    auto stoch_k_series = stochasticPercentKSeries(bars, period_stoch);
    
    // Note: To perfectly replicate `stoch_d` SMA logic, we run SMA directly over `stoch_k_series`
    auto stoch_d_series = simpleMovingAverageSeries(stoch_k_series, period_stoch_signal);

    // 2. Single-pass insertion
    for (std::size_t i = 0; i < bars.size(); ++i) {
        IndicatorRow row;
        row.bar = bars[i];
        
        bool all_core_ready = true;

        if (!std::isnan(r1_series[i])) row.set("ret:fast", r1_series[i]); else all_core_ready = false;
        if (!std::isnan(r5_series[i])) row.set("ret:slow", r5_series[i]);
        if (!std::isnan(vol_series[i])) row.set("vol:" + std::to_string(period_vol), vol_series[i]);
        if (!std::isnan(rsi_series[i])) row.set("rsi:" + std::to_string(period_rsi), rsi_series[i]); else all_core_ready = false;
        if (!std::isnan(kalman_results[i].estimate)) {
            row.set("kalman", kalman_results[i].estimate);
            row.set("kalman_var", kalman_results[i].variance);
        }
        if (!std::isnan(macd_series[i])) row.set("macd", macd_series[i]); else all_core_ready = false;
        if (!std::isnan(ema_fast_series[i])) row.set("ema:" + std::to_string(period_macd_fast), ema_fast_series[i]); else all_core_ready = false;
        if (!std::isnan(ema_slow_series[i])) row.set("ema:" + std::to_string(period_macd_slow), ema_slow_series[i]); else all_core_ready = false;
        if (!std::isnan(sma_20_series[i])) row.set("sma:" + std::to_string(period_bb), sma_20_series[i]);
        if (!std::isnan(sma_50_series[i])) row.set("sma:" + std::to_string(period_sma_slow), sma_50_series[i]);
        
        if (!std::isnan(atr_series[i])) {
            row.set("atr:" + std::to_string(period_atr), atr_series[i]);
            if (bars[i].close != 0.0) {
                row.set("atr_pct:" + std::to_string(period_atr), atr_series[i] / bars[i].close);
            }
        }
        
        if (!std::isnan(bb_series.middle[i])) {
            row.set("bb_upper:" + std::to_string(period_bb), bb_series.upper[i]);
            row.set("bb_middle:" + std::to_string(period_bb), bb_series.middle[i]);
            row.set("bb_lower:" + std::to_string(period_bb), bb_series.lower[i]);
            if (bb_series.middle[i] != 0.0) {
                row.set("bb_width:" + std::to_string(period_bb), (bb_series.upper[i] - bb_series.lower[i]) / bb_series.middle[i]);
            }
            const double band_range = bb_series.upper[i] - bb_series.lower[i];
            if (band_range > 0.0) {
                row.set("bb_percent_b:" + std::to_string(period_bb), (bars[i].close - bb_series.lower[i]) / band_range);
            }
        }
        
        if (!std::isnan(stoch_k_series[i])) {
            row.set("stoch_k:" + std::to_string(period_stoch), stoch_k_series[i]);
            if (!std::isnan(stoch_d_series[i])) {
                row.set("stoch_d:" + std::to_string(period_stoch_signal), stoch_d_series[i]);
            }
        } else {
            all_core_ready = false;
        }

        if (all_core_ready) {
            ++frame.ready_rows;
        }
        frame.rows.push_back(std::move(row));
    }

    return frame;
}

} // namespace sovereign::indicators
