#include "../src/regime/regime_detector.hpp"
#include "../src/strategies/options_trading.hpp"
#include "../src/strategies/spot_futures_arb.hpp"
#include "../src/strategies/spot_only.hpp"

#include <cstdlib>
#include <iostream>

#define CHECK(condition) do { if (!(condition)) { std::cerr << "CHECK failed: " #condition << "\n"; std::exit(1); } } while (false)
#include <vector>

int main() {
    auto detector = sovereign::makeSimpleMovingRegimeDetector();
    std::vector<double> prices(10, 100.0);
    detector->update(prices, {});
    CHECK(detector->get_current_state().current_regime == sovereign::MarketRegime::UNDEFINED);

    prices.assign(20, 100.0);
    prices.back() = 110.0;
    detector->update(prices, {});
    CHECK(detector->get_current_state().current_regime == sovereign::MarketRegime::BULLISH_TREND);

    const auto spot_only = sovereign::strategies::evaluateSpotOnly({100.0, 104.0});
    CHECK(spot_only.ok);
    CHECK(spot_only.decision.side == sovereign::strategies::Side::buy);

    const auto arb = sovereign::strategies::evaluateSpotFuturesArb(100.0, 101.0);
    CHECK(arb.ok);
    CHECK(arb.decision.side == sovereign::strategies::Side::sell);

    const auto options = sovereign::strategies::evaluateOptionsTrading(0.40, 0.25);
    CHECK(options.ok);
    CHECK(options.decision.side == sovereign::strategies::Side::sell);

    std::cout << "regime_strategy_test passed!\n";
    return 0;
}
