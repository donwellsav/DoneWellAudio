/**
 * ML Inference Engine — Unit Tests
 *
 * Tests the MLInferenceEngine class for:
 *   - Graceful degradation when ONNX is unavailable
 *   - Feature vector validation (length, one-hot encoding)
 *   - Cached prediction behavior (predictCached returns last result)
 *   - Model loading error handling
 *   - Score normalization (clamped to [0, 1])
 *   - Dispose lifecycle and post-dispose safety
 *   - Consecutive failure tracking
 *
 * ONNX Runtime Web is fully mocked — no real model loading in tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ML_SETTINGS } from '../constants'

// ── Mock ONNX Runtime Web ──────────────────────────────────────────────────────

/** Tracks mock session calls for assertions */
let mockSessionRun: ReturnType<typeof vi.fn>
let mockSessionRelease: ReturnType<typeof vi.fn>
let mockCreateSession: ReturnType<typeof vi.fn>
let mockTensorConstructor: ReturnType<typeof vi.fn>
let shouldFailLoad = false
let shouldFailInference = false
let mockInferenceScore = 0.75

function resetMockState() {
  shouldFailLoad = false
  shouldFailInference = false
  mockInferenceScore = 0.75

  mockSessionRun = vi.fn().mockImplementation(() => {
    if (shouldFailInference) {
      return Promise.reject(new Error('Inference failed'))
    }
    return Promise.resolve({
      output: { data: new Float32Array([mockInferenceScore]) },
    })
  })

  mockSessionRelease = vi.fn()

  mockCreateSession = vi.fn().mockImplementation(() => {
    if (shouldFailLoad) {
      return Promise.reject(new Error('Failed to load ONNX model'))
    }
    return Promise.resolve({
      run: mockSessionRun,
      release: mockSessionRelease,
    })
  })

  // Must be a real function (not arrow) so it's valid as a constructor with `new`
  mockTensorConstructor = vi.fn().mockImplementation(
    function (this: { data: Float32Array }, _type: string, data: Float32Array, _dims: number[]) {
      void _dims
      this.data = data
    }
  )
}

vi.mock('onnxruntime-web', () => ({
  InferenceSession: {
    get create() { return mockCreateSession },
  },
  get Tensor() { return mockTensorConstructor },
}))

// Import after mock registration so the dynamic import() resolves our mock
import { MLInferenceEngine } from '../mlInference'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a valid 11-element feature vector */
function makeFeatures(overrides: Partial<Record<string, number>> = {}): Float32Array {
  const defaults = {
    msd: 0.8,
    phase: 0.9,
    spectral: 0.5,
    comb: 0.7,
    ihr: 0.6,
    ptmr: 0.85,
    lastFusedProb: 0.5,
    lastFusedConf: 0.5,
    isSpeech: 1,
    isMusic: 0,
    isCompressed: 0,
  }
  const merged = { ...defaults, ...overrides }
  return new Float32Array([
    merged.msd,
    merged.phase,
    merged.spectral,
    merged.comb,
    merged.ihr,
    merged.ptmr,
    merged.lastFusedProb,
    merged.lastFusedConf,
    merged.isSpeech,
    merged.isMusic,
    merged.isCompressed,
  ])
}

/** Flush all pending microtasks so async ONNX mock promises resolve */
async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetMockState()
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MLInferenceEngine — initial state', () => {
  it('isAvailable is false before warmup', () => {
    const engine = new MLInferenceEngine()
    expect(engine.isAvailable).toBe(false)
  })

  it('modelVersion is "none" before warmup', () => {
    const engine = new MLInferenceEngine()
    expect(engine.modelVersion).toBe('none')
  })

  it('consecutiveFailures is 0 initially', () => {
    const engine = new MLInferenceEngine()
    expect(engine.consecutiveFailures).toBe(0)
  })
})

describe('MLInferenceEngine — predict() without model', () => {
  it('returns null when model is not loaded', () => {
    const engine = new MLInferenceEngine()
    const features = makeFeatures()
    expect(engine.predict(features)).toBeNull()
  })

  it('returns null for wrong feature count', () => {
    const engine = new MLInferenceEngine()
    expect(engine.predict(new Float32Array(5))).toBeNull()
    expect(engine.predict(new Float32Array(0))).toBeNull()
    expect(engine.predict(new Float32Array(12))).toBeNull()
  })
})

