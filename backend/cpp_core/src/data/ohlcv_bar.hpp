#pragma once

#include <string>

namespace sovereign {

struct OhlcvBar {
    std::string asset_id;
    std::string timestamp;
    std::string timeframe;
    double open = 0.0;
    double high = 0.0;
    double low = 0.0;
    double close = 0.0;
    double volume = 0.0;
    std::string source;
    std::string ingested_at;
};

} // namespace sovereign
