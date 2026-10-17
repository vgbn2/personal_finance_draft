#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

#include "backtest/frame_backtester.hpp"

namespace fs = std::filesystem;

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    std::cout << "[TEST] Running FrameBacktester Mode B & Options Payoff Suite...\n";

    // 1. Locate options_smile_5m.json fixture
    std::string repo_root = SOVEREIGN_REPO_ROOT;
    std::string fixture_path = repo_root + "/tests/fixtures/catalog/options_smile_5m.json";

    if (!expect(fs::exists(fixture_path), "Fixture options_smile_5m.json must exist")) {
        return 1;
    }

    // 2. Test parseFrameFile
    sovereign::FrameBacktestConfig cfg;
    std::vector<sovereign::AnnotatedRow> rows = sovereign::FrameBacktester::parseFrameFile(fixture_path, cfg);

    std::cout << "[INFO] Parsed rows: " << rows.size() << "\n";
    if (!expect(rows.size() == 50, "Must parse exactly 50 rows from options_smile_5m.json")) {
        return 1;
    }

    // Verify parsed options fields on row 0
    if (rows[0].symbol != "BTC" || rows[0].timeframe != "5m" ||
        std::abs(rows[0].implied_vol - 0.65) >= 1e-6 ||
        std::abs(rows[0].option_delta - 0.52) >= 1e-6 ||
        rows[0].option_type != "C" ||
        std::abs(rows[0].strike - 65000.0) >= 1e-6 ||
        std::abs(rows[0].expiration_frac - 0.08) >= 1e-6) {
        std::cerr << "[FAIL] Row 0 options fields mismatch\n";
        return 1;
    }

    // Verify row 1 (Put option)
    if (std::abs(rows[1].option_delta - (-0.48)) >= 1e-6 || rows[1].option_type != "P") {
        std::cerr << "[FAIL] Row 1 options fields mismatch\n";
        return 1;
    }

    // 3. Test runFromAnnotated Mode B options evaluation
    cfg.horizon = 5;
    cfg.threshold = 0.55;
    cfg.cost_bps = 5.0;
    cfg.monte_carlo_runs = 200;

    sovereign::FrameBacktestResult res = sovereign::FrameBacktester::runFromAnnotated(rows, cfg);

    std::cout << "[INFO] Trades executed: " << res.base.trades.size() << "\n";
    std::cout << "[INFO] Net return: " << res.base.summary.net_return << "\n";
    std::cout << "[INFO] Monte Carlo runs: " << res.monte_carlo.runs << "\n";

    if (!expect(!res.base.trades.empty(), "Should execute valid non-zero trades on 50 bars with horizon 5")) {
        return 1;
    }
    if (!expect(res.monte_carlo.runs == 200, "Monte Carlo must complete 200 runs")) {
        return 1;
    }
    if (!expect(res.mode == "frame", "Mode must be 'frame'")) {
        return 1;
    }
    if (!expect(res.engine == "sovereign_cpp_core", "Engine must be 'sovereign_cpp_core'")) {
        return 1;
    }

    std::cout << "[PASS] FrameBacktester Mode B & Options Payoff tests passed!\n";
    return 0;
}