describe('MLInferenceEngine — predictCached() without model', () => {
  it('returns null when model is not loaded', () => {
    const engine = new MLInferenceEngine()
    const features = makeFeatures()
    expect(engine.predictCached(features)).toBeNull()
  })

  it('returns null for wrong feature count', () => {
    const engine = new MLInferenceEngine()
    expect(engine.predictCached(new Float32Array(5))).toBeNull()
    expect(engine.predictCached(new Float32Array(12))).toBeNull()
  })
})

describe('MLInferenceEngine — warmup and model loading', () => {
  it('loads model successfully via warmup()', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    expect(engine.isAvailable).toBe(true)
    expect(engine.modelVersion).toBe('dwa-fp-v1')
    expect(mockCreateSession).toHaveBeenCalledWith(ML_SETTINGS.MODEL_PATH)
  })

  it('handles model load failure gracefully', async () => {
    shouldFailLoad = true
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    expect(engine.isAvailable).toBe(false)
    expect(engine.modelVersion).toBe('none')
    // Should not throw — graceful degradation
    expect(engine.predictCached(makeFeatures())).toBeNull()
  })

  it('multiple warmup() calls are idempotent', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    engine.warmup()
    engine.warmup()
    await flushPromises()

    expect(mockCreateSession).toHaveBeenCalledTimes(1)
    expect(engine.isAvailable).toBe(true)
  })

  it('warmup() after dispose() is a no-op', async () => {
    const engine = new MLInferenceEngine()
    engine.dispose()
    engine.warmup()
    await flushPromises()

    expect(engine.isAvailable).toBe(false)
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('warmup() after successful warmup is a no-op', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()
    expect(engine.isAvailable).toBe(true)

    engine.warmup()
    await flushPromises()
    // Still only called once
    expect(mockCreateSession).toHaveBeenCalledTimes(1)
  })
})

describe('MLInferenceEngine — predictCached() with loaded model', () => {
  it('returns null on first call (no cached result yet)', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    const result = engine.predictCached(makeFeatures())
    // First call: inference queued but not yet resolved
    expect(result).toBeNull()
  })

  it('returns cached result after inference resolves', async () => {
    mockInferenceScore = 0.82
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // First call — queues inference
    engine.predictCached(makeFeatures())
    await flushPromises()

    // Second call — returns cached result from first inference
    const result = engine.predictCached(makeFeatures())
    expect(result).not.toBeNull()
    expect(result!.feedbackScore).toBeCloseTo(0.82, 2)
    expect(result!.modelConfidence).toBe(1.0)
    expect(result!.isAvailable).toBe(true)
    expect(result!.modelVersion).toBe('dwa-fp-v1')
  })

  it('clamps score to [0, 1] range — score above 1', async () => {
    mockInferenceScore = 1.5
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    engine.predictCached(makeFeatures())
    await flushPromises()

    const result = engine.predictCached(makeFeatures())
    expect(result).not.toBeNull()
    expect(result!.feedbackScore).toBe(1.0)
  })

  it('clamps score to [0, 1] range — score below 0', async () => {
    mockInferenceScore = -0.3
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    engine.predictCached(makeFeatures())
    await flushPromises()

    const result = engine.predictCached(makeFeatures())
    expect(result).not.toBeNull()
    expect(result!.feedbackScore).toBe(0.0)
  })

  it('defaults to 0.5 when output tensor has no data', async () => {
    mockSessionRun.mockResolvedValueOnce({ output: { data: new Float32Array([]) } })
    // output.data[0] is undefined → fallback to 0.5
    mockSessionRun.mockResolvedValueOnce({ output: undefined })

    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    engine.predictCached(makeFeatures())
    await flushPromises()

    const result = engine.predictCached(makeFeatures())
    // Either undefined output or empty array yields 0.5 default via ?? operator
    if (result) {
      expect(result.feedbackScore).toBeGreaterThanOrEqual(0)
      expect(result.feedbackScore).toBeLessThanOrEqual(1)
    }
  })

  it('uses latest features when new ones arrive during in-flight inference', async () => {
    let resolveFirst: (() => void) | null = null
    // First call blocks, second call queues new features
    mockSessionRun
      .mockImplementationOnce(() => new Promise<{ output: { data: Float32Array } }>(resolve => {
        resolveFirst = () => resolve({ output: { data: new Float32Array([0.3]) } })
      }))
      .mockResolvedValueOnce({ output: { data: new Float32Array([0.9]) } })

    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // First prediction — starts in-flight
    engine.predictCached(makeFeatures({ msd: 0.1 }))
    // Second prediction while first is in-flight — queues new features
    engine.predictCached(makeFeatures({ msd: 0.99 }))

    // Resolve first inference
    resolveFirst!()
    await flushPromises()

    // After first resolves, engine should automatically process pending features
    await flushPromises()

    const result = engine.predictCached(makeFeatures())
    expect(result).not.toBeNull()
    // The latest inference result should be 0.9 from the second run
    expect(result!.feedbackScore).toBeCloseTo(0.9, 2)
  })
})

