#!/usr/bin/env python3
"""
Create bootstrap ONNX model for KTR false positive filtering.

Encodes existing gate logic (IHR, PTMR, formant-like patterns) as a small MLP
(11->32->16->1) and exports to ONNX format for browser-side inference.

Uses only numpy + onnx (no PyTorch required). Trains via simple numpy
gradient descent -- sufficient for ~1K params on synthetic data.

Feature vector (11 inputs):
  [0] MSD feedbackScore          [0,1]
  [1] Phase feedbackScore        [0,1]
  [2] Spectral feedbackScore     [0,1]
  [3] Comb confidence            [0,1]
  [4] IHR feedbackScore          [0,1]
  [5] PTMR feedbackScore         [0,1]
  [6] Previous fused probability [0,1]
  [7] Previous fused confidence  [0,1]
  [8] isSpeech                   {0,1}
  [9] isMusic                    {0,1}
  [10] isCompressed              {0,1}

Output: feedbackScore [0,1] where lower = more likely false positive.

Usage:
  pip install numpy onnx
  python scripts/ml/create_bootstrap_model.py

Output: public/models/ktr-fp-filter-v1.onnx
"""

from __future__ import annotations

import numpy as np
from pathlib import Path


# -- Gate logic -> synthetic training data --------------------------------

