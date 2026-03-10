import time
import gate_api
from gate_api.exceptions import GateApiException
from datetime import datetime
import os
from dotenv import load_dotenv

# ==========================================
# 1. SETUP
# ==========================================

load_dotenv()

API_KEY = os.getenv("GATE_KEY")
API_SECRET = os.getenv("GATE_SECRET")

# --- CONFIGURATION ---
CONTRACT_SYMBOL = "BTC_USDT" 
TRADE_SIZE = 10              # 10 Contracts
IS_TESTNET = True            

# !!! IMPORTANT: ARE YOU USING GATE.COM OR GATE.IO? !!!
# Set this to True if your URL bar says "gate.com"
USE_GATE_COM = True         

# Determine the correct URL based on your region
if USE_GATE_COM:
    # Gate.com Testnet URL
    HOST_URL = "https://fx-api-testnet.gate.com/api/v4"
else:
    # Standard Gate.io Testnet URL (Most users)
    HOST_URL = "https://fx-api-testnet.gateio.ws/api/v4"

# Configure API
configuration = gate_api.Configuration(
    host = HOST_URL,
    key = API_KEY,
    secret = API_SECRET
)
api_client = gate_api.ApiClient(configuration)
futures_api = gate_api.FuturesApi(api_client)

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================

def check_account():
    """Verifies Futures Wallet Balance"""
    if not API_KEY or not API_SECRET:
        log("❌ CRITICAL: API Keys not found. Check your .env file.")
        return None

    try:
        # Check Futures Wallet (USDT Settled)
        account = futures_api.list_futures_accounts(settle="usdt")
        
        if account:
            available = float(account[0].available)
            log(f"Connected to: {HOST_URL}")
            log(f"Futures Balance: ${available:.2f} USDT")
            return available
        else:
            log("Futures Wallet is empty or inactive.")
            return 0.0

    except GateApiException as ex:
        log(f"Gate API Exception: {ex.label} - {ex.message}")
        error_str = str(ex).lower()

        if "invalid_key" in error_str or "authentication" in error_str:
             print("\n!!! AUTHENTICATION ERROR !!!")
             print(f"The key was rejected by {HOST_URL}")
             if USE_GATE_COM:
                 print("Try setting 'USE_GATE_COM = False' in the script.")
             else:
                 print("Try setting 'USE_GATE_COM = True' in the script.")
        elif "permission_denied" in error_str or "forbidden" in error_str:
             print("\n!!! PERMISSION ERROR !!!")
             print("Your API Key is valid but lacks 'Perpetual Futures' permissions.")
             print("1. Go to API Management on Gate.io Testnet")
             print("2. Edit your key permissions")
             print("3. Ensure 'Perpetual Futures' is set to 'Read + Write'")
             print("   (Note: 'Spot' permissions are NOT enough!)")
        return None
    except Exception as e:
        log(f"Unexpected Error: {e}")
        return None

def place_market_order(size, reduce_only=False):
    """Places a Market Order"""
    try:
        order = gate_api.FuturesOrder(
            contract=CONTRACT_SYMBOL,
            size=size,      
            price="0",      
            tif="ioc",      
            reduce_only=reduce_only
        )
        result = futures_api.create_futures_order(settle="usdt", futures_order=order)
        log(f"ORDER PLACED | Size: {size} | ID: {result.id}")
        return result
    except GateApiException as ex:
        log(f"Order Failed: {ex.message}")
        return None

def get_position():
    """Checks current position PnL"""
    try:
        position = futures_api.get_position(settle="usdt", contract=CONTRACT_SYMBOL)
        size = int(position.size)
        entry = float(position.entry_price)
        pnl = float(position.unrealised_pnl) if position.unrealised_pnl else 0.0
        
        if size != 0:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] POSITION: {size} Contracts | Entry: ${entry:.1f} | PnL: ${pnl:.4f}   ", end="\r")
        return size, pnl
    except GateApiException as ex:
        return 0, 0.0

# ==========================================
# 3. MAIN LOOP
# ==========================================

def run_strategy():
    print("\n--- STARTING BOT ---")
    
    # 1. Verify Balance
    balance = check_account()
    if balance is None: 
        print("Bot stopping due to Auth Error.")
        return

    # 2. Strategy Loop
    TAKE_PROFIT = 0.5
    STOP_LOSS = -0.5

    while True:
        try:
            current_size, current_pnl = get_position()

            if current_size == 0:
                print("") 
                log("No position. Opening LONG trade...")
                place_market_order(TRADE_SIZE)
            
            else:
                if current_pnl >= TAKE_PROFIT:
                    print("") 
                    log(f"💰 Take Profit (${current_pnl:.2f}). Closing...")
                    place_market_order(-current_size, reduce_only=True)
                elif current_pnl <= STOP_LOSS:
                    print("") 
                    log(f"🛑 Stop Loss (${current_pnl:.2f}). Closing...")
                    place_market_order(-current_size, reduce_only=True)
                
            time.sleep(3)

        except KeyboardInterrupt:
            print("\nBot stopped by user.")
            break
        except Exception as e:
            log(f"Loop Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    run_strategy()