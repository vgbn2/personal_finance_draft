# MT5 Trade Integration & Headless Execution Architecture Plan

**Document Version**: 2.0.0 (Post-Audit Synthesis)  
**Target Milestone**: Session 10 MT5 Trade Execution Engine & Headless Deployment  
**Author**: Sovereign Platform Core Architecture & Audit Panel  
**Status**: APPROVED & REVISED  

---

## 1. Executive Summary & Diagnostic Audit Findings

### 1.1 Fatal Flaws Identified in Plan v1.0.0

A deep architectural audit identified 9 critical defects in the initial plan:

1. **Non-Existent MQL5 Server APIs (`SocketListen` / `SocketAccept`)**:
   - *Defect*: Plan v1.0.0 assumed MQL5 hosts a TCP server on port 8282. Native MQL5 network functions are **strictly client-only** (`SocketConnect`, `SocketSend`, `SocketRead`). Server listening requires external Win32 DLLs (`ws2_32.dll`), violating the zero-dependency cross-platform requirement.
   - *Fix*: Invert topology. The Node.js gateway acts as a persistent TCP server (`net.createServer()`) on `127.0.0.1:8282`. The MQL5 EA runs as a client connecting outbound via `SocketConnect()`.

2. **`BrokerAdapter` TypeScript Contract Violation**:
   - *Defect*: Plan v1.0.0 specified fictitious methods `getBalance()`, `submitOrder()`, and `closePosition()`.
   - *Fix*: Align strictly with canonical `backend/gateway/src/adapters/types.ts`:
     - `placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }>`
     - `cancelOrder(orderId: string): Promise<boolean>`
     - `getPortfolioBalance(): Promise<Record<string, number>>`
     - `getPositions(): Promise<Position[]>`

3. **Hedging vs. Netting Account Desynchronization**:
   - *Defect*: Plan failed to distinguish between Retail Hedging (`ACCOUNT_MARGIN_MODE_RETAIL_HEDGING`) and Retail Netting (`ACCOUNT_MARGIN_MODE_RETAIL_NETTING`).
   - *Fix*: In Netting, closing an order requires an opposite deal, and `POSITION_MAGIC` is overwritten by the last deal. In Hedging, closing requires `request.position = position_ticket`. The adapter inspects `ACCOUNT_MARGIN_MODE` dynamically.

4. **Forex Broker Rejection on Filling Mode**:
   - *Defect*: Plan hardcoded order submissions without filling mode resolution. STP/ECN retail brokers reject `ORDER_FILLING_FOK` with error `TRADE_RETCODE_INVALID_FILL` (10030).
   - *Fix*: Query `SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE)` dynamically and select `ORDER_FILLING_IOC`, `ORDER_FILLING_FOK`, or `ORDER_FILLING_RETURN`.

5. **Fragile Hardcoded Lot Multipliers**:
   - *Defect*: Plan hardcoded `units / 100000` for Forex and `units / 100` for Gold. Breaks on cent accounts, micro accounts, and variable index/crypto CFD contracts.
   - *Fix*: Dynamically query `SYMBOL_TRADE_CONTRACT_SIZE`, `SYMBOL_VOLUME_MIN`, `SYMBOL_VOLUME_MAX`, and `SYMBOL_VOLUME_STEP` before calculating lot volumes.

6. **ECN Two-Step Market Execution Failure**:
   - *Defect*: Plan sent SL and TP directly inside market orders. In ECN/STP market execution (`SYMBOL_TRADE_EXECUTION_MARKET`), sending SL/TP with the initial deal triggers `TRADE_RETCODE_INVALID_STOPS`.
   - *Fix*: If market execution mode is active, submit order with SL/TP = 0, obtain deal ticket, then issue `TRADE_ACTION_SLTP`.

7. **EA Silent Deafness in `OnTick()`**:
   - *Defect*: Running IPC checks inside `OnTick()` stops all message processing when markets are closed (weekends, off-hours, illiquid pairs).
   - *Fix*: Drive all socket I/O, heartbeats, and queue processing inside high-frequency timer `OnTimer()` using `EventSetMillisecondTimer(50)`.

