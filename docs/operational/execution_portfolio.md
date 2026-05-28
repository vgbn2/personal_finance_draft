# Execution And Portfolio Monitoring Roadmap

This document defines the execution and monitoring direction for the local prototype. It is not live trading code, but the repo now contains a paper broker, kill switch, and local route helpers that make the seam buildable.

## Execution Principle

No signal should become an order directly. The planned flow is:

```text
signal
  -> strategy decision
  -> proposed order
  -> pre-trade risk check
  -> paper broker or live broker adapter
  -> order state updates
  -> trade log
  -> portfolio state
  -> monitoring and alerts
```

Live execution must stay behind explicit configuration, credentials, dry-run controls, and kill switches.

## Order Contract

Planned `Order` fields:

- `order_id`
- `asset_id`
- `side`
- `order_type`
- `quantity`
- `limit_price`
- `time_in_force`
- `strategy_id`
- `signal_id`
- `created_at`
- `status`

Planned order states:

- proposed
- risk_rejected
- submitted
- partially_filled
- filled
- cancelled
- failed

## Risk Gates

Pre-trade checks should cover:

- max order notional
- max position notional
- max gross and net exposure
- max leverage
- max daily loss
- max drawdown
- stale data rejection
- trading disabled flag
- unsupported asset or broker route

## Portfolio State

Planned portfolio records:

- cash balance
- positions by `asset_id`
- average cost
- realized PnL
- unrealized PnL
- exposure by asset, sector, currency, and strategy
- margin and collateral where relevant
- open orders
- last mark timestamp

Monitoring should flag stale marks, exposure breaches, large drawdowns, rejected orders, failed broker calls, and missing trade logs.

## Broker Boundary

Paper trading and live trading should use the same execution interface. Broker-specific adapters should translate internal orders into broker API calls, but risk checks should remain broker-independent.

Existing adapter and route names now point to likely integrations:

- `cpp_core/src/execution/paper_broker.hpp`
- `cpp_core/src/execution/paper_broker.cpp`
- `cpp_core/src/execution/live_broker_adapter.hpp`
- `cpp_core/src/execution/simple_market.cpp`
- `cpp_core/src/execution/twap_vwap.cpp`
- `cpp_core/src/execution/rl_router.cpp`
- `cli/src/broker_api/gate_io_api.rs`
- `cli/src/broker_api/mt5_native.rs`
- `cli/src/broker_api/order_executor.rs`
- `cpp_core/src/execution/execution_interface.hpp`
