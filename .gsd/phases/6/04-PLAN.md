---
phase: 6
plan: 4
wave: 3
depends_on: ["6.2"]
files_modified:
  - sovereign_wealth_console/sovereign/engine/execution.py
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Execution engine can consume sentinel signals and map them to order requests"
  artifacts:
    - "sovereign/engine/execution.py exists with basic risk-guard logic"
---

# Plan 6.4: Execution Engine Skeleton

<objective>
Initializes the bridge between the logic-layers (Sentinels) and the execution-layers (Gate.io/Polymarket).

Purpose: Fulfill the 'unresolved' audit item and prepare for automated trading.
Output: Base ExecutionEngine implementation.
</objective>

<context>
Load for context:
- sovereign/engine/quant.py
- sovereign/infra/registry.py
</context>

<tasks>

<task type="auto">
  <name>Initializing Execution Core</name>
  <files>sovereign_wealth_console/sovereign/engine/execution.py</files>
  <action>
    Create the `ExecutionEngine` class. 
    It must take a `Sentinelverdict` and map it to a `RiskSizing` calculation.
    Implement a `dry_run` flag that logs intended trades without sending them to the registry.
    AVOID: Directly executing trades without a separate risk-guard module.
  </action>
  <verify>Import `ExecutionEngine` in a script and verify `evaluate_signal` returns a trade object in dry-run mode.</verify>
  <done>Sentinel-to-Order mapping logic is instantiated.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] `ExecutionEngine` is correctly registered in `registry.py` if needed.
</verification>

<success_criteria>
- [ ] Code compiles and provides log output for "Simulated Signal Execution".
</success_criteria>
