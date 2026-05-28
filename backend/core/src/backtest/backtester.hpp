#pragma once

#include "../data/ohlcv_bar.hpp"
#include "equity_curve.hpp"
#include "trade.hpp"

#include "../utils/constants.hpp"

#include <cstddef>
#include <span>
#include <string>
#include <vector>

namespace sovereign {

struct BacktestConfig {
    std::size_t lookback = constants::PERIOD_VOLATILITY;
    std::size_t holding_period = 5U;
    double entry_threshold = 0.66;
    double fee_bps = constants::DEFAULT_FEE_BPS;
    double slippage_bps = constants::DEFAULT_SLIPPAGE_BPS;
    double starting_equity = 1.0;

    // Transaction costs
    bool use_dynamic_costs = false;
    double cost_commission_bps = constants::DEFAULT_FEE_BPS;
    double cost_slippage_vol_coeff = 0.05;
    double cost_market_impact_coeff = 0.0;

    // Strategy thresholds
    double rsi_overbought = 70.0;
    double rsi_oversold = 30.0;
    double rsi_strong_threshold = 55.0;
    double rsi_neutral_threshold = 50.0;

    // Signal weighting
    double weight_momentum = 0.45;
    double weight_strength = 0.35;
    double weight_bias = 0.20;
};

struct BacktestSummary {
    bool ok = false;
    std::size_t trades = 0;
    std::size_t winners = 0;
    std::size_t losers = 0;
    double net_return = 0.0;
    double max_drawdown = 0.0;
    double win_rate = 0.0;
    double expectancy = 0.0;
    double sharpe = 0.0;
    double sortino = 0.0;
};

struct BacktestResult {
    BacktestConfig config;
    std::vector<Trade> trades;
    EquityCurve equity_curve;
    BacktestSummary summary;
};

class Backtester {
public:
    static BacktestResult run(std::span<const OhlcvBar> bars, const BacktestConfig& config = {});
};

} // namespace sovereign
