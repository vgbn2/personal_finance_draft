# Local-First Migration Guide

This guide is for existing users who already have a `.env`, local paper-trading state, or broker credentials in the current repo shape.

## What should happen

- Existing values should be detected before prompting.
- Existing secrets should be preserved unless the user chooses to replace them.
- Legacy aliases should be migrated into the centralized broker env helpers.
- Local paper-trading history should remain readable.

## Recommended flow

```powershell
sovereign doctor --json
sovereign setup alpaca
sovereign setup polymarket
sovereign doctor runtime --json
sovereign doctor data --json
```

## Safety rules

- Do not copy secrets into shared cloud storage.
- Do not print raw secret values in setup or doctor output.
- Use `private-runner` if live execution must occur on a server you own.
