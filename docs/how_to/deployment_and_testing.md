# Contributor Guide: Testing & Deployment

This guide covers local test execution, mock testing patterns, Docker containerization, and Proxmox VM staging/production deployment.

---

## 1. Test Architecture & Execution

Sovereign uses Node.js's native test runner (`node:test`) and CMake CTest for native C++20 components. Jest and Mocha are not used.

### Zero-Key Test Rule
All test suites run **100% offline with zero external API credentials**:
- Market data tests read from recorded fixtures (`tests/fixtures/`, `storage/data/cache/last_fetch.json`).
- Prediction market tests run against the virtual paper ledger (`backend/gateway/src/paper_ledger.js`).
- Broker execution tests use in-process TCP/HTTP mock bridges (e.g., `tests/fixtures/mock_mt5_bridge.js`).

### Running Test Suites

```bash
# 1. Structure & Hygiene Tests (File contracts, linters, import validation)
npm run test:structure
node scripts/dev/check_hygiene.js

# 2. Market Data & Validation Tests
npm run test:data

# 3. Native C++20 Core & Risk Engine (34 CTests)
npm run test:core

# 4. Backend REST & WebSocket API Contracts
npm run test:api

# 5. Dedicated MT5 Integration Suite
node tests/run_node_tests.js tests/scripts/integration/mt5/mt5_profile_vault.test.js
node tests/run_node_tests.js tests/scripts/integration/mt5/mt5_bridge_lifecycle.test.js
node tests/run_node_tests.js tests/scripts/integration/mt5/mt5_execution_pipeline.test.js
node tests/run_node_tests.js tests/scripts/integration/mt5/mt5_cli_routing.test.js

# 6. Run Complete Test Suite
npm test
```

---

## 2. Mocking & Integration Patterns

When writing tests for external gateways or bridges:
- **No Shallow Mocks**: Do not write tests that test static dummy objects or pass hardcoded fixtures into pure renderers without exercising real subsystems.
- **Real Vault & Disk Execution**: Use `fs.mkdtempSync` for isolated disk storage, real AES-256-GCM encryption, and real serialization roundtrips.
- **In-Memory Network Servers**: Spin up real local loopback servers (e.g. `net.Server` on high ephemeral ports) and connect real adapters to verify protocol framing and disconnect handling.

---

## 3. Docker Deployment

Sovereign provides multi-container orchestration in `infra/docker/docker-compose.yml`.

### Architecture & Service Profiles

| Service | Container | Profile | Purpose |
|---|---|---|---|
| `sv-core` | Node API + Engine | `default` | Private Express REST API, backfill daemon, web bridge. |
| `sv-dashboard` | Vite Nginx | `default` | React 19 web frontend. |
| `sv-mt5` | Wine + Xvfb Headless | `paper-mt5` | Headless MetaTrader 5 terminal executing `SovereignTradeBridge.mq5`. |

### Starting Services

```bash
# Launch core API and dashboard
docker compose up -d

# Launch with headless MT5 Wine service
docker compose --profile paper-mt5 up -d
```

### Docker Host Gateway Communication
The MT5 container accesses the host Node.js bridge server on port 8282 using host-gateway routing:
```yaml
services:
  sv-mt5:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

---

## 4. Proxmox VM Deployment (`hpdesk-1`)

For always-on paper and production execution, Sovereign runs on an isolated Ubuntu Proxmox VM:

### Networking & Access
- **Tailscale Mesh**: The VM communicates with developer workstations over a secure Tailscale VPN mesh.
- **Port Exposure**: Web dashboard and API bind to loopback (`127.0.0.1`) or private Tailscale interfaces.

### Systemd Service Management
Key background daemons managed via systemd:
- `sovereign-api.service`: Express API and WebSocket bridge.
- `sovereign-backfill.service`: Scheduled market data synchronization.
- `sovereign-portfolio-monitor.service`: Real-time drawdown and margin health monitor.

```bash
# Check service status on production host
sudo systemctl status sovereign-api
sudo journalctl -u sovereign-api -f
```
