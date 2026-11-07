#pragma once

namespace sovereign {

struct RiskLimits {
    double max_drawdown{0.30};
    bool fail_closed{true};
    double max_concentration{0.25};
};

struct OptionsGreeks {
    double delta{0.0};
    double gamma{0.0};
    double vega{0.0};
    double theta{0.0};
};

struct OptionsRiskLimits {
    double max_gamma{50.0};
    double max_vega{10000.0};
    double max_delta{5.0};
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
