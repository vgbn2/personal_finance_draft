"""
Sentinel-MT5 — Model Trainer
============================
Trains a GRU + Attention model to score trade setups.
Exports the trained model to ONNX for use in the bot.

Usage:
    python ai/model_trainer.py [--epochs 50] [--batch 64]

requirements:
    pip install torch pandas scikit-learn
"""
import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split

# Add project root
sys.path.append(str(Path(__file__).parent.parent))

from core.config import Config
from ai.feature_engine import FeatureEngine

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("trainer")

# ─── Configuration ────────────────────────────────────────────
LOOKBACK = Config.AI_LOOKBACK
FEATURES = Config.AI_FEATURES
HIDDEN_DIM = 64
LAYERS = 2
DROPOUT = 0.2
LEARNING_RATE = 0.001

# ─── Model Architecture ───────────────────────────────────────
class GRUAttention(nn.Module):
    def __init__(self, input_dim=FEATURES, hidden_dim=HIDDEN_DIM, num_layers=LAYERS):
        super().__init__()
        self.hidden_dim = hidden_dim
        
        # GRU Layer
        self.gru = nn.GRU(
            input_dim, hidden_dim, num_layers, 
            batch_first=True, dropout=DROPOUT
        )
        
        # Attention Mechanism
        self.attention = nn.Linear(hidden_dim, 1)
        
        # Output Head
        self.fc = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        # x shape: (batch, lookback, features)
        out, _ = self.gru(x)  # out: (batch, lookback, hidden)
        
        # Attention weights
        attn_weights = torch.softmax(self.attention(out), dim=1)
        
        # Context vector (weighted sum of all time steps)
        context = torch.sum(attn_weights * out, dim=1)
        
        # Final prediction
        return self.fc(context)

# ─── Dataset ──────────────────────────────────────────────────
class SentinelDataset(Dataset):
    def __init__(self, sequences, labels):
        self.sequences = torch.FloatTensor(sequences)
        self.labels = torch.FloatTensor(labels)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.sequences[idx], self.labels[idx]

def load_data(data_dir: Path):
    """
    Loads M15 CSVs and generates training examples.
    Target: 1 if price rises > 0.05% in next 4 bars (1 hour), else 0.
    """
    all_seqs = []
    all_labels = []
    engine = FeatureEngine()

    csv_files = list(data_dir.glob("*_M15.csv"))
    if not csv_files:
        log.error(f"No CSV files found in {data_dir}. Run fetch_training_data.py first!")
        return [], []

    for file in csv_files:
        log.info(f"Processing {file.name}...")
        df = pd.read_csv(file)
        
        if len(df) < LOOKBACK + 4:
            continue

        # 1. Calculate Features (Batched via Engine refactor)
        # Note: We need raw arrays for the engine
        close = df['close'].values
        high = df['high'].values
        low = df['low'].values
        vol = df['tick_volume'].values

        # This gives us (1, len, 4) -> squeeze to (len, 4)
        # We process the WHOLE series at once to be fast
        # But feature_engine is designed for rolling window on live data.
        # For training, it's efficient to just re-implement vectorised logic here 
        # OR just loop (slow but safe). Let's loop for safety/correctness match.
        
        # ACTUALLY: The feature engine is stateless. We can just loop.
        # Optimization: We'll compute the "full series" features if possible, 
        # but the current engine does rolling Z on the fly. 
        # Let's trust the engine's `compute_features` handles full arrays correctly 
        # because it uses `_rolling_zscore` which iterates.
        
        # The engine returns (1, lookback, 4). We need (Total_Rows, 4).
        # We need to adapt the engine or just reproduce the logic for bulk processing.
        # Reproduction is safer for bulk speed.
        
        # ... Re-implementing simplified Bulk Feature Gen for Speed ...
        # (Z-Score Price, Z-Score Vol, ATR Ratio, VWAP Dev)
        
        # -- Helpers --
        def roll_z(arr, w=20):
            r = pd.Series(arr).rolling(w)
            m = r.mean()
            s = r.std(ddof=0)
            z = (arr - m) / (s + 1e-9)
            return z.fillna(0).clip(-3, 3).values

        def roll_mean(arr, w):
            return pd.Series(arr).rolling(w).mean().fillna(0).values

        # F0: Return Z
        ret = np.diff(close, prepend=close[0]) / (close + 1e-9)
        f0 = roll_z(ret)

        # F1: Vol Z
        v_chg = np.diff(vol, prepend=vol[0]) / (vol + 1e-9)
        f1 = roll_z(v_chg)

        # F2: ATR Ratio
        tr = np.maximum(high - low, np.abs(high - np.roll(close, 1)))
        atr5 = roll_mean(tr, 5)
        atr20 = roll_mean(tr, 20)
        f2 = np.clip(atr5 / (atr20 + 1e-9), 0, 5) / 5.0

        # F3: VWAP Dev
        tp = (high + low + close) / 3
        vp = tp * vol
        cum_vp = np.cumsum(vp)
        cum_v = np.cumsum(vol)
        vwap = cum_vp / (cum_v + 1e-9)
        vwap_dev = (close - vwap) / (vwap + 1e-9)
        f3 = roll_z(vwap_dev)

        features = np.column_stack([f0, f1, f2, f3]) # (N, 4)

        # 2. Generate Targets (Lookforward)
        # Target: Price > 0.1% higher in 4 bars?
        future_close = pd.Series(close).shift(-4)
        change = (future_close - close) / close
        targets = (change > 0.001).astype(float).values # 0.1% gain

        # 3. Slice Sequences
        # We need [t-50 : t] to predict t+4
        for i in range(LOOKBACK + 50, len(df) - 4):
            seq = features[i-LOOKBACK : i]
            label = targets[i]
            
            all_seqs.append(seq)
            all_labels.append(label)

    return np.array(all_seqs), np.array(all_labels)

