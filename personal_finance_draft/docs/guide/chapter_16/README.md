# Chapter 16 - Execution Gateway

## Goal

This chapter explains the broker boundary and why execution logic must stay stricter than ordinary data or research code.

The execution gateway is where the system stops observing markets and starts trying to act inside them. That boundary needs stronger rules.

## What You Are Building

You are building a gateway layer that can:

- accept proposed orders
- validate them before execution
- route them to a paper executor first
- block risky live behavior unless explicit conditions are met

## Prerequisite Concepts

You should already understand:

- config and secret handling
- CLI boundaries
- normalized market data
- paper vs live safety rules

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- HTTP/API basics: beginner
- Secret handling: beginner

## Library And Tool Requirements

- Node.js
- broker SDKs or HTTP clients
- env-loading support

## Beginner Translation Box

- `adapter`: a module that speaks one broker or venue's language
- `proposed order`: a structured order request before it becomes a real submission
- `paper executor`: a no-spend execution path
- `live guard`: logic that blocks real execution unless safety conditions are met

## Why A Gateway Exists

Without a gateway:

- every command would build orders differently
- every broker integration would leak its quirks upward
- live and paper logic would drift apart

The gateway centralizes execution responsibility the same way the market layer centralizes data responsibility.

## Proposed Orders Come First

Do not submit raw ad hoc objects directly to broker adapters.

First create a proposed-order shape with fields like:

- symbol
- side
- quantity or sizing mode
- execution mode
- broker target

Then validate it before routing.

This is the first place many preventable mistakes can be stopped.

## Paper Execution Before Live Execution

The first useful gateway does not need to place a live order.

It only needs to:

- accept a valid proposed order
- preview or log it
- route it to a paper executor
- produce a structured result

If you skip that layer and jump straight to live trading, you lose the safest verification surface.

## Live Guardrails

Live execution should require explicit conditions such as:

- live mode enabled
- credentials available
- account and venue checks passed
- user confirmation or auth boundary cleared

This should fail closed. The absence of proof should block execution.

## Minimum Working Slice

The minimum slice for this chapter:

- define a proposed-order schema
- validate one proposed order
- route it to a paper executor
- print a structured preview or execution result

That is enough to prove the gateway pattern.

## Worked Example Reference

The minimal example subtree does not include a real gateway yet. Use that absence as a teaching signal:

- the example is safe because it stops at status and ingest
- the moment you add execution, you need a stricter boundary than earlier chapters required

When you extend the example, add gateway files under a separate `backend/gateway/` path rather than bolting order logic directly into the CLI.

## Step-By-Step Build

1. Define the proposed-order shape.
2. Add validation rules for required fields.
3. Create one paper executor function.
4. Route valid orders to paper mode.
5. Block live mode with a clear failure message until real guards exist.

## Contracts And Interfaces

The gateway should guarantee:

- adapters receive validated input
- paper and live modes are distinct
- live mode blocks by default
- errors redact secrets and sensitive headers

The last point matters because execution failures may contain sensitive context.

## Tests And Verification

Run a paper-safe gateway command:

```powershell
node backend\cli\sovereign_cli.js trade --paper --json
```

Expected outcome:

- the command returns structured output
- the order is validated before execution
- no live credentials are required

Example:

```json
{
  "ok": true,
  "mode": "paper",
  "validated": true,
  "executed": true
}
```

Also verify that live mode fails closed if the guard is not satisfied.

## Broken Example

If `trade --paper` and `trade --live` share the same hidden code path with only one boolean flip at the end, you have not really separated safe execution from risky execution.

This is exactly the kind of design shortcut the gateway boundary is meant to prevent.

## Expected File Tree

```text
backend/
  gateway/
    src/
      proposed_orders.js
      adapter_a.js
      paper_executor.js
```

## Common Failure Modes

- adapters accept unvalidated input
  Fix: validate before routing.
- paper and live paths share hidden assumptions
  Fix: make the mode explicit.
- execution errors print secrets
  Fix: redact diagnostics early.
- live mode defaults to on when credentials are present
  Fix: require explicit user intent and explicit guards.

## Do Not Build Yet

- unattended real-money automation
- multi-broker production hardening
- optimistic "it is just a tiny live test" shortcuts

## Checkpoint Exercise

Write down three reasons why a paper executor is not optional even if the final goal is live trading.

## Done Criteria

This chapter is done when you can explain:

- why the gateway is a separate boundary
- why proposed orders come before adapter calls
- why paper mode comes before live mode
- why live execution must fail closed by default
