# Skill: Financial Intelligence & High-Integrity TUI Engineering

Meaningful lessons derived from the Sovereign Wealth Console project.

## 1. High-Precision PnL Accounting
- **The Attribution Problem**: In exchange ledgers where funding/rebates are symbol-level but trades are ID-level, avoid the "multiplier effect." Assigning a global symbol-cost to every trade object and then summing those trades will exponentially overstate costs.
- **The Lifecycle Rule**: A trade is only "Closed" when the last movement in its Order ID group is recorded. Always track `first_seen` and `last_seen` timestamps to calculate accurate trade duration and close times.

## 2. Data Pipeline Hygiene
- **Pandas Nan-Stripping**: String conversion of Pandas DataFrames turns nulls into the literal string `'nan'`. This creates "Phantom Symbols" in financial tables. 
- **Action**: Always use `if pd.isna(val) or str(val).lower() == 'nan': continue` during the ingestion phase.

## 3. Machine Learning for Markets
- **Feature-Label Synchronicity**: Features used in the `train.py` loop must be bit-for-bit identical to those extracted in the `predictor.py` (inference) path. Even small normalization differences (e.g., dividing by 10 vs 100) will result in "Silent Model Corruption."
- **Ground-Truth Requirement**: Always label Risk-Off/On clusters using future price returns (e.g., 24h Forward PnL), never current-state proxies.

## 4. Secure Execution Architecture
- **Frozen Configurations**: Config objects should be immutable (`frozen=True`) to prevent race conditions where a background daemon (like a price ticker) updates a global state that other modules rely on.
- **Header-Only Authentication**: Move API keys out of URL query strings and into request headers immediately. Query strings are often logged by middleware or visible in network monitors.

## 5. Performance Optimization
- **Rolling Windows**: For TUI history buffers, `collections.deque(maxlen=N)` is significantly more efficient than `list.pop(0)`, which has $O(n)$ complexity.
- **Database Concurrency**: Enable SQLite `WAL` (Write-Ahead Logging) mode on `__init__` to allow simultaneous reads from an Auditor HUD and writes from a Live Ingestion Daemon.
