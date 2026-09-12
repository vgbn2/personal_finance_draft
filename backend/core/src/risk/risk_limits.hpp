#pragma once

namespace sovereign {

struct RiskLimits {
    double max_drawdown{0.30};
    bool fail_closed{true};
    double max_concentration{0.25};
};

struct RiskDecision {
    bool approved{false};
    bool halt_trading{true};
    double observed_drawdown{0.0};
    double limit{0.0};
    const char* reason{"uninitialized"};
};

} // namespace sovereign