# ─── Training Loop ────────────────────────────────────────────
def train(args):
    data_dir = Path(__file__).parent / "data" / "raw"
    
    # Check for dummy mode
    if args.dummy:
        log.info("Generating dummy data...")
        X = np.random.randn(1000, LOOKBACK, FEATURES).astype(np.float32)
        y = np.random.randint(0, 2, 1000).astype(np.float32)
    else:
        log.info("Loading real data...")
        X, y = load_data(data_dir)
    
    if len(X) == 0:
        log.error("No training data found. Exiting.")
        return

    # Split
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, shuffle=False)
    
    # Loaders
    train_loader = DataLoader(SentinelDataset(X_train, y_train), batch_size=args.batch, shuffle=True)
    val_loader = DataLoader(SentinelDataset(X_val, y_val), batch_size=args.batch)

    # Model Setup
    model = GRUAttention()
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

    # Train
    model.train()
    best_loss = float('inf')
    
    log.info(f"Starting training on {len(X_train)} samples...")
    
    for epoch in range(args.epochs):
        total_loss = 0
        for X_batch, y_batch in train_loader:
            optimizer.zero_grad()
            y_pred = model(X_batch).squeeze()
            loss = criterion(y_pred, y_batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        # Validation
        model.eval()
        val_loss = 0
        correct = 0
        with torch.no_grad():
            for X_v, y_v in val_loader:
                out = model(X_v).squeeze()
                val_loss += criterion(out, y_v).item()
                predicted = (out > 0.5).float()
                correct += (predicted == y_v).sum().item()
        
        val_acc = correct / len(X_val)
        avg_val_loss = val_loss / len(val_loader)
        
        if epoch % 5 == 0:
            log.info(f"Epoch {epoch+1}/{args.epochs} | Train Loss: {total_loss/len(train_loader):.4f} | Val Loss: {avg_val_loss:.4f} | Acc: {val_acc:.2%}")

        # Save Best
        if avg_val_loss < best_loss:
            best_loss = avg_val_loss
            # Save internal state
            torch.save(model.state_dict(), "best_model.pt")
        
        model.train()

    # ─── Export ONNX ──────────────────────────────────────────
    try:
        log.info("Exporting best model to ONNX...")
        model.load_state_dict(torch.load("best_model.pt"))
        model.eval()
        
        output_path = Path(__file__).parent / "models" / "trade_scorer.onnx"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        dummy_input = torch.randn(1, LOOKBACK, FEATURES)
        torch.onnx.export(
            model,
            dummy_input,
            str(output_path),
            input_names=["features"],
            output_names=["confidence"],
            dynamic_axes={"features": {0: "batch"}, "confidence": {0: "batch"}}
        )
        log.info(f"✅ Success! Model saved to {output_path}")
    except Exception as e:
        log.error(f"❌ ONNX Export Failed: {e}")
        log.warning("The PyTorch model 'best_model.pt' is saved and can be used for retraining.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dummy", action="store_true", help="Use dummy data for testing")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=64)
    args = parser.parse_args()
    
    train(args)
