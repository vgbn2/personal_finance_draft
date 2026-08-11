#include "backtest/global_sweep_optimizer.hpp"
#include "data/binary_ts_reader.hpp"
#include "research/walk_forward_split.hpp"
#include "strategies/strategy_sweep_evaluator.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {

int failures = 0;

void check(bool condition, const std::string& message) {
    if (condition) {
        std::cout << "  [PASS] " << message << '\n';
        return;
    }
    std::cerr << "  [FAIL] " << message << '\n';
    ++failures;
}

std::vector<sovereign::OhlcvBar> trendingBars(std::size_t count) {
    std::vector<sovereign::OhlcvBar> bars;
    bars.reserve(count);
    for (std::size_t i = 0; i < count; ++i) {
        const double close = 100.0 + static_cast<double>(i) * 0.4
            + (i % 7U == 0U ? -0.2 : 0.1);
        bars.push_back({
            "TEST",
            std::to_string(i),
            "1d",
            close - 0.1,
            close + 0.3,
            close - 0.3,
            close,
            1000.0 + static_cast<double>(i),
            "fixture",
            "fixture",
        });
    }
    return bars;
}

void writeBinaryFixture(
    const std::filesystem::path& root,
    const std::string& symbol,
    std::size_t prefix_bars,
    std::size_t trailing_bars) {
    std::ofstream file(root / (symbol + "_1d.bin"), std::ios::binary);
    const sovereign::RawTsHeader header{'S', 'O', 'V', 'T',
        static_cast<std::uint32_t>(prefix_bars + trailing_bars)};
    file.write(reinterpret_cast<const char*>(&header), sizeof(header));
    for (std::size_t i = 0; i < prefix_bars + trailing_bars; ++i) {
        const std::size_t trailing_index = i < prefix_bars ? 0U : i - prefix_bars;
        const double close = i < prefix_bars
            ? 50.0 + static_cast<double>(i) * 0.1
            : 100.0 + static_cast<double>(trailing_index) * 0.4
                + (trailing_index % 7U == 0U ? -0.2 : 0.1);
        const sovereign::RawTsRecord record{
            static_cast<double>(i) * 86400000.0,
            close - 0.1,
            close + 0.3,
            close - 0.3,
            close,
            1000.0 + static_cast<double>(i),
        };
        file.write(reinterpret_cast<const char*>(&record), sizeof(record));
    }
}

} // namespace

int main() {
    std::cout << "[TEST] Running global_sweep_optimizer_test...\n";

    sovereign::backtest::GlobalSweepOptions options;
    options.archetypes = {sovereign::strategies::StrategyArchetype::MomentumTrend};
    options.rsi_periods = {7, 14};
    options.atr_periods = {14};
    options.bollinger_periods = {20};
    options.volatility_periods = {20};
    options.thresholds = {0.50, 0.60};
    options.holding_periods = {3, 5};

    const auto grid = sovereign::backtest::GlobalSweepOptimizer::buildSweepGrid(options);
    check(grid.size() == 8U, "grid cardinality matches every configured dimension");
    check(grid.front().rsi_period == 7U, "grid preserves deterministic dimension order");
    check(grid.back().holding_period == 5U, "grid reaches the final configured value");

    const auto split = sovereign::buildWalkForwardBarSplit(240U, 60U, 0.60, 0.20);
    check(split.valid(240U), "walk-forward split accepts the explicit 60/20/20 contract");
    check(split.train_end == 144U, "walk-forward split preserves the requested train ratio");
    check(split.validation_end == 192U, "walk-forward split preserves the requested validation ratio");

    auto bars = trendingBars(180U);
    sovereign::strategies::SweepStrategyParams params;
    params.rsi_period = 5U;
    params.atr_period = 5U;
    params.bollinger_period = 5U;
    params.volatility_period = 5U;
    params.threshold = 0.50;
    params.holding_period = 2U;

    const std::size_t scoring_start = 60U;
    const auto scored = sovereign::strategies::StrategySweepEvaluator::evaluateStrategy(
        bars,
        params,
        0.0,
        scoring_start);
    check(
        scored.equity_curve.points.size() <= bars.size() - scoring_start + 1U,
        "warm-up bars do not enter scored equity statistics");
    check(
        scored.trades.empty()
            || std::stoull(scored.trades.front().entry_time) >= scoring_start,
        "first scored trade cannot begin before the scoring boundary");

    auto trial = sovereign::strategies::StrategySweepEvaluator::evaluateTrial(
        std::span<const sovereign::OhlcvBar>(bars).first(100U),
        std::span<const sovereign::OhlcvBar>(bars).subspan(40U, 100U),
        "TEST",
        "1d",
        params,
        0.0,
        60U);
    check(trial.selection_eligible, "validation evidence explicitly marks an eligible trial");
    const double selection_fitness = trial.fitness_score;
    sovereign::strategies::StrategySweepEvaluator::evaluateHoldout(
        trial,
        std::span<const sovereign::OhlcvBar>(bars).subspan(80U),
        60U,
        0.0);
    check(
        trial.fitness_score == selection_fitness,
        "holdout evaluation cannot mutate selection fitness");
    check(
        trial.overfit_grade.rfind("HOLDOUT_", 0U) == 0U,
        "selected trial receives an explicit holdout grade");

    const auto fixture_dir = std::filesystem::temp_directory_path() / "sovereign_global_sweep_horizon_test";
    std::filesystem::remove_all(fixture_dir);
    std::filesystem::create_directories(fixture_dir);
    writeBinaryFixture(fixture_dir, "SHORT", 0U, 180U);
    writeBinaryFixture(fixture_dir, "LONG", 180U, 180U);

    auto horizon_options = options;
    horizon_options.top_k = 2U;
    const auto equal_horizon = sovereign::backtest::GlobalSweepOptimizer::runSweep(
        fixture_dir,
        {"SHORT", "LONG"},
        {"1d"},
        horizon_options);
    check(equal_horizon.ok, "equal-horizon sweep accepts unequal source histories");
    check(equal_horizon.effective_bars == 180U, "sweep uses the shortest selected dataset as the effective horizon");
    check(
        equal_horizon.leader_board.size() == 2U,
        "equal-horizon sweep retains both selected datasets instead of silently pruning history");
    if (equal_horizon.leader_board.size() == 2U) {
        check(
            equal_horizon.leader_board[0].fitness_score == equal_horizon.leader_board[1].fitness_score,
            "identical trailing histories receive identical validation fitness regardless of older prefix length");
    }
    std::filesystem::remove_all(fixture_dir);

    if (failures != 0) {
        std::cerr << "[FAIL] global_sweep_optimizer_test recorded " << failures << " failure(s).\n";
        return 1;
    }
    std::cout << "[PASS] global_sweep_optimizer_test passed with executable Release checks.\n";
    return 0;
}
