# Roadmap for CLI & Interactive TUI Improvements

This roadmap defines the future development goals for the CLI, focusing on TUI reliability, data-driven suggestions, and automated quality assurance.

## 1. TUI Robustness (Immediate)
- [ ] **Multi-Select Filtering**: Implement safe string filtering in `promptMultiSelect` (similar to the fix applied to `promptSelect`) to prevent `TypeError` when filtering non-string objects.
- [ ] **Empty State Handling**: Ensure that if filtering results in zero matches, the TUI gracefully notifies the user instead of erroring.
- [ ] **Memory Safety**: Audit all TUI buffers to ensure they don't grow unbounded in long-running CLI sessions.

## 2. Dynamic Data-Driven Suggestions
- [ ] **Unified Symbol Registry**: Create a standardized `SymbolRegistry` module in `shared/lib/` that gathers all available symbols from the filesystem cache and DB, providing a single source of truth for all TUI menus.
- [ ] **Contextual Suggestion Engine**: Update symbol menus to categorize suggestions based on asset class (e.g., Crypto, Equity, Macro) to reduce search noise.
- [ ] **Search Ranking**: Implement basic frequency-based ranking in the search engine to suggest frequently used symbols at the top of the filtered lists.

## 3. Automated Quality Assurance (Anti-Bullshit Testing)
- [ ] **TUI Integration Tests**: Add `tests/cli/tui_interaction_test.js` using mock STDIN/STDOUT to verify the TUI flow without human intervention.
- [ ] **Schema-Driven Validation**: Add a pre-execution step to all `backend` commands that validates user inputs (like symbols) against the `SymbolRegistry` before triggering the C++ binary.
- [ ] **Binary Integrity Checks**: Before every `spawnSync` call, verify the binary exists, is executable, and matches the expected hash to prevent "stale binary" errors.

## 4. User Experience Polish
- [ ] **"Recent" Shortcuts**: Introduce a "Recent" category in the symbol selection menu that stores the 5 most recently used tickers.
- [ ] **Command History**: Implement a simple command history file in `workspace/CLI_HISTORY` that persists across sessions to allow rapid re-execution of previous data analysis runs.
- [ ] **TUI Theme Support**: Add light color theme support to `engine.js` for better readability in high-contrast environments.
