## Session-17 audit findings: ALL RESOLVED
#1 kill-switch GET auth (37d2d6d2) | #2 exit-0-on-failure (32cb5637, proven live) |
#3 FOK loss + #7 deadline guard (cafe6eea) | #4 clob_rejected category (32cb5637) |
#5 derive-creds masking (32cb5637) | #6 pUSD display (32cb5637).
Centralization backlog: fetch-retry rollout DONE (6875f1fa -- fetchWithRetry + retryTransient
cover Gate.io fetch, gamma axios, cycle end-date fetch; trade.js has no raw fetches by
construction); submit/preflight dedup DONE (6875f1fa). L2-header SDK adoption REJECTED with
documented rationale: createL2Headers wants a ClobSigner object + WebCrypto HMAC and omits
User-Agent/Accept -- hand-rolled builder in clob_factory stays canonical (remove backlog item).
Suite after all waves: 284/284.

