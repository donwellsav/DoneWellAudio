/**
 * ML Inference Engine — 7th fusion algorithm for false positive reduction
 *
 * Loads an ONNX model in the Web Worker and runs inference on a feature vector
 * constructed from the 6 existing algorithm scores + fusion context + content type.
 *
 * Design:
 *   - Lazy-loads ONNX Runtime Web (~2MB WASM) via dynamic import() on first warmup()
 *   - Graceful degradation: if ONNX fails to load, isAvailable stays false and
 *     fusion proceeds with 6 algorithms as before
 *   - Feature vector: 11 inputs (6 algo scores + prev fused prob/conf + 3 content one-hot)
 *   - Model: Small MLP (11→32→16→1), ~1K params, <0.5ms inference
 *   - Runs entirely in the worker thread — no main thread blocking
 *
 * @see algorithmFusion.ts for MLScoreResult type and fusion integration
 */

import type { MLScoreResult } from './fusionEngine'
import { ML_SETTINGS } from './constants'

// ONNX Runtime Web types (resolved at runtime via dynamic import)
interface OnnxInferenceSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>
  release(): void
}
interface OnnxTensor {
  new (type: string, data: Float32Array, dims: number[]): unknown
}
interface OnnxModule {
  InferenceSession: {
    create(path: string | ArrayBuffer): Promise<OnnxInferenceSession>
  }
  Tensor: OnnxTensor
}

/**
 * ML inference engine for false positive filtering.
 *
 * Lifecycle:
 *   1. Construct (no-op, cheap)
 *   2. warmup() — begins async ONNX load
 *   3. predict() — returns MLScoreResult or null if not yet loaded
 *   4. dispose() — releases ONNX session memory
 */
export class MLInferenceEngine {
  private _session: OnnxInferenceSession | null = null
  private _onnx: OnnxModule | null = null
  private _loading: Promise<void> | null = null
  private _available = false
  private _modelVersion = 'none'
  private _disposed = false
  private _consecutiveFailures = 0
  private _totalFailures = 0

  /** True once the model is loaded and ready for inference. */
  get isAvailable(): boolean {
    return this._available
  }

  /** Current model version string. */
  get modelVersion(): string {
    return this._modelVersion
  }

  /** Number of consecutive inference failures (resets on success). */
  get consecutiveFailures(): number {
    return this._consecutiveFailures
  }

  /**
   * Begin async model load. Does not block — call once at worker init.
   * Safe to call multiple times (subsequent calls are no-ops).
   */
  warmup(): void {
    if (this._loading || this._available || this._disposed) return
    this._loading = this._loadModel()
  }

  /**
   * @deprecated Use predictCached() instead.
   *
   * This method has an async/sync mismatch: session.run() returns a Promise,
   * but the result variable is read synchronously before the promise resolves.
   * Returns null unless the microtask happens to resolve inline.
   * The hot path (workerFft.ts) correctly uses predictCached().
   *
   * Kept for test compatibility only.
   */
  predict(features: Float32Array): MLScoreResult | null {
    if (!this._available || !this._session || !this._onnx) return null
    if (features.length !== ML_SETTINGS.FEATURE_COUNT) return null

    try {
      const tensor = new (this._onnx.Tensor as unknown as new (type: string, data: Float32Array, dims: number[]) => unknown)(
        'float32', features, [1, ML_SETTINGS.FEATURE_COUNT]
      )
      // session.run() is async — result is typically null on return
      let result: MLScoreResult | null = null
      void this._session.run({ input: tensor }).then(output => {
        const score = output.output?.data[0] ?? 0.5
        result = {
          feedbackScore: Math.max(0, Math.min(1, score)),
          modelConfidence: 1.0,
          isAvailable: true,
          modelVersion: this._modelVersion,
        }
        this._consecutiveFailures = 0
      }).catch((err: unknown) => {
        this._consecutiveFailures++
        this._totalFailures++
        void err
      })

      return result
    } catch {
      return null
    }
  }

