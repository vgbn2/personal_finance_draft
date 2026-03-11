
import sqlite3
import pandas as pd

CONN_STR = "c:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/polymarket_sim/data/trades.db"

def inspect():
    try:
        conn = sqlite3.connect(CONN_STR)
        cursor = conn.cursor()
        
        # Get tables
        tables = ["trades", "fills", "sessions"]
        
        for tname in tables:
            print(f"\nTABLE: {tname}")
            print(f"COLUMNS for {tname}:")
            try:
                cursor.execute(f"PRAGMA table_info({tname})")
                rows = cursor.fetchall()
                if not rows:
                    print("  (No columns found!)")
                for row in rows:
                    # row is like (0, 'id', 'INTEGER', ...)
                    print(f"  {row[1]} type={row[2]}")
            except Exception as e:
                print(f"  Error: {e}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()
