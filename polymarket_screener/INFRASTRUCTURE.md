# Infrastructure Requirements & Versions

## 1. Databases
- **PostgreSQL 15+**: For structured trade execution history and user metadata.
- **Redis 7.0+**: For the "High-Speed State Cache" to lower UI lag.
- **MongoDB Atlas**: For remote logging and cloud backup.

## 2. Windows/WSL Port Registry (NO MISMATCH)
| Service | Port | Host | Reason |
|---------|------|------|--------|
| Backend API | 8000 | 0.0.0.0 | FastAPI |
| WS Bridge | 8001 | 0.0.0.0 | High-speed data push |
| React UI | 3000 | 127.0.0.1 | Vite Dev Server |
| Postgres | 5432 | 127.0.0.1 | Primary DB |
| Redis | 6379 | 127.0.0.1 | Cache |

## 3. Lag Mitigation Strategy
- **Caching**: All `MarketSnapshot` objects are cached in Redis. The UI reads from the Redis-backed bridge, not the raw Python loop.
- **Throttling**: The WS bridge will "compress" updates, sending no more than 10 updates per second per asset (100ms grain) to prevent UI thread lock.
- **WSL Tip**: Use `127.0.0.1` explicitly in the frontend proxy; Windows `localhost` can sometimes resolve to `::1` (IPv6), causing 2-second connection delays.
