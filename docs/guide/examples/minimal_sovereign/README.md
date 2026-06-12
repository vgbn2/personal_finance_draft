# Minimal Sovereign Example

This example is the worked thread for the guide's first concrete build path.

It is intentionally small and paper-safe. It demonstrates:

- repo scaffold
- config loading
- a fake provider
- cache writing
- a simple CLI status surface

## Example Commands

Run from this example directory:

```powershell
npm test
node backend\cli\sovereign_cli.js status --json
node backend\scripts\ingest_example.js
```

Expected outcomes:

- the test passes
- the CLI prints structured status
- the ingest script writes one cache file and prints a summary

## Example Tree

```text
minimal_sovereign/
  backend/
  config/
  shared/
  storage/
  tests/
  package.json
```
