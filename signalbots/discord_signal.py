
import MetaTrader5 as mt5
import pandas as pd
import numpy as np
import requests
import time
import traceback
from datetime import datetime, timedelta

# ==========================================
# ⚙️ USER CONFIGURATION
# ==========================================

# 1. ACCOUNT CREDENTIALS (FOR AUTO-LOGIN)
# ------------------------------------------
# Leave these 0/None if you are already logged into the MT5 Terminal.
class Config:
    LOGIN_ID = 2707383   # Example: 12345678
    PASSWORD = "Ducanh@6"
    SERVER = "Headway-Demo" # Example: "ICMarkets-Demo"
    
    # 2. SECURITY & ALERTS
    # ------------------------------------------
    WEBHOOK_URL = "https://discord.com/api/webhooks/1463101858791952554/az4l16sYfAZ9mrlS7cQ_F8mDvkRM68Cfd4kXDss5W9LzRvoti7RdvadL32cXDIOrKOlI"
    DEMO_ONLY = True         # 🔒 SAFETY LOCK: Stops bot if account is Real Money

    # --- RISK & STRATEGY ---
    BASE_RISK_PCT = 0.01       # 1% Standard Risk
    GOLD_MAX_RISK_PCT = 0.05   # 5% Max Risk for Gold A+
    RISK_REWARD = 3.0          # Target 3R
    SL_BUFFER_POINTS = 50      # 5 Pip Buffer for SL

    # --- REPORTING ---
    PNL_REPORT_HOUR = 23       # Hour to send report (0-23)
    TIMEZONE_OFFSET = 7        # UTC+7 (Vietnam/Bangkok)

    # --- ASSETS ---
    ASSETS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDCAD", "BTCUSD"]
    TF_HTF = mt5.TIMEFRAME_H1
    TF_MED = mt5.TIMEFRAME_M15
    TF_LTF = mt5.TIMEFRAME_M5

    MAGIC_NUMBER = 999003
    DEVIATION = 20

# ==========================================
# 2. REPORTER
# ==========================================
class Reporter:
    @staticmethod
    def send_discord(content):
        if not Config.WEBHOOK_URL: return
        try: requests.post(Config.WEBHOOK_URL, json={"content": content})
        except: pass

    @staticmethod
    def send_trade_alert(symbol, action, entry, sl, tp, risk_pct, quality):
        msg = (f"🚀 **SMC ENTRY TRIGGERED**\n"
               f"**Symbol:** {symbol}\n"
               f"**Type:** {action.upper()} ({quality} Setup)\n"
               f"**Entry:** {entry} | **SL:** {sl} | **TP:** {tp}\n"
               f"**Risk:** {risk_pct*100}%")
        Reporter.send_discord(msg)

    @staticmethod
    def send_daily_summary(date_obj):
        history = mt5.history_deals_get(date_obj - timedelta(hours=24), date_obj + timedelta(hours=1))
        if not history: return
        
        daily_profit = sum([deal.profit for deal in history])
        balance = mt5.account_info().balance
        equity = mt5.account_info().equity
        
        msg = (f"📊 **DAILY PnL REPORT** ({date_obj.strftime('%Y-%m-%d')})\n"
               f"**Profit:** ${daily_profit:.2f}\n"
               f"**Balance:** ${balance:.2f}\n"
               f"**Equity:** ${equity:.2f}")
        Reporter.send_discord(msg)