8. **Order Comment Volatility & Attribution Loss**:
   - *Defect*: Relying on order comments for strategy tracking fails because brokers truncate comments to 31 characters or overwrite them on partial fills, SL/TP triggers, and rollovers.
   - *Fix*: Use immutable 64-bit `ORDER_MAGIC` bitmask encoding system ID, strategy hash, timeframe, and instance ID.

9. **Sub-Positions Ledger Path Drift**:
   - *Defect*: Plan referenced non-existent path `shared/lib/risk/sub_positions_ledger.js`.
   - *Fix*: Corrected to `shared/lib/runtime/sub_positions_ledger.js`.

---

## 2. Visual Architecture & IPC Pipeline

```text
+-------------------------------------------------------------------------------------------------------------------------+
|                                    SOVEREIGN MT5 INTEGRATION ARCHITECTURE                                               |
|                                                                                                                         |
|  [Sovereign Core / Node.js Process]                                                                                     |
|    |                                                                                                                    |
|    +---> Gateway Controller (`backend/gateway/src/index.ts`)                                                            |
|            |                                                                                                            |
|            +---> Mt5Adapter (`backend/gateway/src/adapters/mt5_adapter.ts`)                                             |
|                    | [Implements BrokerAdapter: placeOrder, cancelOrder, getPortfolioBalance, getPositions]             |
|                    |                                                                                                    |
|                    +---> Mt5BridgeServer (`net.createServer()`)                                                         |
|                            | Listening on 127.0.0.1:8282                                                                |
|                            | Framing: Newline-Delimited JSON (NDJSON)                                                   |
|                            | Latency: <1 ms (Loopback) | Load Index: 0.1% CPU                                            |
|                            +---------------------------------------+                                                    |
|                                                                    |                                                    |
+--------------------------------------------------------------------|----------------------------------------------------+
                                                                     | Inbound TCP Connection
                                                                     | (`SocketConnect` on boot)
+--------------------------------------------------------------------|----------------------------------------------------+
|  [Headless MT5 Linux Container / Wine Environment: sv-mt5]         v                                                    |
|                                                                                                                         |
|    +---> Xvfb :99 (Virtual Framebuffer, 1024x768x16) [Load: ~0.2% CPU]                                                 |
|    +---> Wine64 (WINEARCH=win64, Audio disabled, fontsmooth=rgb) [Load: ~0.8% CPU]                                      |
|    +---> terminal64.exe /portable /config:startup.ini                                                                   |
|            |                                                                                                            |
|            +---> SovereignTradeBridge.mq5 (Expert Advisor)                                                              |
|                    |-- Event Loop: OnTimer(50ms) [Load: ~0.5% CPU]                                                      |
|                    |-- Native Socket: SocketCreate() -> SocketConnect("127.0.0.1", 8282)                                |
|                    |-- Dynamic Contract Resolution (ContractSize, VolumeStep, Min/MaxLot)                               |
|                    |-- Filling Mode Resolver (IOC / FOK / RETURN)                                                       |
|                    |-- Price Normalization (Digits, TickSize, StopsLevel)                                               |
|                    |-- 64-bit ORDER_MAGIC Strategy Attribution                                                          |
|                    \-- Order Execution -> OrderSend() -> Broker Server                                                  |
|                                                                                                                         |
|    +---> Anti-Update Sentinel (`chmod 000 liveupdate`)                                                                  |
|    +---> Shared Volume: MQL5/Files/ (Fallback File Mailbox: 10-50ms latency)                                            |
+-------------------------------------------------------------------------------------------------------------------------+
```

---

## 3. Communication Protocol & Wire Specification

### 3.1 Connection Handshake & Registration (`REGISTER`)

Upon startup or reconnect, the MQL5 EA initiates connection to the Node.js TCP Server and transmits its registration frame:

**MQL5 Client -> Node.js Gateway**:
```json
{
  "type": "REGISTER",
  "terminalId": "mt5_headless_01",
  "account": 50129481,
  "server": "ICMarketsSC-Demo",
  "company": "Raw Trading Ltd",
  "marginMode": "RETAIL_HEDGING",
  "currency": "USD",
  "leverage": 500,
  "tradeAllowed": true
}
```

