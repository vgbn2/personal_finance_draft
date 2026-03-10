import ccxt
import time
import sys
import os
from dotenv import load_dotenv

# --- 1. LOAD KEYS ---
load_dotenv(override=True)
API_KEY = os.getenv("GATE_KEY")
API_SECRET = os.getenv("GATE_SECRET")

# Debug print to verify keys are loaded (prints first 4 chars only)
if not API_KEY or not API_SECRET:
    print("[!] ERROR: Keys NOT found in .env file.")
    sys.exit(1)
print(f"[*] Loaded Testnet Key: {API_KEY[:4]}...")

# --- CONFIGURATION ---
SYMBOL = 'BTC/USDT'      # Gate.io Testnet usually has liquidity on BTC/USDT
AMOUNT = 0.001           # Adjusted for BTC size (approx $60-90 USD value)
SPREAD = 0.001           # 0.1% Spread
CHECK_INTERVAL = 15      

def initialize_exchange():
    """Connects to Gate.io TESTNET with Time Sync"""
    exchange = ccxt.gateio({
        'apiKey': API_KEY,
        'secret': API_SECRET,
        'enableRateLimit': True,
        'options': {
            'adjustForTimeDifference': True,  # Fixes REQUEST_EXPIRED
            'recvWindow': 10000,
        }
    })
    
    # !!! THIS IS THE FIX FOR "INVALID KEY" !!!
    # Switches the bot to use https://api-testnet.gateapi.io
    exchange.set_sandbox_mode(True) 
    
    return exchange

def cancel_all_orders(exchange):
    try:
        exchange.cancel_all_orders(SYMBOL)
        print("[-] Old orders cancelled.")
    except Exception as e:
        print(f"[!] Info: Could not cancel orders ({e})")

def run_bot():
    exchange = initialize_exchange()
    
    try:
        print("[*] Connecting to Gate.io TESTNET...")
        exchange.load_markets() 
        balance = exchange.fetch_balance()
        
        # Testnet usually gives 'USDT', but sometimes strictly 'BTC' or 'ETH'
        # We print the whole 'total' dictionary to see what you have
        print(f"[+] Connected! Balances: {balance['total']}")
        
    except ccxt.AuthenticationError:
        print("\n[!] CRITICAL ERROR: INVALID_KEY")
        print("    1. Ensure you created the key on the TESTNET site (gate.io/testnet).")
        print("    2. Check for hidden spaces in your .env file.")
        sys.exit(1)
    except Exception as e:
        print(f"[!] CONNECTION ERROR: {e}")
        sys.exit(1)

    print(f"[*] Starting Volume Bot on {SYMBOL} (TESTNET)...")
    
    while True:
        try:
            cancel_all_orders(exchange)
            
            ticker = exchange.fetch_ticker(SYMBOL)
            mid_price = (ticker['bid'] + ticker['ask']) / 2
            
            my_buy = mid_price * (1 - SPREAD)
            my_sell = mid_price * (1 + SPREAD)
            
            print(f"\n[?] Testnet Market: {mid_price:.2f}")
            
            # Place Orders
            print(f"    -> BUY  {AMOUNT} @ {my_buy:.2f}")
            exchange.create_limit_buy_order(SYMBOL, AMOUNT, my_buy)
            
            print(f"    -> SELL {AMOUNT} @ {my_sell:.2f}")
            exchange.create_limit_sell_order(SYMBOL, AMOUNT, my_sell)
            
            print(f"[*] Waiting {CHECK_INTERVAL}s...")
            time.sleep(CHECK_INTERVAL)

        except KeyboardInterrupt:
            sys.exit()
        except Exception as e:
            print(f"[!] Loop Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    run_bot()