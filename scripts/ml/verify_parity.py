#!/usr/bin/env python
"""Train/serve parity gate: replicate the C++ `ml compare` inference in Python (same
serving_manifest.txt column order + medians, same feature CSV, same ONNX files via
onnxruntime) and print per-model accuracy + class counts. The C++ and Python numbers
must match — that proves the C++ inference path has no train/serve skew and is real.

Run:  .venv_ml/Scripts/python.exe scripts/ml/verify_parity.py
Compare its output to:  sovereign_wealth.exe ml compare --frame storage/data/ml/feature_frame.csv
"""
import json
import os
import sys

import numpy as np
import onnxruntime as ort

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(REPO_ROOT, "storage", "models")
MANIFEST = os.path.join(MODELS_DIR, "serving_manifest.txt")
FRAME = os.path.join(REPO_ROOT, "storage", "data", "ml", "feature_frame.csv")


def load_manifest():
    columns, medians, models = [], {}, []
    with open(MANIFEST, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts[0] == "COL":
                columns.append(parts[1]); medians[parts[1]] = float(parts[2])
            elif parts[0] == "MODEL":
                models.append({"name": parts[1], "path": parts[2],
                               "input_set": parts[3], "n_features": int(parts[4])})
    return columns, medians, models


def is_cross_family(c):
    return c.startswith("regime_") or c.startswith("xf_corr_")


def load_csv():
    with open(FRAME, encoding="utf-8") as f:
        header = f.readline().strip().split(",")
        rows = [ln.rstrip("\n").split(",") for ln in f if ln.strip()]
    idx = {h: i for i, h in enumerate(header)}
    return idx, rows


def build_matrix(rows, idx, cols, medians):
    X = np.empty((len(rows), len(cols)), dtype=np.float32)
    for r, row in enumerate(rows):
        for c, col in enumerate(cols):
            v = None
            if col in idx and idx[col] < len(row):
                cell = row[idx[col]]
                if cell != "":
                    try:
                        fv = float(cell)
                        if np.isfinite(fv):
                            v = fv
                    except ValueError:
                        v = None
            X[r, c] = v if v is not None else medians.get(col, 0.0)
    return X


def main():
    columns, medians, models = load_manifest()
    idx, rows = load_csv()
    labels = np.array([int(float(r[idx["label_class"]])) for r in rows]) if "label_class" in idx else None

    out = {"rows": len(rows), "results": []}
    for m in models:
        cols = [c for c in columns if (is_cross_family(c) if m["input_set"] == "cross_family" else True)]
        X = build_matrix(rows, idx, cols, medians)
        sess = ort.InferenceSession(os.path.join(MODELS_DIR, m["name"] + ".onnx"),
                                    providers=["CPUExecutionProvider"])
        res = sess.run(None, {"input": X})
        pred = np.asarray(res[0]).reshape(-1).astype(int)
        acc = float((pred == labels).mean()) if labels is not None else None
        counts = {int(k): int(v) for k, v in zip(*np.unique(pred, return_counts=True))}
        out["results"].append({"model": m["name"], "n_features": len(cols),
                               "accuracy": round(acc, 6) if acc is not None else None,
                               "class_counts": counts})
        print(f"{m['name']:18s} n={len(cols):2d} acc={acc:.6f} counts={counts}")
    with open(os.path.join(MODELS_DIR, "parity_python.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
