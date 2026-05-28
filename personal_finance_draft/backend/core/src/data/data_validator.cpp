#include "data_validator.hpp"

namespace sovereign {

namespace {

bool isBefore(const std::string& lhs, const std::string& rhs) {
    return !lhs.empty() && !rhs.empty() && lhs < rhs;
}

void reject(DataQualityReport& report, const std::string& reason, std::vector<std::string>& bucket) {
    bucket.push_back(reason);
    report.ok = false;
    report.rejected_records.push_back(reason);
}

} // namespace

bool DataValidator::validateBar(const OhlcvBar& bar, DataQualityReport& report) {
    const std::string id = bar.asset_id + "@" + bar.timestamp;
    if (bar.open < 0.0 || bar.high < 0.0 || bar.low < 0.0 || bar.close < 0.0) {
        reject(report, id + ":negative_price", report.rejected_records);
        return false;
    }
    if (bar.high < bar.low || bar.high < bar.open || bar.high < bar.close || bar.low > bar.open || bar.low > bar.close) {
        reject(report, id + ":bad_ohlc_ordering", report.bad_ohlc_ordering);
        return false;
    }
    return true;
}

bool DataValidator::validateMacroObservation(const MacroObservation& obs, DataQualityReport& report) {
    const std::string id = obs.series + "@" + obs.timestamp;
    if (obs.release_timestamp.empty() || isBefore(obs.ingested_at, obs.release_timestamp)) {
        reject(report, id + ":lookahead_risk", report.lookahead_risk);
        return false;
    }
    return true;
}

} // namespace sovereign
