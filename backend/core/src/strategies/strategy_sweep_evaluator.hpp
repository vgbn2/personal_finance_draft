#pragma once

#include "backtest/backtester.hpp"
#include "data/ohlcv_bar.hpp"

#include <cstddef>
#include <span>
#include <string>
#include <vector>

namespace sovereign::strategies {

enum class StrategyArchetype {
    MomentumTrend,
    MeanReversion,
    BreakoutVolatility,
    HybridRegime
};

std::string archetypeToString(StrategyArchetype archetype);
StrategyArchetype stringToArchetype(const std::string& str);

struct SweepStrategyParams {
    StrategyArchetype archetype = StrategyArchetype::MomentumTrend;
    std::size_t rsi_period = 14;
    std::size_t atr_period = 14;
    std::size_t bollinger_period = 20;
    std::size_t volatility_period = 20;
    double threshold = 0.55;
    std::size_t holding_period = 5;
};

struct ParameterPlateau {
    std::size_t min_value = 0;
    std::size_t max_value = 0;
    double mean_fitness = 0.0;
    double stability_score = 0.0; // 1.0 - (std_dev / mean)
};

struct SensitivityPoint {
    std::size_t param_value = 0;
    double net_return = 0.0;
    double max_drawdown = 0.0;
    double sharpe_ratio = 0.0;
    std::size_t trade_count = 0;
    double fitness_score = 0.0;
};

struct SweepTrialResult {
    SweepStrategyParams params;
    std::string symbol;
    std::string timeframe;
    double fitness_score = -999.0;
    bool selection_eligible = false;
    bool overfit_warning = false;
    std::string overfit_grade = "UNKNOWN"; // STABLE_CHAMPION, MODERATE_DECAY, OVERFIT_FRAGILE
    double oos_retention_ratio = 0.0;       // test_sharpe / train_sharpe
    BacktestResult train_result;
    BacktestResult validation_result;
    BacktestResult test_result;
};

class StrategySweepEvaluator {
public:
    static std::vector<ParameterPlateau> extractPlateaus(
        const std::vector<SensitivityPoint>& curve,
        double quantile_threshold = 0.70,
        std::size_t min_window = 2);

    static double periodsPerYear(const std::string& timeframe);

    static BacktestResult evaluateStrategy(
        std::span<const OhlcvBar> bars,
        const SweepStrategyParams& params,
        double cost_bps = 5.0,
        std::size_t scoring_start_index = 0U);

    static SweepTrialResult evaluateTrial(
        std::span<const OhlcvBar> train_bars,
        std::span<const OhlcvBar> validation_bars,
        const std::string& symbol,
        const std::string& timeframe,
        const SweepStrategyParams& params,
        double cost_bps = 5.0,
        std::size_t validation_scoring_start = 0U);

    static void evaluateHoldout(
        SweepTrialResult& selected_trial,
        std::span<const OhlcvBar> holdout_bars,
        std::size_t scoring_start_index,
        double cost_bps = 5.0);
};

} // namespace sovereign::strategies
