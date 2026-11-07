#pragma once

#include "../data/ohlcv_bar.hpp"

#include <cstddef>
#include <string>

namespace sovereign {

enum class StrategyAction {
    Hold,
    Buy,
    Sell,
};

struct StrategyDecision {
    StrategyAction action = StrategyAction::Hold;
    std::string reason;
};

struct StrategyBarContext {
    std::string exchange;
    std::string symbol;
    std::string timeframe;
    std::size_t bar_index = 0;
    const OhlcvBar* previous_bar = nullptr;
};

class CryptoStrategyInterface {
public:
    virtual ~CryptoStrategyInterface() = default;

    virtual std::string name() const = 0;
    virtual StrategyDecision onBar(const OhlcvBar& bar, const StrategyBarContext& context) = 0;
};

} // namespace sovereign
