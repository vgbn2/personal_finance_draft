# Chapter 06 - Product Scope And Safety Rules

## Goal

This chapter explains what the platform is trying to do and where a beginner must draw hard safety boundaries.

If you skip this chapter, you may build technically correct code that is operationally reckless. In a trading system, that is not acceptable.

## What You Are Building

You are building a safe mental model of the product:

- what the platform is for
- what counts as useful early progress
- what parts are safe to run without credentials
- what parts must remain gated until much later

## Prerequisite Concepts

You should already know:

- what a command is
- what config is
- what generated output is
- what the guide means by "minimum working slice"

## Language Proficiency Required

- JavaScript/Node.js: none
- C++: none
- Rust: none

## Library And Tool Requirements

- `.env` handling
- local terminal access
- optional broker SDK awareness

## Beginner Translation Box

- `paper trading`: simulated trading without spending real money
- `live trading`: real order submission against a real venue or account
- `local-first`: prefer local control, local secrets, and local verification before remote automation
- `guardrail`: code or workflow that blocks dangerous actions until conditions are met

## What This Platform Is

At a high level, the repository is building a local-first trading and market-intelligence platform.

That includes:

- gathering market and macro data
- storing and validating that data locally
- exposing research, CLI, and TUI workflows
- supporting execution through broker or venue adapters
- optionally using native compute and ML for heavier workloads

## What This Platform Is Not

It is not:

- a toy script that should fire live orders after two commands
- a one-language tutorial repo
- a beginner-safe environment for real-money automation from day one
- a guarantee that a strategy is profitable

This matters because beginner enthusiasm often skips operational truth. This guide will not.

## The First Safe Version

A useful early version of the platform can already exist if it can:

- load config
- read cached or fake market data
- print status and research output
- run paper-safe or no-spend command paths

That is enough to prove the system shape without touching live money.

## Local-First Operating Principle

The repo leans local-first because local control reduces hidden risk.

Local-first means:

- secrets stay local unless a later chapter explicitly changes that
- the reader can verify behavior from the terminal
- runtime data can be inspected on disk
- paper-safe flows exist before live flows

This is a design choice, not just a convenience choice.

## Paper Mode Before Live Mode

You should assume this order:

1. fake data
2. real data
3. local cache
4. research commands
5. paper execution
6. guarded live execution

If you reverse that order, you lose observability exactly where money risk starts.

## Secrets And Credentials

Secrets include:

- API keys
- API secrets
- private keys
- access tokens
- session credentials

Do not put these directly in source files. Use environment variables or local env files as described later in the config and setup chapters.

## Why Guardrails Exist

In normal app development, a missing guardrail may mean a bad user experience.

In this repo, a missing guardrail may mean:

- sending live orders too early
- leaking secrets
- confusing paper state with real state
- treating stale data as current data

That is why this guide treats guardrails as core product behavior, not optional polish.

## Minimum Working Slice

The minimum safe product slice for a beginner is:

- no live credentials required
- local commands only
- status or research output from fake or cached data
- no unattended automation

If your "first success" requires live broker auth, your scope is wrong.

## Beginner-Safe Workflow

Use this order:

1. inspect repo state
2. build a local CLI
3. load local config
4. ingest fake or safe historical data
5. validate storage and output shape
6. add paper-only execution paths later

This sequence gives you visibility before risk.

## Step-By-Step Build

For this chapter, do not write a broker integration yet. Instead:

1. identify which commands are read-only
2. identify which commands would eventually require credentials
3. write down the difference between paper and live execution
4. confirm that the early guide path stays on the safe side

## Contracts And Interfaces

The product has behavior contracts even before code exists:

- live behavior must be gated
- secrets must not be hardcoded
- paper and live outputs must not be confused
- status commands should be safe to run without spending money

Later code should satisfy these contracts, not invent them.

## Tests And Verification

Reasoning test for this chapter:

answer these with no hesitation:

1. What is the first safe version of the platform?
2. Why is local-first useful here?
3. Why is paper mode required before live mode?

If you cannot answer those, pause before Chapter 07.

You can also run a safe repo-state command:

```powershell
git status --short -- .
```

Expected outcome:

- the command shows repo state only
- no live credentials or broker access are required
- this reinforces the idea that early safe workflows are local and read-oriented

## Expected File Tree

This chapter does not add new files. It defines safe boundaries for how later files should behave.

## Common Failure Modes

- reader treats a broker SDK as the first milestone
  Fix: the first milestone is a safe local system.
- reader stores secrets in code
  Fix: use env-driven setup later.
- reader uses "it is just a tiny test order" as justification
  Fix: tiny live orders are still live orders.

## Do Not Build Yet

- live order submission
- unattended automation against real funds
- remote secret distribution
- production deployment with real credentials

## Checkpoint Exercise

Write a short note in your own words:

`The first version I am allowed to build is useful if it can ______, ______, and ______ without using live broker credentials.`

If you can fill that cleanly, the chapter worked.

## Done Criteria

This chapter is done when you can explain:

- the product boundary
- the money-risk boundary
- the secret-handling boundary
- why a beginner path must remain local and paper-safe first
