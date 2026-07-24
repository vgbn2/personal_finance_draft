# Remote CLI Client

The remote client is a read-only view of the central host. The central host remains the only market-data
poller and canonical writer. Client startup creates an SSH local port forward and probes the authenticated
API; it does not run ingestion, backfills, bot cycles, orders, host restarts, or database synchronization.

## Central host preparation

Generate `.env.central` with `npm run host:prepare-central-env`. This creates distinct
`SOVEREIGN_API_TOKEN` and `SOVEREIGN_CLIENT_TOKEN` values. Keep the API bound to loopback or an approved
private address. Put only the client-token value in an owner-readable file on each client.

## Linux

```bash
bash infra/client/linux/install.sh install \
  --host central.example \
  --user sovereign \
  --identity-file "$HOME/.ssh/id_ed25519" \
  --token-file "$HOME/.config/sovereign-client-token"
```

The installer creates a `systemd --user` service. It starts the connector at login and installs an
on-demand launcher. Add `--auto-open` only for a dedicated monitor; the default is no CLI window.

Lifecycle commands:

```bash
bash infra/client/linux/install.sh status
bash infra/client/linux/install.sh logs
bash infra/client/linux/install.sh restart
bash infra/client/linux/install.sh open
bash infra/client/linux/install.sh uninstall
```

## Windows

Run from PowerShell as the intended desktop user:

```powershell
.\infra\client\windows\Install-SovereignClient.ps1 `
  -Action Install `
  -CentralHost central.example `
  -CentralUser sovereign `
  -IdentityFile "$HOME\.ssh\id_ed25519" `
  -TokenFile "$HOME\.config\sovereign-client-token"
```

This registers a hidden per-user scheduled task. Use `-AutoOpen` to opt into one minimized CLI window per
logon after the authenticated API probe succeeds.

```powershell
.\infra\client\windows\Install-SovereignClient.ps1 -Action Status
.\infra\client\windows\Install-SovereignClient.ps1 -Action Logs
.\infra\client\windows\Install-SovereignClient.ps1 -Action Restart
.\infra\client\windows\Install-SovereignClient.ps1 -Action Open
.\infra\client\windows\Install-SovereignClient.ps1 -Action Uninstall
```

## CLI views

The tunnel defaults to `http://127.0.0.1:8788`. Configuration lives in
`~/.config/sovereign/client.json` on Linux and `%APPDATA%\Sovereign\client.json` on Windows.

```bash
sovereign remote status
sovereign remote status --watch
sovereign remote bias BTCUSDT
sovereign remote data
sovereign remote universe
sovereign remote signal
sovereign remote scorecard
sovereign remote bot
```

Expected connector states are `connecting`, `connected`, `host_unavailable`, `reconnecting`, and `stopped`.
An unavailable host leaves the connector retrying silently. The client cannot restart or wake the host.
