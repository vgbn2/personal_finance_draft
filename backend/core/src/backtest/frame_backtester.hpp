#pragma once

#include "backtester.hpp"

#include <cstdint>
#include <string>
#include <vector>

namespace sovereign {

struct MonteCarloResult {
    int runs = 0;
    int sample_size = 0;
    double mean_final_return = 0.0;
    double median_final_return = 0.0;
    double p05_final_return = 0.0;
    double p95_final_return = 0.0;
    double probability_of_loss = 0.0;
    double mean_max_drawdown = 0.0;
    double p95_max_drawdown = 0.0;
};

struct WalkForwardFoldMetrics {
    std::size_t trades = 0;
    double net_return = 0.0;
    double sharpe_ratio = 0.0;
    double max_drawdown = 0.0;
    double win_rate = 0.0;
};

struct WalkForwardFoldResult {
    int fold = 0;
    std::size_t train_bars = 0;
    std::size_t test_bars = 0;
    std::string train_start;
    std::string train_end;
    std::string test_start;
    std::string test_end;
    WalkForwardFoldMetrics in_sample;
    WalkForwardFoldMetrics out_of_sample;
};

struct WalkForwardAggregate {
    double mean_oos_return = 0.0;
    double mean_oos_trades = 0.0;
    double mean_oos_sharpe = 0.0;
    double mean_oos_drawdown = 0.0;
    int positive_oos_folds = 0;
    double positive_oos_rate = 0.0;
};

struct WalkForwardResult {
    bool ok = false;
    int folds_run = 0;
    int folds_requested = 0;
    std::string reason;
    WalkForwardAggregate aggregate;
    std::vector<WalkForwardFoldResult> folds;
};

struct FrameBacktestConfig {
    double threshold = 0.55;
    int horizon = 5;
    double cost_bps = 5.0;
    int monte_carlo_runs = 200;
    double tail_alpha = 0.05;
    int walk_forward_folds = 0;
    std::string timeframe;
    std::string from_date;
    std::string to_date;
};

struct AnnotatedRow {
    std::string symbol;
    std::string timeframe;
    std::string as_of;
    double close = 0.0;
    std::string predicted_direction;   // "long" | "short" | ""
    double predicted_confidence = 0.0;
};

struct FrameBacktestResult {
    BacktestResult base;
    MonteCarloResult monte_carlo;
    WalkForwardResult walk_forward;
    std::string mode;
    std::string engine = "sovereign_cpp_core";
};

class FrameBacktester {
public:
    // Mode A: C++ native signal from OHLCV bars
    static FrameBacktestResult runNative(
        std::span<const OhlcvBar> bars,
        const BacktestConfig& config,
        const FrameBacktestConfig& frame_cfg);

    // Mode B: pre-annotated predictions from JS model layer
    static FrameBacktestResult runFromAnnotated(
        const std::vector<AnnotatedRow>& rows,
        const FrameBacktestConfig& frame_cfg);

    // Parse a JS-written annotated frame JSON file; populates out_cfg from embedded fields
    static std::vector<AnnotatedRow> parseFrameFile(
        const std::string& path,
        FrameBacktestConfig& out_cfg);

    // Bootstrap Monte Carlo on a vector of per-trade net returns
    static MonteCarloResult runMonteCarlo(
        const std::vector<double>& returns,
        int runs,
        double tail_alpha,
        uint64_t seed = 42ULL);

    // Native rolling walk-forward evaluation
    static WalkForwardResult runWalkForward(
        const std::vector<AnnotatedRow>& rows,
        const FrameBacktestConfig& frame_cfg);
};

} // namespace sovereign
