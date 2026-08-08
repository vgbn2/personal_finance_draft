#pragma once

#include "backtester.hpp"
#include "data/ohlcv_bar.hpp"

#include <cstddef>
#include <filesystem>
#include <span>
#include <string>
#include <vector>

namespace sovereign {

struct OptimizationParams {
    std::size_t rsi_period = 14;
    std::size_t atr_period = 14;
    std::size_t bollinger_period = 20;
    std::size_t volatility_period = 20;
    double threshold = 0.55;
    std::size_t holding_period = 5;
};

struct OptimizationTrialResult {
    OptimizationParams params;
    double fitness_score = -999.0;
    bool overfit_warning = false;
    BacktestResult train_result;
    BacktestResult test_result;
};

struct GridOptimizationResult {
    bool ok = false;
    std::string error;
    std::string symbol;
    std::string timeframe;
    std::size_t total_bars = 0;
    std::size_t train_bars = 0;
    std::size_t test_bars = 0;
    std::size_t grid_combinations_tested = 0;
    OptimizationTrialResult winner;
    std::vector<OptimizationTrialResult> top_candidates;
};

struct GridOptimizationOptions {
    std::vector<std::size_t> rsi_periods = {7, 14, 21};
    std::vector<std::size_t> atr_periods = {7, 14, 21};
    std::vector<std::size_t> bollinger_periods = {10, 20, 30};
    std::vector<std::size_t> volatility_periods = {10, 20, 60};
    std::vector<double> thresholds = {0.50, 0.55, 0.60, 0.66};
    std::vector<std::size_t> holding_periods = {3, 5, 10};
    double train_ratio = 0.70;
    std::size_t top_k = 10;
    double cost_bps = 5.0;
    std::size_t max_bars = 0;
};

class GridOptimizer {
public:
    static std::vector<OptimizationParams> buildGrid(const GridOptimizationOptions& options);

    static OptimizationTrialResult evaluateTrial(
        std::span<const OhlcvBar> train_bars,
        std::span<const OhlcvBar> test_bars,
        const OptimizationParams& params,
        double cost_bps);

    static GridOptimizationResult runOptimization(
        std::span<const OhlcvBar> bars,
        const std::string& symbol,
        const std::string& timeframe,
        const GridOptimizationOptions& options);

    static GridOptimizationResult optimizeFromBinary(
        const std::filesystem::path& ts_dir,
        const std::string& symbol,
        const std::string& timeframe,
        const GridOptimizationOptions& options);
};

} // namespace sovereign
