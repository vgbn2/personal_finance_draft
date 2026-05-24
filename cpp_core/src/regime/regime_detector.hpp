#pragma once

#include <vector>
#include <string>
#include <optional>

namespace sovereign {

enum class MarketRegime {
    UNDEFINED,
    BULLISH_TREND,
    BEARISH_TREND,
    MEAN_REVERSION,
    VOLATILE_CRASH
};

struct RegimeState {
    MarketRegime current_regime;
    double confidence;
    std::string description;
};

class IRegimeDetector {
public:
    virtual ~IRegimeDetector() = default;
    virtual void update(const std::vector<double>& prices, const std::vector<double>& volumes) = 0;
    virtual RegimeState get_current_state() const = 0;
};

} // namespace sovereign