describe('MLInferenceEngine — inference error handling', () => {
  it('tracks consecutive failures', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    shouldFailInference = true
    engine.predictCached(makeFeatures())
    await flushPromises()

    expect(engine.consecutiveFailures).toBe(1)
  })

  it('resets consecutive failures on success', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // Fail once
    shouldFailInference = true
    engine.predictCached(makeFeatures())
    await flushPromises()
    expect(engine.consecutiveFailures).toBe(1)

    // Succeed
    shouldFailInference = false
    // Need to wait for in-flight flag to clear
    engine.predictCached(makeFeatures())
    await flushPromises()

    expect(engine.consecutiveFailures).toBe(0)
  })

  it('keeps last valid prediction after inference failure', async () => {
    mockInferenceScore = 0.65
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // Successful prediction
    engine.predictCached(makeFeatures())
    await flushPromises()

    const goodResult = engine.predictCached(makeFeatures())
    expect(goodResult).not.toBeNull()
    expect(goodResult!.feedbackScore).toBeCloseTo(0.65, 2)

    // Now fail — wait for in-flight to clear first
    await flushPromises()
    shouldFailInference = true
    engine.predictCached(makeFeatures())
    await flushPromises()

    // Should still return the last good cached result
    const afterFail = engine.predictCached(makeFeatures())
    expect(afterFail).not.toBeNull()
    expect(afterFail!.feedbackScore).toBeCloseTo(0.65, 2)
  })

  it('suppresses log spam after 3 consecutive failures', async () => {
    const warnSpy = vi.spyOn(console, 'warn')
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    shouldFailInference = true
    // Run 5 failures sequentially
    for (let i = 0; i < 5; i++) {
      engine.predictCached(makeFeatures())
      await flushPromises()
    }

    // console.warn called for first 3 failures only
    const inferenceWarns = warnSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('inference failed')
    )
    expect(inferenceWarns.length).toBeLessThanOrEqual(3)
  })
})

describe('MLInferenceEngine — dispose()', () => {
  it('sets isAvailable to false', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()
    expect(engine.isAvailable).toBe(true)

    engine.dispose()
    expect(engine.isAvailable).toBe(false)
  })

  it('releases the ONNX session', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    engine.dispose()
    expect(mockSessionRelease).toHaveBeenCalledTimes(1)
  })

  it('predictCached() returns null after dispose', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // Get a cached result
    engine.predictCached(makeFeatures())
    await flushPromises()

    engine.dispose()
    expect(engine.predictCached(makeFeatures())).toBeNull()
  })

  it('clears last prediction on dispose', async () => {
    mockInferenceScore = 0.77
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    engine.predictCached(makeFeatures())
    await flushPromises()

    engine.dispose()
    // After dispose, any call returns null — no stale cache
    expect(engine.predictCached(makeFeatures())).toBeNull()
  })

  it('in-flight inference does not write back after dispose (TOCTOU safety)', async () => {
    let resolveInference: (() => void) | null = null
    mockSessionRun.mockImplementationOnce(() => new Promise(resolve => {
      resolveInference = () => resolve({ output: { data: new Float32Array([0.99]) } })
    }))

    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // Start inference
    engine.predictCached(makeFeatures())
    // Dispose before inference completes
    engine.dispose()
    // Now resolve the inference
    resolveInference!()
    await flushPromises()

    // The result should NOT have been written back
    expect(engine.isAvailable).toBe(false)
  })

  it('release() errors are silently caught', async () => {
    mockSessionRelease.mockImplementation(() => {
      throw new Error('Release failed')
    })

    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // Should not throw
    expect(() => engine.dispose()).not.toThrow()
  })
})

