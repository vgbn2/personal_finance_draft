#pragma once

#include "validated_market_frame.hpp"

namespace sovereign {

class DataValidator {
public:
    static bool validateBar(const OhlcvBar& bar, DataQualityReport& report);
    static bool validateMacroObservation(const MacroObservation& obs, DataQualityReport& report);
};

} // namespace sovereign
