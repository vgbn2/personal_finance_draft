import requests
import pandas as pd
import time
import ast
import matplotlib.pyplot as plt
import os

# --- 1. CONFIGURATION ---
EVENT_SLUG = "btc-updown-15m-1766919600"  # Your specific Event
INITIAL_CASH = 1000.0  # Starting fake money
BET_SIZE = 100.0       # How much to spend per trade
FEE_RATE = 0.001       # 0.1% taker fee (Polymarket estimate)

# --- 2. THE MOCK CLIENT (Engine) ---
class MockArbClient:
    """
    Simulates a Polymarket account that holds Cash, UP tokens, and DOWN tokens.
    """
    def __init__(self, initial_cash=1000):
        self.cash = initial_cash
        self.pos_up = 0.0    # Shares of UP
        self.pos_down = 0.0  # Shares of DOWN
        self.trade_log = []
        self.equity_curve = []

    def execute_arb_trade(self, price_up, price_down, timestamp):
        """
        Buys EQUAL shares of UP and DOWN to lock in a profit.
        """
        # 1. Calculate Cost
        # To get 1.0 payout, we need 1 share of UP and 1 share of DOWN.
        combined_price = price_up + price_down
        
        # 2. Check Affordability
        cost_for_batch = BET_SIZE 
        shares_to_buy = cost_for_batch / combined_price
        
        total_cost = shares_to_buy * combined_price
        fees = total_cost * FEE_RATE
        
        if self.cash >= (total_cost + fees):
            # EXECUTE BUY
            self.cash -= (total_cost + fees)
            self.pos_up += shares_to_buy
            self.pos_down += shares_to_buy
            
            # Log it
            self.trade_log.append({
                'time': timestamp,
                'action': 'BUY_ARB',
                'price_sum': combined_price,
                'shares': shares_to_buy,
                'fee': fees
            })
            return True
        return False

    def get_equity(self, market_resolved=False):
        """
        Calculates total account value.
        If market_resolved=True, assumes positions pay out $1.00 each.
        """
        if market_resolved:
            # In a perfect arb, 1 UP + 1 DOWN = $1.00 Payout
            # Since we have equal amounts of both, payout is just sum of shares
            payout = self.pos_up # (Since pos_up == pos_down)
            return self.cash + payout
        else:
            # Unresolved equity (cash only, as positions are illiquid in this view)
            return self.cash

