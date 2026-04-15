---
phase: 6
plan: 2
wave: 2
depends_on: ["6.1"]
files_modified:
  - sovereign_wealth_console/sovereign/adapters/polymarket/client.py
  - sovereign_wealth_console/sovereign/store/persistence.py
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Polymarket token IDs are persisted in SQLite across restarts"
    - "Discovery calls are URL-encoded and rate-guarded"
  artifacts:
    - "New KV entry in SQLite for 'polymarket_token_cache'"
---

# Plan 6.2: Intelligence Persistence & L3 Refinement

<objective>
Improves L3 (Sentiment) reliability by persisting discovered token IDs and protecting the API discovery loop from rate limits.

Purpose: Avoid burning Polymarket rate limits and fix "broken" search queries.
Output: Persistent Polymarket cache and robust discovery logic.
</objective>

<context>
Load for context:
- sovereign/adapters/polymarket/client.py
- sovereign/store/persistence.py
</context>

<tasks>

<task type="auto">
  <name>SQLite Token Cache Integration</name>
  <files>sovereign_wealth_console/sovereign/adapters/polymarket/client.py</files>
  <action>
    1. Import `polymarket_client` dependency on `persistence`.
    2. Add `save_cache()` and `load_cache()` methods to `PolymarketClient`.
    3. Modify `fetch_snapshot` to check the persistent store before calling `_discover_token_id`.
    AVOID: Keeping the cache in-memory only, as this makes startup very slow and prone to API blocks.
  </action>
  <verify>Check `sovereign.db` for key `polymarket_token_cache` after a run.</verify>
  <done>Token IDs survive restart.</done>
</task>

<task type="auto">
  <name>Polymarket Discovery Hardening</name>
  <files>sovereign_wealth_console/sovereign/adapters/polymarket/client.py</files>
  <action>
    1. Use `urllib.parse.quote` for the `search` query parameter.
    2. Add `await asyncio.sleep(0.5)` inside the discovery loop to guard against rate limiting.
    3. Improve default search terms to target high-volume markets.
  </action>
  <verify>Verify URL encoding with keywords containing spaces (e.g. "btc price").</verify>
  <done>Discovery calls are resilient and valid.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Log shows "Cache HIT" or similar logic during restart (if logs added).
- [ ] No 429 errors from Polymarket in `sovereign.log`.
</verification>

<success_criteria>
- [ ] Persistent token lookup successfully enabled.
- [ ] Keywords with special characters do not crash the GET request.
</success_criteria>