  /**
   * Synchronous prediction using cached ONNX session.
   * Returns the last successful prediction for a given feature vector,
   * or a fallback score if the model hasn't run yet.
   *
   * For the hot path, we maintain a prediction cache that updates
   * asynchronously but is read synchronously.
   */
  private _lastPrediction: MLScoreResult | null = null
  private _pendingFeatures: Float32Array | null = null
  private _inferenceInFlight = false

  /**
   * Queue a prediction and return the most recent cached result.
   * This avoids blocking the worker on async ONNX inference.
   *
   * @param features - 11-element feature vector
   * @returns Last cached MLScoreResult, or null if no prediction yet
   */
  predictCached(features: Float32Array): MLScoreResult | null {
    if (!this._available || !this._session || !this._onnx) return null
    if (features.length !== ML_SETTINGS.FEATURE_COUNT) return null

    // Snapshot features — caller may reuse the same buffer across frames,
    // so we must copy to avoid reading mutated data during async inference
    this._pendingFeatures = new Float32Array(features)

    // Kick off inference if not already in flight
    if (!this._inferenceInFlight) {
      this._runInference()
    }

    return this._lastPrediction
  }

  private _runInference(): void {
    if (!this._pendingFeatures || !this._session || !this._onnx) return
    this._inferenceInFlight = true

    const features = this._pendingFeatures
    this._pendingFeatures = null

    const tensor = new (this._onnx.Tensor as unknown as new (type: string, data: Float32Array, dims: number[]) => unknown)(
      'float32', features, [1, ML_SETTINGS.FEATURE_COUNT]
    )

    void this._session.run({ input: tensor }).then(output => {
      // Fix 7 (AI Fight Club): Guard against stale write after dispose().
      // An in-flight inference promise can complete after dispose() nulls everything.
      if (this._disposed) return
      this._consecutiveFailures = 0
      const score = output.output?.data[0] ?? 0.5
      this._lastPrediction = {
        feedbackScore: Math.max(0, Math.min(1, score)),
        modelConfidence: 1.0,
        isAvailable: true,
        modelVersion: this._modelVersion,
      }
    }).catch((err: unknown) => {
      // Inference error — keep last prediction, track failures
      this._consecutiveFailures++
      this._totalFailures++
      void err
    }).finally(() => {
      this._inferenceInFlight = false
      // If new features arrived while we were processing, run again
      if (this._pendingFeatures) {
        this._runInference()
      }
    })
  }

  /** Release ONNX session memory. */
  dispose(): void {
    this._disposed = true
    this._available = false
    this._loading = null
    this._lastPrediction = null
    if (this._session) {
      try { this._session.release() } catch { /* ignore */ }
      this._session = null
    }
    this._onnx = null
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _loadModel(): Promise<void> {
    try {
      // Dynamic import — ONNX Runtime Web is code-split, not in initial bundle
      const onnx = (await import(/* webpackIgnore: true */ 'onnxruntime-web')) as unknown as OnnxModule
      if (this._disposed) return

      this._onnx = onnx

      // Load model from static asset
      const session = await onnx.InferenceSession.create(ML_SETTINGS.MODEL_PATH)
      if (this._disposed) {
        session.release()
        return
      }

      this._session = session
      // Extract version from model path: /models/dwa-fp-filter-v1.onnx → dwa-fp-v1
      const pathMatch = ML_SETTINGS.MODEL_PATH.match(/dwa-fp-filter-(v\d+)/)
      this._modelVersion = pathMatch ? `dwa-fp-${pathMatch[1]}` : 'dwa-fp-v1'
      this._available = true
    } catch {
      // ONNX load failed (network error, unsupported browser, etc.)
      // Fusion continues with 6 algorithms — no user-facing error
      this._available = false
    } finally {
      this._loading = null
    }
  }
}
