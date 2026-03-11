
import unittest
from polymarket_sim.analysis.portfolio import Portfolio, Position, OrderSide

class TestSettlement(unittest.TestCase):
    def test_settlement_winner(self):
        p = Portfolio(bankroll=100.0)
        # Buy 100 shares of Yes at 0.40
        p._positions["T1"] = Position("T1", OrderSide.BUY, 0.40, 100)
        p.bankroll -= 40.0 # Cost was already deducted
        
        # Settle: T1 is winner
        p.settle_positions("Yes", ["Yes", "No"], ["T1", "T2"])
        
        # Check: Payout = 100 * $1.00 = $100.
        # Bankroll should be 100 - 40 + 100 = 160.
        # Logic in settle_positions adds (Entry*Size + NetPnL)
        # NetPnL = (1.0 - 0.4) * 100 = 60.
        # Bankroll += (0.4*100) + 60 = 100. 
        # Wait, if bankroll started at 100. Paid 40 -> 60 left.
        # Recovers 100. Final should be 160.
        # Code: self.bankroll += (pos.avg_entry * pos.size) + net_pnl
        # = (40) + 60 = 100.
        # Final bankroll = 60 (remaining) + 100 = 160. Correct.
        
        self.assertEqual(p.bankroll, 160.0)
        self.assertNotIn("T1", p._positions)

    def test_settlement_loser(self):
        p = Portfolio(bankroll=100.0)
        # Buy 100 shares of No at 0.60
        p._positions["T2"] = Position("T2", OrderSide.BUY, 0.60, 100.0)
        p.bankroll -= 60.0 # 40 left
        
        # Settle: Yes is winner (so No is loser)
        p.settle_positions("Yes", ["Yes", "No"], ["T1", "T2"])
        
        # Payout = 0.
        # PnL = (0 - 0.6) * 100 = -60.
        # Recover = (0.6*100) + (-60) = 0.
        # Final bankroll = 40 + 0 = 40. Correct.
        
        self.assertEqual(p.bankroll, 40.0)
        self.assertNotIn("T2", p._positions)

if __name__ == "__main__":
    unittest.main()
