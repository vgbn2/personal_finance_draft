#include "exposure_monitor.hpp"

namespace sovereign::portfolio {

ExposureDecision ExposureMonitor::evaluate(const PortfolioState& state, const ExposureLimits& limits) {
    ExposureDecision decision;
    decision.report = analyzeExposure(state, limits);
    if (decision.report.within_limits) {
        decision.approved = true;
        decision.halt_trading = false;
        decision.reason = "exposure_within_limits";
        return decision;
    }

    decision.approved = false;
    decision.halt_trading = true;
    decision.reason = "exposure_limit_breached";
    return decision;
}

} // namespace sovereign::portfolio
