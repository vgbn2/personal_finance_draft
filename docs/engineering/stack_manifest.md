# Technology Stack

> Updated on 2026-05-25 to reflect current operational state.

## Runtime

| Technology | Status | Purpose |
|------------|--------|---------|
| C++20 | **Active** | Core calculations, data contracts, backtests, risk, and execution interfaces |
| Node.js | **Active** | Operational CLI (`backend/cli/sovereign_cli.js`) and local web/API bridge |
| CMake | **Active** | C++ build configuration (3.15+) |
| Rust | **Active** | Local CLI core in `cli/` with command, config, portfolio, and backtest helpers |
| ONNX | *Planned* | CNN and regime model artifact format |

## Production Dependencies

### Web (Node.js)
| Package | Version | Purpose |
|---------|---------|---------|
| node:http | built-in | Local web/API server in `backend/api/app.js` |
| socket.io | ^4.5.0 | Live dashboard telemetry and market-data updates |

### CLI (Node.js)
| Module | Purpose |
|--------|---------|
| `child_process` | Spawning C++ backend processes |
| `fs`, `path` | Local cache and config management |

## Development Dependencies

| Package | Purpose |
|---------|---------|
| CTest | C++ unit and integration testing |
| nodemon | Web development auto-reload |

## Infrastructure

| Service | Status | Purpose |
|---------|--------|---------|
| GitHub Actions | Planned | CI/CD automation |
| Docker | Active | Local containerization (`infra/docker/`) |
| Kubernetes | Starter | Deployment manifests (`infra/deployment/kubernetes/`) |
| Terraform | Starter | Infrastructure as Code (`infra/deployment/terraform/`) |
| Heroku | Starter | Cloud deployment (`infra/deployment/heroku/`) |

## Configuration

| Variable/File | Purpose | Required |
|---------------|---------|----------|
| `.env` | Local secrets, never committed | No |
| `config/markets/data_sources.yaml` | Source and universe config | Yes |
| `config/feature_engineering.yaml` | Feature and CNN windows | Yes |
| `config/strategies.yaml` | Strategy parameters | Yes |
| `config/risk_management.yaml` | Risk limits | Yes |
| `models/metadata.json` | Model registry metadata | Yes |
