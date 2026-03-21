# The 5-Agent Multi-LLM Workflow Manifesto
## A Framework for High-Integrity Engineering

This document outlines the multi-agent orchestration pattern used to build complex, multi-disciplinary systems in the `CODEPTIT` workspace. To prevent AI "groupthink," this framework mandates the use of physically distinct LLM providers and APIs for different roles.

---

## 1. The 5-Agent Hardware/API Mapping

To ensure true architectural diversity, the roles are explicitly mapped to the API keys you have provisioned:

### 🛡️ Role 1: The Orchestrator (Me)
- **API/Engine:** Gemini 1.5 Pro (Native Workspace Agent)
- **Persona:** The Project Lead & Integrator.
- **Mission:** Maintains the session context, coordinates the sub-agents, and performs the final synthesis of code into the user's workspace.

### 🔍 Role 2: The Deep-Dive Researcher
- **API/Engine:** Tavily API (Search) + Groq (Fast Synthesis)
- **Persona:** The Scientific Academic.
- **Mission:** Bypasses standard LLM hallucinations by using Tavily to scrape real-time peer-reviewed data and Groq (Llama-3/Mixtral) to parse thousands of words of medical/physics papers in milliseconds.

### 📐 Role 3: The Architect / Strategist
- **API/Engine:** DeepSeek-Reasoner (via OpenRouter)
- **Persona:** The Systems Architect.
- **Mission:** Specializes in high-level logical design (e.g., Async queues, Pydantic schemas, state machines). DeepSeek-Reasoner's chain-of-thought is mathematically superior for designing non-blocking data pipelines.

### 🛠️ Role 4: The Surgical Executor
- **API/Engine:** DeepSeek-Coder (via OpenRouter) or Gemini 1.5
- **Persona:** The Senior Software Engineer.
- **Mission:** Writes the actual Python/C++ code based on the Architect's blueprints. Extremely disciplined in adhering to the Open-Closed Principle.

### ⚖️ Role 5: The Logical Auditor
- **API/Engine:** DeepSeek-Reasoner (via OpenRouter)
- **Persona:** The Skeptical QA Physicist/Engineer.
- **Mission:** Pure adversarial analysis. It reviews the Orchestrator's integrated code and actively tries to break it by finding logical fallacies (like the Interstitial Lag Fallacy or Linear Dielectric mappings).

---

## 2. Adversarial Workflow Protocol

Every critical logic gate (like the UKF, Alert Logic, or Physics Simulation) must follow this "Multi-Provider" loop:

1. **Design:** Orchestrator (Gemini) asks Architect (DeepSeek) for a blueprint.
2. **Grounding:** Researcher (Tavily/Groq) pulls external papers to verify the formulas.
3. **Execution:** Executor (DeepSeek-Coder) writes the algorithms.
4. **Audit:** Auditor (DeepSeek-Reasoner) tries to find 3 catastrophic flaws.
5. **Integration:** Orchestrator (Gemini) applies the final, audited code to the workspace.

---

## 3. Core Principles for Future Projects
- **API Diversity:** Never rely on a single model family for complex math or biology. If Gemini writes it, DeepSeek audits it.
- **Async First:** Never use blocking loops for sensor-driven systems.
- **Schema Driven:** Use Pydantic to ensure data integrity across the "Hive."
- **Physics-Aware:** Always simulate the physical constraints of the hardware.
