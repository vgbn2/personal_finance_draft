import streamlit as st
import json
import time
import pandas as pd
import os
from datetime import datetime

st.set_page_config(
    page_title="Elon Tweet Dashboard",
    page_icon="🐦",
    layout="wide"
)

# Custom CSS for dark mode aesthetics
st.markdown("""
<style>
    .stMetric {
        background-color: #1E1E1E;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #333;
    }
    .stDataFrame {
        border-radius: 10px;
    }
    div[data-testid="stMetricValue"] {
        font-size: 28px;
        color: #00BFFF;
    }
</style>
""", unsafe_allow_html=True)

st.title("🐦 Elon Musk Tweet Markets Dashboard")
st.caption("Real-time analytics from Polymarket Tracker")

DATA_FILE = "dashboard_data.json"

def load_data():
    if not os.path.exists(DATA_FILE):
        return None
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return None

# Auto-refresh mechanism
if 'last_run' not in st.session_state:
    st.session_state.last_run = time.time()

    time.sleep(3) # Streamlit refresh loop

# --- PAPER TRADING LOGIC ---
PORTFOLIO_FILE = "paper_portfolio.json"

def load_portfolio():
    if not os.path.exists(PORTFOLIO_FILE):
        return reset_portfolio()
    try:
        with open(PORTFOLIO_FILE, "r") as f:
            return json.load(f)
    except:
        return reset_portfolio()

def save_portfolio(p):
    with open(PORTFOLIO_FILE, "w") as f:
        json.dump(p, f, indent=2)

def reset_portfolio():
    p = {"cash": 1000.0, "positions": [], "history": []}
    save_portfolio(p)
    return p

def buy_shares(market_title, bucket_name, price_cents, amount_usd):
    p = load_portfolio()
    if p["cash"] < amount_usd:
        st.toast("❌ Insufficient Funds!")
        return
    
    shares = (amount_usd / (price_cents / 100.0))
    p["cash"] -= amount_usd
    
    # Check if position exists
    found = False
    for pos in p["positions"]:
        if pos["market"] == market_title and pos["bucket"] == bucket_name:
            pos["shares"] += shares
            pos["cost_basis"] += amount_usd
            found = True
            break
    if not found:
        p["positions"].append({
            "market": market_title,
            "bucket": bucket_name,
            "shares": shares,
            "cost_basis": amount_usd
        })
    
    p["history"].append({
        "time": datetime.now().isoformat(),
        "action": "BUY",
        "market": market_title,
        "bucket": bucket_name,
        "shares": shares,
        "price": price_cents
    })
    
    save_portfolio(p)
    st.toast(f"✅ Bought {shares:.1f} shares of {bucket_name}!")
    st.rerun()

# --- SIDEBAR ---
portfolio = load_portfolio()
with st.sidebar:
    st.header("💼 Paper Wallet")
    st.metric("Cash Balance", f"${portfolio['cash']:.2f}")
    
    if st.button("🔄 Reset Wallet ($1,000)"):
        portfolio = reset_portfolio()
        st.rerun()
        
    st.divider()
    st.subheader("Open Positions")
    
    total_equity = portfolio['cash']
    
    # Calculate PnL if data is available
    tracker_data = load_data()
    
    if portfolio["positions"]:
        for pos in portfolio["positions"]:
            # Find current price
            current_price = 0.0
            if tracker_data and tracker_data.get('events'):
                for e in tracker_data['events']:
                    if e['title'] == pos['market']:
                        for b in e['buckets']:
                            if b['name'] == pos['bucket']:
                                current_price = b['price']
                                break
            
            val = pos['shares'] * (current_price / 100.0)
            total_equity += val
            pnl = val - pos['cost_basis']
            pnl_pct = (pnl / pos['cost_basis']) * 100 if pos['cost_basis'] > 0 else 0
            
            st.write(f"**{pos['bucket']}**")
            c1, c2 = st.columns(2)
            c1.caption(f"{pos['shares']:.1f} shares")
            c2.caption(f"${val:.2f} ({pnl_pct:+.1f}%)")
            st.divider()
            
    st.metric("Total Equity", f"${total_equity:.2f}", 
             delta=f"{total_equity - 1000:.2f}", delta_color="normal")

# --- MAIN LOOP UPDATE ---
placeholder = st.empty()
while True:
    data = load_data()
    
    with placeholder.container():
        if not data:
            st.warning("⚠️ Waiting for tracker data... run 'elonmusk_tweet.py'")
            time.sleep(2)
            continue
            
        # Top Metrics
        c1, c2, c3, c4 = st.columns(4)
        status_icon = "🟢" if data.get('tracker_active') else "🔴"
        with c1: st.metric("Tracker Status", f"{status_icon} {'Active' if data.get('tracker_active') else 'Manual'}")
        with c2: st.metric("Live Rate", f"{data.get('live_rate', 0):.1f} / day")
        with c3: st.metric("Base Rate", f"{data.get('base_rate', 0):.1f} / day")
        with c4: st.metric("Elon Status", data.get('status', 'Unknown'))
        
        st.divider()
        
        # Events
        if not data.get('events'):
            st.info("No active markets found.")
        
        for event in data.get('events', []):
            with st.expander(f"📅 {event['title']}", expanded=True):
                # Event High Level
                ec1, ec2, ec3 = st.columns(3)
                with ec1: st.metric("Current Count", event['count'])
                with ec2: st.metric("Projected Count", event['proj'])
                with ec3: st.metric("Days Left", f"{event['days_left']:.2f}d")
                
                # Market Table with BUY buttons
                buckets = event.get('buckets', [])
                if buckets:
                    # Create custom layout for trading
                    st.write("##### Trade Prediction Buckets")
                    
                    # Header
                    h1, h2, h3, h4, h5, h6 = st.columns([3, 1.5, 1.5, 1.5, 1.5, 1.5])
                    h1.write("**Bucket Name**")
                    h2.write("**Price**")
                    h3.write("**Prob**")
                    h4.write("**Edge**")
                    h5.write("**Signal**")
                    h6.write("**Action**")
                    
                    for b in buckets:
                        r1, r2, r3, r4, r5, r6 = st.columns([3, 1.5, 1.5, 1.5, 1.5, 1.5])
                        r1.write(f"{b['name']}")
                        r2.write(f"{b['price']:.1f}¢")
                        r3.write(f"{b['prob']:.1f}%")
                        
                        edge_color = "green" if b['edge'] > 0 else "red"
                        r4.markdown(f":{edge_color}[{b['edge']:+.1f}%]")
                        
                        r5.write(b['signal'])
                        
                        key_id = f"buy_{event['title']}_{b['name']}"
                        if r6.button("Buy $10", key=key_id):
                            buy_shares(event['title'], b['name'], b['price'], 10.0)
                            
                else:
                    st.write("No bucket data available.")
        
        st.caption(f"Last Updated: {data.get('timestamp')}")
        
    time.sleep(3)