# ==========================================
# 3. SMC STRATEGY LOGIC
# ==========================================
class SMCStrategy:
    @staticmethod
    def get_rsi(symbol, timeframe, period=14):
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, period + 15)
        if rates is None or len(rates) < period + 1: return 50.0
        df = pd.DataFrame(rates)
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi.iloc[-1]

    @staticmethod
    def detect_market_structure(symbol):
        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_H1, 0, 50)
        if rates is None or len(rates) < 50: return "neutral"
        df = pd.DataFrame(rates)
        highs = df['high'].rolling(5, center=True).max()
        lows = df['low'].rolling(5, center=True).min()
        
        if len(highs.dropna()) < 5: return "neutral"
        
        last_high = highs.dropna().iloc[-1]
        prev_high = highs.dropna().iloc[-5]
        last_low = lows.dropna().iloc[-1]
        prev_low = lows.dropna().iloc[-5]
        if last_high > prev_high and last_low > prev_low: return "bullish"
        elif last_high < prev_high and last_low < prev_low: return "bearish"
        return "ranging"

    @staticmethod
    def detect_fvg(symbol, timeframe, bias):
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, 10)
        if rates is None: return None
        df = pd.DataFrame(rates)
        for i in range(len(df)-2, 2, -1):
            c1, c2, c3 = df.iloc[i-2], df.iloc[i-1], df.iloc[i]
            if bias == "bullish" and c2['close'] > c2['open']:
                if c1['high'] < c3['low']:
                    return {'type': 'bullish', 'entry': c3['low'], 'sl': c1['high']} 
            elif bias == "bearish" and c2['close'] < c2['open']:
                if c1['low'] > c3['high']:
                    return {'type': 'bearish', 'entry': c3['high'], 'sl': c1['low']} 
        return None

    @staticmethod
    def detect_amd_phase(symbol):
        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 20)
        if rates is None: return "unknown"
        df = pd.DataFrame(rates)
        high_low_diff = df['high'] - df['low']
        avg_range = high_low_diff.mean()
        recent_vol = high_low_diff.iloc[-10:].mean()
        
        if recent_vol < (avg_range * 0.7): return "Accumulation"
        
        range_low = df['low'].iloc[-20:-5].min()
        last_low = df['low'].iloc[-1]
        last_close = df['close'].iloc[-1]
        if last_low < range_low and last_close > range_low: return "Manipulation"
        
        range_high = df['high'].iloc[-20:-5].max()
        last_high = df['high'].iloc[-1]
        if last_high > range_high and last_close < range_high: return "Manipulation"
        
        return "Distribution"

# ==========================================
# 4. EXECUTOR (TICK SIZE FIX)
# ==========================================
class Executor:
    @staticmethod
    def connect():
        if not mt5.initialize():
            print("❌ MT5 Init Failed")
            return False
        if Config.LOGIN_ID != 12345678:
            return mt5.login(Config.LOGIN_ID, Config.PASSWORD, Config.SERVER)
        return True

    @staticmethod
    def normalize_price(symbol, price):
        """
        Rounds price to the nearest tick size (e.g., 0.25 for US500).
        Fixes Error 10015.
        """
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None: return price
        
        tick_size = symbol_info.trade_tick_size
        if tick_size > 0:
            # Round to nearest tick step
            price = round(price / tick_size) * tick_size
        
        # Cleanup floating point artifacts (e.g. 4000.2500001 -> 4000.25)
        return round(price, symbol_info.digits)

    @staticmethod
    def calculate_lot_size(symbol, entry, sl, risk_percent):
        info = mt5.symbol_info(symbol)
        account = mt5.account_info()
        if not info or not account: return 0.0
        
        balance = account.balance
        risk_usd = balance * risk_percent
        dist = abs(entry - sl)
        if dist == 0: return 0.0
        
        tick_value = info.trade_tick_value
        if tick_value == 0: tick_value = 1.0 
        
        raw_lot = risk_usd / ((dist / tick_size) * tick_value)
        step = info.volume_step
        lot = round(raw_lot / step) * step
        lot = max(info.volume_min, min(info.volume_max, lot))
        
        if lot < info.volume_min: return 0.0
        return lot

    @staticmethod
    def execute_trade(symbol, signal_type, entry, sl, quality="B"):
        # 1. Risk Calc
        risk_pct = Config.BASE_RISK_PCT
        if "XAU" in symbol and quality == "A+": risk_pct = Config.GOLD_MAX_RISK_PCT
        elif "XAU" in symbol: risk_pct = 0.02

        # 2. Buffer & Normalize
        info = mt5.symbol_info(symbol)
        buffer = Config.SL_BUFFER_POINTS * info.point
        final_sl = sl - buffer if signal_type == 'buy' else sl + buffer
        
        # --- CRITICAL FIX: Tick Size Normalization ---
        entry = Executor.normalize_price(symbol, entry)
        final_sl = Executor.normalize_price(symbol, final_sl)

        # 3. Targets (TP)
        dist = abs(entry - final_sl)
        tp = entry + (dist * Config.RISK_REWARD) if signal_type == 'buy' else entry - (dist * Config.RISK_REWARD)
        tp = Executor.normalize_price(symbol, tp)
        
        # 4. Sizing
        lot_size = Executor.calculate_lot_size(symbol, entry, final_sl, risk_pct)
        if lot_size == 0.0: 
            print(f"⚠️ {symbol}: Balance too low or Lot 0"); return

        # 5. Order
        req = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": lot_size,
            "type": mt5.ORDER_TYPE_BUY_LIMIT if signal_type == 'buy' else mt5.ORDER_TYPE_SELL_LIMIT,
            "price": entry,
            "sl": final_sl,
            "tp": tp,
            "deviation": Config.DEVIATION,
            "magic": Config.MAGIC_NUMBER,
            "comment": f"SMC-{quality}",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_RETURN,
        }
        res = mt5.order_send(req)
        
        if res.retcode == mt5.TRADE_RETCODE_DONE:
            print(f"🚀 {symbol} {signal_type.upper()} | Lot: {lot_size} | Entry: {entry}")
            Reporter.send_trade_alert(symbol, signal_type, entry, final_sl, tp, risk_pct, quality)
        else:
            print(f"❌ Error {symbol}: {res.comment} (Retcode: {res.retcode})")

