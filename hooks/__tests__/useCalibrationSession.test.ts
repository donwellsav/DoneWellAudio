// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/dsp/constants'
import type { Advisory, DetectorSettings, SpectrumData } from '@/types/advisory'
import { useCalibrationSession } from '../useCalibrationSession'

const calibrationMocks = vi.hoisted(() => {
  const sessionInstances: MockCalibrationSession[] = []
  const downloadCalibrationExport = vi.fn<(data: unknown) => void>()
  const downsampleSpectrum = vi.fn<(freqDb: Float32Array) => number[]>((freqDb) => Array.from(freqDb))

  class MockCalibrationSession {
    readonly falsePositiveIds = new Set<string>()
    readonly logNoiseFloor = vi.fn<(noiseFloorDb: number, peakDb: number, contentType: string) => void>()
    readonly logSpectrumSnapshot = vi.fn<(spectrum: SpectrumData, trigger: 'periodic' | 'detection' | 'ambient_capture') => void>()
    readonly logDetection = vi.fn<(advisory: Advisory, spectrum: SpectrumData | null) => void>()
    readonly logContentTypeChange = vi.fn<(from: string, to: string) => void>()
    readonly logMissed = vi.fn<(band: 'LOW' | 'MID' | 'HIGH' | null) => void>()
    readonly logSettingsChange = vi.fn<(changes: Partial<DetectorSettings>) => void>()
    readonly buildExport = vi.fn(() => ({ ok: true }))

    constructor(readonly settings: DetectorSettings) {
      sessionInstances.push(this)
    }

    logFalsePositive(advisoryId: string): void {
      this.falsePositiveIds.add(advisoryId)
    }

    unflagFalsePositive(advisoryId: string): void {
      this.falsePositiveIds.delete(advisoryId)
    }

    getStats() {
      return {
        elapsedMs: 0,
        detectionCount: this.logDetection.mock.calls.length,
        falsePositiveCount: this.falsePositiveIds.size,
        missedCount: this.logMissed.mock.calls.length,
        snapshotCount: this.logSpectrumSnapshot.mock.calls.length,
      }
    }
  }

  return {
    sessionInstances,
    downloadCalibrationExport,
    downsampleSpectrum,
    MockCalibrationSession,
  }
})

const roomStorageMocks = vi.hoisted(() => ({
  load: vi.fn(() => ({})),
  save: vi.fn<(value: unknown) => void>(),
}))

vi.mock('@/lib/calibration', () => ({
  CalibrationSession: calibrationMocks.MockCalibrationSession,
  downloadCalibrationExport: calibrationMocks.downloadCalibrationExport,
  downsampleSpectrum: calibrationMocks.downsampleSpectrum,
}))

vi.mock('@/lib/storage/dwaStorage', () => ({
  roomStorage: roomStorageMocks,
}))

function makeSpectrum(contentType: SpectrumData['contentType'] = 'speech'): SpectrumData {
  return {
    freqDb: new Float32Array([1, 2, 3, 4]),
    power: new Float32Array([1, 4, 9, 16]),
    noiseFloorDb: -72,
    effectiveThresholdDb: -42,
    sampleRate: 48000,
    fftSize: 8192,
    timestamp: Date.now(),
    peak: -18,
    autoGainEnabled: false,
    autoGainDb: 0,
    autoGainLocked: false,
    rawPeakDb: -18,
    algorithmMode: 'auto',
    contentType,
    msdFrameCount: 12,
    isCompressed: false,
    compressionRatio: 1.2,
    isSignalPresent: true,
  }
}

function makeAdvisory(id: string): Advisory {
  return {
    id,
    trackId: `track-${id}`,
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.9,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -18,
    prominenceDb: 12,
    qEstimate: 4,
    bandwidthHz: 250,
    velocityDbPerSec: 1.2,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -6 },
      peq: { type: 'bell', hz: 1000, q: 4, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
  }
}

