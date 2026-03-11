import streamlit as st
import pandas as pd
import time
from datetime import datetime, timezone
import logging
from backend import Config, PolymarketAPI, ElonTracker, TweetAnalyzer
from scipy.stats import nbinom

# Set Page Configuration (Must be first)
st.set_page_config(
    page_title="Elon Tweet Tracker",
    page_icon="🐦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize Session State
if 'tracker' not in st.session_state:
    st.session_state.tracker = ElonTracker(headless=True)
    try:
        st.session_state.tracker.start()
    except Exception as e:
        st.error(f"Failed to start tracker: {e}")

if 'last_update' not in st.session_state:
    st.session_state.last_update = datetime.now()

if 'data' not in st.session_state:
    st.session_state.data = None

# Sidebar Configuration
with st.sidebar:
    st.header("⚙️ Configuration")
    Config.BANKROLL = st.number_input("Bankroll ($)", value=1000.0, step=100.0)
    Config.KELLY_FRACTION = st.slider("Kelly Fraction (Safety)", 0.1, 1.0, 0.25, 0.05)
    Config.DISPERSION_PARAM = st.slider("Dispersion (Alpha)", 0.0, 1.0, 0.1, 0.01)
    
    st.markdown("---")
    if st.button("🔄 Refresh Data"):
        with st.spinner("Scraping XTracker & Polymarket..."):
            st.session_state.tracker.update()
            st.session_state.data = st.session_state.tracker.get_data()
            st.session_state.last_update = datetime.now()
            st.success("Refreshed!")

# Main Dashboard logic
def main():
    st.title("🐦 Elon Tweet Tracker & Analyzer")
    
    # metrics
    tracker_data = st.session_state.data
    dynamic_base = TweetAnalyzer.calculate_dynamic_rate(tracker_data)
    mult, status = TweetAnalyzer.get_texas_status()
    live_rate = dynamic_base * mult
    
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Status", status)
    col2.metric("Base Rate (7d)", f"{dynamic_base:.1f}")
    col3.metric("Live Clock Rate", f"{live_rate:.1f}/day")
    col4.metric("Last Update", st.session_state.last_update.strftime("%H:%M:%S"))

    st.markdown("---")

    # Get data
    events = PolymarketAPI.get_active_elon_events()
    
    if not events:
        st.warning("No active Elon Tweet markets found.")
        return

    utc_now = datetime.now(timezone.utc)
    
    # Process each event
    for event in events:
        title = event['title']
        end_str = event['endDate'].replace('Z', '+00:00')
        end = datetime.fromisoformat(end_str)
        days_left = (end - utc_now).total_seconds()/86400

        if days_left <= 0: continue

        my_count = TweetAnalyzer.match_count(title, tracker_data) if tracker_data else None
        if my_count is None: my_count = Config.MANUAL_COUNT_FALLBACK
        
        impact = (live_rate - dynamic_base) * min(days_left, 0.2)
        proj = int(my_count + (dynamic_base * days_left) + impact)

        with st.expander(f"📅 {title} (Left: {days_left:.2f}d)", expanded=True):
            c1, c2, c3 = st.columns(3)
            c1.metric("Current Count", my_count)
            c2.metric("Projected", proj)
            c3.metric("End Date", end.strftime("%Y-%m-%d %H:%M"))

            # Table Data Calculation
            markets = event.get('markets', [])
            
            # Parsing markets (reused logic could be cleaner but keeping it simple)
            buckets = []
            for m in markets:
                try:
                    name = m.get('groupItemTitle', 'Unknown')
                    l, h = 0, 9999
                    if "-" in name:
                        p=name.split("-")
                        l, h = int(p[0]), int(p[1])
                    elif "<" in name:
                        h = int(name[1:]) - 1
                    elif "+" in name:
                        l = int(name[:-1])
                    elif " or more" in name:
                        l = int(name.split(" ")[0])
                        
                    prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                    price = float(prices[0]) * 100
                    buckets.append({'l':l, 'h':h, 'p':price, 'n':name})
                except: continue
            buckets.sort(key=lambda x: x['l'])

            # Build DataFrame
            rows = []
            for b in buckets:
                # Calculations
                if my_count > b['h']: 
                    prob = 0.0
                    prob_pois = 0.0
                else:
                    n_max = max(0, b['h'] - my_count)
                    n_min = max(0, b['l'] - my_count)
                    remaining_proj = max(0, proj - my_count)
                    
                    if remaining_proj == 0:
                        prob = 100.0 if (n_min == 0) else 0.0
                        prob_pois = prob
                    else:
                        prob = TweetAnalyzer.calculate_nbinom_prob(n_min, n_max, remaining_proj)
                        prob_pois = TweetAnalyzer.calculate_poisson_prob(n_min, n_max, remaining_proj)

                edge = prob - b['p']
                edge2 = prob_pois - b['p']
                kf, amt, _ = TweetAnalyzer.calculate_kelly(prob, b['p'])

                # Skip junk
                if b['p'] < 1.0 and prob < 1.0: continue

                rows.append({
                    "Bucket": b['n'],
                    "Price": f"{b['p']:.1f}¢",
                    "Prob %": f"{prob:.1f}%",
                    "Edge %": f"{edge:+.1f}%",
                    "Edge(2) %": f"{edge2:+.1f}%",
                    "Kelly": f"{kf*100:.1f}%",
                    "Size ($)": f"${amt:.0f}",
                    "Action": "BUY" if edge > 15 else ("SELL/NO" if edge < -15 else "WATCH")
                })
            
            if rows:
                df = pd.DataFrame(rows)
                # Highlight Signal
                st.dataframe(df, use_container_width=True, hide_index=True)

                # Distribution Visualization
                st.subheader("📊 Probability Distribution (Bell Curve)")
                
                # Calculate remaining projection for the curve
                remaining_proj = max(0, proj - my_count)
                
                if remaining_proj > 0:
                    # Generate X axis (spread around mean)
                    x_min = max(0, int(remaining_proj * 0.5))
                    x_max = int(remaining_proj * 1.5) + 20
                    x_vals = range(x_min, x_max)
                    
                    # Calculate PMF for both distributions
                    pois_probs = [TweetAnalyzer.calculate_poisson_prob(x, x, remaining_proj) for x in x_vals]
                    
                    # For NegBinom, we need the raw PMF not the range helper
                    # Re-implementing raw pmf logic here for visualization clarity
                    # Mu = remaining_proj, Alpha = Config.DISPERSION_PARAM
                    alpha = Config.DISPERSION_PARAM
                    var = remaining_proj + alpha * (remaining_proj ** 2)
                    p = remaining_proj / var
                    n = (remaining_proj ** 2) / (var - remaining_proj)
                    nb_probs = [nbinom.pmf(x, n, p) * 100 for x in x_vals]
                    
                    chart_data = pd.DataFrame({
                        "Tweets Needed": x_vals,
                        "Poisson (Standard) %": pois_probs,
                        "NegBinom (Burstiness) %": nb_probs
                    }).set_index("Tweets Needed")
                    
                    st.line_chart(chart_data)
                    st.caption(f"Visualizing probability of *additional* tweets needed. Current Count: {my_count}. Projected Additional: {int(remaining_proj)}.")

if __name__ == "__main__":
    main()
