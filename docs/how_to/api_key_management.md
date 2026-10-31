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
node backend/cli/sovereign_cli.js auth service create \
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
node backend/cli/sovereign_cli.js auth service list
```

### Revoke a Key

```bash
node backend/cli/sovereign_cli.js auth service revoke --id "analyst-alice"
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
   node backend/cli/sovereign_cli.js auth service create \
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
   node backend/cli/sovereign_cli.js auth service revoke --id "client-external-hedge"
   ```

