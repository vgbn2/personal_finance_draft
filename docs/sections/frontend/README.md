# Frontend Domain Structure Map

Canonical structural map for the `Frontend/` subsystem of the Sovereign Trading Platform.

## Overview And Subsystems

The `Frontend/` directory contains the React/Vite web application that serves as the visual trading cockpit, market monitor, and strategy backtesting UI.

```text
Frontend/
└── dashboard/
    ├── src/
    │   ├── components/   # React UI panels (BacktestPanel, StrategyPanel, etc.)
    │   ├── lib/          # API & Socket.IO client connectors
    │   ├── App.tsx       # Root layout & dashboard routing
    │   └── main.tsx      # React entrypoint
    ├── dist/             # Built production bundle (served by backend/api/app.js)
    ├── package.json      # Frontend package configuration & dependencies
    └── vite.config.ts    # Vite build & bundle configuration
```

## Active Subsystem Entrypoints

1. **Dashboard Root App (`Frontend/dashboard/src/App.tsx`):**
   - Renders the responsive multi-panel layout (Market Watch, Backtest Workspace, Strategy Performance, Order Matrix).

2. **API & Telemetry Client (`Frontend/dashboard/src/lib/api.ts`):**
   - Wraps HTTP REST calls (`/api/status`, `/api/backtest`, `/api/market/bars`) and Socket.IO real-time event subscriptions.

3. **Production Build Artifact (`Frontend/dashboard/dist/`):**
   - Compiled production bundle served statically by `backend/api/app.js` at runtime.

## Code Atlas & Related Maps

- API Route Reference — [`docs/engineering/web_api.md`](../../engineering/web_api.md)
- Terminal Dashboard Interface — [`docs/sections/interface/terminal-dashboard/README.md`](../interface/terminal-dashboard/README.md)
