#include "backtest/grid_optimizer.hpp"

#include <cmath>
#include <iostream>
#include <vector>

int main() {
    std::cout << "[TEST] Running grid_optimizer_test..." << std::endl;

    // Test 1: Grid building
    sovereign::GridOptimizationOptions opts;
    opts.rsi_periods = {7, 14};
    opts.atr_periods = {14};
    opts.bollinger_periods = {20};
    opts.volatility_periods = {20};
    opts.thresholds = {0.50, 0.55};
    opts.holding_periods = {5};

    const auto grid = sovereign::GridOptimizer::buildGrid(opts);
    if (grid.size() != 4) { // 2 * 1 * 1 * 1 * 2 * 1 = 4
        std::cerr << "FAILED: buildGrid expected 4 combinations, got " << grid.size() << std::endl;
        return 1;
    }
    std::cout << "  ✔ buildGrid generated 4 parameter tuples" << std::endl;

    // Test 2: Run optimization on synthetic bars
    std::vector<sovereign::OhlcvBar> bars;
    bars.reserve(200);
    double price = 100.0;
    for (int i = 0; i < 200; ++i) {
        sovereign::OhlcvBar bar;
        bar.asset_id = "TEST";
        bar.timeframe = "1d";
        bar.timestamp = "2023-01-01";
        price += (i % 2 == 0 ? 1.5 : -1.0);
        bar.open = price - 0.5;
        bar.high = price + 1.0;
        bar.low = price - 1.0;
        bar.close = price;
        bar.volume = 1000.0;
        bars.push_back(bar);
    }

    const auto res = sovereign::GridOptimizer::runOptimization(bars, "TEST", "1d", opts);
    if (!res.ok || res.grid_combinations_tested != 4 || res.top_candidates.empty()) {
        std::cerr << "FAILED: runOptimization ok: " << res.ok << " error: " << res.error << std::endl;
        return 1;
    }

    std::cout << "  ✔ runOptimization evaluated " << res.grid_combinations_tested
              << " combinations, top score: " << res.winner.fitness_score << std::endl;

    std::cout << "✔ grid_optimizer_test passed cleanly!" << std::endl;
    return 0;
}
