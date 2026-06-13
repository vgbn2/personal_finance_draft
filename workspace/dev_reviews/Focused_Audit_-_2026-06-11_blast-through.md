## Focused Audit - 2026-06-11 (`/blast-through` on the unrecorded `feat/ml-onnx-section` working tree)

Scope: the ~28-file uncommitted diff (self-described in DEV_COMMENTS.md as "2026-06-10 Mass Audit
& Ingestion Repair" — that session wrote no handoff/session-memory entry) plus carried gated
sections. Full `npm test` run as the verification gate. **DCS this audit: 0.87** (Freshness 0.95
— integrity ok:true, BTCUSDT through 2026-06-10; Schema 0.85 — failing indicator data-flow
contract; Coverage 0.80 — 7 NEW failing test files vs the 226/232 baseline). Below the 0.95
promotion bar: **do not commit this tree as-is.**

