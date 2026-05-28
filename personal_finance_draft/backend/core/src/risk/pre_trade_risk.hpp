#pragma once

#include "risk_limits.hpp"

namespace sovereign {

struct TradeOrder {
    double notional;
    double volatility;
    double current_drawdown;
};

class PreTradeRisk {
public:
    explicit PreTradeRisk(RiskLimits limits);
    
    RiskDecision validate(const TradeOrder& order) const;

private:
    RiskLimits limits_;
};

} // namespace sovereign
