#include <iostream>
#include <vector>
#include <cassert>
#include "features/macro_features.hpp"

void test_macro_feature_extraction() {
    using namespace sovereign;
    using namespace sovereign::features;

    MacroFeatureExtractor extractor;
    std::vector<MacroObservation> observations;

    // Series 1: Interest Rate (US02YIELD) - Monthly points
    observations.push_back({"US02YIELD", "2026-01-01", "2026-01-01", 4.5, "FRED", ""});
    observations.push_back({"US02YIELD", "2026-02-01", "2026-02-01", 4.7, "FRED", ""});
    observations.push_back({"US02YIELD", "2026-03-01", "2026-03-01", 4.6, "FRED", ""});

    // Series 2: Inflation (CPI)
    observations.push_back({"CPI", "2026-01-01", "2026-01-15", 300.0, "FRED", ""});
    observations.push_back({"CPI", "2026-02-01", "2026-02-15", 305.0, "FRED", ""});
    observations.push_back({"CPI", "2026-03-01", "2026-03-15", 312.0, "FRED", ""});

    // Series 3: Liquidity component (M2SL)
    observations.push_back({"M2SL", "2026-03-01", "2026-03-20", 21000.0, "FRED", ""});

    FeatureFrame frame = extractor.extract(observations);

    // Basic validation
    assert(frame.rows.size() == 3);
    assert(frame.ready_rows == 3);

    // Check last row features (2026-03-01)
    const auto& last_row = frame.rows.back();
    assert(last_row.timestamp == "2026-03-01");

    // Rate momentum: 4.6 - 4.7 = -0.1
    auto rate_mom = last_row.get("macro:rate_momentum:US02YIELD");
    assert(rate_mom.has_value());
    assert(std::abs(*rate_mom - (-0.1)) < 1e-9);

    // Inflation velocity: (312-305) - (305-300) = 7 - 5 = 2
    auto inf_vel = last_row.get("macro:inflation_velocity:CPI");
    assert(inf_vel.has_value());
    assert(std::abs(*inf_vel - 2.0) < 1e-9);

    // Liquidity index: (M2SL + US02YIELD*-0.5) / 2 = (21000 + 4.6*-0.5) / 2 = (21000 - 2.3) / 2 = 10498.85
    // Wait, DFF was the inverted one in my code, but US02YIELD is also a rate.
    // My code only used DFF for inversion. US02YIELD is not in the composite list.
    // Liquidity components were: M2SL, WALCL, RESERVES, DFF (-0.5)
    // Only M2SL is present at 2026-03-01 for composite in this test.
    auto liq_idx = last_row.get("macro:liquidity_index");
    assert(liq_idx.has_value());
    assert(std::abs(*liq_idx - 21000.0) < 1e-9);

    std::cout << "MacroFeatureExtractor test passed!" << std::endl;
}

int main() {
    test_macro_feature_extraction();
    return 0;
}