**Node.js Gateway -> MQL5 Client**:
```json
{
  "type": "REGISTER_ACK",
  "ok": true,
  "timestamp": "2026-09-11T16:45:00.000Z"
}
```

### 3.2 Order Submission Protocol (`ORDER_SUBMIT`)

**Node.js Gateway -> MQL5 Client**:
```json
{
  "type": "ORDER_SUBMIT",
  "nonce": "cmd_1726073100124_9f2a",
  "clientOrderId": "sov-mt5-20260911-001",
  "symbol": "EURUSD",
  "side": "buy",
  "orderType": "market",
  "quantity": 10000,
  "price": 1.08450,
  "sl": 1.08200,
  "tp": 1.08900,
  "magic": "6003429185732640769",
  "comment": "sov|mom_cnn|01"
}
```

**MQL5 Client Execution Logic**:
1. Parse `symbol`, normalize volume: `lots = MathFloor((quantity / contractSize) / volumeStep) * volumeStep`.
2. Normalize price, SL, TP via `SymbolInfoInteger(symbol, SYMBOL_DIGITS)`.
3. Resolve filling type: `SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE)`.
4. Check execution mode: if `SYMBOL_TRADE_EXECUTION_MARKET`, issue initial order without SL/TP, then modify position with SL/TP after fill.
5. Invoke `OrderSend(request, result)`.

**MQL5 Client -> Node.js Gateway**:
```json
{
  "type": "ORDER_RESULT",
  "nonce": "cmd_1726073100124_9f2a",
  "ok": true,
  "ticket": 84920184,
  "deal": 73819201,
  "symbol": "EURUSD",
  "volume": 0.10,
  "fillPrice": 1.08452,
  "retcode": 10009,
  "retcodeDescription": "TRADE_RETCODE_DONE",
  "timestamp": "2026-09-11T16:45:00.180Z"
}
```

### 3.3 Position & Account Sync Protocol (`POSITIONS_GET` & `ACCOUNT_GET`)

**Node.js Gateway -> MQL5 Client**:
```json
{
  "type": "POSITIONS_GET",
  "nonce": "cmd_1726073100150_b1c2"
}
```

**MQL5 Client -> Node.js Gateway**:
```json
{
  "type": "POSITIONS_RESULT",
  "nonce": "cmd_1726073100150_b1c2",
  "ok": true,
  "positions": [
    {
      "symbol": "EURUSD",
      "quantity": 10000,
      "averagePrice": 1.08452,
      "marketValue": 10845.20,
      "unrealizedPl": 12.50,
      "side": "buy",
      "ticket": 84920184,
      "magic": "6003429185732640769",
      "comment": "sov|mom_cnn|01"
    }
  ]
}
```

---

## 4. 64-Bit Magic Number Attribution Schema

Because brokers truncate or overwrite `ORDER_COMMENT`, strategy attribution is encoded strictly inside the 64-bit integer `ORDER_MAGIC`:

```text
+---------------------+-----------------------+---------------------+-----------------------+
|  Bits [63..48] (16) |   Bits [47..32] (16)  |  Bits [31..16] (16) |   Bits [15..0] (16)   |
+---------------------+-----------------------+---------------------+-----------------------+
|      System ID      |      Strategy ID      |   Timeframe (Min)   |   Instance/Run ID     |
|   (0x534F = "SO")   |  (CRC16 Strategy Hash)| (1, 5, 15, 60, etc) |    (Ticket / Nonce)   |
+---------------------+-----------------------+---------------------+-----------------------+
```

