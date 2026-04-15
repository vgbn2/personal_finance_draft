# SPEC-001: FIR/IIR Filter Research Tool Optimization

## 1. Overview
The goal is to refine and debug the FIR filter research tool located in `_research/backtest/FIR_filter.py`. The tool currently compares a Simple Moving Average (SMA) as a basic FIR filter and an Exponential Moving Average (EMA) as a basic IIR filter, using Geometric Brownian Motion (GBM) for price projections.

## 2. Requirements
- **DSP-Grade Filtering**: Transition from basic SMA/EMA to proper digital signal processing filters.
    - **FIR**: Implementation of a Hamming-windowed Sinc low-pass filter.
    - **IIR**: Implementation of a 2nd-order Butterworth low-pass filter.
- **Bug Fixes**: Resolve naming inconsistencies in the final forecast summary (Cell 6).
- **Premium Visualization**: Implement a high-fidelity, "Forensic" dark-mode visualization for trend extraction and projection.
- **Modular Design**: Ensure the code remains modular and easy to import into Jupyter Notebooks.
- **Sync**: Synchronize `FIR_filter.py` and `FIR_filter.ipynb` logic.

## 3. Technical Constraints
- Use `scipy.signal` for filter design and application.
- Maintain `yfinance` for data acquisition.
- Utilize `numpy` for all vector operations to ensure high performance.
- Plotting must follow the "Visual Excellence" guidelines (no browser defaults, custom typography).

## 4. Success Criteria
- [ ] FIR/IIR naming is consistent across the script and notebook.
- [ ] Sinc and Butterworth filters are verified to produce smoother trends than SMA/EMA.
- [ ] Visualization matches the requested "Premium" aesthetic.
- [ ] Empirical validation (plots) captured before final sign-off.
