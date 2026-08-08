#include "grid_optimizer.hpp"
#include "data/binary_ts_reader.hpp"

#include <algorithm>
#include <cmath>
#include <iostream>

#if defined(_OPENMP)
#include <omp.h>
#endif

namespace sovereign {

std::vector<OptimizationParams> GridOptimizer::buildGrid(const GridOptimizationOptions& options) {
    std::vector<OptimizationParams> grid;
    grid.reserve(options.rsi_periods.size() *
                 options.atr_periods.size() *
                 options.bollinger_periods.size() *
                 options.volatility_periods.size() *
                 options.thresholds.size() *
                 options.holding_periods.size());

    for (const auto rsi : options.rsi_periods) {
        for (const auto atr : options.atr_periods) {
            for (const auto boll : options.bollinger_periods) {
                for (const auto vol : options.volatility_periods) {
                    for (const auto thresh : options.thresholds) {
                        for (const auto hold : options.holding_periods) {
                            OptimizationParams p;
                            p.rsi_period = rsi;
                            p.atr_period = atr;
                            p.bollinger_period = boll;
                            p.volatility_period = vol;
                            p.threshold = thresh;
                            p.holding_period = hold;
                            grid.push_back(p);
                        }
                    }
                }
            }
        }
    }
    return grid;
}

OptimizationTrialResult GridOptimizer::evaluateTrial(
    std::span<const OhlcvBar> train_bars,
    std::span<const OhlcvBar> test_bars,
    const OptimizationParams& params,
    double cost_bps) {

    OptimizationTrialResult trial;
    trial.params = params;

    BacktestConfig cfg;
    cfg.entry_threshold = params.threshold;
    cfg.holding_period = static_cast<int>(params.holding_period);
    cfg.fee_bps = cost_bps;

    trial.train_result = Backtester::run(train_bars, cfg);

    if (!test_bars.empty()) {
        trial.test_result = Backtester::run(test_bars, cfg);
        trial.overfit_warning = (trial.test_result.summary.sharpe < 0.5 * trial.train_result.summary.sharpe) ||
                                (trial.test_result.summary.expectancy < 0.0);
    } else {
        trial.test_result = trial.train_result;
        trial.overfit_warning = false;
    }

    const double penalty = trial.overfit_warning ? 100.0 : 0.0;
    const double net_ret = trial.train_result.summary.net_return;
    const double max_dd = trial.train_result.summary.max_drawdown;
    const double ev = trial.train_result.summary.expectancy;

    trial.fitness_score = net_ret - max_dd + (ev * 10.0) - penalty;
    return trial;
}

GridOptimizationResult GridOptimizer::runOptimization(
    std::span<const OhlcvBar> bars,
    const std::string& symbol,
    const std::string& timeframe,
    const GridOptimizationOptions& options) {

    GridOptimizationResult result;
    result.symbol = symbol;
    result.timeframe = timeframe;
    result.total_bars = bars.size();

    if (bars.size() < 30) {
        result.ok = false;
        result.error = "insufficient_bars_for_optimization";
        return result;
    }

    const double ratio = std::clamp(options.train_ratio, 0.1, 0.9);
    result.train_bars = static_cast<std::size_t>(bars.size() * ratio);
    result.test_bars = bars.size() - result.train_bars;

    if (result.train_bars < 20) {
        result.ok = false;
        result.error = "train_subset_too_small";
        return result;
    }

    std::span<const OhlcvBar> train_bars = bars.subspan(0, result.train_bars);
    std::span<const OhlcvBar> test_bars = bars.subspan(result.train_bars);

    const auto grid = buildGrid(options);
    result.grid_combinations_tested = grid.size();

    std::vector<OptimizationTrialResult> trial_results(grid.size());

    const int total_grid = static_cast<int>(grid.size());
#if defined(_OPENMP)
#pragma omp parallel for schedule(dynamic)
#endif
    for (int i = 0; i < total_grid; ++i) {
        trial_results[i] = evaluateTrial(train_bars, test_bars, grid[i], options.cost_bps);
    }

    std::sort(trial_results.begin(), trial_results.end(), [](const OptimizationTrialResult& a, const OptimizationTrialResult& b) {
        return a.fitness_score > b.fitness_score;
    });

    if (!trial_results.empty()) {
        result.winner = trial_results[0];
        const std::size_t count = std::min(options.top_k, trial_results.size());
        result.top_candidates.assign(trial_results.begin(), trial_results.begin() + count);
    }

    result.ok = true;
    return result;
}

GridOptimizationResult GridOptimizer::optimizeFromBinary(
    const std::filesystem::path& ts_dir,
    const std::string& symbol,
    const std::string& timeframe,
    const GridOptimizationOptions& options) {

    const auto read_res = BinaryTsReader::loadSymbolBinary(ts_dir, symbol, timeframe, options.max_bars, true);
    if (!read_res.ok) {
        GridOptimizationResult res;
        res.ok = false;
        res.symbol = symbol;
        res.timeframe = timeframe;
        res.error = read_res.error;
        return res;
    }

    return runOptimization(read_res.bars, symbol, timeframe, options);
}

} // namespace sovereign
