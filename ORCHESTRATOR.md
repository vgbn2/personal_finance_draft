# ORCHESTRATOR: Terminus System

<role>
Lead Orchestrator (Antigravity). Responsible for goal decomposition, agent dispatch, and artifact synthesis.
</role>

<objective>
Refine the Terminus system by implementing real multi-agent coordination for SPEC, PLAN, and CODE phases.
</objective>

<active_mission>
Mission: Refine Scaling and Performance.
Sub-tasks:
1. Research optimal price scale for low-priced assets.
2. Refine matching logic in `aggregator.hpp`.
3. Fix potential race conditions in `RingBuffer`.
</active_mission>

<agent_registry>
- **Researcher**: Analysis and discovery (RESEARCH.md).
- **Refiner**: Spec development (SPEC.md).
- **Instructor**: Plan generation (PLAN.md).
- **Coder**: Implementation.
- **Debugger**: Error correction.
</agent_registry>

<process>
## 1. Goal Setting (Current Stage)
- Define the SPEC for scaling.
- Run `Refine` agent.

## 2. Plan Generation
- Call `Instruct` agent.

## 3. Execution
- Call `Code` agent.
</process>
