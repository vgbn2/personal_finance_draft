# Pre-Flight & Stability Verification Plan

To ensure the code doesn't "just break" when finished, we implement an automated validation pipeline.

## 1. Phase 1: Infrastructure Pre-Flight (`tests/preflight.py`)
**Goal**: Verify the environment is sane before any trading logic runs.
- **Check Ports**: Assert that 8000, 8001, 5432, and 6379 are open and not blocked by Windows/WSL conflicts.
- **DB Ping**: Send a test command to Redis and Postgres. Fail fast if they don't respond within 500ms.
- **API Key Check**: Verify `.env` contains the required keys (even if they are just mock keys for now).

## 2. Phase 2: Logic Unit Testing (`tests/units/`)
- **Greeks Math**: Cross-verify the Black-Scholes output against known constants.
- **Slippage Calc**: Feed a mock orderbook and verify the computed `effective_price` matches manual math.
- **Aggregator Skew**: Test the "Stale Data Poisoning" logic by feeding one data stream with a 5-second old timestamp. Assert it is rejected.

## 3. Phase 3: Integration Mocking (`tests/integration/`)
- **VS Bridge Stress**: Spawn 50 mock WebSocket clients and spray data. Verify Python memory doesn't leak.
- **VPN Simulation**: Simulate a network socket timeout. Verify the `ExponentialBackoff` retry loop triggers correctly.

## 4. Phase 4: Full-Loop Front-Testing (`main.py --test`)
- Run the system in "Paper Mode" with synthetic prices for 5 minutes.
- Verify that every signal generated is successfully logged to **MongoDB** and **Postgres** simultaneously.
