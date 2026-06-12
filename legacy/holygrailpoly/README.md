# Legacy Holygrail Poly Snapshot

This folder is a compatibility snapshot of the legacy Polymarket bot layout.

Purpose:
- preserve the older `POLY_*` env naming
- provide a local bridge into the current `POLYMARKET_*` flow
- run brute-force env probes without disturbing the main adapter

Current env aliases accepted here:
- `POLY_PRIVATE_KEY` -> `POLYMARKET_PRIVATE_KEY`
- `POLY_FUNDER_ADDRESS` -> `POLYMARKET_FUNDER_ADDRESS`
- `POLY_SIGNATURE_TYPE` -> `POLYMARKET_SIGNATURE_TYPE`
- `POLY_API_KEY` -> `POLYMARKET_API_KEY`
- `POLY_API_SECRET` -> `POLYMARKET_API_SECRET`
- `POLY_API_PASSPHRASE` -> `POLYMARKET_API_PASSPHRASE`

Usage:
- `node legacy/holygrailpoly/bruteforce.js`
- `node legacy/holygrailpoly/bruteforce.js --schema legacy`
- `node legacy/holygrailpoly/bruteforce.js --schema current`

The runner uses the existing `backend/cli/sovereign_cli.js` surface to compare
`polymarket collateral-probe` under different env mappings.
