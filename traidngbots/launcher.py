import os
import sys
import subprocess
import time

def install_requirements():
    print("Checking dependencies...")
    try:
        import rich
        import py_clob_client
        import ccxt
        import gate_api
        import dotenv
        import pandas
        import matplotlib
    except ImportError:
        print("Installing missing requirements...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
            print("Dependencies installed.")
        except Exception as e:
            print(f"Error installing dependencies: {e}")
            print("Try running: pip install -r requirements.txt")

def main():
    # Ensure .env exists
    if not os.path.exists(".env"):
        print("⚠️  .env file not found!")
        print("Creating .env template...")
        with open(".env", "w") as f:
            f.write("PRIVATE_KEY=\nPOLYMARKET_PROXY=0x1e7955f5402c8eb5f2aa7879b36bc8789d8f2091\nGATE_KEY=\nGATE_SECRET=\n")
        print("✅ Created .env file. Please open it and fill in your API keys.")
        input("Press Enter to exit and configure your keys...")
        return

    print("\n--- 🤖 TRADING BOT LAUNCHER ---")
    print("1. Polymarket Arbitrage Bot (arbtbot15min.py)")
    print("2. Gate.io Futures Bot (gatebot.py)")
    print("3. Gate.io Volume Farm (volumefarm_gatebot.py)")
    print("4. Gate.io Key Test (key_test.py)")
    print("5. Backtest Visualization (back_test.py)")
    print("6. Polymarket MM (main.py) [Requires poly_data folder]")
    
    choice = input("\nSelect a bot to run (1-6): ")
    
    scripts = {
        "1": "arbtbot15min.py",
        "2": "gatebot.py",
        "3": "volumefarm_gatebot.py",
        "4": "key_test.py",
        "5": "back_test.py",
        "6": "main.py"
    }
    
    if choice in scripts:
        script = scripts[choice]
        if os.path.exists(script):
            print(f"\n🚀 Launching {script}...\n")
            subprocess.run([sys.executable, script])
        else:
            print(f"\n❌ Error: {script} not found in current directory.")
    else:
        print("\n❌ Invalid selection.")

if __name__ == "__main__":
    if os.path.exists("requirements.txt"):
        install_requirements()
    main()