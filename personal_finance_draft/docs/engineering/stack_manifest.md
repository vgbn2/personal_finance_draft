# Technology Stack

> Updated on 2026-05-25 to reflect current operational state.

## Runtime

| Technology | Status | Purpose |
|------------|--------|---------|
| C++20 | **Active** | Core calculations, data contracts, backtests, risk, and execution interfaces |
| Node.js | **Active** | Operational CLI (`scripts/cli/sovereign_cli.js`) and local web/API bridge |
| CMake | **Active** | C++ build configuration (3.15+) |
| Rust | **Active** | Local CLI core in `cli/` with command, config, portfolio, and backtest helpers |
| ONNX | *Planned* | CNN and regime model artifact format |

## Production Dependencies

### Web (Node.js)
| Package | Version | Purpose |
|---------|---------|---------|
| node:http | built-in | Local web/API server in `web/app.js` |
| express | ^4.18.0 | Listed in `web/package.json`; not required by current `web/app.js` runtime |
| socket.io | ^4.5.0 | Planned streaming dashboard updates |
| dotenv | ^16.0.0 | Environment configuration |

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
| Docker | Active | Local containerization (`docker/`) |
| Kubernetes | Starter | Deployment manifests (`deployment/kubernetes/`) |
| Terraform | Starter | Infrastructure as Code (`deployment/terraform/`) |
| Heroku | Starter | Cloud deployment (`deployment/heroku/`) |

## Configuration

| Variable/File | Purpose | Required |
|---------------|---------|----------|
| `.env` | Local secrets, never committed | No |
| `config/data_sources.yaml` | Source and universe config | Yes |
| `config/feature_engineering.yaml` | Feature and CNN windows | Yes |
| `config/strategies.yaml` | Strategy parameters | Yes |
| `config/risk_management.yaml` | Risk limits | Yes |
| `models/metadata.json` | Model registry metadata | Yes |
