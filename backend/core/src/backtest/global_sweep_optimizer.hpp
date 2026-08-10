#pragma once

#include "data/ohlcv_bar.hpp"
#include "strategies/strategy_sweep_evaluator.hpp"

#include <cstddef>
#include <filesystem>
#include <span>
#include <string>
#include <vector>

namespace sovereign::backtest {

struct SweepDatasetRequest {
    std::string family;
    std::string symbol;
    std::string timeframe;
    std::string fingerprint;
};

struct GlobalSweepOptions {
    std::vector<strategies::StrategyArchetype> archetypes = {
        strategies::StrategyArchetype::MomentumTrend,
        strategies::StrategyArchetype::MeanReversion,
        strategies::StrategyArchetype::BreakoutVolatility,
        strategies::StrategyArchetype::HybridRegime
    };
    std::vector<std::size_t> rsi_periods = {7, 14, 21};
    std::vector<std::size_t> atr_periods = {7, 14, 21};
    std::vector<std::size_t> bollinger_periods = {10, 20, 30};
    std::vector<std::size_t> volatility_periods = {10, 20, 60};
    std::vector<double> thresholds = {0.50, 0.55, 0.60, 0.66};
    std::vector<std::size_t> holding_periods = {3, 5, 10};
    double train_ratio = 0.70;
    std::size_t top_k = 20;
    double cost_bps = 5.0;
    std::size_t max_bars = 0;
    std::vector<SweepDatasetRequest> validated_datasets;
};

struct SymbolPlateaus {
    std::string symbol;
    std::string timeframe;
    strategies::StrategyArchetype archetype;
    std::vector<strategies::ParameterPlateau> rsi_plateaus;
    std::vector<strategies::ParameterPlateau> atr_plateaus;
    std::vector<strategies::ParameterPlateau> bollinger_plateaus;
    std::vector<strategies::ParameterPlateau> volatility_plateaus;
    std::vector<strategies::ParameterPlateau> holding_plateaus;
};

struct GlobalSweepResult {
    bool ok = false;
    std::string error;
    std::size_t total_datasets = 0;
    std::size_t effective_bars = 0;
    std::size_t total_pass1_evaluations = 0;
    std::size_t total_pass2_evaluations = 0;
    std::vector<SymbolPlateaus> discovered_plateaus;
    std::vector<strategies::SweepTrialResult> leader_board;
    std::vector<strategies::SweepTrialResult> strategy_champions;
};

class GlobalSweepOptimizer {
public:
    static std::vector<strategies::SweepStrategyParams> buildSweepGrid(const GlobalSweepOptions& options);

    static GlobalSweepResult runSweep(
        const std::filesystem::path& ts_dir,
        const std::vector<std::string>& symbols,
        const std::vector<std::string>& timeframes,
        const GlobalSweepOptions& options);

    static GlobalSweepResult runValidatedSweep(
        const std::filesystem::path& ts_dir,
        const std::vector<SweepDatasetRequest>& datasets,
        const GlobalSweepOptions& options);
};

} // namespace sovereign::backtest
