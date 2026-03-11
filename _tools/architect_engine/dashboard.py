import json
import os
import subprocess
import pandas as pd
import streamlit as st
import plotly.express as px
from datetime import datetime
from pathlib import Path

# Paths
DATA_FILE = Path(__file__).parent / "data" / "all_conversations.json"
EXTRACTOR_SCRIPT = Path(__file__).parent / "extract_prompts.py"

st.set_page_config(
    page_title="Prompt Analytics",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .metric-card {
        background-color: #1E1E1E;
        padding: 20px;
        border-radius: 10px;
        border: 1px solid #333;
        text-align: center;
    }
    .metric-value {
        font-size: 32px;
        font-weight: bold;
        color: #00FF88;
    }
    .metric-label {
        font-size: 14px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .task-done { color: #00FF88; }
    .task-todo { color: #FFD700; }
    .task-in-progress { color: #00BFFF; }
</style>
""", unsafe_allow_html=True)


# ─── Data Loading ───────────────────────────────────────────────────────────
@st.cache_data(ttl=60) # Cache for 60 seconds
def load_data():
    if not DATA_FILE.exists():
        return None
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


data = load_data()

# ─── Sidebar & Actions ──────────────────────────────────────────────────────
with st.sidebar:
    st.title("🧠 Prompt Analytics")
    st.markdown("Analyze your Antigravity conversation patterns, task completion, and engineering velocity.")
    
    st.divider()
    
    if st.button("🔄 Extract New Prompts", use_container_width=True, type="primary"):
        with st.spinner("Extracting conversations from brain directory..."):
            try:
                result = subprocess.run(
                    ["python", str(EXTRACTOR_SCRIPT)],
                    capture_output=True,
                    text=True,
                    check=True
                )
                st.success("Extraction complete!")
                st.cache_data.clear() # Clear cache to force reload
                st.rerun()
            except subprocess.CalledProcessError as e:
                st.error(f"Extraction failed: {e.stderr}")
                
    st.divider()
    
    if data:
        st.caption(f"Last updated: {data.get('extracted_at', 'Unknown').split('.')[0]}")


if not data:
    st.warning("No conversation data found. Please run the extractor.")
    st.stop()


# ─── Process Data for Visualization ─────────────────────────────────────────
stats = data.get("stats", {})
conversations = data.get("conversations", [])

# Create DataFrame for timelines
df_convs = []
for c in conversations:
    # Safely parse date
    date_str = c.get("created")
    if date_str and date_str != "unknown":
        try:
            # Handle possible varied date formats
            if len(date_str) == 10: # YYYY-MM-DD
                dt = datetime.strptime(date_str, "%Y-%m-%d")
            else: # YYYY-MM-DD HH:MM
                dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        except ValueError:
            dt = None
            
        if dt:
            df_convs.append({
                "id": c["id"],
                "date": dt.date(),
                "goal": c.get("plan", {}).get("goal", "Unknown Goal") if c.get("plan") else "No Goal",
                "tasks": len(c.get("tasks", [])),
                "artifacts": len(c.get("artifacts", []))
            })

df = pd.DataFrame(df_convs)


# ─── 1. Top-Level Metrics ───────────────────────────────────────────────────
st.header("Velocity Overview")
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.markdown(f"""
        <div class="metric-card">
            <div class="metric-value">{stats.get('total_conversations', 0)}</div>
            <div class="metric-label">Conversations</div>
        </div>
    """, unsafe_allow_html=True)
    
with col2:
    st.markdown(f"""
        <div class="metric-card">
            <div class="metric-value">{stats.get('total_task_items', 0)}</div>
            <div class="metric-label">Total Task Items</div>
        </div>
    """, unsafe_allow_html=True)

with col3:
    st.markdown(f"""
        <div class="metric-card">
            <div class="metric-value" style="color: #00BFFF;">{stats.get('total_artifacts', 0)}</div>
            <div class="metric-label">Artifacts Generated</div>
        </div>
    """, unsafe_allow_html=True)

with col4:
    rate_color = "#00FF88" if float(stats.get('completion_rate', '0').strip('%')) > 80 else "#FFD700"
    st.markdown(f"""
        <div class="metric-card">
            <div class="metric-value" style="color: {rate_color};">{stats.get('completion_rate', '0%')}</div>
            <div class="metric-label">Task Completion Rate</div>
        </div>
    """, unsafe_allow_html=True)

st.write("") # spacer

# ─── 2. Interactive Timeline ────────────────────────────────────────────────
if not df.empty:
    st.subheader("Engineering Output Over Time")
    
    # Aggregate by date
    df_daily = df.groupby("date").agg({
        "id": "count",
        "tasks": "sum",
        "artifacts": "sum"
    }).reset_index()
    df_daily.rename(columns={"id": "Conversations"}, inplace=True)
    
    # Plotly Bar Chart
    fig = px.bar(
        df_daily, 
        x="date", 
        y=["tasks", "artifacts", "Conversations"],
        title="Tasks, Artifacts, and Conversations per Day",
        barmode="group",
        color_discrete_sequence=["#00BFFF", "#00FF88", "#FFD700"]
    )
    fig.update_layout(
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        legend_title="Metric",
        xaxis_title="Date",
        yaxis_title="Count"
    )
    st.plotly_chart(fig, use_container_width=True)


st.divider()

# ─── 3. Full-Text Search & Filtering ────────────────────────────────────────
st.header("Search Conversations")

search_col1, search_col2 = st.columns([3, 1])
with search_col1:
    search_query = st.text_input("Search goals, tasks, or summaries...", placeholder="e.g., 'dashboard', 'python', 'fix'")
with search_col2:
    sort_order = st.selectbox("Sort By", ["Newest First", "Oldest First", "Most Tasks", "Most Artifacts"])


# Filter logic
filtered_convs = []
for c in conversations:
    # Build a giant string of text to search against
    searchable_text = ""
    
    if c.get("plan"):
        searchable_text += c["plan"].get("goal", "") + " "
        searchable_text += " ".join(c["plan"].get("sections", [])) + " "
        
    for task in c.get("tasks", []):
        searchable_text += task.get("text", "") + " "
        
    searchable_text += c.get("walkthrough_summary", "") + " "
    
    if search_query.lower() in searchable_text.lower():
        filtered_convs.append(c)


# Sort logic
if sort_order == "Newest First":
    filtered_convs.sort(key=lambda x: x.get("created", ""), reverse=True)
elif sort_order == "Oldest First":
    filtered_convs.sort(key=lambda x: x.get("created", ""))
elif sort_order == "Most Tasks":
    filtered_convs.sort(key=lambda x: len(x.get("tasks", [])), reverse=True)
elif sort_order == "Most Artifacts":
    filtered_convs.sort(key=lambda x: len(x.get("artifacts", [])), reverse=True)


st.caption(f"Found {len(filtered_convs)} matching conversations")

# ─── 4. Conversation Inspector ──────────────────────────────────────────────
for i, c in enumerate(filtered_convs):
    # Goal acts as title, fallback to ID
    goal = c.get("plan", {}).get("goal") if c.get("plan") else None
    title = f"{c.get('created', 'Unknown Date')} | {goal if goal else c['id'][:8]}"
    
    task_count = len(c.get("tasks", []))
    done_count = sum(1 for t in c.get("tasks", []) if t["status"] == "done")
    
    with st.expander(f"📁 {title} ({done_count}/{task_count} tasks)"):
        
        tab1, tab2, tab3 = st.tabs(["📋 Tasks", "🎯 Plan", "📦 Artifacts"])
        
        with tab1:
            if not c.get("tasks"):
                st.info("No tasks recorded for this session.")
            else:
                for task in c["tasks"]:
                    icon = "✅" if task["status"] == "done" else "⏳" if task["status"] == "in_progress" else "❌" if task["status"] == "blocked" else "🔳"
                    color_cls = "task-done" if task["status"] == "done" else "task-in-progress" if task["status"] == "in_progress" else "task-todo"
                    
                    st.markdown(f"<span class='{color_cls}'>{icon} {task['text']}</span>", unsafe_allow_html=True)
        
        with tab2:
            if c.get("plan"):
                st.markdown(f"**Goal**: {c['plan'].get('goal', 'N/A')}")
                st.markdown("**Sections**:")
                for sec in c['plan'].get("sections", []):
                    st.markdown(f"- {sec}")
            else:
                st.info("No implementation plan found.")
                
            if c.get("walkthrough_summary"):
                st.divider()
                st.markdown("**Walkthrough Summary**:")
                st.write(c["walkthrough_summary"])
        
        with tab3:
            if not c.get("artifacts"):
                st.info("No artifacts recorded.")
            else:
                for art in c["artifacts"]:
                    st.markdown(f"**{art['name']}** ({art['type']})")
                    st.caption(f"{art.get('summary', 'No summary')}")
                    st.write("")
