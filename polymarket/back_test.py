import pandas as pd
import matplotlib.pyplot as plt
import glob
import os
import numpy as np

# --- 1. CONFIGURATION ---
DATA_FOLDER = "market_data"  # The folder name you created
INITIAL_CASH = 1000.0
BET_SIZE = 100.0       
FEE_RATE = 0.001       

# --- 2. THE ENGINE ---
class MockArbClient:
    def __init__(self, initial_cash=1000):
        self.cash = initial_cash
        self.trade_log = []

    def execute_arb_trade(self, price_up, price_down, timestamp):
        combined_price = price_up + price_down
        
        # LOGIC: Buy if sum < 0.99
        if combined_price >= 0.99:
            return False

        shares = BET_SIZE / combined_price
        cost = shares * combined_price
        fees = cost * FEE_RATE
        
        if self.cash >= (cost + fees):
            self.cash -= (cost + fees)
            self.trade_log.append({
                'time': timestamp,
                'action': 'BUY',
                'price_sum': combined_price,
                'shares': shares,
                'fee': fees
            })
            return True
        return False

# --- 3. BULK DATA LOADER ---
def load_all_files(folder_path):
    print(f"\n--- 📂 Scanning folder: {folder_path} ---")
    
    # Find all CSVs
    all_files = glob.glob(os.path.join(folder_path, "*.csv"))
    
    if not all_files:
        print(f"❌ No CSV files found in '{folder_path}'")
        print("Make sure you created the folder and put the files inside!")
        return None

    print(f"✅ Found {len(all_files)} files. Merging data...")
    
    df_list = []
    
    for filename in all_files:
        try:
            # Read individual file
            df = pd.read_csv(filename)
            
            # --- Auto-Map Columns (Same logic as before) ---
            col_map = {}
            # Find Time
            for col in ['t', 'timestamp', 'date', 'time', 'ts', 'Date_Time']:
                match = next((c for c in df.columns if c.lower() == col.lower()), None)
                if match: 
                    col_map['t'] = match
                    break
            
            # Find Price
            for col in ['price', 'close', 'last', 'p', 'bid', 'ask', 'price_up']:
                match = next((c for c in df.columns if c.lower() == col.lower()), None)
                if match: 
                    col_map['price_up'] = match
                    break
            
            if 't' in col_map and 'price_up' in col_map:
                # Rename to standard
                df = df.rename(columns={col_map['t']: 't', col_map['price_up']: 'price_up'})
                
                # If 'price_down' missing, simulate it (for testing orderbook data)
                if 'price_down' not in df.columns:
                     # Simulate DOWN price roughly as (1 - UP) with noise
                    df['price_down'] = 1.0 - df['price_up'] - np.random.uniform(-0.02, 0.03, len(df))
                
                # Keep only relevant cols
                df = df[['t', 'price_up', 'price_down']]
                df_list.append(df)
            else:
                print(f"⚠️ Skipping {os.path.basename(filename)}: Columns not found.")
                
        except Exception as e:
            print(f"⚠️ Error reading {os.path.basename(filename)}: {e}")

    if not df_list:
        print("❌ Could not load any valid data.")
        return None

    # Merge all mini-dataframes into one big timeline
    full_df = pd.concat(df_list, ignore_index=True)
    
    # Convert time and Sort
    full_df['t'] = pd.to_datetime(full_df['t'])
    full_df = full_df.sort_values('t').reset_index(drop=True)
    
    print(f"✅ Successfully loaded {len(full_df)} total data points across {len(all_files)} files.")
    return full_df

# --- 4. VISUALIZATION ---
def plot_results(df, bot):
    print("📊 Generating Dashboard...")
    plt.style.use('dark_background')
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10), sharex=True)
    plt.subplots_adjust(hspace=0.4)
    
    # Prices
    ax1.set_title(f"Combined Market Data ({len(df)} rows)")
    ax1.plot(df['t'], df['price_up'], color='#00ff00', linewidth=0.8, label='UP')
    ax1.plot(df['t'], df['price_down'], color='#ff0000', linewidth=0.8, label='DOWN', alpha=0.6)
    ax1.legend()
    
    # Spread
    spread = df['price_up'] + df['price_down']
    ax2.set_title("Arbitrage Opportunities (Cost < 1.00)")
    ax2.plot(df['t'], spread, color='cyan', linewidth=0.5)
    ax2.axhline(1.0, color='white', linestyle='--', alpha=0.5)
    ax2.fill_between(df['t'], 0, 1.0, where=(spread < 0.99), color='green', alpha=0.3)
    ax2.set_ylim(0.9, 1.05)
    
    # Equity
    if bot.trade_log:
        times_plot = [df['t'].iloc[0]]
        equity = [INITIAL_CASH]
        cum = INITIAL_CASH
        
        for t in bot.trade_log:
            profit = (1.0 - t['price_sum']) * t['shares'] - t['fee']
            cum += profit
            times_plot.append(t['time'])
            equity.append(cum)
            
        ax3.step(times_plot, equity, where='post', color='gold')
        ax3.set_title(f"Total Profit: ${cum - INITIAL_CASH:.2f}")
    else:
        ax3.text(0.5, 0.5, "No Trades Found", ha='center', color='white')
        
    plt.show()

# --- MAIN ---
if __name__ == "__main__":
    # 1. Load Everything
    df = load_all_files(DATA_FOLDER)
    
    if df is not None:
        # 2. Run Bot
        print("\n--- Running Cumulative Backtest ---")
        bot = MockArbClient(INITIAL_CASH)
        
        for i, row in df.iterrows():
            bot.execute_arb_trade(float(row['price_up']), float(row['price_down']), row['t'])
                
        # 3. Show Results
        print(f"\nFinal Balance: ${bot.cash + (bot.trade_log[-1]['shares'] if bot.trade_log else 0):.2f}")
        plot_results(df, bot)