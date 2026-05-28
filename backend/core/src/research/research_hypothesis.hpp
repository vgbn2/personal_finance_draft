#pragma once

#include <cstddef>
#include <string>

namespace sovereign {

enum class HypothesisStatus {
    Draft,
    Active,
    Validated,
    Rejected,
    Archived,
};

struct ResearchHypothesis {
    std::string name;
    std::string question;
    std::string symbol;
    std::string timeframe;
    std::string owner;
    std::string created_at;
    std::string updated_at;
    HypothesisStatus status = HypothesisStatus::Draft;
    std::size_t minimum_trades = 30;
    double minimum_sharpe = 1.0;

    bool is_active() const {
        return status == HypothesisStatus::Active;
    }

    bool is_publishable() const {
        return !name.empty() && !question.empty() && !symbol.empty() && !timeframe.empty();
    }
};

} // namespace sovereign
