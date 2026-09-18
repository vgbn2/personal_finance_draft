# Sovereign MetaTrader 5 (MT5) Trade Bridge

Technical documentation for the Sovereign MetaTrader 5 execution bridge, native MQL5 reverse-TCP socket interface, wire protocol, fail-closed security preflight, and headless Wine automation.

---

## 1. Architecture Overview

Sovereign decouples quantitative strategy research and order orchestration from MetaTrader 5 terminal execution through an out-of-process, reverse-TCP socket architecture.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      Sovereign Execution Engine                         │
│  backend/cli/commands/trade/trade.js  │  backend/gateway/src/index.ts   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                        [Pre-Trade Risk & Policy Gate]
                        - MFA PIN Gate (verifyPin)
                        - Global Kill Switch (storage/data/kill_switch.json)
                        - Native C++ Risk Engine (Drawdown & Exposure checks)
                        - MagicCodec Strategy Attribution
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                    Mt5Adapter (TCP Socket Server)                       │
│  backend/gateway/src/adapters/mt5_adapter.ts                            │
│  Listening on 127.0.0.1:8282 (MT5_BRIDGE_PORT)                          │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │
                   Reverse-TCP Stream (JSON Lines \n)
                   Inbound connection from EA client
                                     │
┌────────────────────────────────────┴────────────────────────────────────┐
│                  MetaTrader 5 Terminal (Wine / Windows)                 │
│  tools/mt5/SovereignTradeBridge.mq5 (Expert Advisor)                    │
│  - Native MQL5 Client Sockets (SocketCreate, SocketConnect)             │
│  - 50ms High-Resolution Timer Polling (EventSetMillisecondTimer)        │
│  - Dynamic Filling Detection (IOC / FOK / RETURN)                       │
│  - ECN 2-Step Market Order + SL/TP Deal Modification                    │
│  - Zero Windows DLL Imports (AllowDllImport=false)                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Design Tenets

1. **Reverse-TCP Client Socket**: MT5 operates as a TCP *client* connecting outbound to the Sovereign Gateway TCP *server* on `127.0.0.1:8282`. This eliminates Windows firewall bind restrictions, port collision issues in multi-terminal setups, and the need for listening socket privileges.
2. **Zero DLL Dependencies**: The bridge uses MQL5 native standard library socket primitives (`SocketCreate`, `SocketConnect`, `SocketSend`, `SocketRead`, `SocketIsReadable`). External C/C++ DLL imports (`AllowDllImport=false`) are strictly avoided, ensuring compatibility with prop-firm compliance rules and locked-down institutional accounts.
3. **Framing & Transport**: Communication occurs over plain TCP using newline-delimited (`\n`) UTF-8 JSON payloads with correlation nonces (`nonce`).
4. **Resilient Reconnection**: The EA polls connectivity every timer cycle (default 50ms) and attempts reconnection every 1000ms if the connection drops, buffering incomplete chunks across socket reads.

---

## 2. Installation & Compilation

Sovereign provides automated multi-root discovery and compilation for both native Windows and Linux/Wine environments via `backend/scripts/verification/mt5_bridge_install.js`.

### Multi-Root Terminal Discovery

The installation engine searches the following locations in order:
1. `MT5_TERMINAL_ID` within `APPDATA/MetaQuotes/Terminal/<ID>` (Native Windows).
2. Wine user directories: `~/.mt5/drive_c/users/*/AppData/Roaming/MetaQuotes/Terminal/*/MQL5`.
3. Configured terminal path in encrypted profile store (`shared/lib/profiles/mt5_profiles.js`).
4. Default Wine Program Files: `~/.mt5/drive_c/Program Files/MetaTrader 5/MQL5`.

### Automated CLI Deployment

To install and compile both the Trade Bridge EA and the Export Script:

```bash
# Via Sovereign CLI
sovereign mt5 bridge

# Or directly via Node.js script
node backend/scripts/verification/mt5_bridge_install.js
```