```typescript
// Shared codec in shared/lib/runtime/mt5_magic_codec.js
export const MagicCodec = {
  encode(systemId: number, strategyId: number, tfMinutes: number, instanceId: number): string {
    const sys = BigInt(systemId & 0xFFFF) << 48n;
    const strat = BigInt(strategyId & 0xFFFF) << 32n;
    const tf = BigInt(tfMinutes & 0xFFFF) << 16n;
    const inst = BigInt(instanceId & 0xFFFF);
    return (sys | strat | tf | inst).toString();
  },
  decode(magicStr: string) {
    const m = BigInt(magicStr);
    return {
      systemId: Number((m >> 48n) & 0xFFFFn),
      strategyId: Number((m >> 32n) & 0xFFFFn),
      tfMinutes: Number((m >> 16n) & 0xFFFFn),
      instanceId: Number(m & 0xFFFFn),
    };
  }
};
```

---

## 5. Headless Linux Wine & Container Deployment Blueprint

### 5.1 Wine & Virtual Display Configuration
- **Operating System**: Ubuntu 22.04 LTS on Proxmox VM (`hpdesk-1`).
- **Wine Environment**: WineHQ Staging 8.x/9.x, `WINEARCH=win64`, `WINEPREFIX=/opt/mt5/.wine`.
- **Virtual Framebuffer (`Xvfb`)**: Display `:99`, resolution `1024x768x16` (16-bit depth minimizes memory allocation and GDI CPU repaints).
- **Audio Nullification**: Disable Wine sound drivers in registry to eliminate CPU-intensive ALSA audio retry loops on order chimes:
  ```bash
  wine reg add "HKEY_CURRENT_USER\Software\Wine\Drivers" /v Audio /t REG_SZ /d "" /f
  ```
- **Font Fixes**: Install `corefonts` and enable `fontsmooth=rgb` via `winetricks` to prevent MT5 GUI crashes.

### 5.2 Portable Mode & Path Determinism
MT5 is launched strictly with the `/portable` flag:
```bash
wine /opt/mt5/terminal/terminal64.exe /portable /config:startup.ini
```
*Benefits*:
- All data remains inside `/opt/mt5/terminal/` instead of unpredictable Windows `%APPDATA%/MetaQuotes/Terminal/<32-char-hash>/`.
- Enables static volume mounting for `MQL5/Experts/` and `MQL5/Files/`.

### 5.3 Anti-Update Hardening
MetaQuotes pushes unannounced auto-updates that break Wine compatibility. Two independent locks prevent auto-updates:
1. **Directory Nullification**:
   ```bash
   rm -rf /opt/mt5/terminal/liveupdate
   touch /opt/mt5/terminal/liveupdate
   chmod 000 /opt/mt5/terminal/liveupdate
   ```
2. **DNS / Hosts Sinkhole**:
   Map `liveupdate.mql5.com` and `liveupdate.metaquotes.net` to `127.0.0.1` in `/etc/hosts`.

### 5.4 Docker Compose Architecture (`sv-mt5`)

```yaml
version: '3.8'

services:
  sv-mt5:
    build:
      context: ./infra/mt5
      dockerfile: Dockerfile
    container_name: sv-mt5
    restart: unless-stopped
    environment:
      - MT5_LOGIN=${MT5_LOGIN}
      - MT5_PASSWORD=${MT5_PASSWORD}
      - MT5_SERVER=${MT5_SERVER}
    volumes:
      - ./storage/mt5/terminal:/opt/mt5/terminal
      - ./tools/mt5:/opt/mt5/terminal/MQL5/Experts:ro
      - ./storage/data/mt5_ipc:/opt/mt5/terminal/MQL5/Files
    ports:
      - "127.0.0.1:8282:8282"
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2048M
    networks:
      - sovereign-net

  sv-gateway:
    build:
      context: .
      dockerfile: Dockerfile.gateway
    container_name: sv-gateway
    environment:
      - MT5_BRIDGE_HOST=sv-mt5
      - MT5_BRIDGE_PORT=8282
      - MT5_FILES_DIR=/app/storage/data/mt5_ipc
    volumes:
      - ./storage/data/mt5_ipc:/app/storage/data/mt5_ipc
    depends_on:
      sv-mt5:
        condition: service_healthy
    networks:
      - sovereign-net

networks:
  sovereign-net:
    driver: bridge
```

---

## 6. Target Documentation Mapping & Taxonomy

