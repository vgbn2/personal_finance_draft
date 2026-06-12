# Chapter 19 - API And Dashboard

## Goal

This chapter explains how runtime state becomes a local web/API surface and then becomes a dashboard UI.

The API and dashboard should not invent a second truth. They should expose what the backend already knows in a format that is easier to inspect visually.

## What You Are Building

You are building:

- a small local API server
- a health endpoint
- a status endpoint
- one simple dashboard panel that consumes that status

## Prerequisite Concepts

You should already understand:

- CLI status behavior
- config and storage boundaries
- structured output contracts

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- React: beginner awareness
- HTTP basics: beginner

## Library And Tool Requirements

- Node.js
- a web server framework
- React or another frontend runtime
- Vite or equivalent frontend tooling

## Beginner Translation Box

- `endpoint`: one callable HTTP path
- `health endpoint`: a small route proving the service is alive
- `status endpoint`: a route that returns operational state
- `panel`: one bounded UI area that shows a specific type of information

## Why The API Exists

The CLI is great for operators. The API and dashboard make state easier to inspect for repeated workflows and comparisons.

The API should expose real backend truth, not UI-specific invented state.

If the dashboard needs information, the correct question is:

- what backend state should be exposed?

Not:

- what extra client-side guesswork should we add?

## Start With Health And Status

Do not start with a huge dashboard.

Start with:

- `GET /health`
- `GET /status`

Those two routes teach most of the important lessons:

- route wiring
- backend state exposure
- JSON payload stability
- frontend fetch flow

## One Panel Is Enough

A single dashboard panel can prove the architecture:

- fetch one endpoint
- parse JSON
- render state

That is enough to prove the backend-to-UI path without exploding scope.

## Minimum Working Slice

The minimum slice for this chapter:

- API server runs locally
- `/health` returns `ok: true`
- `/status` returns one status object
- UI panel renders one field from `/status`

That is a complete vertical slice.

## Step-By-Step Build

1. Start a local API server.
2. Add a health route.
3. Add a status route that reuses backend truth.
4. Start a small frontend view or page.
5. Fetch `/status`.
6. Render one field such as mode, data freshness, or cached symbol count.

## Contracts And Interfaces

The API and dashboard should guarantee:

- health routes stay lightweight
- status routes return structured backend truth
- frontend panels consume stable JSON
- UI does not silently reinterpret backend meaning

This keeps the dashboard from becoming a second application with different logic.

## Tests And Verification

Run a local server command, then verify endpoints:

```powershell
node backend\api\app.js
```

And in another shell:

```powershell
curl http://localhost:3000/health
curl http://localhost:3000/status
```

Expected outcome:

- `/health` returns a small success payload
- `/status` returns structured state

Example health payload:

```json
{
  "ok": true,
  "service": "sovereign-web"
}
```

## Expected File Tree

```text
backend/
  api/
    app.js
    server/
      routes/
Frontend/
  dashboard/
    src/
      pages/
      components/
```

## Common Failure Modes

- the UI invents business logic instead of reading backend truth
  Fix: keep interpretation on the backend where possible.
- the first endpoint tries to solve every need
  Fix: start with health and status.
- the dashboard depends on unstable ad hoc payloads
  Fix: define the contract first.

## Do Not Build Yet

- full production UI polish
- broad realtime complexity
- large client-side state frameworks
- dozens of panels before the first one is stable

## Checkpoint Exercise

Pick one backend status field and describe how it should appear in both CLI output and one dashboard panel without changing its meaning.

## Done Criteria

This chapter is done when you can explain:

- why the API exists
- why health and status come first
- how one panel proves the full vertical slice
- why the dashboard should not invent its own truth
