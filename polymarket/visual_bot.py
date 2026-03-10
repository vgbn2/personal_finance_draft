import requests
import pandas as pd
import time
import ast
import matplotlib.pyplot as plt

# --- 1. CONFIGURATION ---
# The specific event slug (Bitcoin 15m Up/Down)
EVENT_SLUG = "btc-updown-15m-1766919600" 
INITIAL_CASH = 1000.0  # Starting fake money
BET_SIZE = 100.0       # How much to spend per trade
FEE_RATE = 0.001       # 0.1% fee estimate

# --- 2. THE MOCK CLIENT (Engine) ---
class MockArbClient:
    """
    Simulates a Polymarket account that buys BOTH sides (Yes + No)
    whenever the combined price is cheap (< $1.00).
    """
    def __init__(self, initial_cash=1000):
        self.cash = initial_cash
        self.pos_up = 0.0
        self.pos_down = 0.0
        self.trade_log = []

    def execute_arb_trade(self, price_up, price_down, timestamp):
        combined_price = price_up + price_down
        
        # Determine how many shares we can buy with our bet size
        cost_for_batch = BET_SIZE 
        shares_to_buy = cost_for_batch / combined_price
        
        total_cost = shares_to_buy * combined_price
        fees = total_cost * FEE_RATE
        
        # Check if we have enough cash
        if self.cash >= (total_cost + fees):
            self.cash -= (total_cost + fees)
            self.pos_up += shares_to_buy
            self.pos_down += shares_to_buy
            
            self.trade_log.append({
                'time': timestamp,
                'action': 'BUY_ARB',
                'price_sum': combined_price,
                'shares': shares_to_buy,
                'fee': fees
            })
            return True
        return False

# --- 3. DATA FETCHING (Robust Version) ---
def fetch_arb_data(slug):
    print(f"--- Fetching Data for: {slug} ---")
    
    GAMMA_API = "https://gamma-api.polymarket.com/events"
    CLOB_API = "https://clob.polymarket.com/prices-history"

    try:
        # A. Get Token IDs
        resp = requests.get(GAMMA_API, params={"slug": slug}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not data: return None

        market = data[0]['markets'][0]
        
        # FIX: Handle stringified lists if necessary
        raw_ids = market.get('clobTokenIds')
        if isinstance(raw_ids, str):
            clob_ids = ast.literal_eval(raw_ids)
        else:
            clob_ids = raw_ids

        token_up, token_down = clob_ids[0], clob_ids[1]
        print(f"✅ Tokens: UP({token_up[-6:]}) / DOWN({token_down[-6:]})")

        # B. Helper to get candles
        def _get_hist(tid):
            end_ts = int(time.time())
            start_ts = end_ts - (24 * 60 * 60) # Last 24 hours
            try:
                r = requests.get(CLOB_API, params={"interval": "1m", "market": tid, "startTs": start_ts, "endTs": end_ts}, timeout=10)
                history = r.json().get('history', [])
                if not history: return pd.DataFrame()
                df = pd.DataFrame(history)
                df['t'] = pd.to_datetime(df['t'], unit='s')
                df['c'] = df['c'].astype(float)
                return df[['t', 'c']].rename(columns={'c': 'price'})
            except Exception as e:
                print(f"⚠️ Error fetching history: {e}")
                return pd.DataFrame()

        # C. Fetch & Merge
        df_up = _get_hist(token_up)
        df_down = _get_hist(token_down)
        
        if df_up.empty or df_down.empty: 
            print("❌ No history found (Market might be too new).")
            return None
        
        df = pd.merge(df_up, df_down, on='t', suffixes=('_up', '_down'), how='inner')
        return df.sort_values('t')

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

# --- 4. VISUALIZATION (The Screen) ---
def plot_results(df, bot):
    print("📊 Generating Dashboard... (Check for popup window)")
    
    # Setup the plot
    plt.style.use('dark_background') # Optional: Makes it look cool
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10), sharex=True)
    plt.subplots_adjust(hspace=0.3)
    
    # CHART 1: Prices
    ax1.set_title(f"Market Prices: {EVENT_SLUG}")
    ax1.plot(df['t'], df['price_up'], label='UP (Yes)', color='#00ff00', linewidth=1)
    ax1.plot(df['t'], df['price_down'], label='DOWN (No)', color='#ff0000', linewidth=1)
    ax1.legend(loc='upper right')
    ax1.grid(True, alpha=0.2)

    # CHART 2: The Spread (Cost to buy both)
    df['implied_sum'] = df['price_up'] + df['price_down']
    ax2.set_title("Arbitrage Cost (Target < 1.00)")
    ax2.plot(df['t'], df['implied_sum'], color='cyan', linewidth=1)
    ax2.axhline(y=1.0, color='white', linestyle='--', label='Break Even (1.00)')
    # Highlight profit zones
    ax2.fill_between(df['t'], 0, 1.0, where=(df['implied_sum'] < 0.995), color='green', alpha=0.3)
    ax2.set_ylim(0.90, 1.05)
    ax2.legend()

    # CHART 3: Account Balance
    if bot.trade_log:
        times = [df['t'].iloc[0]]
        equity = [INITIAL_CASH]
        current_bal = INITIAL_CASH
        
        for trade in bot.trade_log:
            # Calculate realized profit for visualization
            profit = (1.0 - trade['price_sum']) * trade['shares'] - trade['fee']
            current_bal += profit
            times.append(trade['time'])
            equity.append(current_bal)
            
        ax3.step(times, equity, where='post', color='gold', linewidth=2)
        ax3.set_title(f"Portfolio Equity (Final: ${current_bal:,.2f})")
    else:
        ax3.text(0.5, 0.5, "No Trades Triggered", ha='center', color='white')
        ax3.set_title("Portfolio Equity")

    ax3.set_ylabel("Balance ($)")
    
    print("✅ Dashboard Ready.")
    plt.show()

# --- 5. MAIN EXECUTION ---
if __name__ == "__main__":
    # 1. Fetch
    df = fetch_arb_data(EVENT_SLUG)
    
    if df is not None:
        # 2. Simulate
        bot = MockArbClient(initial_cash=INITIAL_CASH)
        print(f"\n--- Starting Backtest ---")
        
        for i, row in df.iterrows():
            p_up = float(row['price_up'])
            p_down = float(row['price_down'])
            
            # TRIGGER: If buying both costs less than $0.99
            if (p_up + p_down) < 0.99:
                bot.execute_arb_trade(p_up, p_down, row['t'])

        # 3. Show Screen
        plot_results(df, bot)
        