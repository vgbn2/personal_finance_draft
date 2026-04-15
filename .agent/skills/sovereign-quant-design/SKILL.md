# SKILL: Sovereign Quant Design

> **Mission**: Enforce disciplined, institutional-grade engineering for trading and wealth management.

## Core Mandates

### 1. Architecture-First Initialization
- **Rule**: NEVER write logic before the folder structure is verified.
- **Why**: Prevents "script spaghetti" and ensures the project follows the **Four-Zone Standard** (Adapters, Core, Intelligence, UI).
- **Zone Definitions**:
    - **Adapters**: Pure I/O (APIs, CSVs, On-chain polling).
    - **Core**: Mathematical logic, PnL matching, Ledger management.
    - **Intelligence**: Neural models (CNN-LSTM), forecasting, and risk scores.
    - **UI**: Terminal/Web visual representation.

### 2. Theory-First Logic (Anti-Hype)
- **Rule**: Every quantitative indicator (Kalman, SMA/EMA, RSI) must have its mathematical source cited or derived.
- **Rule**: No "hype-driven" coding. Provide factual, objective analysis to the user.

### 3. Verification Protocol
- **Rule**: No "trust me, it works." 
- **Rule**: Every trade reconciliation must pass an entry-exit parity check before being saved to the database.

## 4. Filesystem Anatomy & Import Laws

### Architectural Placement
- **Adapters (`/adapters`)**: Pure I/O logic. Converts external data to `UniversalTrade`.
- **Core (`/core`)**: The mathematical and ledger foundation.
- **Intelligence (`/intelligence`)**: Forecasting and risk heuristics.
- **UI (`/ui`)**: Visual representation.

### Strict Dependency Flow (Refactor-Proofing)
- **Constraint**: No circular imports.
- **Constraint**: **Upward-Only Flow**: UI -> Core -> Adapter.
- **Constraint**: **Structural Decoupling**: Intelligence modules must be "Adapter-Blind"; they only interact with normalized Core data.
## 5. Security & Attack Surface Reduction

### Local-Only Mandate
- **Rule**: The Sovereign Wealth Console is a **CLI-First** application. Avoid web ports (80, 443, 8000) unless explicitly requested and secured.
- **Why**: Financial accounts and private keys must remain isolated from the global internet attack surface.
## 6. Strict Meta-Workflow (The GSD Loop)

### Planning Lifecycle Mandate
- **Rule**: Never skip straight to writing code for complex systems.
- **Workflow**: `Discover -> Suggest Ideals -> User Approval -> Finalize Plan -> Audit/Checker -> Execute`.
- **Metrics**: Every plan MUST include `difficulty` (effort), `complexity` (logical density), and `estimated_length` (Estimated Lines of Code - LOC) in the frontmatter.
  - *Difficulty*: Low (Simple code), Medium (Integrated logic), High (Critical/Algorithmic).
  - *Complexity*: Low (Linear), Medium (Branching/Schema), High (Mathematical/Edge-case heavy).
  - *Estimated Length*: In lines of code (e.g., 50 LOC, 120 LOC).
- **Why**: Ensures no wasted tokens, no hallucinated architectures, and guarantees that I am solving the exact problem the user requires.
- **Enforcement**: If a task triggers a new milestone or major architectural shift, I MUST output a research/suggest artifact and WAIT for the user to approve before generating the `01-PLAN.md` sequence.
