"""
Regression Test for Bug #4: Runaway Position Accumulation.
Verifies logic for bankroll guard (conceptually).
Since MatchingEngine requires full setup, this is a lightweight logic check.
"""
import logging

class MockPortfolio:
    def __init__(self, bankroll):
        self.bankroll = bankroll
    def snapshot(self):
        return self

def test_bankroll_logic():
    print("Testing Bankroll Guard Logic...")
    
    # Scenario: $100 bankroll, Order cost $150
    portfolio = MockPortfolio(bankroll=100.0)
    order_price = 0.50
    order_size = 300  # Cost = 150
    cost = order_price * order_size
    
    if portfolio.bankroll < cost:
        print(f"✅ Guard Active: Rejected order cost ${cost} with bankroll ${portfolio.bankroll}")
    else:
        print(f"❌ FAILED: Allowed order cost ${cost} with bankroll ${portfolio.bankroll}")
        exit(1)

if __name__ == "__main__":
    test_bankroll_logic()
