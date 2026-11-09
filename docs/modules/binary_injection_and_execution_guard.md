# Module: Binary Injection And Process Execution Guard

> **Status:** Implemented
> **Audience:** Maintainers, API Developers, Security Auditors, Quantitative Engineers
> **Canonical owners:** `backend/cpp_core/src/data/data_validator.hpp`, `backend/cpp_core/src/data/binary_ts_merger.cpp`, `backend/cpp_core/src/data/binary_ts_reader.cpp`, `backend/api/server/services/cli_executor.js`, `backend/api/server/services/input_validator.js`
> **Review triggers:** File I/O interfaces, native subprocess execution, flat binary time-series schema, cryptographic hashing, query parsing

## Purpose And Non-Goals

This module provides boundary defense against binary poisoning, argument injection, and unauthorized filesystem escape across the dual C++ and Node.js execution layers of the sovereign trading platform.

### Goals
- **IEEE 754 Floating-Point Finite-Float Invariant (ExploitGym TV-01)**: Prevent non-finite float and NaN injection into flat binary time-series files (`.bin`), sorting algorithms, and streaming mergers.
- **Path Traversal Shielding**: Confine all file resolution in Node.js API services and C++ native file readers strictly to approved storage roots (`REPO_ROOT`, `STORAGE_DATA_DIR`, `os.tmpdir()`).
- **Cryptographic Dataset Fingerprinting**: Provide FIPS 180-4 compliant SHA-512 cryptographic digests for raw `.bin` datasets without external dependencies, replacing legacy residues.
- **Single Responsibility Principle (SRP)**: Enforce centralized validation in `sovereign::DataValidator` and `input_validator.js` rather than embedding ad-hoc validation inside low-level I/O parsers.
- **Process Execution Hardening**: Mandate parameter-array subprocess invocations (`execFile`, `spawnSync` with `{ shell: false }`) and prevent CLI option injection by enforcing alphanumeric token prefixes.

### Non-Goals
- Full application payload decryption or TLS termination (handled upstream by reverse proxy / host network boundary).
- Broker authorization credentials (handled by `ephemeral_key_vault.js` and broker gateway adapters).

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `DataValidator::isValidRecord(ts, close)` | `backend/cpp_core/src/data/data_validator.hpp` | Validates `std::isfinite(ts_ms) && ts_ms >= 0 && std::isfinite(close) && close > 0`. |
| `DataValidator::sanitizeSymbol(symbol)` | `backend/cpp_core/src/data/data_validator.hpp` | Strips path delimiters and normalizes to uppercase alphanumeric characters and underscores. |
| `DataValidator::sanitizeTimeframe(tf)` | `backend/cpp_core/src/data/data_validator.hpp` | Replaces non-alphanumeric characters with underscores. |
| `BinaryTsReader::sha512File(path, digest, err)` | `backend/cpp_core/src/data/binary_ts_reader.cpp` | Computes 128-hex FIPS 180-4 SHA-512 digest for regular binary files; rejects symlink targets. |
| `BinaryTsMerger::mergeFiles(ex, in, out, opts)` | `backend/cpp_core/src/data/binary_ts_merger.cpp` | Merges two binary time-series streams in $O(N+M)$ time while discarding NaN/Inf records. |
| `isPathWithinAllowedRoots(path, roots)` | `backend/api/server/services/input_validator.js` | Confines target path to `[REPO_ROOT, STORAGE_DATA_DIR, os.tmpdir()]`. |
| `isValidSymbol(symbol)` / `isValidTimeframe(tf)` | `backend/api/server/services/input_validator.js` | Strict regex validation prohibiting option injection (`-` prefixes) and directory slashes. |
| `isFormulaInjection(val)` / `sanitizeCsvCell(val)` | `shared/lib/security/normalized.js` | Detects and neutralizes spreadsheet formula injection (CWE-1236) via `'` apostrophe prefixing. |
| `backendStatus`, `backendDataSummary`, `signalStatus` | `backend/api/server/services/cli_executor.js` | Web API bridge handlers validating query parameters against path traversal and CLI injection. |

---

## Dependencies And Data Flow

```text
HTTP / Query Params -> input_validator.js -> cli_executor.js (path containment)
                                                    |
                                                    v
                                         spawnSync (shell: false)
                                                    |
                                                    v
Incoming Data Streams -> DataValidator (finite float check) -> BinaryTsMerger / BinaryTsReader -> storage/data/ts/*.bin
                                                                         |
                                                                         v
                                                            sha512File (FIPS 180-4)
```

---

## Invariants And Safety Boundaries

### 1. IEEE 754 Non-Finite Float Invariant (TV-01)
In IEEE 754 arithmetic, comparisons against `NaN` always evaluate to `false` (e.g. `NaN < 100` is `false`, and `NaN >= 100` is `false`). An injected `NaN` in a binary time-series breaks the strict monotonicity assumption of two-pointer streaming merges and can bypass risk thresholds.
Every record processed by `BinaryTsMerger` and `BinaryTsReader` must satisfy:
```cpp
// [Security: TV-01] Strict IEEE 754 finite-float validation
bool DataValidator::isValidRecord(double ts_ms, double close) {
    return std::isfinite(ts_ms) && ts_ms >= 0.0 && std::isfinite(close) && close > 0.0;
}
```

### 2. Path Traversal & Root Containment Invariant
No API query parameter or CLI argument may specify a filesystem path outside designated sandbox roots:
- `REPO_ROOT`: The absolute repository root path.
- `STORAGE_DATA_DIR`: Runtime disk storage directory (`storage/data/`).
- `os.tmpdir()`: Operational RAM/tmpfs temporary folder (`/tmp` or `/dev/shm`).

