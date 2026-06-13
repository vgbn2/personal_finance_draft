# Sovereign Trading Platform - Claude Code Setup

## MCP Servers

**Supabase PostgreSQL** - Configured and ready
- Project: kwrnlkvoqzmaolmwvhse
- Use for database queries and schema management

## Custom Skills — single source: `.agents/skills/`

### Core Development
- `code-review` - Code review automation
- `multi-agent-research` - Research coordination
- `bootstrap-protocol` - Bootstrap automation
- `session-orchestrator` - Session orchestration
- `repo-global-protocol` - Repo-wide rules and conventions

### Automation & Testing
- `ci-cd` - CI/CD automation
- `evidence-first-testing` - Test-driven approach
- `verification-gates` - Quality gates
- `mass-implement` - Batch implementation

### Architecture & Design
- `sovereign-architect` - Architecture design
- `cpp-standards` - C++ code standards
- `react-component` - React component generation
- `technical-debt-ledger` - Debt tracking
- `subagent-contracts` - Agent contracts

### Documentation & Memory
- `context-memory` - Context preservation
- `docs-sync` - Documentation synchronization
- `review-session` - Session review
- `all-skills-loader` - Skill aggregation

### Database & Infrastructure
- `database-guardian` - Database safety
- `supabase` - Supabase utilities
- `supabase-postgres-best-practices` - PostgreSQL best practices
- `sovereign-mcp` - MCP server management

### Specialized
- `blast-through` - Speed implementation

## Architecture Plan (current)

See conversation history for the 5-phase plan. Phase 0 (cleanup) is complete:
- Rust CLI stubs deleted (`backend/cli/src/commands/`)
- Skills consolidated to `.agents/skills/` (`.gemini/` and `.codex/` removed)
- TUI menu labels cleaned up (no inline descriptions)

**Next:** Phase 1 — centralized asset picker (`tui/asset_picker.js`)
