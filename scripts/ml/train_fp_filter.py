#!/usr/bin/env python3
"""
Train KTR false positive filter model from labeled data.

Reads exported CSV (from export_training_data.py), trains an MLP,
and exports to ONNX. Uses numpy-only training (no PyTorch required).

Usage:
  python scripts/ml/train_fp_filter.py --input data/training.csv [--version v2]

Output: public/models/ktr-fp-filter-{version}.onnx + updated manifest.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Reuse the NumpyMLP and ONNX export from bootstrap script
sys.path.insert(0, str(Path(__file__).parent))
from create_bootstrap_model import NumpyMLP, export_onnx, sigmoid


FEATURE_COLS = [
    "msd", "phase", "spectral", "comb", "ihr", "ptmr",
    "fused_prob", "fused_conf",
    "is_speech", "is_music", "is_compressed",
]


def load_csv(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Load training CSV into feature matrix X and label vector y."""
    rows = []
    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            features = [float(row[col]) for col in FEATURE_COLS]
            label = float(row["label"])
            rows.append((features, label))

    if not rows:
        print("No rows in training data")
        sys.exit(1)

    X = np.array([r[0] for r in rows], dtype=np.float32)
    y = np.array([[r[1]] for r in rows], dtype=np.float32)
    return X, y


def train(
    X: np.ndarray,
    y: np.ndarray,
    epochs: int = 500,
    lr: float = 0.002,
    batch_size: int = 64,
    val_split: float = 0.2,
    seed: int = 42,
) -> tuple[NumpyMLP, dict]:
    """Train MLP on labeled data. Returns (model, metrics)."""
    rng = np.random.default_rng(seed)

    # Shuffle and split
    indices = rng.permutation(len(X))
    split = int(len(X) * (1 - val_split))
    X_train, y_train = X[indices[:split]], y[indices[:split]]
    X_val, y_val = X[indices[split:]], y[indices[split:]]

    print(f"Training: {len(X_train)} samples, Validation: {len(X_val)} samples")

    model = NumpyMLP(seed=seed)
    best_val_loss = float('inf')
    patience = 0
    max_patience = 40

    for epoch in range(epochs):
        # Mini-batch SGD
        batch_indices = rng.permutation(len(X_train))
        epoch_loss = 0.0
        n_batches = 0

        for start in range(0, len(X_train), batch_size):
            idx = batch_indices[start:start + batch_size]
            _, cache = model.forward(X_train[idx])
            batch_loss = model.backward(cache, y_train[idx], lr=lr)
            epoch_loss += batch_loss
            n_batches += 1

        epoch_loss /= n_batches

        # Validation
        val_pred = model.predict(X_val)
        val_loss = float(np.mean((val_pred - y_val) ** 2))

        if epoch % 50 == 0:
            print(f"  Epoch {epoch:3d}: train={epoch_loss:.4f} val={val_loss:.4f}")

        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            patience = 0
        else:
            patience += 1
            if patience >= max_patience:
                print(f"  Early stopping at epoch {epoch} (val={val_loss:.4f})")
                break

    # Compute final metrics
    val_pred = model.predict(X_val)
    val_loss = float(np.mean((val_pred - y_val) ** 2))

    # Precision/recall at threshold 0.5 for FP detection
    # label < 0.5 = false positive, pred < 0.5 = model predicts FP
    true_fp = y_val.flatten() < 0.5
    pred_fp = val_pred.flatten() < 0.5
    tp = np.sum(true_fp & pred_fp)
    fp_count = np.sum(~true_fp & pred_fp)
    fn_count = np.sum(true_fp & ~pred_fp)

    precision = tp / (tp + fp_count) if (tp + fp_count) > 0 else 0.0
    recall = tp / (tp + fn_count) if (tp + fn_count) > 0 else 0.0

    metrics = {
        "val_loss": round(val_loss, 6),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "training_samples": len(X_train),
        "validation_samples": len(X_val),
        "total_samples": len(X),
    }

    print(f"\nMetrics: val_loss={val_loss:.4f} precision={precision:.3f} recall={recall:.3f}")
    return model, metrics


def update_manifest(manifest_path: Path, version: str, onnx_filename: str, metrics: dict) -> None:
    """Update manifest.json with new model version."""
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        manifest = {"models": {}}

    manifest["current"] = onnx_filename
    manifest["version"] = version
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    manifest["models"][version] = {
        "file": onnx_filename,
        "type": "trained",
        "description": f"Trained on {metrics['total_samples']} labeled events",
        "features": 11,
        "architecture": "MLP 11->32->16->1",
        "params": 929,
        "trainingSamples": metrics["training_samples"],
        "valLoss": metrics["val_loss"],
        "precision": metrics["precision"],
        "recall": metrics["recall"],
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Updated {manifest_path}")


def main():
    parser = argparse.ArgumentParser(description="Train KTR FP filter model")
    parser.add_argument("--input", "-i", required=True, help="Training CSV from export_training_data.py")
    parser.add_argument("--version", "-v", default="v2", help="Model version (default: v2)")
    parser.add_argument("--epochs", type=int, default=500, help="Max training epochs")
    parser.add_argument("--lr", type=float, default=0.002, help="Learning rate")
    parser.add_argument("--min-samples", type=int, default=100, help="Minimum samples to train")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Training data not found: {input_path}")
        print("Run export_training_data.py first.")
        sys.exit(1)

    print(f"=== KTR FP Filter Training ({args.version}) ===\n")

    X, y = load_csv(input_path)
    print(f"Loaded {len(X)} samples, {11} features")

    if len(X) < args.min_samples:
        print(f"\nWarning: Only {len(X)} samples (minimum: {args.min_samples})")
        print("Collect more user feedback before training. Aborting.")
        sys.exit(0)

    # Label distribution
    fp_count = np.sum(y.flatten() < 0.5)
    pos_count = np.sum(y.flatten() >= 0.5)
    print(f"Labels: {pos_count} positive, {fp_count} false positive")

    if fp_count == 0 or pos_count == 0:
        print("Warning: No class balance. Need both CONFIRM and FALSE+ labels.")
        sys.exit(0)

    model, metrics = train(X, y, epochs=args.epochs, lr=args.lr)

    # Export
    models_dir = Path(__file__).parent.parent.parent / "public" / "models"
    onnx_filename = f"ktr-fp-filter-{args.version}.onnx"
    onnx_path = models_dir / onnx_filename

    print(f"\nExporting to {onnx_path}...")
    export_onnx(model, onnx_path)

    # Update manifest
    manifest_path = models_dir / "manifest.json"
    update_manifest(manifest_path, f"ktr-fp-{args.version}", onnx_filename, metrics)

    print(f"\nDone! Deploy {onnx_filename} to production.")


if __name__ == "__main__":
    main()
