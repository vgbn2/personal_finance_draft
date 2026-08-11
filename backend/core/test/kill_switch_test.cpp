#include "../src/execution/kill_switch.hpp"
#include "../src/execution/paper_broker.hpp"
#include <cstdlib>
#include <iostream>

#define CHECK(condition) do { if (!(condition)) { std::cerr << "CHECK failed: " #condition << "\n"; std::exit(1); } } while (false)

using namespace sovereign::execution;

int main() {
    auto paper = std::make_unique<PaperBroker>();
    KillSwitch ks(std::move(paper));

    ExecutionOrder order{.instrument_id = "BTCUSDT", .side = "buy", .quantity = 1.0, .order_type = "market"};

    // 1. Normal state (disengaged)
    CHECK(ks.is_engaged() == false);
    CHECK(ks.isReady() == true);
    auto res1 = ks.submit(order);
    CHECK(res1.state == OrderState::filled);
    CHECK(res1.filled_quantity == 1.0);

    // 2. Engage kill switch
    ks.engage();
    CHECK(ks.is_engaged() == true);
    CHECK(ks.isReady() == false); // Should report not ready
    
    // Attempt submission
    auto res2 = ks.submit(order);
    CHECK(res2.state == OrderState::rejected);
    CHECK(res2.filled_quantity == 0.0);
    CHECK(res2.reason.find("BLOCKED") != std::string::npos);

    // 3. Cancels should still be allowed during kill switch engagement
    CHECK(ks.cancel("BTCUSDT") == true);

    // 4. Disengage
    ks.disengage();
    CHECK(ks.is_engaged() == false);
    CHECK(ks.isReady() == true);
    auto res3 = ks.submit(order);
    CHECK(res3.state == OrderState::filled);

    std::cout << "KillSwitch execution decorator tests passed!" << std::endl;
    return 0;
}
