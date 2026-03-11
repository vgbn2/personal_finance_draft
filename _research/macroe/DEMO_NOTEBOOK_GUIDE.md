# Demo Notebook Quick Start

## TL;DR
This notebook demonstrates the refactored `macroe` modules interactively.

## Installation (One-Time Setup)
```bash
pip install jupyter pandas rich aiohttp python-dotenv py-clob-client
```

## Running the Notebook

### Option A: Jupyter Server
```bash
cd macroe
jupyter notebook demo_notebook.ipynb
```

### Option B: VS Code
1. Open `demo_notebook.ipynb` in VS Code
2. Click "Select Kernel" → Choose Python 3.11+
3. Click "Run All" at the top

## What Gets Tested

✅ **Always Works:**
- Module imports
- Helper function tests (window calculations)
- Trading signal logic

⚠️ **Needs Data:**
- Currency Strength Meter (requires CSV files from `global_runner.py`)

🔐 **Needs Credentials:**
- Polymarket client demo (requires `.env` with PRIVATE_KEY)

## Troubleshooting

**No CSV files?** → Run `python global_runner.py` first  
**Module not found?** → Ensure kernel is in `macroe/` directory  
**Async errors?** → Add `pip install nest-asyncio` and use `nest_asyncio.apply()`

## Expected Output

When working correctly, you'll see:
1. ✅ Green checkmark for imports
2. Rich table with currency rankings (or "No data" message)
3. Trading signal recommendations based on USD strength
