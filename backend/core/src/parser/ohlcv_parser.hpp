#pragma once

#include "../data/data_quality_report.hpp"
#include "../data/ohlcv_bar.hpp"

#include <filesystem>
#include <vector>

namespace sovereign::parser {

struct ParsedOhlcvFile {
    std::vector<sovereign::OhlcvBar> bars;
    sovereign::DataQualityReport quality;
};

ParsedOhlcvFile parseOhlcvCsvFile(
    const std::filesystem::path& path,
    const std::string& asset_id,
    const std::string& timeframe,
    const std::string& source,
    const std::string& ingested_at = ""
);

} // namespace sovereign::parser
