#pragma once

namespace sovereign {

struct RiskLimits {
    double max_drawdown{0.20};
    bool fail_closed{true};
};

struct RiskDecision {
    bool approved{false};
    bool halt_trading{true};
    double observed_drawdown{0.0};
    double limit{0.0};
    const char* reason{"uninitialized"};
};

} // namespace sovereign
