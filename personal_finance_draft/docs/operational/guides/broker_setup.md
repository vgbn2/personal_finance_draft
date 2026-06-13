# Broker Setup

## Alpaca

```powershell
sovereign setup alpaca
sovereign doctor alpaca --json
```

## Gate.io

```powershell
sovereign setup gateio
sovereign doctor gateio --json
```

## MT5

```powershell
sovereign setup mt5
sovereign doctor mt5 --json
```

## Polymarket

```powershell
sovereign setup polymarket
sovereign doctor polymarket --json
```

## Supabase

```powershell
sovereign setup supabase
sovereign doctor supabase --json
```

## Shared Rule

- All secrets stay on the local machine or the user's private runner.
- `doctor` redacts secret values and reports validation errors instead of raw keys.
