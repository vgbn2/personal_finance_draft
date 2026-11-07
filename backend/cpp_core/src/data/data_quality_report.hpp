#pragma once

#include <string>
#include <vector>

namespace sovereign {

struct DataQualityReport {
    bool ok = true;
    std::vector<std::string> missing_timestamps;
    std::vector<std::string> duplicate_timestamps;
    std::vector<std::string> stale_observations;
    std::vector<std::string> bad_ohlc_ordering;
    std::vector<std::string> timezone_mismatch;
    std::vector<std::string> lookahead_risk;
    std::vector<std::string> source_freshness;
    std::vector<std::string> rejected_records;
};

} // namespace sovereign
