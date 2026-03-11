import sys
from pathlib import Path

# Setup path
root = Path(__file__).parent.parent / 'quant_terminal' / 'backend' / 'app'
sys.path.insert(0, str(root))

print(f"Path added: {root}")

try:
    from services.macro.engine import MacroDataPipeline
    print("SUCCESS: Import worked!")
except Exception as e:
    print(f"FAILED: {e}")
except SyntaxError as e:
    print(f"SYNTAX ERROR: {e}")
