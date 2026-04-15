---
phase: 6
plan: 3
wave: 2
depends_on: ["6.1"]
files_modified:
  - sovereign_wealth_console/sovereign/ui/interact.py
  - sovereign_wealth_console/sovereign/ui/hud.py
  - sovereign_wealth_console/sovereign/cli/main.py
  - sovereign_wealth_console/sovereign/cli/active_console.py
  - sovereign_wealth_console/sovereign/cli/history_console.py
  - sovereign_wealth_console/sovereign/cli/research_console.py
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Interactive confirmations are cleared on view switch"
    - "Startup health panel is visible during first 5 seconds"
    - "Satellite consoles can be quit via 'q' key"
  artifacts:
    - "clear_pending() method in interact.py"
    - "CommandProcessor integrations in satellite consoles"
---

# Plan 6.3: UI Orchestration & Component Integration

<objective>
Refines the Multi-Terminal UX by cleaning up interaction states and providing clear system-readiness feedback during startup.

Purpose: Prevent accidental trades and fix "zombie" console processes.
Output: Integrated startup panel and robust satellite interfaces.
</objective>

<context>
Load for context:
- sovereign/ui/interact.py
- sovereign/ui/hud.py
- sovereign/cli/active_console.py
</context>

<tasks>

<task type="auto">
  <name>Securing Interaction Transitions</name>
  <files>
    - sovereign_wealth_console/sovereign/ui/interact.py
    - sovereign_wealth_console/sovereign/ui/hud.py
  </files>
  <action>
    1. Implement `InteractiveHUD.clear_pending()` to reset `pending_action` and `pending_desc`.
    2. Update `SovereignHUD.set_view` and `set_display_mode` to call this cleanup.
    AVOID: Allowing a staged `:buy` to persist if the user escapes to a different HUD view.
  </action>
  <verify>Stage a trade (:buy), press '2', switch back to 'i', and check if the 'Are You Sure' panel is gone.</verify>
  <done>Confirmation state is local to the interactive active view ONLY.</done>
</task>

<task type="auto">
  <name>Startup Health Panel Wiring</name>
  <files>
    - sovereign_wealth_console/sovereign/ui/hud.py
    - sovereign_wealth_console/sovereign/cli/main.py
  </files>
  <action>
    1. Add `_startup_ts` to `SovereignHUD`.
    2. In `generate_layout`, if `now - _startup_ts < 5.0`, overlay the `SovereignUI.build_status_panel()`.
    3. Ensure `registry.health_report()` is used for the panel data.
  </action>
  <verify>Launch `main.py` and verify the cyan 'Registry Status' table is visible for the first 5s.</verify>
  <done>Users receive explicit 'Online' feedback for all adapters on boot.</done>
</task>

<task type="auto">
  <name>Satellite Console Portability & Quit</name>
  <files>
    - sovereign_wealth_console/sovereign/cli/active_console.py
    - sovereign_wealth_console/sovereign/cli/history_console.py
    - sovereign_wealth_console/sovereign/cli/research_console.py
  </files>
  <action>
    1. Integrate `CommandProcessor.poll()` into the satellite loop.
    2. Register 'q' and 'esc' as terminators for these sessions.
    3. **Refactor ActiveConsole**: Remove the duplicate `GateLiveClient` connection; poll from DB instead.
  </action>
  <verify>Press 'q' in any satellite window to verify clean exit.</verify>
  <done>All consoles follow unified exit protocols and share a single WS data line.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] No duplicate WS connections visible in logs during suite startup.
- [ ] Startup panel fades out correctly.
</verification>

<success_criteria>
- [ ] All 3 satellite consoles are non-blocking and keyboard-responsive.
- [ ] PnL bleed through view-switches is eliminated.
</success_criteria>
