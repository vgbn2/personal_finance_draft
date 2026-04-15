---
phase: 6
plan: 1
wave: 1
depends_on: []
files_modified:
  - sovereign_wealth_console/sovereign/adapters/macro/fred_client.py
  - sovereign_wealth_console/sovereign/adapters/gate_io/live_client.py
  - sovereign_wealth_console/start_all.bat
  - sovereign_wealth_console/.gitignore
autonomous: true
user_setup: []

must_haves:
  truths:
    - "FRED API keys are passed via session params, not f-strings"
    - "Websockets use explicit SSL context for secure connection"
    - "start_all.bat initializes venv before executing modules"
  artifacts:
    - "SSLContext imported in adapters/gate_io/live_client.py"
    - ".gitignore contains test.db entries"
---

# Plan 6.1: Security Hardening & Environmental Stability

<objective>
Seals data leaks and stabilizes the runtime environment by hardening API communication and ensuring virtual environment isolation.

Purpose: Prevent API key leaks in logs and resolve library mismatches in startup.
Output: Updated fred_client, live_client, and start_all script.
</objective>

<context>
Load for context:
- sovereign/adapters/macro/fred_client.py
- sovereign/adapters/gate_io/live_client.py
- start_all.bat
</context>

<tasks>

<task type="auto">
  <name>Hardening FRED API Requests</name>
  <files>sovereign_wealth_console/sovereign/adapters/macro/fred_client.py</files>
  <action>
    Refactor `_fetch_series` to use the `params` argument in `session.get()` instead of f-stringing `api_key` into the URL. 
    AVOID: Including `api_key` in the base string because it gets logged more easily in many HTTP debuggers.
  </action>
  <verify>Check code for removal of `&api_key=` from the url f-string.</verify>
  <done>API key is exclusively passed via params dict.</done>
</task>

<task type="auto">
  <name>Enforcing Explicit WebSocket SSL</name>
  <files>sovereign_wealth_console/sovereign/adapters/gate_io/live_client.py</files>
  <action>
    Import `ssl` and create a default `ssl.create_default_context()` in `GateLiveClient.connect`. 
    Pass this context to `websockets.connect(..., ssl=context)`.
    AVOID: Using the default implicit context on Windows, which can lead to certificate validation failures.
  </action>
  <verify>Check `live_client.py` for `ssl` import and `websockets.connect` parameter update.</verify>
  <done>All WS connections are explicitly secured.</done>
</task>

<task type="auto">
  <name>Virtual Environment & Persistence Cleanup</name>
  <files>
    - sovereign_wealth_console/start_all.bat
    - sovereign_wealth_console/.gitignore
    - sovereign_wealth_console/sovereign/store/persistence.py
  </files>
  <action>
    1. Update `start_all.bat` to call `if exist ".venv\Scripts\activate.bat" call .venv\Scripts\activate.bat`.
    2. Add `test.db` and `sovereign.db` to `.gitignore`.
    3. Remove `test.db` from disk.
    4. Refactor `persistence.py`: Consolidate `LocalJsonAdapter` and `SQLitePersistenceAdapter`. Remove one if it's purely redundant or mark for deprecation.
  </action>
  <verify>Run `git status` to ensure `test.db` is gone. Check `persistence.py` for single-adapter logic where possible.</verify>
  <done>Environment is isolated and persistence logic is lean.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] No API keys in fred_client console/log outputs.
- [ ] Satellite consoles launch via venv if present.
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] No `test.db` in git tree
</success_criteria>
