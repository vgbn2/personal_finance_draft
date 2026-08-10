#include "../src/execution/kill_switch.hpp"
#include "../src/execution/live_broker_adapter.hpp"
#include "../src/execution/paper_broker.hpp"
#include "../src/execution/rl_router.hpp"
#include "../src/execution/simple_market.hpp"
#include "../src/execution/twap_vwap.hpp"

#include <cstdlib>
#include <cmath>
#include <iostream>

#define CHECK(condition) do { if (!(condition)) { std::cerr << "CHECK failed: " #condition << "\n"; std::exit(1); } } while (false)
#include <memory>

namespace {

[[maybe_unused]] bool approxEqual(double actual, double expected, double tolerance = 1e-9) {
    return std::fabs(actual - expected) <= tolerance;
}

} // namespace

int main() {
    using namespace sovereign::execution;

    PaperBroker paper;
    CHECK(paper.isReady());
    CHECK(paper.name() == "PaperBroker");

    const ExecutionOrder market_order{.instrument_id = "BTCUSDT", .side = "buy", .quantity = 1.0, .order_type = "market"};
    const auto market_fill = paper.submit(market_order);
    CHECK(market_fill.state == OrderState::filled);
    CHECK(approxEqual(market_fill.filled_quantity, 1.0));
    CHECK(approxEqual(market_fill.average_price, 100.0));

    const auto simple_outcome = simulateSimpleMarketFill(market_order, 101.5);
    CHECK(simple_outcome.result.state == OrderState::filled);
    CHECK(approxEqual(simple_outcome.result.average_price, 101.5));

    const auto twap = buildTwapSlices(10.0, 4U);
    CHECK(twap.size() == 4U);
    CHECK(approxEqual(sumSlices(twap), 10.0));
    CHECK(approxEqual(twap.front(), 2.5));

    const std::vector<double> volume_profile{1.0, 2.0, 1.0};
    const auto vwap = buildVwapSlices(8.0, volume_profile);
    CHECK(vwap.size() == volume_profile.size());
    CHECK(approxEqual(sumSlices(vwap), 8.0));
    CHECK(vwap[1] > vwap[0]);

    const auto route_high_urgency = chooseRoutingMode(market_order, 100000.0, 0.95);
    CHECK(route_high_urgency.mode == RoutingMode::simple_market);
    const auto route_low_urgency = chooseRoutingMode(market_order, 100000.0, 0.10);
    CHECK(route_low_urgency.mode == RoutingMode::vwap);

    LiveBrokerAdapter live;
    CHECK(!live.isReady());
    CHECK(live.submit(market_order).state == OrderState::rejected);

    auto paper_ptr = std::make_unique<PaperBroker>();
    KillSwitch kill_switch(std::move(paper_ptr));
    CHECK(kill_switch.isReady());
    kill_switch.engage();
    CHECK(!kill_switch.isReady());
    const auto blocked = kill_switch.submit(market_order);
    CHECK(blocked.state == OrderState::rejected);
    CHECK(blocked.reason.find("BLOCKED") != std::string::npos);

    std::cout << "execution_test passed!\n";
    return 0;
}
