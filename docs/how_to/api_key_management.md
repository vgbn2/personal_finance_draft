# Personal & Service API Key Management

Sovereign provides role-based and capability-scoped authentication for team members, client applications, and AI integrations (MCP).

Tokens are hashed using `scrypt` with a random 16-byte hex salt and verified using constant-time comparisons (`crypto.timingSafeEqual`) against `storage/runtime/service_principals.json`.

---

## 1. Capability Matrix

| Capability | Scope / Access Level |
|---|---|
| `status.read` | View node health, deployment profiles, and service uptime. |
| `data.read` | Read market timeseries, historical bars, and cached fixtures. |
| `research.read` | Inspect strategy configurations, backtest logs, and tear sheets. |
| `research.run` | Dispatch backtest simulations, parameter sweeps, and Monte Carlo runs. |
| `paper.operate` | Place and cancel virtual paper orders, inspect ledger balances. |
| `live.execute` | Authorize live broker orders (restricted to owner roles with physical 2FA). |

---

## 2. Provisioning Keys via CLI

### Create a Service or Personal Token

Run the built-in sovereign CLI command:

```bash
node frontend/cli-tui/sovereign_cli.js auth service create \
  --id "analyst-alice" \
  --capabilities "status.read,data.read,research.read,research.run"
```

Output:
```json
{
  "ok": true,
  "id": "analyst-alice",
  "token": "sv_live_4f8a9b2c...",
  "capabilities": ["status.read", "data.read", "research.read", "research.run"]
}
```

*Note: The plaintext token is printed exactly once. Only its salted scrypt digest is persisted in `storage/runtime/service_principals.json`.*

### List Active Principals

```bash
node frontend/cli-tui/sovereign_cli.js auth service list
```

### Revoke a Key

```bash
node frontend/cli-tui/sovereign_cli.js auth service revoke --id "analyst-alice"
```

---

## 3. Authenticating Requests

### REST API

Pass the token via the `x-sovereign-token` header or the standard `Authorization: Bearer` header:

```bash
# Using x-sovereign-token
curl -H "x-sovereign-token: sv_live_4f8a9b2c..." http://127.0.0.1:8787/api/status

# Using Bearer token
curl -H "Authorization: Bearer sv_live_4f8a9b2c..." http://127.0.0.1:8787/api/research/strategies
```

### WebSocket API Bridge

Pass the token in the socket.io handshake payload:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://127.0.0.1:8787', {
  auth: {
    token: 'sv_live_4f8a9b2c...'
  }
});
```

---

## 4. Outside & Non-Configured Users (External Clients / Teammates)

When outside users connect from external networks (non-loopback IP, e.g. remote workstation, mobile, or cloud client):

### Security Boundary: Anti-Spoofing & Zero Loopback Auto-Trust
- Local loopback auto-trust (`127.0.0.1`) is **strictly disabled** for external callers.
- Reverse proxy headers (`X-Forwarded-For`, `X-Real-IP`) are screened in `backend/api/server/services/access_control.js`. If an outside caller connects through an edge proxy, they receive an anonymous principal (`source: "none"` or `"invalid_credentials"`) with **zero capabilities** unless an authentic token is provided.

### Onboarding Paths for Outside Users

#### Path A: Interactive Web Login (Human Users / Dashboard)
1. Outside users sign up / log in through the web dashboard using Supabase Auth (email or OAuth).
2. Upon login, the user receives a Supabase JWT bearer token.
3. In `access_control.js`, `resolveHumanRole()` assigns any unconfigured external user the default safe role `viewer`:
   - Role `viewer` grants read-only capabilities: `status.read`, `data.read`, `research.read`.
   - External users cannot trigger paper trades or live execution without explicit operator escalation.
4. To grant elevated roles to outside users, the host operator sets the user ID in `SOVEREIGN_USER_ROLE_MAP`:
   ```bash
   SOVEREIGN_USER_ROLE_MAP='{"usr_abc123": "researcher", "usr_def456": "operator"}'
   ```

#### Path B: Headless External Client / API Integration
For outside automated scripts, remote AI copilots, or external third-party integrations:
1. The host operator provisions a personal API token via CLI:
   ```bash
   node frontend/cli-tui/sovereign_cli.js auth service create \
     --id "client-external-hedge" \
     --capabilities "status.read,data.read,research.read"
   ```
2. The generated token (`sv_live_...`) is securely transferred out-of-band to the external user.
3. The outside user includes the token in their HTTP client or script:
   ```bash
   curl -H "x-sovereign-token: sv_live_..." https://sovereign.yourdomain.com/api/status
   ```
4. If an external token is compromised, revoke it immediately without restarting services:
   ```bash
   node frontend/cli-tui/sovereign_cli.js auth service revoke --id "client-external-hedge"
   ```

---

## 5. Bring-Your-Own-Key (BYOK) Architecture: Data Keys vs Interactive Keys

To enable outside researchers, external teammates, and transient clients to utilize their own provider quotas and execute trades securely, Sovereign implements the **Bring-Your-Own-Key (BYOK)** model.

```text
               ┌────────────────────────────────────────────────────────┐
               │ Outside Client / Dashboard / Headless Integrator       │
               └───────────┬────────────────────────────────┬───────────┘
                           │                                │
                 Ephemeral Data Key                Interactive Execution Key
             (Alpaca Data, Binance, etc.)      (Alpaca Secret, Polymarket Key)
                           │                                │
                           ▼                                ▼
               ┌───────────────────────┐        ┌───────────────────────┐
               │ HTTP / WebSocket Auth │        │ EphemeralKeyVault     │
               │ Handshake Payload     │        │ In-Memory RAM Only    │
               │ (Connection Scoped)   │        │ (Zero Disk / SQLite)  │
               └───────────┬───────────┘        └───────────┬───────────┘
                           │                                │
                           ▼                                ▼
               Provider Quota Streaming         Gated Broker Submission
```

### Architectural Segregation & Guarantees

| Key Category | Examples | Transport & Ingestion | Persistence & Lifetime | Security Invariant |
|---|---|---|---|---|
| **Data Keys** (Read-Only) | Alpaca Data Key, Binance Read Key, Finnhub, Gate.io | Sent in WebSocket connection handshake (`auth.dataKey`) or HTTP header (`x-provider-key`) | Connection lifetime only; discarded immediately upon socket close | Cannot place orders or sign contracts; rate-limits charged to user's quota |
| **Interactive Keys** (Execution/Signing) | Alpaca Live/Paper Secret, Polymarket Private Key, MT5 Credentials | Client-side AES-256-GCM encrypted vault or in-memory `EphemeralKeyVault` | Held strictly in volatile memory; auto-evicted after 1 hour of inactivity | **Zero-Disk Invariant**: Never written to `.env`, SQLite, logs, or disk caches |

### Ephemeral Vault API Reference (`EphemeralKeyVault`)

The in-memory vault (`backend/api/server/services/ephemeral_key_vault.js`) manages transient credentials:

- `vault.register(sessionId, credentials, { ttlMs })`: Registers session keys in memory.
- `vault.get(sessionId, keyName)`: Retrieves a key and extends session TTL.
- `vault.revoke(sessionId)`: Overwrites memory and immediately evicts credentials.
- `vault.getTelemetry()`: Emits health metrics with all keys fully masked (`ABCD...WXYZ`).


