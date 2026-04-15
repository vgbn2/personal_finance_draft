---
phase: 10
plan: 1
wave: 1
---

# Plan 10.1: Sovereign Command Suite Refactor

<objective>
Decompose the monolithic Sovereign Wealth Console into a modular 3-Terminal Suite (Active, Historical, Research) to enable specialized workflows and interactive strategic allocation.

Purpose: High-fidelity operational and research clarity.
Output: 3 standalone CLI terminals and a shared allocator core.
</objective>

<context>
- .gsd/SPEC.md
- ui/hud.py
- main.py
- core/registry.py
</context>

<tasks>

<task type="auto">
  <name>Shared UI & Logic Modularization</name>
  <files>ui/components.py, core/allocator.py</files>
  <action>
    - Extract reusable widgets (Registry, Macro, Sentinel) from `ui/hud.py` into a modular `ui/components.py`.
    - Implement `core/allocator.py` to handle the hierarchical asset sections (Savings, Bonds, Stocks, Crypto) and DCA vs. Lump Sum math.
    - Setup the `strategy_config.json` loader for persistent strategy state.
  </action>
  <verify>python -c "import ui.components; import core.allocator" passes without error.</verify>
  <done>Core UI components and Allocation logic are decoupled from the main HUD.</done>
</task>

<task type="auto">
  <name>Terminal Launchers & HUD Specialization</name>
  <files>active_console.py, history_console.py, research_console.py, ui/active_hud.py, ui/history_hud.py, ui/research_hud.py</files>
  <action>
    - Create `active_console.py` (Heartbeat) with the updated `ActiveHUD` (Live flows + Registry).
    - Create `history_console.py` (Auditor) with `HistoryHUD` (DB Performance + Attribution).
    - Create `research_console.py` (Laboratory) with `ResearchHUD` (Neural Forecasts + Interactive Selection Menu).
    - Implement the keyboard listener in `research_console.py` for asset/strategy selection.
  </action>
  <verify>Run 'python active_console.py' and verify 'AUTHENTICATED' status is visible in the specialized view.</verify>
  <done>Three distinct terminals are functional and display their respective specialized data.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Active console successfully ingests live data to SQLite.
- [ ] History console correctly reads and displays matched PnL from the DB.
- [ ] Research console allows interactive menu selection of Altcoin sections.
</verification>

<success_criteria>
- [ ] Monolithic HUD is successfully retired in favor of the 3-Terminal Suite.
- [ ] Allocation weights and DCA simulations are visually confirmed in the Research CLI.
- [ ] Multi-terminal concurrency is verified via WAL mode.
</success_criteria>
