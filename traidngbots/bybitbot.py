import time
import os
from datetime import datetime
from dotenv import load_dotenv
from pybit.unified_trading import HTTP

# ==========================================
# 1. SETUP
# ==========================================

load_dotenv()

# Ensure you have these in your .env file:
# BYBIT_TESTNET_KEY=your_api_key
# BYBIT_TESTNET_SECRET=your_api_secret
API_KEY = os.getenv("BYBIT_TESTNET_KEY")
API_SECRET = os.getenv("BYBIT_TESTNET_SECRET")

# --- CONFIGURATION ---
SYMBOL = "BTCUSDT"
QTY = 0.001          # 0.001 BTC (Minimum for Bybit Linear)
IS_TESTNET = True    # Use Bybit Testnet

# Initialize Bybit HTTP Session (V5 API)
session = HTTP(
    testnet=IS_TESTNET,
    api_key=API_KEY,
    api_secret=API_SECRET,
)

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================

def check_account():
    """Verifies Wallet Balance (Unified Account)"""
    if not API_KEY or not API_SECRET:
        log("❌ CRITICAL: API Keys not found. Check your .env file.")
        return None

    try:
        # Fetch balance for Unified account (covers Spot & Futures)
        # Note: If using an older Standard Account, change accountType to "CONTRACT"
        response = session.get_wallet_balance(accountType="UNIFIED", coin="USDT")
        
        if response['retCode'] == 0:
            account_list = response['result']['list']
            if account_list:
                # Navigate to find USDT balance
                coins = account_list[0].get('coin', [])
                usdt_data = next((c for c in coins if c['coin'] == 'USDT'), None)
                
                if usdt_data:
                    balance = float(usdt_data['walletBalance'])
                    log(f"Connected to Bybit Testnet")
                    log(f"USDT Balance: ${balance:.2f}")
                    return balance
            
            log("USDT Wallet is empty or not found.")
            return 0.0
        else:
            log(f"API Error: {response['retMsg']}")
            return None

    except Exception as e:
        log(f"Connection Error: {e}")
        return None

def place_market_order(side, qty, reduce_only=False):
    """Places a Market Order. Side: 'Buy' or 'Sell'"""
    try:
        response = session.place_order(
            category="linear",
            symbol=SYMBOL,
            side=side,
            orderType="Market",
            qty=str(qty),
            reduceOnly=reduce_only
        )
        
        if response['retCode'] == 0:
            order_id = response['result']['orderId']
            log(f"ORDER PLACED | Side: {side} | Qty: {qty} | ID: {order_id}")
            return response
        else:
            log(f"Order Failed: {response['retMsg']}")
            return None
    except Exception as e:
        log(f"Order Exception: {e}")
        return None

def get_position():
    """Checks current position PnL"""
    try:
        response = session.get_positions(
            category="linear",
            symbol=SYMBOL
        )
        
        if response['retCode'] == 0:
            positions = response['result']['list']
            for pos in positions:
                size = float(pos['size'])
                if size > 0:
                    side = pos['side'] # "Buy" or "Sell"
                    entry = float(pos['avgPrice'])
                    pnl = float(pos['unrealisedPnl'])
                    
                    # Convert size to signed float for logic
                    signed_size = size if side == "Buy" else -size
                    
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] POSITION: {side} {size} | Entry: ${entry:.1f} | PnL: ${pnl:.4f}   ", end="\r")
                    return signed_size, pnl
            
            # No active position
            return 0.0, 0.0
        else:
            log(f"Error fetching position: {response['retMsg']}")
            return 0.0, 0.0

    except Exception as e:
        log(f"Position Error: {e}")
        return 0.0, 0.0

# ==========================================
# 3. MAIN LOOP
# ==========================================

def run_strategy():
    print("\n--- STARTING BYBIT BOT ---")
    
    # 1. Verify Balance
    balance = check_account()
    if balance is None: 
        print("Bot stopping due to Auth/Connection Error.")
        return

    # 2. Strategy Loop
    TAKE_PROFIT = 0.5  # USDT
    STOP_LOSS = -0.5   # USDT

    while True:
        try:
            current_size, current_pnl = get_position()

            if current_size == 0:
                print("") 
                log("No position. Opening LONG trade...")
                place_market_order("Buy", QTY)
            
            else:
                # Logic to close trade based on PnL
                if current_pnl >= TAKE_PROFIT:
                    print("") 
                    log(f"💰 Take Profit (${current_pnl:.2f}). Closing...")
                    close_side = "Sell" if current_size > 0 else "Buy"
                    place_market_order(close_side, abs(current_size), reduce_only=True)
                    
                elif current_pnl <= STOP_LOSS:
                    print("") 
                    log(f"🛑 Stop Loss (${current_pnl:.2f}). Closing...")
                    close_side = "Sell" if current_size > 0 else "Buy"
                    place_market_order(close_side, abs(current_size), reduce_only=True)
                
            time.sleep(3)

        except KeyboardInterrupt:
            print("\nBot stopped by user.")
            break
        except Exception as e:
            log(f"Loop Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    run_strategy()