describe('useCalibrationSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    calibrationMocks.sessionInstances.length = 0
    calibrationMocks.downloadCalibrationExport.mockReset()
    calibrationMocks.downsampleSpectrum.mockClear()
    roomStorageMocks.load.mockClear()
    roomStorageMocks.save.mockClear()
    roomStorageMocks.load.mockReturnValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates a fresh session after calibration is turned off and on again', () => {
    const spectrumRef = { current: makeSpectrum() }
    const { result } = renderHook(
      ({ isAnalysisRunning }) => useCalibrationSession(spectrumRef, isAnalysisRunning, DEFAULT_SETTINGS),
      { initialProps: { isAnalysisRunning: true } },
    )

    act(() => {
      result.current.setCalibrationEnabled(true)
    })

    expect(calibrationMocks.sessionInstances).toHaveLength(1)
    expect(result.current.isRecording).toBe(true)

    act(() => {
      result.current.onFalsePositive('adv-1')
    })

    expect(result.current.falsePositiveIds.has('adv-1')).toBe(true)
    expect(result.current.stats.falsePositiveCount).toBe(1)

    act(() => {
      result.current.setCalibrationEnabled(false)
    })

    expect(result.current.isRecording).toBe(false)
    expect(result.current.falsePositiveIds.size).toBe(0)
    expect(result.current.stats.falsePositiveCount).toBe(0)

    act(() => {
      result.current.setCalibrationEnabled(true)
    })

    expect(calibrationMocks.sessionInstances).toHaveLength(2)
    expect(result.current.falsePositiveIds.size).toBe(0)
  })

  it('logs content-type changes from the spectrum ref without requiring a rerender', () => {
    const spectrumRef = { current: makeSpectrum('speech') }
    const { result } = renderHook(() => useCalibrationSession(spectrumRef, true, DEFAULT_SETTINGS))

    act(() => {
      result.current.setCalibrationEnabled(true)
    })

    const session = calibrationMocks.sessionInstances[0]
    expect(session.logContentTypeChange).toHaveBeenCalledWith('unknown', 'speech')

    spectrumRef.current = makeSpectrum('music')

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(session.logContentTypeChange).toHaveBeenLastCalledWith('speech', 'music')
  })

  it('cancels ambient capture and clears UI state when calibration is disabled mid-capture', () => {
    const spectrumRef = { current: makeSpectrum() }
    const { result } = renderHook(() => useCalibrationSession(spectrumRef, true, DEFAULT_SETTINGS))

    act(() => {
      result.current.setCalibrationEnabled(true)
    })

    act(() => {
      result.current.captureAmbient(spectrumRef)
    })

    expect(result.current.isCapturingAmbient).toBe(true)

    act(() => {
      result.current.setCalibrationEnabled(false)
    })

    expect(result.current.isCapturingAmbient).toBe(false)
    expect(result.current.ambientCapture).toBeNull()
  })

  it('clears a completed ambient capture before the next calibration session export', () => {
    const spectrumRef = { current: makeSpectrum() }
    const { result } = renderHook(() => useCalibrationSession(spectrumRef, true, DEFAULT_SETTINGS))

    act(() => {
      result.current.setCalibrationEnabled(true)
    })

    act(() => {
      result.current.captureAmbient(spectrumRef)
      vi.advanceTimersByTime(5_000)
    })

    expect(result.current.ambientCapture).not.toBeNull()

    act(() => {
      result.current.setCalibrationEnabled(false)
    })

    expect(result.current.ambientCapture).toBeNull()

    act(() => {
      result.current.setCalibrationEnabled(true)
    })

    act(() => {
      result.current.exportSession(DEFAULT_SETTINGS, '0.61.0')
    })

    const nextSession = calibrationMocks.sessionInstances[1]
    expect(nextSession.buildExport).toHaveBeenCalledWith(
      expect.any(Object),
      null,
      DEFAULT_SETTINGS,
      '0.61.0',
    )
  })
})