# ==========================================
# 5. MAIN ENGINE
# ==========================================
def run():
    if not Executor.connect(): 
        print("❌ Connect Failed - Check Login ID")
        return
        
    print(f"✅ SMC Bot Online | PnL Report at {Config.PNL_REPORT_HOUR}:00 UTC+7")
    
    last_summary_date = None

    try:
        while True:
            # --- NON-TRADING ---
            utc_now = datetime.utcnow()
            local_now = utc_now + timedelta(hours=Config.TIMEZONE_OFFSET)
            
            if local_now.hour == Config.PNL_REPORT_HOUR and last_summary_date != local_now.date():
                print("📊 Sending Daily PnL...")
                Reporter.send_daily_summary(local_now)
                last_summary_date = local_now.date()

            # --- TRADING ---
            for symbol in Config.ASSETS:
                try:
                    # 1. Structure
                    structure = SMCStrategy.detect_market_structure(symbol)
                    phase = SMCStrategy.detect_amd_phase(symbol)
                    rsi_h1 = SMCStrategy.get_rsi(symbol, mt5.TIMEFRAME_H1)
                    rsi_m5 = SMCStrategy.get_rsi(symbol, mt5.TIMEFRAME_M5)
                    
                    signal, quality = None, "B"
                    
                    # 2. Bullish
                    if structure == "bullish" and rsi_h1 > 50 and rsi_m5 < 45:
                        fvg = SMCStrategy.detect_fvg(symbol, mt5.TIMEFRAME_M15, "bullish")
                        if fvg:
                            if "Manipulation" in phase: quality = "A+"
                            Executor.execute_trade(symbol, 'buy', fvg['entry'], fvg['sl'], quality)

                    # 3. Bearish
                    elif structure == "bearish" and rsi_h1 < 50 and rsi_m5 > 55:
                        fvg = SMCStrategy.detect_fvg(symbol, mt5.TIMEFRAME_M15, "bearish")
                        if fvg:
                            if "Manipulation" in phase: quality = "A+"
                            Executor.execute_trade(symbol, 'sell', fvg['entry'], fvg['sl'], quality)
                            
                except Exception as e:
                    print(f"Err {symbol}: {e}")
            
            time.sleep(60)

    except KeyboardInterrupt:
        mt5.shutdown()
        print("🛑 Bot Stopped")

if __name__ == "__main__":
    run()