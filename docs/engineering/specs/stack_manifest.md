# Technology Stack Manifest

> **Diátaxis Type**: Reference & Specification | **Status**: Canonical | **Owner**: Platform Engineering | **Review**: Continuous

## 1. Core Toolchain & Languages

| Technology | Baseline Version | Active Implementation | Purpose |
|---|---|---|---|
| **C++20** | `C++20` standard | `clang++ 14+`, `g++ 11+` | Native quantitative engine (`sovereign_wealth`), indicators, binary TS merger, and CTest suite. |
| **Node.js** | `v20.0.0+` | Node LTS `v20.x`, `v22.x` | Orchestration CLI, Ink TUI dashboard, native HTTP server, and broker gateways. |
| **CMake** | `3.15.0+` | CMake `3.25.1+` | Multi-platform build configuration (`CMakeLists.txt`) and CTest harness. |
| **TypeScript / JS**| `ES2022+` | Pure CommonJS / ESM | Dashboard components, broker bridges, and testing scripts. |

---

## 2. Platform Dependencies (`package.json`)

### Core Runtime Dependencies
| Package | Version | Purpose |
|---|---|---|
| `node:http` | Built-in | High-performance native HTTP server in `backend/api/app.js` (zero Express dependency). |
| `ink` | `^7.1.0` | React-based terminal dashboard engine running DEC Mode 2026 synchronized output. |
| `ink-select-input` | `^6.2.0` | Keyboard-driven terminal select input components. |
| `ink-text-input` | `^6.0.0` | Keyboard-driven terminal text input fields. |
| `@alpacahq/alpaca-trade-api`| `^4.0.1` | Alpaca REST and WebSocket streaming gateway for equities and crypto paper/live trading. |
| `@polymarket/clob-client-v2`| `^0.0.3` | Polymarket CLOB gateway for prediction market orderbook streaming. |
| `@supabase/supabase-js` | `^2.106.2` | Client library for telemetry and user audit trails. |
| `ethers` | `^6.17.0` | Ethereum cryptographic utilities for Polymarket EIP-712 order signing. |
| `@modelcontextprotocol/sdk` | `^1.29.0` | Model Context Protocol (MCP) server for Claude and autonomous agent tool exposure. |

### Frontend Dashboard (`Frontend/dashboard/package.json`)
| Technology | Version | Purpose |
|---|---|---|
| `React` | `^19.0.1` | Component-driven reactive web user interface. |
| `Vite` | `^6.2.3` | Ultra-fast client bundler and development server. |
| `TailwindCSS` | `^4.1.14` | Tailwind CSS v4 utility-first responsive design styling. |
| `Lucide React` | `^0.546.0` | Minimalist interface iconography. |

---

## 3. Testing & Quality Assurance Stack

| Harness | Runner / Command | Coverage & Scope |
|---|---|---|
| **Native CTest Suite** | `ctest --test-dir backend/core/build` | 34 C++20 unit and regression test executables (`npm run test:core`). |
| **Node.js Native Test Runner**| `node tests/run_node_tests.js` | Zero-dependency native Node test runner (`node:test`). |
| **Safety & Invariant Suite** | `npm run test:safety` | 43 zero-mutation, trade PIN, and automation safety boundary tests. |
| **Structural Contract Suite** | `npm run test:structure` | 12 architectural contract suites validating skill mirrors and hygiene. |
| **API & Contract Suites** | `npm run test:api`, `npm run test:contracts` | 40 HTTP API route keys, WebSocket bridges, and storage contracts. |
| **Documentation Audit & Filter**| `npm run docs:filter`, `npm run audit:documentation` | Zero-tolerance CI gate validating 100% of links, manifests, and Diátaxis types. |

---

## 4. Production Deployment & Infrastructure

| Layer | Technology | Configuration & Path |
|---|---|---|
| **Host System** | Ubuntu 24.04 LTS (Proxmox VE) | Dedicated hardware node (`hpdesk-1`). |
| **Network Mesh** | Tailscale Encrypted Mesh | Private point-to-point node interconnection without public exposure. |
| **Container Engine**| Docker Compose | Multi-container soak stack (`infra/docker/docker-compose.yml`). |
| **Services** | Docker Containers | `sv-web` (Port 8787), `sv-bot-alpaca-paper`, `sv-backfill`, `sv-strategy-explorer`. |
| **Process Model** | Single-Writer Authority (`central-host`)| Atomic POSIX locking via `storage/data/locks/*.lock`. |

---

## 5. Storage & Persistence Tier

| Subsystem | Storage Engine | Location |
|---|---|---|
| **High-Density TS** | Binary Packed IEEE-754 (SOVT v1) | `storage/data/ts/*.bin` |
| **Universe & Caches**| Local JSON Store | `storage/data/cache/*.json` |
| **Execution History**| Append-Only JSONL Ledgers | `storage/data/paper/` |
| **State Locks** | POSIX `O_EXCL` Lockfiles | `storage/data/locks/` |
