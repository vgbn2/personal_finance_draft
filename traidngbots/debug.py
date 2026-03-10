import os
from dotenv import load_dotenv

load_dotenv(override=True) # Forces reload of .env file

key = os.getenv("GATE_KEY")
if key:
    print(f"Loaded Key: {key[:5]}... (Check if this matches your NEW Testnet key)")
else:
    print("No key found!")