The script performs the following:
- Copies `tools/mt5/SovereignExport.mq5` to `<TerminalRoot>/MQL5/Scripts/SovereignExport.mq5`.
- Copies `tools/mt5/SovereignTradeBridge.mq5` to `<TerminalRoot>/MQL5/Experts/SovereignTradeBridge.mq5`.
- Detects `MetaEditor64.exe` (native or Wine).
- Spawns `/compile:<target>` and verifies generated `.ex5` binaries and timestamps.

### Chart Attachment

1. Launch MetaTrader 5 (`sovereign mt5 connect --slot propfirm` or GUI).
2. Ensure **Algo Trading** is enabled in the top toolbar.
3. In the MT5 **Navigator** panel, expand **Expert Advisors**.
4. Drag `SovereignTradeBridge` onto any liquid chart (e.g. `EURUSD`).
5. Configure input parameters in the popup dialog:
   - `InpHost` (default: `"127.0.0.1"`): Target IP of Sovereign gateway server.
   - `InpPort` (default: `8282`): Target port (`MT5_BRIDGE_PORT`).
   - `InpTimerMs` (default: `50`): High-resolution polling frequency in milliseconds.
   - `InpMaxLot` (default: `2.0`): Hard cap on maximum lot size per individual trade.
6. Verify successful registration: MT5 **Experts** log should display:
   ```text
   [SOVEREIGN] Socket connected and registered with gateway at 127.0.0.1:8282
   ```

---

## 3. Fail-Closed Security & Preflight

Every order submitted through the MT5 bridge passes through multiple defensive security and risk layers before reaching the terminal socket.

```text
Order Intent (CLI / Strategy Bot)
               │
               ▼
   [1. Runtime Authorization] ── Fail ──► Abort (403 Unauthorized)
   - verifyPin(SOVEREIGN_TRADE_PIN)
   - requireAuth('live trading')
               │
               ▼
   [2. Global Kill Switch] ───── Fail ──► Reject ("GLOBAL KILL SWITCH ENGAGED")
   - storage/data/kill_switch.json
   - sovereign kill-switch status check
               │
               ▼
   [3. C++ Risk Engine Bridge] ─ Fail ──► Reject ("CRITICAL: Risk Rejection")
   - Max Drawdown Limit (MAX_ALLOWED_DRAWDOWN, default: 0.30)
   - Position Concentration Limit
   - Account Margin / Equity Validation
               │
               ▼
   [4. Magic Codec Packing] ──── Pass ──► Pack 64-bit uint64 Strategy Identifier
   - shared/lib/runtime/mt5_magic_codec.js
               │
               ▼
   [5. Mt5Adapter Socket Dispatch] ────► Transmit ORDER_SUBMIT over TCP
```

### Trade PIN MFA Verification
Live execution (`--live`) enforces dual-check authentication:
- In interactive sessions, the user is prompted for the Trade PIN.
- In headless/automated mode, `SOVEREIGN_TRADE_PIN` must be present and verified using constant-time hash comparison (`verifyPin`). If unset in unattended runs, execution immediately **fails closed**.
- The Trade PIN is stripped from child process environment arguments to prevent exposure in process tables (`/proc`).

### Global Kill Switch
The execution gateway checks the native risk engine status (`kill-switch status`) against `storage/data/kill_switch.json`. If the kill switch is engaged, all outbound orders are immediately rejected before touching the socket.

### C++ Native Risk Checks
Orders are checked against the compiled C++ analytics engine (`backend/core/`):
- Notional value: `referencePrice * quantity`.
- Equity & Margin: Current equity queried from `getPortfolioBalance()`.
- Drawdown bounds: `CURRENT_PORTFOLIO_DRAWDOWN` must not exceed `MAX_ALLOWED_DRAWDOWN` (default: `0.30`).

### Magic Codec Strategy Attribution (`mt5_magic_codec.js`)
Sovereign embeds routing metadata into MT5's 64-bit `ulong` order magic field:

