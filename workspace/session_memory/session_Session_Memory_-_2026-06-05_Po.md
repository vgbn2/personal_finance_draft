## Session Memory - 2026-06-05 Polymarket gateway closeout

{
  "work": "Mass-implement + blast-through on the Polymarket gateway, legacy bridge, and gateway launcher seam",
  "implemented": [
    "Added a lightweight `polymarket collateral-probe --json` path for signer/funder/signature type plus collateral balance and allowance only.",
    "Switched the legacy `holygrailpoly` brute-force runner to use the fast collateral probe instead of the heavier `debug` and `modes` paths.",
    "Replaced the CLI fallback from `npx tsx` to a dedicated `backend/cli/lib/run_trade_gateway.js` bootstrap when local `tsx` is unavailable.",
    "Extracted `backend/gateway/src/polymarket_errors.js` so gateway probe failures keep endpoint context but redact `POLY_API_KEY`, `POLY_PASSPHRASE`, and `POLY_SIGNATURE`."
  ],
  "verification": [
    "node --test tests/scripts/tests/polymarket_errors.test.js tests/scripts/tests/polymarket_account.test.js tests/scripts/tests/legacy_polymarket_env.test.js tests/scripts/tests/sovereign_cli.test.js -> 55/55 pass",
    "node_modules/.bin/tsc.cmd -p backend/gateway/tsconfig.json --noEmit -> pass",
    "node backend/cli/sovereign_cli.js polymarket collateral-probe --json -> structured JSON failure with auth-bearing headers redacted",
    "node legacy/holygrailpoly/bruteforce.js --schema current -> same endpoint failure through signature_type 1",
    "node legacy/holygrailpoly/bruteforce.js --schema legacy -> same endpoint failure through signature_type 3"
  ],
  "findings": [
    "The original timeout/noise problem was partly launcher drift: the CLI had been falling back to `npx tsx`, which is wrong on this machine when registry/network access is restricted.",
    "Current and legacy env schemas both reach `https://clob.polymarket.com/balance-allowance/update` and fail with network `EACCES`, so env aliasing is no longer the primary suspect.",
    "The high-severity auth leak in raw gateway error serialization is fixed; live probe output is now safe enough to inspect."
  ],
  "remaining": [
    "Endpoint reachability or runtime network policy to `clob.polymarket.com` is the active blocker.",
    "The legacy bridge is still not a pure alias comparator because it may force signatureType=3 when a funder exists; keep that nuance in mind before trusting current-vs-legacy deltas.",
    "Do not spend more time changing signer/funder logic until the network-layer EACCES is cleared."
  ],
  "dcs": 0.92
}

