# Next Session Goal

## Primary Objective: Deep Review & Architecture Audit
1. **Deep Codebase Review**: Conduct a deep architectural and implementation review across:
   - Live strategy signal fast-path (`backend/cli/commands/strategy/strategy.js`) and lookback warming.
   - ML model continuous 1-100 conviction scoring and ONNX inference runtime (`shared/lib/ml/models.js`).
   - Pre-trade risk engine contracts and native C++ backend protocol boundaries (`backend/cli/commands/tools/risk.js`).
   - Multi-strategy virtual position attribution and sub-position ledger accounting (`shared/lib/runtime/sub_positions_ledger.js`).
   - Gateway TypeScript adapter seams (`backend/gateway/src/`).
2. **Host & Container Soak Verification**: Verify `sv-bot-alpaca-paper` continuous execution on `hpdesk` with real fills and zero resource leaks.