| Bit Range | Width | Field | Description |
|---|---|---|---|
| `[63..48]` | 16 bits | **System Domain ID** | Constant `0x534F` (ASCII `"SO"`). Kept `< 0x8000` so sign bit remains clear in MQL5 logs. |
| `[47..32]` | 16 bits | **Strategy ID Hash** | CRC-16/IBM hash of strategy string (e.g. `"trend_follow"`, `"mean_reversion"`). |
| `[31..16]` | 16 bits | **Timeframe** | Resolution in minutes (e.g., `1`, `5`, `15`, `60`, `240`, `1440`). |
| `[15..0]` | 16 bits | **Instance / Ticket ID** | Sub-position ticket instance counter. |

---

## 4. JSON Wire Protocol

All frames are single-line JSON strings terminated by `\n`.

### 4.1 Registration Handshake

Triggered immediately when the EA establishes a socket connection.

#### Request (EA -> Gateway)
```json
{
  "type": "REGISTER",
  "terminalId": "mt5_665544",
  "account": 665544,
  "server": "MetaQuotes-Demo",
  "company": "MetaQuotes Software Corp.",
  "marginMode": "RETAIL_HEDGING",
  "currency": "USD",
  "leverage": 100,
  "tradeAllowed": true
}
```

#### Response (Gateway -> EA)
```json
{
  "type": "REGISTER_ACK",
  "ok": true
}
```

---

### 4.2 Account Balance Query

#### Request (Gateway -> EA)
```json
{
  "type": "ACCOUNT_GET",
  "nonce": "cmd_1726650000000_a1b2c"
}
```

#### Response (EA -> Gateway)
```json
{
  "type": "ACCOUNT_RESULT",
  "nonce": "cmd_1726650000000_a1b2c",
  "ok": true,
  "balance": 50000.00,
  "equity": 50010.50,
  "freeMargin": 49500.25
}
```

---

### 4.3 Positions Query

#### Request (Gateway -> EA)
```json
{
  "type": "POSITIONS_GET",
  "nonce": "cmd_1726650000001_d3e4f"
}
```

#### Response (EA -> Gateway)
```json
{
  "type": "POSITIONS_RESULT",
  "nonce": "cmd_1726650000001_d3e4f",
  "ok": true,
  "positions": [
    {
      "ticket": 10203040,
      "symbol": "EURUSD",
      "side": "buy",
      "volume": 0.10,
      "openPrice": 1.08500,
      "currentPrice": 1.08620,
      "unrealizedPl": 12.00,
      "magic": "6003254425686016"
    }
  ]
}
```

---

### 4.4 Quote Query

#### Request (Gateway -> EA)
```json
{
  "type": "QUOTE_GET",
  "nonce": "cmd_1726650000002_g5h6i",
  "symbol": "EURUSD"
}
```

#### Response (EA -> Gateway)
```json
{
  "type": "QUOTE_RESULT",
  "nonce": "cmd_1726650000002_g5h6i",
  "ok": true,
  "price": 1.08625
}
```

---

### 4.5 Order Submission & ECN Execution

#### Request (Gateway -> EA)
```json
{
  "type": "ORDER_SUBMIT",
  "nonce": "cmd_1726650000003_j7k8l",
  "symbol": "EURUSD",
  "side": "buy",
  "orderType": "market",
  "quantity": 0.10,
  "price": 1.08625,
  "sl": 1.08100,
  "tp": 1.09500,
  "magic": "6003254425686016",
  "comment": "sov|trend_follow"
}
```

#### MQL5 Execution Logic
1. **Dynamic Filling Policy**: Inspects `SYMBOL_FILLING_MODE`:
   - If `SYMBOL_FILLING_IOC` is supported, sets `req.type_filling = ORDER_FILLING_IOC`.
   - Else if `SYMBOL_FILLING_FOK` is supported, sets `ORDER_FILLING_FOK`.
   - Otherwise falls back to `ORDER_FILLING_RETURN`.