def generate_gate_training_data(n_samples: int = 20000) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic training data encoding existing KTR gate logic.

    The target score reflects what the existing multiplicative gates do:
    - IHR gate: IHR > 0.35 + comb > 0.3 -> x0.65 (instrument suppression)
    - PTMR gate: PTMR < 0.2 -> x0.80 (broad peak suppression)
    - Formant gate: speech + spectral > 0.4 + low comb + phase > 0.5 -> x0.70
    - Music IHR: music + IHR > 0.5 + phase > 0.6 -> x0.75
    - Compressed phase: compressed + phase > 0.7 + spectral < 0.3 -> x0.70
    """
    rng = np.random.default_rng(42)
    X = np.zeros((n_samples, 11), dtype=np.float32)
    y = np.zeros((n_samples, 1), dtype=np.float32)

    for i in range(n_samples):
        msd = rng.uniform(0, 1)
        phase = rng.uniform(0, 1)
        spectral = rng.uniform(0, 1)
        comb = rng.uniform(0, 1)
        ihr = rng.uniform(0, 1)
        ptmr = rng.uniform(0, 1)
        prev_prob = rng.uniform(0, 1)
        prev_conf = rng.uniform(0, 1)

        content = rng.choice(4)  # 0=default, 1=speech, 2=music, 3=compressed
        is_speech = 1.0 if content == 1 else 0.0
        is_music = 1.0 if content == 2 else 0.0
        is_compressed = 1.0 if content == 3 else 0.0

        X[i] = [msd, phase, spectral, comb, ihr, ptmr,
                prev_prob, prev_conf, is_speech, is_music, is_compressed]

        # Baseline: average of 6 algorithm scores
        algo_scores = [msd, phase, spectral, comb, ihr, ptmr]
        score = float(np.mean(algo_scores))

        # IHR gate
        if ihr > 0.35 and comb > 0.3:
            score *= 0.65

        # PTMR gate
        if ptmr < 0.2:
            score *= 0.80

        # Formant gate (speech)
        if is_speech > 0.5 and spectral > 0.4 and comb < 0.2 and phase > 0.5:
            score *= 0.70

        # Music harmonic suppression
        if is_music > 0.5 and ihr > 0.5 and phase > 0.6:
            score *= 0.75

        # Auto-Tune artifact suppression
        if is_compressed > 0.5 and phase > 0.7 and spectral < 0.3:
            score *= 0.70

        # High agreement boost
        high_count = sum(1 for s in algo_scores if s > 0.7)
        if high_count >= 4:
            score = max(score, 0.75)

        # Low agreement suppression
        low_count = sum(1 for s in algo_scores if s < 0.3)
        if low_count >= 3 and high_count <= 1:
            score = min(score, 0.35)

        y[i] = np.clip(score, 0.0, 1.0)

    return X, y


# -- Numpy MLP (train without PyTorch) -----------------------------------

def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -500, 500)))


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0, x)


def relu_grad(x: np.ndarray) -> np.ndarray:
    return (x > 0).astype(np.float32)


class NumpyMLP:
    """Tiny MLP trained with numpy-only backprop. 11->32->16->1."""

    def __init__(self, seed: int = 42):
        rng = np.random.default_rng(seed)
        # He initialization for ReLU layers
        self.W1 = (rng.standard_normal((11, 32)) * np.sqrt(2.0 / 11)).astype(np.float32)
        self.b1 = np.zeros(32, dtype=np.float32)
        self.W2 = (rng.standard_normal((32, 16)) * np.sqrt(2.0 / 32)).astype(np.float32)
        self.b2 = np.zeros(16, dtype=np.float32)
        self.W3 = (rng.standard_normal((16, 1)) * np.sqrt(2.0 / 16)).astype(np.float32)
        self.b3 = np.zeros(1, dtype=np.float32)

    def forward(self, X: np.ndarray) -> tuple[np.ndarray, dict]:
        """Forward pass, returns (output, cache for backprop)."""
        z1 = X @ self.W1 + self.b1
        a1 = relu(z1)
        z2 = a1 @ self.W2 + self.b2
        a2 = relu(z2)
        z3 = a2 @ self.W3 + self.b3
        out = sigmoid(z3)
        cache = {"X": X, "z1": z1, "a1": a1, "z2": z2, "a2": a2, "z3": z3, "out": out}
        return out, cache

    def predict(self, X: np.ndarray) -> np.ndarray:
        out, _ = self.forward(X)
        return out

    def backward(self, cache: dict, y_true: np.ndarray, lr: float = 0.001) -> float:
        """Backprop + SGD update. Returns MSE loss."""
        n = len(y_true)
        out = cache["out"]

        # MSE loss
        loss = float(np.mean((out - y_true) ** 2))

        # d_loss/d_out = 2*(out - y) / n
        d_out = 2.0 * (out - y_true) / n

        # Sigmoid gradient: out * (1 - out)
        d_z3 = d_out * out * (1.0 - out)

        # Layer 3
        d_W3 = cache["a2"].T @ d_z3
        d_b3 = d_z3.sum(axis=0)
        d_a2 = d_z3 @ self.W3.T

        # ReLU 2
        d_z2 = d_a2 * relu_grad(cache["z2"])

        # Layer 2
        d_W2 = cache["a1"].T @ d_z2
        d_b2 = d_z2.sum(axis=0)
        d_a1 = d_z2 @ self.W2.T

        # ReLU 1
        d_z1 = d_a1 * relu_grad(cache["z1"])

        # Layer 1
        d_W1 = cache["X"].T @ d_z1
        d_b1 = d_z1.sum(axis=0)

        # SGD update
        self.W3 -= lr * d_W3
        self.b3 -= lr * d_b3
        self.W2 -= lr * d_W2
        self.b2 -= lr * d_b2
        self.W1 -= lr * d_W1
        self.b1 -= lr * d_b1

        return loss


def train_model() -> NumpyMLP:
    """Train the bootstrap MLP on synthetic gate data."""
    print("Generating synthetic training data...")
    X_all, y_all = generate_gate_training_data(n_samples=20000)

    split = int(len(X_all) * 0.8)
    X_train, y_train = X_all[:split], y_all[:split]
    X_val, y_val = X_all[split:], y_all[split:]

    model = NumpyMLP(seed=42)
    param_count = 11*32 + 32 + 32*16 + 16 + 16*1 + 1
    print(f"Model parameters: {param_count:,}")
    print(f"Training on {len(X_train)} samples, validating on {len(X_val)}...")

    best_val_loss = float('inf')
    patience = 0
    max_patience = 30
    lr = 0.002

    for epoch in range(500):
        # Mini-batch training (batch_size=256)
        indices = np.random.permutation(len(X_train))
        batch_size = 256
        epoch_loss = 0.0
        n_batches = 0

        for start in range(0, len(X_train), batch_size):
            batch_idx = indices[start:start + batch_size]
            X_batch = X_train[batch_idx]
            y_batch = y_train[batch_idx]
            _, cache = model.forward(X_batch)
            batch_loss = model.backward(cache, y_batch, lr=lr)
            epoch_loss += batch_loss
            n_batches += 1

        epoch_loss /= n_batches

        # Validation
        val_pred = model.predict(X_val)
        val_loss = float(np.mean((val_pred - y_val) ** 2))

        if epoch % 50 == 0:
            print(f"  Epoch {epoch:3d}: train_loss={epoch_loss:.4f}  val_loss={val_loss:.4f}")

        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            patience = 0
        else:
            patience += 1
            if patience >= max_patience:
                print(f"  Early stopping at epoch {epoch} (val_loss={val_loss:.4f})")
                break

    print(f"  Final val_loss: {best_val_loss:.4f}")
    return model


# -- ONNX export (no PyTorch, builds graph directly) ---------------------

def export_onnx(model: NumpyMLP, output_path: Path) -> None:
    """Build ONNX graph from numpy weights and save."""
    import onnx
    from onnx import helper, TensorProto, numpy_helper

    # Create weight initializers
    initializers = [
        numpy_helper.from_array(model.W1.T, name="W1"),  # Transpose for Gemm
        numpy_helper.from_array(model.b1, name="b1"),
        numpy_helper.from_array(model.W2.T, name="W2"),
        numpy_helper.from_array(model.b2, name="b2"),
        numpy_helper.from_array(model.W3.T, name="W3"),
        numpy_helper.from_array(model.b3, name="b3"),
    ]

    # Build computation graph: input -> Gemm -> Relu -> Gemm -> Relu -> Gemm -> Sigmoid -> output
    nodes = [
        helper.make_node("Gemm", ["input", "W1", "b1"], ["z1"], transB=0),
        helper.make_node("Relu", ["z1"], ["a1"]),
        helper.make_node("Gemm", ["a1", "W2", "b2"], ["z2"], transB=0),
        helper.make_node("Relu", ["z2"], ["a2"]),
        helper.make_node("Gemm", ["a2", "W3", "b3"], ["z3"], transB=0),
        helper.make_node("Sigmoid", ["z3"], ["output"]),
    ]

    # I/O definitions
    input_def = helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 11])
    output_def = helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, 1])

    graph = helper.make_graph(
        nodes,
        "ktr-fp-filter",
        [input_def],
        [output_def],
        initializer=initializers,
    )

    onnx_model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    onnx_model.ir_version = 7
    onnx.checker.check_model(onnx_model)
    onnx.save(onnx_model, str(output_path))

    size_kb = output_path.stat().st_size / 1024
    print(f"Exported ONNX model to {output_path} ({size_kb:.1f} KB)")


# -- Verification ---------------------------------------------------------

def verify_model(model: NumpyMLP) -> None:
    """Run sanity checks on the trained model."""
    cases = [
        ("All-high algos", [0.9, 0.9, 0.8, 0.7, 0.2, 0.9, 0.8, 0.8, 0, 0, 0], "> 0.6"),
        ("IHR gate (music)", [0.7, 0.7, 0.5, 0.5, 0.6, 0.5, 0.6, 0.5, 0, 1, 0], "< 0.5"),
        ("Low PTMR", [0.5, 0.5, 0.4, 0.3, 0.3, 0.1, 0.4, 0.4, 0, 0, 0], "< 0.4"),
        ("Speech formant", [0.6, 0.6, 0.5, 0.1, 0.3, 0.4, 0.5, 0.5, 1, 0, 0], "< 0.5"),
        ("All-low algos", [0.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.3, 0, 0, 0], "< 0.3"),
        ("Neutral", [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0], "~0.4-0.6"),
    ]
    for name, features, expected in cases:
        inp = np.array([features], dtype=np.float32)
        score = model.predict(inp)[0, 0]
        print(f"  {name:24s} {score:.3f} (expect {expected})")


# -- Main -----------------------------------------------------------------

def main():
    output_path = Path(__file__).parent.parent.parent / "public" / "models" / "ktr-fp-filter-v1.onnx"

    print("=== KTR Bootstrap Model Creator ===\n")
    model = train_model()

    print("\nVerification:")
    verify_model(model)

    print(f"\nExporting to {output_path}...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_onnx(model, output_path)

    # Verify with ONNX Runtime if available
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(str(output_path))
        test_input = np.array([[0.5]*6 + [0.5, 0.5, 0, 0, 0]], dtype=np.float32)
        result = session.run(None, {"input": test_input})
        print(f"ONNX Runtime check: output={result[0][0][0]:.4f}")
    except ImportError:
        print("(onnxruntime not installed -- skipping runtime check)")

    print("\nDone! Model ready for browser inference.")


if __name__ == "__main__":
    main()
