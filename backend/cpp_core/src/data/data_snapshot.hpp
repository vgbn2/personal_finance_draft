#pragma once

#include "data_quality_report.hpp"
#include "ohlcv_bar.hpp"

#include <cstddef>
#include <filesystem>
#include <string>
#include <vector>

namespace sovereign {

struct MarketDataSummary {
    std::string symbol;
    std::string timeframe;
    std::size_t bars = 0;
    double first_close = 0.0;
    double last_close = 0.0;
    double min_close = 0.0;
    double max_close = 0.0;
    double total_volume = 0.0;
};

struct MarketDataSnapshot {
    std::vector<OhlcvBar> bars;
    DataQualityReport quality;
    MarketDataSummary summary;
};

struct MarketUniverseEntry {
    std::string symbol;
    std::vector<std::string> timeframes;
    std::size_t records = 0;
};

struct MarketUniverse {
    std::vector<MarketUniverseEntry> entries;
    DataQualityReport quality;
};

MarketDataSummary summarizeBars(std::string symbol, std::string timeframe, const std::vector<OhlcvBar>& bars);
MarketDataSnapshot loadMarketDataSnapshot(
    const std::filesystem::path& input_path,
    std::string symbol,
    std::string timeframe,
    std::size_t max_bars = 0
);
MarketUniverse loadMarketUniverse(const std::filesystem::path& input_path, std::size_t max_entries = 0);

} // namespace sovereign
