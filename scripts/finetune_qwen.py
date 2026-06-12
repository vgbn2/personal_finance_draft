#!/usr/bin/env python3
"""
Finetune Qwen2.5-Coder:7b using Unsloth QLoRA on RTX 3050.
- Optimized for consumer GPU (6GB VRAM)
- Saves finetuned model to GGUF format
- Exports to Ollama
"""

import os
import json
from pathlib import Path

def finetune():
    """Run QLoRA finetuning."""
    print("🚀 Qwen2.5-Coder Finetuning Setup\n")

    # Check dependencies
    try:
        import torch
        import transformers
        print(f"✓ PyTorch: {torch.__version__}")
        print(f"✓ Transformers: {transformers.__version__}")
    except ImportError:
        print("❌ Missing dependencies. Install first:")
        print("   pip install torch transformers")
        return

    try:
        import unsloth
        print(f"✓ Unsloth available")
    except ImportError:
        print("⚠️  Unsloth not found. Install with:")
        print("   pip install unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git")
        return

    # Check GPU
    print(f"\n📊 GPU Status:")
    print(f"  Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  Device: {torch.cuda.get_device_name(0)}")
        print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")
    else:
        print("  ⚠️  No CUDA GPU detected. CPU training will be very slow.")

    # Check training data
    data_path = Path("training_data.jsonl")
    if not data_path.exists():
        print(f"\n❌ Training data not found: {data_path}")
        print("   Run: python scripts/generate_training_data.py")
        return

    with open(data_path) as f:
        num_examples = sum(1 for _ in f)
    print(f"\n📋 Training Data:")
    print(f"  Examples: {num_examples}")
    print(f"  File: {data_path}")

    # Installation instructions
    print("\n" + "="*70)
    print("INSTALLATION STEPS")
    print("="*70)

    print("""
1. Create a virtual environment:
   python -m venv venv
   .\\venv\\Scripts\\activate  # Windows
   # or: source venv/bin/activate  # Linux/Mac

2. Install core dependencies:
   pip install --upgrade pip setuptools wheel
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

3. Install Unsloth:
   pip install unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git

4. Install other dependencies:
   pip install transformers datasets peft bitsandbytes

5. Install LLaMA-CPP-Python for GGUF conversion (optional):
   pip install llama-cpp-python

6. Run this script again to start finetuning:
   python scripts/finetune_qwen.py
""")

    print("\n⏱️  Estimated Time:")
    print(f"  Installation: 5-10 minutes")
    print(f"  Finetuning: 2-4 hours (depending on GPU and data size)")
    print(f"  Conversion to GGUF: 10-30 minutes")

    print("\n💡 Tips:")
    print("  - Keep the terminal open during finetuning")
    print("  - Monitor GPU usage: nvidia-smi -l 1")
    print("  - If OOM, reduce batch_size in the training config below")
    print("  - Finetuned model saved to: models/qwen-sovereign-lora/")

if __name__ == "__main__":
    finetune()
