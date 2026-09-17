# Operational Guide: Broker & Gateway Setup

Quick operational reference for configuring and checking broker connections on live, paper, and containerized deployment nodes. For complete architecture and contributor details, see [docs/how_to/broker_gateway_setup.md](../../how_to/broker_gateway_setup.md).

---

## Quick Operational Commands

### MetaTrader 5 (MT5)
```bash
# Diagnostic check of terminal binary, port 8282, and vault profiles
node backend/cli/sovereign_cli.js mt5 doctor

# Manage encrypted credential profiles (propfirm, test, live)
node backend/cli/sovereign_cli.js mt5 profile list
node backend/cli/sovereign_cli.js mt5 profile add --slot test

# Launch terminal and start TCP bridge
node backend/cli/sovereign_cli.js mt5 connect --slot test

# Headless Docker container run
docker compose --profile paper-mt5 up -d sv-mt5
```

### Alpaca
```bash
# Verify Alpaca sandbox / production status
node backend/cli/sovereign_cli.js doctor alpaca
```

### Polymarket
```bash
# Verify CLOB wallet credentials and active collateral balances
node backend/cli/sovereign_cli.js doctor polymarket
node backend/cli/sovereign_cli.js polymarket positions
```

### Gate.io
```bash
# Verify Gate.io API permissions and server time sync
node backend/cli/sovereign_cli.js doctor gateio
```

### Supabase
```bash
# Test Supabase connection and public schema RLS policies
node backend/cli/sovereign_cli.js doctor supabase
```

---

## Operational Security Checklist

1. Never commit `.env` or `storage/secrets/` to git.
2. Ensure file permissions on `storage/secrets/mt5/vault.key` are `0o600`.
3. Use `doctor` checks before enabling any automated execution daemon.
4. Verify kill-switch accessibility: `node backend/cli/sovereign_cli.js kill-switch --action engage`.
