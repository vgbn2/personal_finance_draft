#include "spot_futures_arb.hpp"

#include <cmath>

namespace sovereign::strategies {

SpotFuturesArbSignal evaluateSpotFuturesArb(double spot_price, double futures_price, double entry_threshold_bps) {
    SpotFuturesArbSignal signal;
    if (spot_price <= 0.0 || futures_price <= 0.0) {
        signal.decision.side = Side::none;
        signal.decision.reason = "invalid_spread_inputs";
        return signal;
    }

    signal.basis_bps = (futures_price / spot_price - 1.0) * 10000.0;
    signal.ok = true;

    if (signal.basis_bps >= entry_threshold_bps) {
        signal.decision.side = Side::sell;
        signal.decision.reason = "futures_rich_short_spread";
    } else if (signal.basis_bps <= -entry_threshold_bps) {
        signal.decision.side = Side::buy;
        signal.decision.reason = "futures_cheap_long_spread";
    } else {
        signal.decision.side = Side::none;
        signal.decision.reason = "basis_neutral";
    }

    signal.decision.confidence = std::fabs(signal.basis_bps) / 100.0;
    return signal;
}

} // namespace sovereign::strategies