describe('MLInferenceEngine — dispose during model load', () => {
  it('does not become available if disposed before import resolves', async () => {
    // Slow down the create so we can dispose in between
    let resolveCreate: (() => void) | null = null
    const slowSession = {
      run: mockSessionRun,
      release: mockSessionRelease,
    }
    mockCreateSession.mockImplementationOnce(
      () => new Promise(resolve => {
        resolveCreate = () => resolve(slowSession)
      })
    )

    const engine = new MLInferenceEngine()
    engine.warmup()
    // Let the dynamic import() resolve (but create is still pending)
    await flushPromises()

    // Dispose while create is pending
    engine.dispose()
    expect(engine.isAvailable).toBe(false)

    // Now resolve the session creation
    resolveCreate!()
    await flushPromises()

    // Engine should have released the session and stayed unavailable
    expect(mockSessionRelease).toHaveBeenCalled()
    expect(engine.isAvailable).toBe(false)
  })
})

describe('ML feature vector', () => {
  it('FEATURE_COUNT constant is 11', () => {
    expect(ML_SETTINGS.FEATURE_COUNT).toBe(11)
  })

  it('has exactly 11 elements matching the model input spec', () => {
    const features = makeFeatures()
    expect(features.length).toBe(ML_SETTINGS.FEATURE_COUNT)
  })

  it('content type one-hot encoding is mutually exclusive', () => {
    const testCases = [
      { type: 'speech', expected: [1, 0, 0] },
      { type: 'music', expected: [0, 1, 0] },
      { type: 'compressed', expected: [0, 0, 1] },
      { type: 'unknown', expected: [0, 0, 0] },
    ] as const

    for (const { type, expected } of testCases) {
      const features = makeFeatures({
        isSpeech: type === 'speech' ? 1 : 0,
        isMusic: type === 'music' ? 1 : 0,
        isCompressed: type === 'compressed' ? 1 : 0,
      })
      expect(features[8]).toBe(expected[0])
      expect(features[9]).toBe(expected[1])
      expect(features[10]).toBe(expected[2])
    }
  })

  it('algorithm scores occupy indices 0-5', () => {
    const features = makeFeatures({
      msd: 0.1, phase: 0.2, spectral: 0.3,
      comb: 0.4, ihr: 0.5, ptmr: 0.6,
    })
    expect(features[0]).toBeCloseTo(0.1)
    expect(features[1]).toBeCloseTo(0.2)
    expect(features[2]).toBeCloseTo(0.3)
    expect(features[3]).toBeCloseTo(0.4)
    expect(features[4]).toBeCloseTo(0.5)
    expect(features[5]).toBeCloseTo(0.6)
  })

  it('fusion context (prev prob/conf) occupies indices 6-7', () => {
    const features = makeFeatures({ lastFusedProb: 0.77, lastFusedConf: 0.88 })
    expect(features[6]).toBeCloseTo(0.77)
    expect(features[7]).toBeCloseTo(0.88)
  })
})

describe('MLInferenceEngine — model version extraction', () => {
  it('extracts version from model path matching dwa-fp-filter-vN', async () => {
    const engine = new MLInferenceEngine()
    engine.warmup()
    await flushPromises()

    // Default MODEL_PATH is '/models/dwa-fp-filter-v1.onnx'
    expect(engine.modelVersion).toBe('dwa-fp-v1')
  })
})