Any relative sequences (`../../`) or absolute paths pointing outside these roots trigger an immediate fail-closed error:
```javascript
// [Security: Path Containment] Confining candidate files to permitted trees
const candidate = path.resolve(REPO_ROOT, String(query.input));
if (!isPathWithinAllowedRoots(candidate)) {
  return { ok: false, error: 'Path traversal denied: input outside allowed roots' };
}
```

### 3. FIPS 180-4 SHA-512 Dataset Fingerprinting
Historical snapshots must be authenticated with 512-bit cryptographic hashes. The native C++ engine implements standard 80-round SHA-512 message compression operating on 64-bit words, verified against the NIST `"abc"` test vector. Symlinks are explicitly rejected (`std::filesystem::is_symlink`) to prevent runtime snapshot replacement attacks.

### 4. Subprocess Argument Isolation & Option Injection Prevention
When spawning C++ backend binaries or Node CLI tools:
- Shell execution is strictly prohibited (`{ shell: false }`).
- Arguments are passed as individual array elements, never concatenated strings.
- Ticker symbols and timeframes are validated against strict regexes (`/^[A-Z0-9][A-Z0-9_.-]{0,19}$/i`). Arguments starting with hyphens are rejected to prevent option injection.

### 5. CSV / Spreadsheet Formula Injection Guard (CWE-1236)
When exporting data frames, feature matrices, or ledger balances to CSV:
- Cells beginning with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) can execute unauthorized DDE/commands when opened in Excel or LibreOffice Calc.
- `shared/lib/security/normalized.js` enforces detection (`isFormulaInjection`) and OWASP-standard neutralization (`sanitizeCsvCell`), which prepends an apostrophe (`'`) to force interpretation as a raw text literal.

---

## Code Snippets & Comment Implementation

### C++ Two-Pointer Streaming Merge with NaN Filtering
From `backend/cpp_core/src/data/binary_ts_merger.cpp`:
```cpp
// [DSA] Two-Pointer Streaming Merge with Deduplication & NaN Sanitization
// Algorithmic pattern: Two-pointer sorted stream merge (identical to Merge Sort merge phase).
// Time Complexity: O(N + M) where N = ex_records, M = in_records.
// Space Complexity: O(1) auxiliary streaming buffers, preventing RAM exhaustion on multi-GB datasets.
// [Security: TV-01] Filters non-finite floats to prevent IEEE 754 NaN desynchronization.
while (ex_reader.hasNext() && in_reader.hasNext()) {
    const auto& ex_rec = ex_reader.peek();
    const auto& in_rec = in_reader.peek();

    const bool ex_valid = DataValidator::isValidRecord(ex_rec.ts_ms, ex_rec.close);
    const bool in_valid = DataValidator::isValidRecord(in_rec.ts_ms, in_rec.close);

    if (!ex_valid) {
        ex_reader.advance();
        continue;
    }
    if (!in_valid) {
        in_reader.advance();
        continue;
    }

    if (ex_rec.ts_ms == in_rec.ts_ms) {
        if (options.existing_wins_on_tie) {
            writer.writeRecord(ex_rec);
        } else {
            writer.writeRecord(in_rec);
        }
        ex_reader.advance();
        in_reader.advance();
    } else if (ex_rec.ts_ms < in_rec.ts_ms) {
        writer.writeRecord(ex_rec);
        ex_reader.advance();
    } else {
        writer.writeRecord(in_rec);
        in_reader.advance();
    }
}
```

### Path Boundary Containment in Node.js Services
From `backend/api/server/services/cli_executor.js`:
```javascript
// ponytail: unified path containment check for report file arguments
for (const field of ['input', 'model_report', 'backtest_report']) {
  if (query[field]) {
    const candidate = path.resolve(REPO_ROOT, String(query[field]));
    if (!isPathWithinAllowedRoots(candidate)) {
      return { ok: false, error: `Path traversal denied: ${field} outside allowed roots` };
    }
  }
}
```

---

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Traversal attempt via query param | HTTP 200/400 with `{ ok: false, error: "Path traversal denied..." }` | Query rejected, 0 child processes spawned | Caller / Client |
| Injected NaN in `.bin` records | Discarded silently during streaming merge; count reflects valid records | Invalid records skipped; sorted monotonic stream preserved | Ingestion Provider |
| Option injection in symbol (`--flag`) | Sanitizer returns fallback or validation fails with `false` | Parameter rejected before subprocess spawn | Web API Layer |
| Symlink snapshot substitution | `sha512File` returns `dataset_not_regular_file` | Snapshot rejected, digest generation halts | Storage Operator |

---

## Tests And Evidence

- **Unit & Boundary Tests**:
  - `tests/scripts/security/binary_injection_guard.test.js`: Verifies `isPathWithinAllowedRoots`, regex argument injection defenses, and `cli_executor.js` fail-closed responses.
  - `backend/cpp_core/test/data/binary_ts_reader_test.cpp`: Verifies FIPS 180-4 SHA-512 digest on reference vector `"abc"`, symlink rejection, and header parsing.
- **Verification Commands**:
  ```bash
  # Execute Node.js security regression test
  node tests/scripts/security/binary_injection_guard.test.js

  # Execute Native C++ CTest suite
  npm run test:core

  # Execute API contract tests
  npm run test:api
  ```
