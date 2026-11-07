#include "candle_parser/ohlcv_parser.hpp"
#include "risk_management/position_sizing/position_sizer.hpp"
#include "risk_management/position_sizing/kelly.hpp"
#include "risk_management/position_sizing/sharpe_based.hpp"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>

namespace {

bool approxEqual(double lhs, double rhs, double tolerance = 0.000001) {
    return std::abs(lhs - rhs) <= tolerance;
}

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    const auto path = std::filesystem::temp_directory_path() / "sovereign_ohlcv_parser_test.csv";
    {
        std::ofstream output(path);
        output << "timestamp,open,high,low,close,volume\n";
        output << "2026-05-18T00:00:00Z,100,105,99,104,1000\n";
        output << "2026-05-19T00:00:00Z,104,106,103,105,900\n";
    }

    const auto parsed = sovereign::parser::parseOhlcvCsvFile(path, "equities:SPY", "1d", "csv_test");
    if (!expect(parsed.quality.ok, "Expected parser quality to be ok")) return 1;
    if (!expect(parsed.bars.size() == 2U, "Expected two parsed bars")) return 1;
    if (!expect(parsed.bars.front().asset_id == "equities:SPY", "Expected asset id to be assigned")) return 1;
    if (!expect(approxEqual(parsed.bars.back().close, 105.0), "Expected parsed close")) return 1;

    const sovereign::position_sizing::PositionSizingInput sizing_input{
        10000.0,
        100.0,
        95.0,
        0.02,
        0.50,
    };
    const auto sizing = sovereign::position_sizing::sizePosition(sizing_input);
    if (!expect(sizing.ok, "Expected position sizing decision to be valid")) return 1;
    if (!expect(approxEqual(sizing.risk_budget, 200.0), "Expected risk budget")) return 1;
    if (!expect(approxEqual(sizing.quantity, 40.0), "Expected quantity constrained by stop risk")) return 1;
    if (!expect(approxEqual(sizing.notional, 4000.0), "Expected notional")) return 1;
    if (!expect(approxEqual(sizing.min_notional, 150.0), "Expected min notional floor $150 on $10k equity")) return 1;

    // Test rejection when notional is below $150 statutory floor
    const sovereign::position_sizing::PositionSizingInput micro_input{
        10000.0,
        100.0,
        90.0, // stop distance = 10
        0.0001, // risk budget = $1.00 -> quantity = 0.1, notional = $10.00
        0.50,
    };
    const auto micro_sizing = sovereign::position_sizing::sizePosition(micro_input);
    if (!expect(!micro_sizing.ok, "Expected micro notional ($10) to be rejected below $150 floor")) return 1;

    // Test dynamic 0.7% portfolio equity floor on large portfolio ($100k equity -> $700 floor)
    const sovereign::position_sizing::PositionSizingInput large_equity_input{
        100000.0,
        100.0,
        99.0, // stop distance = 1
        0.004, // risk budget = $400 -> quantity = 400, but max_notional = 0.004 -> notional = $400
        0.004, // max notional = $400, below 0.7% ($700)
    };
    const auto large_sizing = sovereign::position_sizing::sizePosition(large_equity_input);
    if (!expect(approxEqual(large_sizing.min_notional, 700.0), "Expected 0.7% floor ($700) on $100k equity")) return 1;
    if (!expect(!large_sizing.ok, "Expected trade below 0.7% of portfolio ($400 < $700) to be rejected")) return 1;

    const double kelly = sovereign::position_sizing::kellyFraction(0.55, 1.5);
    if (!expect(kelly > 0.0 && kelly < 1.0, "Expected Kelly fraction in valid range")) return 1;

    const double sharpe_scaled = sovereign::position_sizing::sharpeScaledFraction(1.5, 0.5);
    if (!expect(sharpe_scaled > 0.0 && sharpe_scaled <= 0.5, "Expected Sharpe-scaled fraction to respect cap")) return 1;

    std::filesystem::remove(path);
    std::cout << "parser_position_sizer_test passed!\n";
    return 0;
}
