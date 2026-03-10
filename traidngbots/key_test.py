import os
import gate_api
from dotenv import load_dotenv

# Load keys
load_dotenv()
KEY = os.getenv("GATE_KEY")
SECRET = os.getenv("GATE_SECRET")

# ---------------------------------------------------------
# DIAGNOSTIC TOOL
# ---------------------------------------------------------
print("\n--- KEY DIAGNOSTIC TOOL ---")

# 1. CHECK IF KEYS EXIST
if not KEY or not SECRET:
    print("❌ CRITICAL: .env file not found or keys missing!")
    print("   Make sure you have a file named '.env' with GATE_KEY and GATE_SECRET.")
    exit()
else:
    print(f"✅ Keys Loaded. Key starts with: {KEY[:5]}...")

# 2. CONFIGURATION (TESTNET)
print("\n[TEST 1] Connecting to SPOT Testnet...")
spot_config = gate_api.Configuration(
    host = "https://api-testnet.gateapi.io/api/v4",
    key = KEY,
    secret = SECRET
)
spot_api = gate_api.SpotApi(gate_api.ApiClient(spot_config))

try:
    accounts = spot_api.list_spot_accounts(currency="USDT")
    print("✅ SPOT Connection: SUCCESS")
    print(f"   Spot Balance: {accounts[0].available if accounts else 0} USDT")
except Exception as e:
    print("❌ SPOT Connection: FAILED")
    print(f"   Reason: {e}")

# 3. CONFIGURATION (FUTURES)
print("\n[TEST 2] Connecting to FUTURES Testnet...")
futures_config = gate_api.Configuration(
    host = "https://fx-api-testnet.gateio.ws/api/v4",
    key = KEY,
    secret = SECRET
)
futures_api = gate_api.FuturesApi(gate_api.ApiClient(futures_config))

try:
    # Attempt to check Futures Balance
    accounts = futures_api.list_futures_accounts(settle="usdt")
    print("✅ FUTURES Connection: SUCCESS")
    print(f"   Futures Balance: {accounts[0].available if accounts else 0} USDT")
except Exception as e:
    print("❌ FUTURES Connection: FAILED")
    print(f"   Reason: {e}")

print("\n---------------------------------------------------------")
print("DIAGNOSIS:")