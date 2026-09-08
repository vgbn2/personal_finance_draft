# Native Core Maintenance Notes

These are durable review constraints for `backend/core`. They replace the
scattered `dev.review.txt` sidecars that previously mixed local reminders with
source files.

## Data boundaries

- Keep feed adapters deterministic and local-first. Wire name-only feed files
  to a real adapter or retire them.
- Keep provider boundaries explicit and fail closed on missing ingestion
  inputs. Prefer recorded or file-backed fixtures.
- Normalize and validate parser input at the boundary. Reuse small helpers
  across CSV and JSON adapters, and prove malformed input is rejected.

## Portfolio and risk

- Keep exposure, PnL, and sizing helpers deterministic, pure, and bounded.
- Reuse `sizePosition`, `kellyFraction`, and `sharpeScaledFraction` before
  adding sizing logic. Cover changed numeric behavior directly.
- Connect new portfolio behavior to explicit risk limits and executable tests.

## Regimes and strategies

- Keep regime detection deterministic and expose it through a header-level
  factory or API seam; tests should not include implementation `.cpp` files.
- Preserve the regime state and description contract when extending it.
- Keep strategies small, composable, and explicit about side and confidence.
  Prefer shared interfaces over standalone one-off binaries.

## Tests and operations

- Keep `backend/core/test` focused on executable contracts and compact fixtures,
  without generated outputs or empty shells.
- Route build, setup, test, deployment, and data operations through the
  repository's active CLI or web entrypoints.
- Do not commit compiler databases such as `.pdb` files or local review
  sidecars. `npm run hygiene` enforces this boundary.
