#pragma once

#include <cstddef>
#include <string_view>

namespace sovereign {
namespace constants {

// Strategy & Backtest defaults
constexpr double DEFAULT_FEE_BPS = 2.0;
constexpr double DEFAULT_SLIPPAGE_BPS = 3.0;

// Indicators
constexpr std::size_t PERIOD_RSI = 14U;
constexpr std::size_t PERIOD_MACD_FAST = 12U;
constexpr std::size_t PERIOD_MACD_SLOW = 26U;
constexpr std::size_t PERIOD_SMA_SLOW = 50U;
constexpr std::size_t PERIOD_STOCHASTIC = 14U;
constexpr std::size_t PERIOD_STOCHASTIC_SIGNAL = 3U;
constexpr std::size_t PERIOD_RETURN_FAST = 1U;
constexpr std::size_t PERIOD_RETURN_SLOW = 5U;
constexpr std::size_t PERIOD_ATR = 14U;
constexpr std::size_t PERIOD_BOLLINGER = 20U;
constexpr double MULTIPLIER_BOLLINGER = 2.0;
constexpr std::size_t PERIOD_VOLATILITY = 20U;

// Statistics & Math
constexpr double TRADING_DAYS_PER_YEAR = 252.0;
constexpr double DEFAULT_RISK_FREE_RATE = 0.0;
constexpr double PERCENT_MULTIPLIER = 100.0;
constexpr double BPS_DIVISOR = 10000.0;

// Risk
constexpr double DEFAULT_MAX_DRAWDOWN_LIMIT = 0.20; // 20% limit

// Indicator Fallbacks
constexpr double RSI_NEUTRAL_LEVEL = 50.0;
constexpr double STRENGTH_NEUTRAL = 0.5;

// File Paths
constexpr std::string_view DEFAULT_HISTORY_CACHE = "data/cache/backtest_history.json";
constexpr std::string_view DEFAULT_SNAPSHOT_CACHE = "data/cache/last_fetch.json";
constexpr std::string_view DEFAULT_BACKTEST_ARTIFACT = "data/backtests/latest_backtest.json";

} // namespace constants
} // namespace sovereign
