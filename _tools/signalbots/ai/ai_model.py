"""
Sentinel-MT5 — AI Trade Scorer
================================
LSTM-based trade validation model.

Backends:
  1. ONNX Runtime  — production inference (fast)
  2. Dummy fallback — returns 0.5 until a real model is trained

The AI acts as a *Risk Manager* only — it scores trades,
never executes them.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from core.config import Config

log = logging.getLogger("sentinel.ai")


# ─── ONNX Backend ────────────────────────────────────────────

class _OnnxBackend:
    """Thin wrapper around an ONNX InferenceSession."""

    def __init__(self, model_path: str):
        import onnxruntime as ort

        self._session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        log.info("ONNX model loaded from %s", model_path)

    def predict(self, features: np.ndarray) -> float:
        """
        Run inference.

        Parameters
        ----------
        features : np.ndarray
            Shape ``(1, lookback, n_features)`` — float32.

        Returns
        -------
        float
            Confidence score in [0.0, 1.0].
        """
        result = self._session.run(
            None,
            {self._input_name: features.astype(np.float32)},
        )
        # Assume model output is a single sigmoid-activated value
        raw = float(result[0].flat[0])
        return max(0.0, min(1.0, raw))


# ─── Dummy Backend ────────────────────────────────────────────

class _DummyBackend:
    """Returns a neutral 0.5 score.  Used when no model is available."""

    def predict(self, features: np.ndarray) -> float:  # noqa: ARG002
        return 0.5


# ─── Public Interface ─────────────────────────────────────────

class TradeScorer:
    """
    Trade confidence scorer.

    Loads an ONNX model if available, otherwise falls back
    to a dummy scorer that always returns 0.5.
    """

    def __init__(self, model_path: str | None = None):
        path = model_path or Config.ONNX_MODEL_PATH
        if Path(path).is_file():
            try:
                self._backend = _OnnxBackend(path)
            except Exception as exc:
                log.warning("ONNX load failed (%s) — using dummy scorer", exc)
                self._backend = _DummyBackend()
        else:
            log.info(
                "No ONNX model at %s — using dummy scorer (all scores = 0.5)",
                path,
            )
            self._backend = _DummyBackend()

    def predict(self, features: np.ndarray) -> float:
        """
        Score a trade signal.

        Parameters
        ----------
        features : np.ndarray
            Shape ``(1, Config.AI_LOOKBACK, Config.AI_FEATURES)``.

        Returns
        -------
        float
            Confidence in [0.0, 1.0].  Higher = more likely profitable
            within 60 minutes.
        """
        return self._backend.predict(features)

    # ── Utility: export PyTorch → ONNX ────────────────────────

    @staticmethod
    def export_to_onnx(
        pytorch_model,  # nn.Module
        output_path: str,
        lookback: int = Config.AI_LOOKBACK,
        n_features: int = Config.AI_FEATURES,
    ) -> None:
        """
        Export a trained PyTorch LSTM model to ONNX format.

        Usage::

            import torch
            model = MyLSTM()
            model.load_state_dict(torch.load("checkpoint.pt"))
            TradeScorer.export_to_onnx(model, "trade_scorer.onnx")
        """
        import torch

        dummy = torch.randn(1, lookback, n_features)
        torch.onnx.export(
            pytorch_model,
            dummy,
            output_path,
            input_names=["features"],
            output_names=["confidence"],
            dynamic_axes={
                "features": {0: "batch"},
                "confidence": {0: "batch"},
            },
        )
        log.info("Model exported to %s", output_path)
