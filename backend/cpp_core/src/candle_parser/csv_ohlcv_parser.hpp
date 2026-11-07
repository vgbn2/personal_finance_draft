#pragma once

#include "../data/ohlcv_bar.hpp"

#include <optional>
#include <string_view>

namespace sovereign::parser {

std::optional<sovereign::OhlcvBar> parseOhlcvCsvRow(
    std::string_view line,
    std::string_view asset_id,
    std::string_view timeframe,
    std::string_view source,
    std::string_view ingested_at
);

} // namespace sovereign::parser
