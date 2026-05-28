#include "../src/regime/regime_detector.hpp"
#include <cassert>
#include <iostream>
#include <vector>

int main() {
    auto detector = sovereign::makeSimpleMovingRegimeDetector();
    
    // Test: Insufficient data
    std::vector<double> prices(10, 100.0);
    detector->update(prices, {});
    assert(detector->get_current_state().current_regime == sovereign::MarketRegime::UNDEFINED);

    // Test: Bullish
    prices.assign(20, 100.0);
    prices.back() = 110.0;
    detector->update(prices, {});
    assert(detector->get_current_state().current_regime == sovereign::MarketRegime::BULLISH_TREND);

    // Test: Bearish
    prices.assign(20, 100.0);
    prices.back() = 90.0;
    detector->update(prices, {});
    assert(detector->get_current_state().current_regime == sovereign::MarketRegime::BEARISH_TREND);

    std::cout << "Regime detector tests passed!" << std::endl;
    return 0;
}
