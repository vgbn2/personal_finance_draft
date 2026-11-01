#pragma once

#include "validated_market_frame.hpp"
#include <string>

namespace sovereign {

// [OOP: SRP] Centralized Data Validator & Security Sanitizer
// Single source of truth for input sanitization, IEEE 754 finite validation,
// and market data invariants across C++ ingestion, storage, and merge engines.
class DataValidator {
public:
    static bool validateBar(const OhlcvBar& bar, DataQualityReport& report);
    static bool validateMacroObservation(const MacroObservation& obs, DataQualityReport& report);

    // [Security] Path Traversal Shielding: Whitelist alphanumeric characters + underscores
    static std::string sanitizeSymbol(const std::string& symbol);
    static std::string sanitizeTimeframe(const std::string& timeframe);

    // [Security: TV-01] Non-finite float validation (NaN / Inf rejection)
    static bool isValidRecord(double ts_ms, double close);
};

} // namespace sovereign
