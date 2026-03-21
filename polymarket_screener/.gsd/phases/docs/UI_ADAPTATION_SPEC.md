# UI-Backend Adaptation Specification

This document defines the interface between the Python Quant Engine and the User's HTML/React frontend.

## 1. Unified State Payload (`type: "STATE_UPDATE"`)
The backend will broadcast this every 100-500ms (configurable) to reflect the current market snapshot.

```json
{
  "type": "STATE_UPDATE",
  "timestamp": 1625097600.0,
  "data": {
    "screener": [
      {
        "id": "BTC-100K-YES",
        "label": "Will BTC hit $100k?",
        "price": 0.82,
        "volume_24h": 1200000.50,
        "signal": "STRONG_BUY",
        "trend": [0.80, 0.81, 0.82] 
      }
    ],
    "greeks": {
      "delta": 0.65,
      "gamma": 0.012,
      "theta": -0.45,
      "vega": 0.08
    },
    "risk": {
      "label": "LOW",
      "black_swan_prob": 0.024,
      "color_hex": "#10B981"
    },
    "portfolio": {
      "alpha": 12.4,
      "survival_rate": 94.2
    }
  }
}
```

## 2. Targeted Adaptation Points
Based on the `frontend_prototype.html`, the backend must provide:
- **Sparkline Data**: The `trend` array (last 10-20 prices) to power the volume/price charts.
- **Dynamic Hex Colors**: The `risk.color_hex` to control the "Neon" status indicators in the user's CSS.
- **VPN Heartbeat**: A frequent `{"type": "PONG"}` message to keep the connection alive through VPN timeouts.

## 3. Command Interface (`type: "UI_COMMAND"`)
The UI can send commands back to the engine:
- `EXECUTE_TRADE`: Trigger buy/sell based on ID and size.
- `SET_FILTER`: Update the screener keywords.
- `TRIGGER_MONTE_CARLO`: Start a new stress-test run.

## 4. Port Stability
- **Frontend Source**: `http://127.0.0.1:3000`
- **Backend Sync**: `ws://127.0.0.1:8001/ws`
