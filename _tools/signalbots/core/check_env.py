import os
import sys
from pathlib import Path
from dotenv import load_dotenv
try:
    import MetaTrader5 as mt5
except ImportError:
    print("❌ [ERROR] Python module 'MetaTrader5' not found.")
    print("   👉 Please run: pip install -r requirements.txt")
    sys.exit(1)

def check():
    # 1. Load .env
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        print(f"❌ [ERROR] .env file not found at {env_path}")
        print("   Copy .env.example to .env and fill in your credentials.")
        return False

    load_dotenv(env_path)

    # 2. Key Validation
    token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
    is_valid_token = token and "YOUR_" not in token

    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    is_valid_webhook = webhook and "YOUR_" not in webhook

    if not is_valid_token and not is_valid_webhook:
        print("❌ [ERROR] You must configure either DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL.")
        return False
        
    if not is_valid_token:
        print("⚠️ [WARNING] No Bot Token — running in Webhook-Only mode.")
        
    if not is_valid_webhook:
         print("⚠️ [WARNING] No Webhook URL — you won't receive trade alerts if bot fails.")

    login_env = os.environ.get("MT5_LOGIN_ID", "").strip()
    if not login_env or not login_env.isdigit():
        print("❌ [ERROR] MT5_LOGIN_ID is missing or not a number.")
        return False

    # 3. MT5 Connection Test
    print("🔍 Testing MT5 connection...")
    if not mt5.initialize():
        print(f"❌ [ERROR] MT5 initialize failed. Error: {mt5.last_error()}")
        print("   Make sure MetaTrader 5 is installed and running.")
        return False
    
    # Optional: Login check
    login = int(login_env)
    password = os.environ.get("MT5_PASSWORD", "")
    server = os.environ.get("MT5_SERVER", "")
    
    if login and password and server:
        if not mt5.login(login, password, server):
             print(f"❌ [ERROR] MT5 login failed: {mt5.last_error()}")
             print(f"   Check credentials: ID={login} Server='{server}'")
             mt5.shutdown()
             return False
        else:
             print(f"✅ MT5 Connected: {login} @ {server}")
        
    # 4. ZMQ Port Check (Removed)
    # Architecture Unified -> No more ZMQ ports involved.
    
    mt5.shutdown()
    print("✅ Configuration check passed.")
    return True

if __name__ == "__main__":
    if not check():
        sys.exit(1)