Documentation for the MT5 integration will be authored across four canonical documentation sections:

| Documentation Section | Target File Path | Contents to Add |
|---|---|---|
| **1. Architecture** | `docs/engineering/architecture/05_EXECUTION_SUB_POSITIONS_AND_RISK.md` | - `Mt5Adapter` architectural design and `BrokerAdapter` implementation.<br>- Node.js TCP Server <-> MQL5 Client NDJSON IPC protocol.<br>- 64-bit `ORDER_MAGIC` bitmasking schema and sub-position attribution. |
| **2. Specifications** | `docs/engineering/specs/technical_spec.md`<br>`docs/engineering/specs/capability_manifest.md` | - Wire schemas for `ORDER_SUBMIT`, `ORDER_RESULT`, `POSITIONS_GET`, `REGISTER`.<br>- Dynamic filling mode, price normalization, and lot sizing contracts.<br>- Manifest registration for MT5 execution and feed capabilities. |
| **3. Operations & Guides** | `docs/operational/guides/DEPLOYMENT.md`<br>`docs/operational/guides/role_based_hosting.md`<br>`docs/operational/guides/cli_quick_guide.md` | - Headless Linux Wine64 + Xvfb configuration guide on Proxmox VM (`hpdesk-1`).<br>- Docker compose service `sv-mt5` configuration, auto-update lock, and resource quotas.<br>- CLI operational verbs (`sovereign mt5 doctor`, `sovereign trade buy --broker mt5`). |
| **4. Subsystems** | `docs/sections/backend/README.md`<br>`docs/sections/execution/mt5-bridge/README.md` | - Gateway adapter exports and configuration variables.<br>- MQL5 EA compilation and installation instructions via `MetaEditor.exe`. |

---

## 7. Implementation Roadmap & Milestones

```text
[Phase 1: Gateway TCP Server & Adapter]
       |
       +---> Author `backend/gateway/src/adapters/mt5_adapter.ts` (Implements BrokerAdapter)
       +---> Export `Mt5Adapter` in `backend/gateway/src/adapters/index.ts`
       +---> Wire `broker === 'mt5'` in `backend/gateway/src/index.ts`
       |
[Phase 2: MQL5 Client EA Bridge]
       |
       +---> Create `tools/mt5/SovereignTradeBridge.mq5`
       +---> Implement `SocketConnect("127.0.0.1", 8282)` client in `OnTimer(50ms)`
       +---> Add dynamic symbol contract sizing, filling mode, and price normalization
       |
[Phase 3: Magic Number & Sub-Positions Ledger]
       |
       +---> Create `shared/lib/runtime/mt5_magic_codec.js`
       +---> Link fills and position updates to `shared/lib/runtime/sub_positions_ledger.js`
       +---> Expand `backend/cli/commands/trade/trade_mt5.js` with `buy`, `sell`, `positions`
       |
[Phase 4: Headless Wine Docker Recipe & CI Fixtures]
       |
       +---> Create `infra/mt5/Dockerfile` and `infra/mt5/entrypoint.sh`
       +---> Author mock TCP server fixture in `tests/fixtures/mock_mt5_bridge.js`
       +---> Verify 100% test integrity in `tests/scripts/operational/mt5_adapter.test.js`
       |
[Phase 5: Documentation Synchronization]
       |
       +---> Update Architecture, Specs, Operations, and Subsystem docs per Section 6
       +---> Validate with `docker run squidfunk/mkdocs-material build --strict`
```

---

## 8. Verification Checklist

- [ ] `npx tsc -p backend/gateway/tsconfig.json --noEmit` passes with 0 errors.
- [ ] Mock TCP unit tests in `tests/scripts/operational/mt5_adapter.test.js` pass keyless.
- [ ] Strict documentation check `docker run squidfunk/mkdocs-material build --strict` passes with 0 warnings.
- [ ] Safe sandbox: `LIVE_TRADING=false`, `SOVEREIGN_EXECUTION_AUTHORIZED=false`.
- [ ] Memory footprint under Wine strictly bounded within 2048MB container quota.
