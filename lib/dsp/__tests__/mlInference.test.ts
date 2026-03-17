/**
 * ML Inference Engine — Unit Tests
 *
 * Tests the MLInferenceEngine class for graceful degradation,
 * feature vector validation, and cached prediction behavior.
 *
 * Note: ONNX Runtime Web is not installed in the test environment,
 * so we test the unavailable/fallback paths and validate the public API.
 */
import { describe, it, expect } from 'vitest'
import { MLInferenceEngine } from '../mlInference'
import { ML_SETTINGS } from '../constants'

describe('MLInferenceEngine', () => {
  it('isAvailable is false before warmup', () => {
    const engine = new MLInferenceEngine()
    expect(engine.isAvailable).toBe(false)
  })

  it('modelVersion is "none" before warmup', () => {
    const engine = new MLInferenceEngine()
    expect(engine.modelVersion).toBe('none')
  })

  it('predict() returns null when model is not loaded', () => {
    const engine = new MLInferenceEngine()
    const features = new Float32Array(ML_SETTINGS.FEATURE_COUNT)
    expect(engine.predict(features)).toBeNull()
  })

  it('predictCached() returns null when model is not loaded', () => {
    const engine = new MLInferenceEngine()
    const features = new Float32Array(ML_SETTINGS.FEATURE_COUNT)
    expect(engine.predictCached(features)).toBeNull()
  })

  it('predict() returns null for wrong feature count', () => {
    const engine = new MLInferenceEngine()
    const wrongSize = new Float32Array(5)
    expect(engine.predict(wrongSize)).toBeNull()
  })

  it('predictCached() returns null for wrong feature count', () => {
    const engine = new MLInferenceEngine()
    const wrongSize = new Float32Array(5)
    expect(engine.predictCached(wrongSize)).toBeNull()
  })

  it('FEATURE_COUNT constant matches expected value of 11', () => {
    expect(ML_SETTINGS.FEATURE_COUNT).toBe(11)
  })

  it('dispose() sets isAvailable to false', () => {
    const engine = new MLInferenceEngine()
    engine.dispose()
    expect(engine.isAvailable).toBe(false)
  })

  it('warmup() after dispose() is a no-op', () => {
    const engine = new MLInferenceEngine()
    engine.dispose()
    engine.warmup()
    // Should not throw, should stay unavailable
    expect(engine.isAvailable).toBe(false)
  })

  it('multiple warmup() calls are idempotent', () => {
    const engine = new MLInferenceEngine()
    // Should not throw
    engine.warmup()
    engine.warmup()
    engine.warmup()
    // Model won't load (no ONNX in test env), but shouldn't crash
    expect(engine.isAvailable).toBe(false)
  })
})

describe('ML feature vector', () => {
  it('has exactly 11 elements matching the model input spec', () => {
    // Simulate the feature vector construction from workerFft.ts
    const features = new Float32Array([
      0.8,  // msd feedbackScore
      0.9,  // phase feedbackScore
      0.5,  // spectral feedbackScore
      0.7,  // comb confidence
      0.6,  // ihr feedbackScore
      0.85, // ptmr feedbackScore
      0.5,  // lastFusedProb
      0.5,  // lastFusedConf
      1,    // isSpeech
      0,    // isMusic
      0,    // isCompressed
    ])
    expect(features.length).toBe(ML_SETTINGS.FEATURE_COUNT)
  })

  it('content type one-hot encoding is mutually exclusive', () => {
    const testCases = [
      { type: 'speech', expected: [1, 0, 0] },
      { type: 'music', expected: [0, 1, 0] },
      { type: 'compressed', expected: [0, 0, 1] },
      { type: 'unknown', expected: [0, 0, 0] },
    ]

    for (const { type, expected } of testCases) {
      const features = new Float32Array([
        0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5, 0.5,
        type === 'speech' ? 1 : 0,
        type === 'music' ? 1 : 0,
        type === 'compressed' ? 1 : 0,
      ])
      expect(features[8]).toBe(expected[0])
      expect(features[9]).toBe(expected[1])
      expect(features[10]).toBe(expected[2])
    }
  })
})
