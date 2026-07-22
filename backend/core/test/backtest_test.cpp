#include "../src/backtest/backtester.hpp"
#include "../src/data/data_snapshot.hpp"

#include <iostream>
#include <span>
#include <vector>
#include <filesystem>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    using namespace sovereign;

    // 1. Load a committed empirical capture; tests must not silently skip in a clean checkout.
    const auto cache_path = std::filesystem::path(SOVEREIGN_REPO_ROOT)
        / "tests" / "fixtures" / "real_bars_btc.json";

    std::cout << "[ANTI-BULLSHIT] Loading real market data for backtest validation: " << cache_path << "\n";
    auto snapshot = loadMarketDataSnapshot(cache_path, "BTCUSDT", "1h");
    
    if (snapshot.bars.empty()) {
        std::cerr << "[TEST FAIL] Loaded 0 bars for BTCUSDT:1h\n";
        return 1;
    }

    // 2. Run Backtest
    const auto result = Backtester::run(std::span<const OhlcvBar>(snapshot.bars.data(), snapshot.bars.size()), {
        20U, // lookback
        5U,  // holding
        0.50, // threshold
        2.0,  // fee
        3.0,  // slippage
        1000.0, // start equity
    });

    if (!expect(result.summary.ok, "Expected backtest to succeed")) {
        return 1;
    }
    if (!expect(result.summary.trades > 0U, "Expected trades to be generated")) {
        return 1;
    }
    
    std::cout << "Backtest Summary:\n";
    std::cout << "  Trades: " << result.summary.trades << "\n";
    std::cout << "  Net Return: " << result.summary.net_return << "\n";

    if (!expect(!result.equity_curve.points.empty(), "Expected equity curve points")) {
        return 1;
    }

    // 3. Test Mixed/Bad data (Fail Closed)
    auto mixed_bars = snapshot.bars;
    mixed_bars[snapshot.bars.size()/2].asset_id = "equities:AAPL";
    const auto mixed_result = Backtester::run(std::span<const OhlcvBar>(mixed_bars.data(), mixed_bars.size()));
    if (!expect(!mixed_result.summary.ok && mixed_result.summary.trades == 0U, "Expected mixed-asset input to fail closed")) {
        return 1;
    }

    auto bad_ohlc_bars = snapshot.bars;
    bad_ohlc_bars[snapshot.bars.size()/2].high = bad_ohlc_bars[snapshot.bars.size()/2].low - 1.0;
    const auto bad_ohlc_result = Backtester::run(std::span<const OhlcvBar>(bad_ohlc_bars.data(), bad_ohlc_bars.size()));
    if (!expect(!bad_ohlc_result.summary.ok && bad_ohlc_result.summary.trades == 0U, "Expected invalid OHLC input to fail closed")) {
        return 1;
    }

    // 4. Test Dynamic Costs
    BacktestConfig dyn_config;
    dyn_config.use_dynamic_costs = true;
    dyn_config.cost_commission_bps = 5.0;
    dyn_config.cost_slippage_vol_coeff = 0.5; // High slippage on vol
    
    const auto dyn_result = Backtester::run(std::span<const OhlcvBar>(snapshot.bars.data(), snapshot.bars.size()), dyn_config);
    
    if (!expect(dyn_result.summary.ok, "Expected dynamic cost backtest to succeed")) {
        return 1;
    }
    
    std::cout << "Normal Return: " << result.summary.net_return << "\n";
    std::cout << "Dynamic Cost Return: " << dyn_result.summary.net_return << "\n";
    
    if (!expect(dyn_result.summary.net_return < result.summary.net_return, "Expected dynamic costs to reduce net return")) {
        return 1;
    }

    std::cout << "backtest_test passed!\n";
    return 0;
}
