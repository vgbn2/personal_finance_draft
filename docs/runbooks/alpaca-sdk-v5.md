# Alpaca SDK v5 adapter

The installed `@alpacahq/alpaca-trade-api@5.0.0` separates trading and market-data APIs. Generated models translate HTTP snake_case into camelCase, so the adapter must translate them back at the existing shared position-normalizer boundary; otherwise buying power and sellable inventory are lost. Think of this as a plug adapter: changing the socket alone does not reconnect the wires.

## Installed contract map

Canonical sources below are relative to `node_modules/@alpacahq/alpaca-trade-api/src/`.

| Operation | SDK request | Response / wire contract | Source |
| --- | --- | --- | --- |
| Authentication | `{ keyId, secret, paper }` | SDK option is `secret`, not `secretKey` | `client.ts:84-104` |
| Trading URL | `new trading.Configuration({ basePath: resolvedSettings.baseUrl })` | Explicit basePath overrides paper selection; facade has no baseUrl option | `trading/runtime.ts:23-29`, `core/runtime.ts:171-175` |
| Account | `trading.account.getAccount()` | `cash`, `buyingPower`, `equity` numeric strings | `trading/apis/AccountsApi.ts`, `trading/models/Account.ts` |
| Positions | `trading.positions.getAllOpenPositions()` | `qty`, `qtyAvailable`, `avgEntryPrice`, `marketValue`, `unrealizedPl` | `trading/apis/PositionsApi.ts:166-201`, `trading/models/Position.ts:217-244` |
| Submit | `orders.postOrder({ createOrderRequest: orders.buildOrder(input) })` | Input `timeInForce`, `clientOrderId`, `limitPrice`; builder emits numeric strings, serializer emits snake_case | `orders.ts:382-397`, `trading/apis/OrdersApi.ts:423-468` |
| Bracket | Same submit path with `orderClass`, `takeProfit.limitPrice`, `stopLoss.stopPrice` | Wire `order_class`, `take_profit.limit_price`, `stop_loss.stop_price` | `trading/models/CreateOrderRequest.ts` |
| Cancel | `orders.deleteOrderByOrderID({ orderId })` | 204 succeeds; 404 rejects (not falsely acknowledged) | `trading/apis/OrdersApi.ts:121-164` |
| History | `orders.getAllOrders({ status: 'all', limit: 500, nested: false, direction: 'desc' })` | `submittedAt`, `createdAt`, `filledAt` are Date; `clientOrderId` string | `trading/apis/OrdersApi.ts:38-49`, `trading/models/Order.ts:312-352` |
| Stock quote | `marketData.stocks.stockLatestQuoteSingle({ symbol })` | `response.quote.ap/bp` | `market-data/apis/StockApi.ts:742-798`, `market-data/models/StockQuote.ts:109-124` |
| Crypto quote | `marketData.crypto.cryptoLatestQuotes({ loc: 'us', symbols })` | `response.quotes[symbol].ap/bp` | `market-data/apis/CryptoApi.ts:343-400`, `market-data/models/CryptoQuote.ts` |

`ap`/`bp` are the actual generated quote model fields, not `AskPrice`, `askPrice`, or `bidPrice`. The public adapter still returns one finite positive ask, falling back to bid when ask is zero/missing, or zero when unavailable.

## Safety and preserved limits

- Shared normalization stays owned by `shared/lib/brokers/alpaca_env.js`; explicit camelCase-to-snake_case conversion preserves `qty_available: 0` and partial sellable quantity. Missing availability retains the existing quantity fallback.
- Core account/position numeric fields must be present and finite. Malformed inventory rejects rather than silently fabricating zeros. Empty positions remain valid.
- History remains optional and limited to the latest 500 orders, not complete attribution. A failure emits a warning and returns actual positions without enrichment. Dates are serialized to ISO. The existing position contract exposes submission time only; fill time is its fallback, and client ID remains enrichment metadata, not a new Position property.
- Stocks retain integer `gtc` / fractional `day`; crypto retains `gtc` and normalized slash symbols. Brackets are integer equity buy orders with valid positive exit prices, rejecting crypto/fractional unsupported brackets before HTTP.
- No-credential brackets now reject unless `simulateIfMissingCredentials: true`, matching ordinary order fail-closed behavior. Quote-unavailable zero and cancel-without-credentials false remain unchanged.
- The optional legacy injected client is bridged only at construction for account, positions, history, submit, cancel, and stock/crypto quotes. SDK model deserializers convert legacy wire responses; the SDK request serializer converts order input. Methods are resolved lazily so a partial injected client fails only when an absent operation is called. Production retains one generated v5 SDK request owner.
- Generated trading APIs do not enable facade automatic retries/rate limiting. Tests explicitly use configurations with retry/rateLimit unset (disabled). This avoids hidden sleeps/repeated calls on errors; adapter callers retain error/backoff ownership. Market data retains facade defaults in production.

## Local-only verification runbook

### 1. Inspection / probe

```bash
node -p "require('@alpacahq/alpaca-trade-api/package.json').version" # expected 5.0.0
git diff -- backend/execution/src/adapters/alpaca_adapter.ts # inspect only batch-owned source
```

### 2. Remediation / action

```bash
npm run build --workspace backend/execution # compile generated ignored dist; no provider calls
```

### 3. Verification / oracle

```bash
node --test tests/scripts/operational/alpaca_sdk_contract.test.js # real SDK against loopback HTTP fixtures
node --test --test-name-pattern='AlpacaAdapter and PolymarketAdapter' tests/scripts/chaos/adversarial_chaos.test.js # existing injected fault seam
anti-cheat-enforcer --diff --require-tests --no-revert # audit without reverting unrelated staged work
```

Expected: contract suite passes, no external requests and no keys needed. Pre-fix: all seven contract tests failed, including constructor missing-secret, undefined methods, and bracket missing expected rejection. `reproducer-mint` confirmed exit 1; repeatable scratch recipe and baseline output live at `/tmp/opencode/alpaca-sdk-v5/`.

Review correction (attempt 2): the added real-HTTP legacy transport regression reproduced discarded injected operations (8 passed, 1 failed; account failed after successful submission). Independent malformed-field cases now cover buying power, equity, entry price, market value, and unrealized P/L. Existing assertions were retained unchanged.

The initial suite took about 30 seconds to exit despite subsecond assertions. SDK `core/runtime.ts:993-1001` creates a referenced per-attempt timer (default 30000 ms); malformed response paths retain deadlines until expiry. Fixture SDK configurations now use `timeoutMs: 1000`, reducing the observed pre-correction suite duration to 1237 ms without sleeps, retries, relaxed assertions, or production timeout changes. Production configurations remain unchanged.

### 4. Rollback / safety

No SDK downgrade artifact is qualified; do not downgrade dependencies or deploy this batch automatically. Stop on failed verification, preserve unrelated work, and let the parent reviewer isolate/revert only batch-owned changes if needed. No live hosts, provider orders, or deployment have been exercised by this local contract suite.