2. **Contract Sizing & Lot Normalization**:
   - Converts units to lots: `lots = quantity / contractSize` if `quantity >= contractSize`.
   - Clamps to step size: `MathFloor(lots / volumeStep) * volumeStep`.
   - Bounds between `SYMBOL_VOLUME_MIN` and `SYMBOL_VOLUME_MAX`.
   - Enforces hard ceiling `InpMaxLot` (default: 2.0 lots).
3. **ECN 2-Step Market Order Execution**:
   - On Market Execution accounts (`SYMBOL_TRADE_EXECUTION_MARKET`), MT5 brokers reject market orders containing SL/TP in the initial `TRADE_ACTION_DEAL` request.
   - The EA submits the deal without SL/TP.
   - Once filled, the EA immediately issues a secondary `TRADE_ACTION_SLTP` request on the returned position ticket.

#### Response (EA -> Gateway)
```json
{
  "type": "ORDER_RESULT",
  "nonce": "cmd_1726650000003_j7k8l",
  "ok": true,
  "ticket": 10203041,
  "deal": 5040302,
  "symbol": "EURUSD",
  "volume": 0.10,
  "fillPrice": 1.08625,
  "retcode": 10009,
  "timestamp": "2026.09.18 14:30:00"
}
```

---

### 4.6 Order Cancellation

#### Request (Gateway -> EA)
```json
{
  "type": "ORDER_CANCEL",
  "nonce": "cmd_1726650000004_m9n0o",
  "ticket": 10203041
}
```

#### Response (EA -> Gateway)
```json
{
  "type": "CANCEL_RESULT",
  "nonce": "cmd_1726650000004_m9n0o",
  "ok": true,
  "retcode": 10009
}
```

---

## 5. Wine & Headless Operations

Sovereign operates MetaTrader 5 inside minimal, headless Wine environments on Linux (Proxmox VMs, Ubuntu containers, or bare-metal servers).

### Wine Emulation Quirks & Mitigations

1. **WebRequest Whitelist Error 4014**:
   - Standard MQL5 `WebRequest()` calls fail under Wine unless target URLs are manually configured in the graphical MT5 settings dialog (`Tools > Options > Expert Advisors`). Under headless Wine, these GUI settings frequently fail to persist.
   - **Mitigation**: Sovereign's Reverse-TCP native socket architecture completely bypasses `WebRequest()`, eliminating error 4014.
2. **Winsock Non-Blocking Connect**:
   - Wine's Winsock emulation handles non-blocking TCP handshakes differently than native Windows kernel sockets.
   - **Mitigation**: `SovereignTradeBridge.mq5` sets explicit socket timeouts (`SocketTimeouts(g_socket, 50, 50)`) and a 500ms connection window (`SocketConnect(g_socket, InpHost, InpPort, 500)`).
3. **Millisecond Timer Fallback**:
   - In lightweight container environments lacking multimedia timer interrupts (`timeSetEvent`), `EventSetMillisecondTimer()` can return error 4001.
   - **Mitigation**: `SovereignTradeBridge.mq5` catches millisecond timer initialization failures and gracefully falls back to `EventSetTimer(1)` (1-second tick loop) while continuing to poll on incoming tick events (`OnTick`).
4. **Wine Audio Driver Stubbing**:
   - Prevents Wine ALSA/PulseAudio warnings from polluting standard error streams:
   ```bash
   wine reg add "HKEY_CURRENT_USER\Software\Wine\Drivers" /v Audio /t REG_SZ /d "" /f
   ```

### Xvfb Virtual Framebuffer Setup

To run MT5 headlessly without an X server or GPU:

```bash
# Start virtual display on :99
Xvfb :99 -screen 0 1024x768x16 -nolisten tcp -ac +extension GLX &
export DISPLAY=:99
```

### Headless `startup.ini` Automation & Hygiene

When launching via `infra/mt5/entrypoint.sh` or `sovereign mt5 connect`, an ephemeral `startup.ini` is generated:

```ini
[Common]
Login=665544
Password=EncryptedPasswordRetrievedFromVault
Server=MetaQuotes-Demo
CertPath=
AutoConfiguration=true
EnableNews=false

[Charts]
MaxBars=1000
PrintColor=false

[Experts]
AllowDllImport=false
Enabled=true
Account=true
Profile=true
```

#### Secret Hygiene Protocol
- The INI file is written with strict `0600` permissions.
- In-memory Node.js heap buffers holding decrypted passwords are wiped immediately after the child process is spawned.
- An asynchronous background timer overwrites the INI file with pseudo-random bytes and unlinks it within 2 to 5 seconds of process startup.

#### Anti-Update Lock
MetaQuotes background autoupdates can corrupt running headless instances. The entrypoint creates an immutable dummy file:
```bash
rm -rf /opt/mt5/terminal/liveupdate
touch /opt/mt5/terminal/liveupdate
chmod 000 /opt/mt5/terminal/liveupdate
```

---

## 6. CLI Commands & Verification

### Profile Management

Manage encrypted account credentials stored in `storage/secrets/mt5/profiles.json` (AES-256-GCM):

```bash
# List configured accounts
sovereign mt5 profile list

# Add or edit an account profile (interactive wizard)
sovereign mt5 profile add

# Run diagnostics on terminal, profile, and bridge installation
sovereign mt5 doctor --slot propfirm

# Launch MT5 terminal attached to configured profile
sovereign mt5 connect --slot propfirm
```

### Live Trade Desk Operations

All trading commands support `--broker mt5` to route orders through the MT5 Reverse-TCP bridge:

```bash
# Query account balance, equity, and free margin
sovereign trade balance --broker mt5

# Output balance as structured JSON
sovereign trade balance --broker mt5 --json

# List active MT5 positions and strategy attribution
sovereign trade positions --broker mt5

# Fetch live market quote for a symbol
sovereign trade quote EURUSD --broker mt5

# Submit market BUY order (0.10 lots / 10,000 units) in dry-run mode
sovereign trade buy EURUSD 0.10 market --broker mt5

# Submit LIVE market BUY order (prompts for Trade PIN MFA)
sovereign trade buy EURUSD 0.10 market --broker mt5 --live

# Submit LIVE limit SELL order with strategy attribution
sovereign trade sell EURUSD 0.10 limit 1.0950 --broker mt5 --live --strategy trend_follow

# Cancel open order ticket
sovereign trade cancel 10203041 --broker mt5
```

---

## 7. Problems Encountered & Architecture Hardening

During end-to-end integration under Linux/Wine, several architectural edge cases and emulation quirks were isolated and systematically resolved.

### 7.1 Wine Dual-Root Terminal Layout Discrepancy
- **Root Cause**: When MetaTrader 5 runs under Wine in non-portable mode, it stores runtime data and loads Expert Advisors from `~/.mt5/drive_c/users/<user>/AppData/Roaming/MetaQuotes/Terminal/<32-hex-hash>/MQL5/Experts/`, mapped via `origin.txt` back to `C:\Program Files\MetaTrader 5`. Compiling `.ex5` files solely into `Program Files/MetaTrader 5/MQL5/Experts/` resulted in MT5 running stale EA binaries from the `AppData` hash root.
- **Resolution**: `backend/scripts/verification/mt5_bridge_install.js` was enhanced with `resolveTerminalRoots()` to dynamically discover all terminal instances across both `AppData/Roaming` and `Program Files`, copying source files and executing `MetaEditor64.exe /compile:<target>` across every discovered root with timestamp (`mtime`) validation.

### 7.2 MQL5 Socket Error 5273 (`ERR_NETSOCKET_IO_ERROR`) & Winsock Emulation
MQL5 socket error `5273` is a generic network I/O fault that maps to three distinct failure modes under Wine:

1. **Offline Gateway Listener (`WSAECONNREFUSED`)**:
   - *Symptom*: When the Sovereign CLI is idle, no Node.js process is listening on `127.0.0.1:8282`. MT5 logged `[SOVEREIGN] SocketConnect failed, err=5273` or `SocketSend error, err=5273` repeatedly.
   - *Resolution*: Added 5000ms log throttling in `SovereignTradeBridge.mq5` (`g_lastErrorLogTime`) and moved connection confirmation logging inside `SendRegistration()` conditioned on successful transmission.
2. **Non-Blocking Read Timeouts vs Fatal Socket Closure**:
   - *Symptom*: Wine Winsock returns `-1` (err `5273`) on non-blocking reads when no data is ready. The EA previously tore down the socket on any `read <= 0`, causing instant disconnects and thrashing.
   - *Resolution*: Added `SocketIsReadable(g_socket)` guard. `SocketRead()` is only called when `readable > 0` with a bounded buffer (`MathMin(1024, readable)`). Fatal socket closure is only triggered if `readable > 0` but `read <= 0` (genuine EOF / remote peer shutdown).
3. **Dead Connection Retention after CLI Teardown**:
   - *Symptom*: After an on-demand CLI command finished and closed port 8282, MT5 retained `g_socket != INVALID_HANDLE` without detecting the remote socket shutdown, preventing subsequent CLI commands from reconnecting.
   - *Resolution*: Added a 2000ms heartbeat `{"type":"PING"}` in `OnTimer()`. When the port is closed, `SocketSend` fails immediately on the next heartbeat, invokes `CloseSocket()`, and returns the EA to the active `ConnectBridge()` retry loop.

### 7.3 Gateway On-Demand Connection Timeout Tuning
- **Root Cause**: The default `connectTimeoutMs` in `backend/gateway/src/adapters/mt5_adapter.ts` was 4000ms. In virtualized or containerized Wine environments with 1000ms timer granularity, the connection handshake occasionally required 4-5s on initial spawn.
- **Resolution**: Increased default `connectTimeoutMs` to 10000ms (configurable via `MT5_CONNECT_TIMEOUT_MS`).

### 7.4 Compiler Warning 43 (`uint` to `int` Truncation)
- **Root Cause**: MQL5 `SocketIsReadable()` returns a `uint`, which generated a compiler warning when stored in a signed `int`.
- **Resolution**: Updated `readable` and `toRead` buffer sizing variables to explicit `uint` types.

---

## 8. Verification & Troubleshooting Runbook

| Symptom | Diagnostic Step | Root Cause & Resolution |
|---|---|---|
| `MT5 terminal bridge is not connected` | Check if MT5 is running and EA is attached to an active chart. | The TCP server on `127.0.0.1:8282` is active but has not received a `REGISTER` message from the EA. Verify Algo Trading is enabled and `InpPort=8282` matches `MT5_BRIDGE_PORT`. |
| `[SOVEREIGN] SocketSend error, err=5273` | Normal during CLI idle periods. | Gateway binds port 8282 on-demand during CLI runs. When CLI exits, EA logs throttled retry messages every 5s until next command executes. |
| `WebRequest error 4014` | Verify you are using `SovereignTradeBridge.mq5`. | Older HTTP-based bridges required URL whitelisting. Upgrade to the Reverse-TCP bridge which uses native sockets. |
| `Invalid Trade PIN. Live execution blocked` | Verify `SOVEREIGN_TRADE_PIN` in `.env`. | Fail-Closed security prevented unauthenticated trade execution. Check PIN configuration or provide PIN at the interactive prompt. |
| `GLOBAL KILL SWITCH ENGAGED` | Inspect `storage/data/kill_switch.json`. | Risk engine has tripped the global kill switch. Reset via `sovereign kill-switch reset` only after reviewing system state. |
| `Market execution SL/TP rejected (retcode 10016)` | Check broker execution mode in MT5 symbol specs. | ECN brokers require 2-step execution. Verify that `SovereignTradeBridge.mq5` is up to date with post-fill `TRADE_ACTION_SLTP` modification. |
