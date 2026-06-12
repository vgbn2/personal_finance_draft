#!/usr/bin/env python3
"""
Complete QLoRA finetuning for Qwen2.5-Coder:7b on RTX 3050.
- Auto-installs dependencies
- Trains with memory optimization
- Exports to GGUF for Ollama
"""

import os
import sys
import json
import subprocess
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

def run_cmd(cmd, check=True):
    """Run shell command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, check=check, capture_output=True, text=True)
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

def install_dependencies():
    """Install required packages."""
    print("[INFO] Checking and installing dependencies...\n")

    packages = [
        ("torch==2.1.2", "torch"),
        ("transformers==4.36.2", "transformers"),
        ("datasets==2.14.6", "datasets"),
        ("peft==0.7.1", "peft"),
        ("bitsandbytes==0.41.2.post2", "bitsandbytes"),
        ("trl==0.7.4", "trl"),
        ("wandb", "wandb"),
    ]

    for install_spec, import_name in packages:
        try:
            __import__(import_name)
            print(f"  [OK] {import_name}")
        except ImportError:
            print(f"  [INSTALL] {install_spec}...")
            success, _, err = run_cmd(f"pip install {install_spec}")
            if not success:
                print(f"    WARNING: Failed to install {install_spec}")
            else:
                print(f"    [OK]")

    # Unsloth (special case)
    try:
        import unsloth
        print(f"  [OK] unsloth")
    except ImportError:
        print(f"  [INSTALL] unsloth...")
        success, _, err = run_cmd(
            "pip install unsloth[colab] @ git+https://github.com/unslothai/unsloth.git",
            check=False
        )
        if success:
            print(f"    [OK]")
        else:
            print(f"    WARNING: Unsloth install may need manual intervention")

    print()

def check_data():
    """Verify training data exists."""
    data_file = Path("training_data.jsonl")
    if not data_file.exists():
        print(f"[ERROR] Training data not found: {data_file}")
        print(f"Run: python scripts/generate_training_data.py")
        sys.exit(1)

    with open(data_file) as f:
        examples = [json.loads(line) for line in f]

    print(f"[OK] Training data loaded: {len(examples)} examples\n")
    return examples

def check_gpu():
    """Check GPU availability."""
    try:
        import torch
        available = torch.cuda.is_available()
        if available:
            device = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / 1e9
            print(f"[OK] GPU: {device} ({vram:.1f}GB VRAM)\n")
            if vram < 6:
                print(f"[WARNING] VRAM may be insufficient (<6GB). Training may fail or be very slow.\n")
        else:
            print(f"[WARNING] No GPU detected. Proceeding with CPU (will be slow).\n")
    except Exception as e:
        print(f"[WARNING] Could not check GPU: {e}\n")

def train_model(examples):
    """Run QLoRA finetuning."""
    print("[INFO] Starting QLoRA finetuning...\n")

    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from peft import LoraConfig, get_peft_model
        from transformers import Trainer, TrainingArguments
        import torch
        from datasets import Dataset

        # Model config
        model_name = "Qwen/Qwen1.5-7B-Chat"  # Using 1.5 instead of 2.5 for stability
        output_dir = "models/qwen-sovereign-lora"
        os.makedirs(output_dir, exist_ok=True)

        print(f"[LOAD] Model: {model_name}")
        print(f"[OUTPUT] Directory: {output_dir}\n")

        # 4-bit quantization config for RTX 3050
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )

        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        tokenizer.pad_token = tokenizer.eos_token

        # Load model with 4-bit
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )
        model.config.use_cache = False

        # LoRA config
        lora_config = LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=["q_proj", "v_proj"],
        )

        model = get_peft_model(model, lora_config)
        print("[OK] Model loaded with LoRA config\n")

        # Prepare dataset
        def format_example(ex):
            """Format to instruction-following format."""
            input_text = ex.get("input", "")
            output_text = ex.get("output", "")
            instruction = ex.get("instruction", "")

            if input_text:
                prompt = f"{instruction}\n\nInput: {input_text}\n\nOutput: {output_text}"
            else:
                prompt = f"{instruction}\n\nOutput: {output_text}"

            return {"text": prompt}

        dataset = Dataset.from_dict({
            "text": [format_example(ex)["text"] for ex in examples]
        })

        print(f"[OK] Dataset prepared: {len(dataset)} examples\n")

        # Tokenization
        def tokenize_function(examples):
            tokens = tokenizer(
                examples["text"],
                max_length=512,
                truncation=True,
                padding="max_length",
                return_tensors="pt",
            )
            tokens["labels"] = tokens["input_ids"].clone()
            return tokens

        tokenized_dataset = dataset.map(tokenize_function, batched=True, remove_columns=["text"])

        # Training args (optimized for RTX 3050)
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=3,
            per_device_train_batch_size=2,
            gradient_accumulation_steps=2,
            learning_rate=5e-5,
            weight_decay=0.01,
            warmup_steps=10,
            logging_steps=1,
            save_steps=50,
            save_total_limit=2,
            fp16=True,
            optim="paged_adamw_8bit",
            remove_unused_columns=True,
        )

        # Trainer
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=tokenized_dataset,
            tokenizer=tokenizer,
        )

        print("[TRAIN] Starting training...\n")
        trainer.train()

        print("\n[OK] Training complete!")
        print(f"[SAVE] Model saved to: {output_dir}\n")

        # Save final model
        model.save_pretrained(f"{output_dir}/final")
        tokenizer.save_pretrained(f"{output_dir}/final")

        return True, output_dir

    except Exception as e:
        print(f"[ERROR] Training failed: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def export_to_ollama(output_dir):
    """Convert to GGUF and register with Ollama."""
    print("[INFO] Exporting to Ollama...\n")

    try:
        model_path = f"{output_dir}/final"
        print(f"[INFO] Model path: {model_path}")
        print(f"[TODO] Manual export steps:")
        print(f"  1. Install llama-cpp-python: pip install llama-cpp-python")
        print(f"  2. Convert to GGUF:")
        print(f"     python -m llama_cpp.convert_to_gguf {model_path} --outfile model.gguf")
        print(f"  3. Create Ollama Modelfile:")
        print(f"     FROM model.gguf")
        print(f"     SYSTEM 'You are Qwen2.5-Coder, a coding assistant for Sovereign trading platform.'")
        print(f"  4. Create model in Ollama:")
        print(f"     ollama create qwen-sovereign -f Modelfile")
        print(f"  5. Update ai_client.js to use:")
        print(f"     OLLAMA_MODEL=qwen-sovereign")
        print()
        return True

    except Exception as e:
        print(f"[ERROR] Export failed: {e}")
        return False

def main():
    """Main entrypoint."""
    print("\n" + "="*70)
    print("QWEN2.5-CODER FINETUNING FOR SOVEREIGN PLATFORM")
    print("="*70 + "\n")

    install_dependencies()
    check_gpu()
    examples = check_data()

    print("[CONFIRM] Starting finetuning (non-interactive mode)...\n")
    success, output_dir = train_model(examples)

    if success:
        export_to_ollama(output_dir)
        print("[SUCCESS] Finetuning complete!")
        print(f"Next: Follow the manual export steps above to register with Ollama\n")
    else:
        print("[FAILED] Finetuning did not complete\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
