#pragma once

#include <cstddef>
#include <string>

namespace sovereign {

enum class CorporateActionType {
    Split,
    ReverseSplit,
    Dividend,
    Delisting,
    SymbolChange,
    Merger,
    SpinOff,
    Unknown,
};

struct CorporateAction {
    CorporateActionType type = CorporateActionType::Unknown;
    std::string symbol;
    std::string timestamp;
    std::string effective_date;
    double ratio_numerator = 0.0;
    double ratio_denominator = 0.0;
    double cash_amount = 0.0;
    std::string currency;
    std::string source;

    bool is_price_adjusting() const {
        return type == CorporateActionType::Split
            || type == CorporateActionType::ReverseSplit
            || type == CorporateActionType::Dividend;
    }

    double split_factor() const {
        if (ratio_numerator <= 0.0 || ratio_denominator <= 0.0) {
            return 1.0;
        }
        if (type == CorporateActionType::Split || type == CorporateActionType::ReverseSplit) {
            return ratio_denominator / ratio_numerator;
        }
        return 1.0;
    }
};

} // namespace sovereign
