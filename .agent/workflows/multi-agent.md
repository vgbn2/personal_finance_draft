---
description: Multi-Agent CLI Workflow for GSD
---

# /multi-agent Workflow

<objective>
Coordinate multiple specialized agent roles to complete complex tasks.
</objective>

<process>

1. **Select Agent Role:**
   - `research`: Discovery and feasibility.
   - `refine`: Self-refinement and SPEC.md updates.
   - `instruct`: Goal decomposition and PLAN.md generation.
   - `code`: Feature implementation.
   - `debug`: Error resolution and diagnostic fixes.

2. **Execute Agent Role:**

**PowerShell:**
```powershell
# Example invocation
# ./scripts/agents/research.ps1 "Analyze Redis integration"
```

**Bash:**
```bash
# Example invocation
# ./scripts/agents/research.sh "Analyze Redis integration"
```

3. **Chain Roles (Optional):**
   - Research → Refine → Instruct → Code → Debug

</process>