# --- 3. DATA FETCHING (Robust Version) ---
def fetch_arb_data(slug):
    print(f"--- Fetching Data for: {slug} ---")
    
    # API Endpoints
    GAMMA_API = "https://gamma-api.polymarket.com/events"
    CLOB_API = "https://clob.polymarket.com/prices-history"

    try:
        # A. Get IDs
        resp = requests.get(GAMMA_API, params={"slug": slug}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not data: return None

        if not data[0].get('markets'):
            print("❌ Error: No markets found in event.")
            return None

        market = data[0]['markets'][0]
        
        # Fix for stringified lists
        raw_ids = market.get('clobTokenIds')
        if isinstance(raw_ids, str):
            clob_ids = ast.literal_eval(raw_ids)
        else:
            clob_ids = raw_ids

        token_up, token_down = clob_ids[0], clob_ids[1]
        print(f"✅ Tokens: UP({token_up[-6:]}) / DOWN({token_down[-6:]})")

        # B. Get History Helper
        def _get_hist(tid):
            end_ts = int(time.time())
            start_ts = end_ts - (24 * 60 * 60) # Last 24h
            try:
                r = requests.get(CLOB_API, params={"interval": "1m", "market": tid, "startTs": start_ts, "endTs": end_ts}, timeout=10)
                history = r.json().get('history', [])
                if not history: return pd.DataFrame()
                df = pd.DataFrame(history)
                df['t'] = pd.to_datetime(df['t'], unit='s')
                df['c'] = df['c'].astype(float)
                return df[['t', 'c']].rename(columns={'c': 'price'})
            except Exception as e:
                print(f"⚠️ Error fetching history for {tid}: {e}")
                return pd.DataFrame()

        # C. Fetch & Merge
        df_up = _get_hist(token_up)
        df_down = _get_hist(token_down)
        
        if df_up.empty or df_down.empty: return None
        
        df = pd.merge(df_up, df_down, on='t', suffixes=('_up', '_down'), how='inner')
        return df.sort_values('t')

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def plot_results(df, bot):
    """
    Creates a dashboard showing Prices, Spread, and Account Growth.
    """
    print("📊 Generating Backtest Screen...")
    
    # Create a window with 3 charts stacked
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10), sharex=True)
    plt.subplots_adjust(hspace=0.3)
    
    # CHART 1: Token Prices
    ax1.set_title(f"Market Prices: {EVENT_SLUG}")
    ax1.plot(df['t'], df['price_up'], label='Price UP', color='green', alpha=0.6)
    ax1.plot(df['t'], df['price_down'], label='Price DOWN', color='red', alpha=0.6)
    ax1.set_ylabel("Price ($)")
    ax1.legend(loc='upper right')
    ax1.grid(True, alpha=0.3)

    # CHART 2: Arbitrage Spread (The Opportunity)
    # Calculate implied sum for the whole dataframe for plotting
    df['implied_sum'] = df['price_up'] + df['price_down']
    
    ax2.set_title("Arbitrage Cost (Target < 1.00)")
    ax2.plot(df['t'], df['implied_sum'], color='blue', label='Cost (UP+DOWN)')
    # Draw a red line at 1.00 (Break Even)
    ax2.axhline(y=1.0, color='red', linestyle='--', linewidth=2, label='Break Even (1.00)')
    # Draw a green zone where profit exists
    ax2.fill_between(df['t'], 0, 1.0, where=(df['implied_sum'] < 1.0), color='green', alpha=0.1)
    ax2.set_ylabel("Cost ($)")
    ax2.legend(loc='upper right')
    ax2.grid(True, alpha=0.3)

    # CHART 3: Your Portfolio Growth
    # We need to reconstruct the equity curve from the trade log
    if bot.trade_log:
        # Convert log to dataframe
        trades_df = pd.DataFrame(bot.trade_log)
        # Create a cumulative profit line
        # Start with initial cash
        equity_over_time = [INITIAL_CASH]
        times = [df['t'].iloc[0]]
        
        running_balance = INITIAL_CASH
        for trade in bot.trade_log:
            # Net impact of the trade (simplified for visualization)
            # In a real arb, equity doesn't jump until we sell/settle, 
            # but here we visualize "Locked Profit"
            profit_per_trade = (1.0 - trade['price_sum']) * trade['shares'] - trade['fee']
            running_balance += profit_per_trade
            
            equity_over_time.append(running_balance)
            times.append(trade['time'])
            
        ax3.step(times, equity_over_time, where='post', color='gold', linewidth=2)
        ax3.set_title(f"Portfolio Equity (Final: ${running_balance:.2f})")
    else:
        ax3.text(0.5, 0.5, "No Trades Executed", ha='center', fontsize=12)
        ax3.set_title("Portfolio Equity")

    ax3.set_ylabel("Account Value ($)")
    ax3.grid(True, alpha=0.3)

    print("✅ Dashboard ready! Check the popup window.")
    plt.show()

# --- 4. MAIN EXECUTION ---
if __name__ == "__main__":
    # 1. Fetch
    df = fetch_arb_data(EVENT_SLUG)
    
    if df is not None:
        # --- SAVE DATA FOR BACKTESTER ---
        folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "market_data")
        os.makedirs(folder, exist_ok=True)
        csv_path = os.path.join(folder, f"{EVENT_SLUG}.csv")
        df.to_csv(csv_path, index=False)
        print(f"💾 Data saved to: {csv_path}")

        # 2. Simulate
        bot = MockArbClient(initial_cash=INITIAL_CASH)
        print(f"\n--- Starting Backtest ---")
        
        for i, row in df.iterrows():
            p_up = float(row['price_up'])
            p_down = float(row['price_down'])
            if (p_up + p_down) < 0.99:
                bot.execute_arb_trade(p_up, p_down, row['t'])

        # 3. VISUALIZE (The new part)
        plot_results(df, bot)
    
    else:
        print("\n❌ Failed to fetch data. No file was saved.")
        print("   👉 Check if the EVENT_SLUG is valid and active.")