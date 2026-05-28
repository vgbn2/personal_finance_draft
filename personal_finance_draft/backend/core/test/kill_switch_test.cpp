#include "../src/execution/kill_switch.hpp"
#include "../src/execution/paper_broker.hpp"
#include <cassert>
#include <iostream>

using namespace sovereign::execution;

int main() {
    auto paper = std::make_unique<PaperBroker>();
    KillSwitch ks(std::move(paper));

    ExecutionOrder order{"BTCUSDT", "buy", 1.0, "market"};

    // 1. Normal state (disengaged)
    assert(ks.is_engaged() == false);
    assert(ks.isReady() == true);
    auto res1 = ks.submit(order);
    assert(res1.state == OrderState::filled);
    assert(res1.filled_quantity == 1.0);

    // 2. Engage kill switch
    ks.engage();
    assert(ks.is_engaged() == true);
    assert(ks.isReady() == false); // Should report not ready
    
    // Attempt submission
    auto res2 = ks.submit(order);
    assert(res2.state == OrderState::rejected);
    assert(res2.filled_quantity == 0.0);
    assert(res2.reason.find("BLOCKED") != std::string::npos);

    // 3. Cancels should still be allowed during kill switch engagement
    assert(ks.cancel("BTCUSDT") == true);

    // 4. Disengage
    ks.disengage();
    assert(ks.is_engaged() == false);
    assert(ks.isReady() == true);
    auto res3 = ks.submit(order);
    assert(res3.state == OrderState::filled);

    std::cout << "KillSwitch execution decorator tests passed!" << std::endl;
    return 0;
}
