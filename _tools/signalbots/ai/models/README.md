# AI Models Directory

Place your trained ONNX models here.

## Naming Convention
The default model filename is `trade_scorer.onnx`.

## Configuration
If you use a different filename, update `ONNX_MODEL_PATH` in `.env` or `core/config.py`.

## Model Input Shape
The model must accept an input tensor of shape `(1, 50, 4)`:
- Batch Size: 1
- Lookback: 50 candles
- Features: 4 (Z-score Price, Z-score Volume, ATR Ratio, VWAP Dev)
