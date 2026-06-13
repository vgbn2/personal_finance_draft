# Chapter 18 - ML And ONNX Pipeline

## Goal

This chapter explains the machine-learning layer as an advanced system built on top of an already working base platform.

The central rule is simple: if the underlying data, storage, and execution boundaries are weak, ML only amplifies that weakness. This layer comes late on purpose.

## What You Are Building

You are building a conceptual pipeline that can:

- dump training data
- train a model outside the CLI runtime
- export it to ONNX
- serve it with a stable runtime contract
- compare train-time and serve-time behavior

## Prerequisite Concepts

You should already understand:

- data ingestion
- storage layout
- strategy and backtest boundaries
- the native core bridge

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- Python: beginner to intermediate
- C++: beginner awareness
- ML concepts: beginner

## Library And Tool Requirements

- Python ML tooling
- ONNX export support
- ONNX runtime awareness
- Node.js and C++ integration context

## Beginner Translation Box

- `feature`: one input column used by a model
- `train/serve skew`: the model sees different input handling at runtime than it saw during training
- `manifest`: a file that describes how runtime code should interpret a model or feature set
- `parity check`: proof that two execution paths produce the same result

## Why ML Comes Late

The ML layer depends on:

- reliable data
- repeatable storage
- known feature definitions
- trustworthy runtime boundaries

If those are unstable, model output becomes harder to trust than simple rule-based systems, not easier.

## The Pipeline Shape

A stable ML pipeline usually looks like this:

1. generate dataset
2. define features
3. train model
4. evaluate model
5. export model
6. serve model
7. compare serve-time behavior to train-time behavior

Skipping step 7 is a common failure. A model that trains correctly but serves incorrectly is operationally broken.

## ONNX As A Boundary Format

ONNX is useful because it creates a portable model format that can be served outside Python.

That matters in this repo because:

- the training environment and runtime environment differ
- native or cross-language runtime use becomes easier
- runtime code can serve a model without re-embedding the full training stack

## Minimum Working Slice

The minimum slice for this chapter:

- build a tiny dataset
- explain its features
- train one simple model offline
- export the idea of a portable runtime contract

You do not need a production-grade model to prove the pipeline concept.

## Step-By-Step Build

1. Generate one small dataset from known cached history.
2. Label the target clearly.
3. Train one simple model in Python.
4. Export or describe the ONNX artifact.
5. Define the feature order and fill behavior in a serving manifest.
6. Compare one runtime prediction path to the training path.

## Contracts And Interfaces

The ML layer should guarantee:

- feature order is stable
- missing-value handling is explicit
- the serving runtime knows how to interpret the model
- runtime predictions can be compared to expected outputs

This is the anti-skew contract. Without it, ML becomes theater.

## Tests And Verification

Run an example dataset or compare command:

```powershell
node backend\cli\sovereign_cli.js ml compare --json
```

Expected outcome:

- the command identifies the model path
- the runtime can explain which backend served the model
- comparison output is structured

Example:

```json
{
  "ok": true,
  "model": "xgboost_v1",
  "backend": "onnx_runtime"
}
```

## Expected File Tree

```text
scripts/
  ml/
storage/
  models/
shared/
  lib/
    ml/
backend/
  core/
    src/
      ml/
```

## Common Failure Modes

- model files exist but feature handling is undocumented
  Fix: write the serving contract explicitly.
- training and runtime fill data differently
  Fix: add parity checks.
- ML gets introduced before the base system is trustworthy
  Fix: finish the base path first.

## Do Not Build Yet

- production deployment of ML
- performance tuning
- deep model experimentation
- auto-trading directly from an unverified model path

## Checkpoint Exercise

Write down three examples of train/serve skew that could make a "working" model operationally false.

## Done Criteria

This chapter is done when you can explain:

- why ML is late in the roadmap
- why ONNX is useful here
- what a serving manifest protects
- why parity checks matter
