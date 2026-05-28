#include "../src/data/data_snapshot.hpp"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

namespace {

bool approxEqual(double actual, double expected, double tolerance) {
    return std::fabs(actual - expected) <= tolerance;
}

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    const std::vector<sovereign::OhlcvBar> bars{
        {"equities:SPY", "2026-05-18T00:00:00Z", "1d", 100.0, 105.0, 99.0, 104.0, 1000.0, "stooq", "2026-05-18T00:05:00Z"},
        {"equities:SPY", "2026-05-19T00:00:00Z", "1d", 104.0, 108.0, 103.0, 107.0, 1200.0, "stooq", "2026-05-19T00:05:00Z"},
        {"equities:SPY", "2026-05-20T00:00:00Z", "1d", 107.0, 109.0, 106.0, 108.0, 900.0, "stooq", "2026-05-20T00:05:00Z"},
    };

    const auto summary = sovereign::summarizeBars("SPY", "1d", bars);
    if (!expect(summary.bars == 3U, "Expected bar count")) {
        return 1;
    }
    if (!expect(approxEqual(summary.first_close, 104.0, 0.0000001), "Expected first close")) {
        return 1;
    }
    if (!expect(approxEqual(summary.last_close, 108.0, 0.0000001), "Expected last close")) {
        return 1;
    }
    if (!expect(approxEqual(summary.min_close, 104.0, 0.0000001), "Expected min close")) {
        return 1;
    }
    if (!expect(approxEqual(summary.max_close, 108.0, 0.0000001), "Expected max close")) {
        return 1;
    }
    if (!expect(approxEqual(summary.total_volume, 3100.0, 0.0000001), "Expected total volume")) {
        return 1;
    }

    const auto input = std::filesystem::temp_directory_path() / "sovereign_data_snapshot_test.json";
    {
        std::ofstream output(input);
        output
            << "{\n"
            << "  \"mode\": \"backtest_history\",\n"
            << "  \"fetched_at\": \"2026-05-18T00:00:00.000Z\",\n"
            << "  \"sources\": [\n"
            << "    {\"family\":\"equities\",\"provider\":\"test\",\"symbol\":\"SPY\",\"timeframe\":\"1d\",\"timestamp\":\"2026-05-16T00:00:00.000Z\",\"open\":100,\"high\":103,\"low\":99,\"close\":102,\"volume\":10},\n"
            << "    {\"family\":\"equities\",\"provider\":\"test\",\"symbol\":\"QQQ\",\"timeframe\":\"1d\",\"timestamp\":\"2026-05-16T00:00:00.000Z\",\"open\":200,\"high\":205,\"low\":199,\"close\":204,\"volume\":20},\n"
            << "    {\"family\":\"equities\",\"provider\":\"test\",\"symbol\":\"SPY\",\"timeframe\":\"1d\",\"timestamp\":\"2026-05-17T00:00:00.000Z\",\"open\":102,\"high\":104,\"low\":101,\"close\":103,\"volume\":11}\n"
            << "  ]\n"
            << "}\n";
    }
    const auto loaded = sovereign::loadMarketDataSnapshot(input, "SPY", "1d");
    if (!expect(loaded.quality.ok, "Expected loaded snapshot quality to pass")) {
        return 1;
    }
    if (!expect(loaded.bars.size() == 2U, "Expected two loaded SPY bars")) {
        return 1;
    }
    if (!expect(loaded.summary.bars == 2U, "Expected loaded summary count")) {
        return 1;
    }
    if (!expect(approxEqual(loaded.summary.last_close, 103.0, 0.0000001), "Expected loaded last close")) {
        return 1;
    }

    std::filesystem::remove(input);
    return 0;
}
