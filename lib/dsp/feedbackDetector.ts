// KillTheRing2 Feedback Detector - Core DSP engine for peak detection
// Adapted from FeedbackDetector.js with TypeScript and enhancements

import { A_WEIGHTING, ECM8000_CALIBRATION, EXP_LUT, HARMONIC_SETTINGS, MSD_SETTINGS, PERSISTENCE_SCORING, SIGNAL_GATE, HYSTERESIS, PHPR_SETTINGS } from './constants'
import { 
  medianInPlace, 
  buildPrefixSum, 
  quadraticInterpolation,
  clamp,
  isValidFftSize,
  generateId 
} from '@/lib/utils/mathHelpers'
import type { DetectedPeak, AnalysisConfig, DetectorSettings, AlgorithmMode, ContentType } from '@/types/advisory'
import { DEFAULT_CONFIG } from '@/types/advisory'
import type { CombPatternResult } from './advancedDetection'

const HOLD_DECAY_RATE_MULTIPLIER = 2

export interface FeedbackDetectorCallbacks {
  onPeakDetected?: (peak: DetectedPeak) => void
  onPeakCleared?: (peak: { binIndex: number; frequencyHz: number; timestamp: number }) => void
  onCombPatternDetected?: (pattern: CombPatternResult) => void
  onError?: (message: string) => void
}

/** Frame timing breakdown from performance.now() instrumentation (debug only) */
export interface PerfTimings {
  total: number   // Full analyze() call
  power: number   // Power/prefix sum loop (Math.exp / LUT)
  peaks: number   // Peak detection + MSD updates + registration
  msd: number     // Remaining (persistence + cleanup)
}

export interface FeedbackDetectorState {
  isRunning: boolean
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  sampleRate: number
  fftSize: number
  // Auto-gain control
  autoGainEnabled: boolean
  autoGainDb: number // Current auto-computed gain in dB
  autoGainLocked: boolean // True when calibration is done and gain is frozen
  rawPeakDb: number // Pre-gain peak level in dBFS
  isSignalPresent: boolean // True when pre-gain signal is above silence threshold
  // Advanced algorithm state (populated by DSP pipeline)
  algorithmMode?: AlgorithmMode
  contentType?: ContentType
  msdFrameCount?: number
  isCompressed?: boolean
  compressionRatio?: number
  // Performance instrumentation (only populated when debugPerf is enabled)
  perfTimings?: PerfTimings | null
}

export class FeedbackDetector {
  // Configuration
  private config: AnalysisConfig
  private callbacks: FeedbackDetectorCallbacks

  // Web Audio
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private _deviceChangeHandler: (() => void) | null = null
  private _stateChangeHandler: (() => void) | null = null
  private analyser: AnalyserNode | null = null

  // Preallocated buffers
  private freqDb: Float32Array | null = null
  private timeDomain: Float32Array | null = null // Raw waveform for phase coherence FFT
  private power: Float32Array | null = null
  private prefix: Float64Array | null = null
  private holdMs: Float32Array | null = null
  private deadMs: Float32Array | null = null
  private active: Uint8Array | null = null
  private activeHz: Float32Array | null = null
  private activeBins: Uint32Array | null = null
  private activeBinPos: Int32Array | null = null
  private activeCount: number = 0
  
  // MSD (Magnitude Slope Deviation) buffers - DAFx-16 algorithm
  // Stores magnitude history per frequency bin for growth analysis
  private msdHistory: Float32Array[] | null = null // [bin][frame] ring buffer
  private msdHistoryIndex: Uint8Array | null = null // Current write index per bin
  private msdFrameCount: Uint16Array | null = null // How many frames we have per bin
  private msdConfirmFrames: Uint8Array | null = null // Frames below fast confirm threshold
  private msdMinFrames: number = MSD_SETTINGS.DEFAULT_MIN_FRAMES // Content-adaptive (synced with worker)

  // Peak Persistence Scoring - Phase 2 Enhancement
  // Tracks consecutive frames where a peak persists at the same frequency
  // Feedback = persistent (vertical streak), transient = short-lived
  private persistenceCount: Uint16Array | null = null // Consecutive frames at this bin
  private persistenceLastDb: Float32Array | null = null // Last amplitude for comparison

  // A-weighting lookup
  private aWeightingTable: Float32Array | null = null
  private aWeightingMinDb: number = 0
  private aWeightingMaxDb: number = 0

  // Mic calibration compensation (ECM8000)
  private micCalibrationTable: Float32Array | null = null
  private micCalMinDb: number = 0
  private micCalMaxDb: number = 0

  // Analysis bounds
  private startBin: number = 1
  private endBin: number = 0
  private effectiveNb: number = 2

  // Noise floor
  private noiseFloorDb: number | null = null
  private noiseSampleIdx: Uint32Array | null = null
  private noiseSamples: Float32Array | null = null

  // Timing
  private isRunning: boolean = false
  private rafId: number = 0
  private lastRafTs: number = 0
  private lastAnalysisTs: number = 0
  private maxAnalysisGapMs: number = 120

  // Analysis bounds
  private analysisMinDb: number = -100
  private analysisMaxDb: number = 0

  // Harmonic detection — runtime override (set via updateSettings)
  private harmonicToleranceCents: number = HARMONIC_SETTINGS.TOLERANCE_CENTS

  // Smoothing time constant for AnalyserNode (0-1, matches DEFAULT_SETTINGS)
  private smoothingTimeConstant: number = 0.5

  // Ring/growth detection thresholds (mapped from DetectorSettings, matches DEFAULT_SETTINGS)
  private ringThresholdDb: number = 3
  private growthRateThreshold: number = 1.0

  // Auto-gain control — adjusts inputGainDb to keep signal in optimal detection range
  private _autoGainEnabled: boolean = false
  private _autoGainDb: number = 15 // Current auto-computed gain (starts at default)
  private _rawPeakDb: number = -100 // Pre-gain peak level (updated each frame)
  private _autoGainTargetDb: number = -18 // Target post-gain peak level (configurable, -18 = balanced headroom)
  private _autoGainMinDb: number = -10 // Min auto gain
  private _autoGainMaxDb: number = 30 // Max auto gain
  private _autoGainAttackCoeff: number = 0 // EMA attack (computed from sample rate)
  private _autoGainReleaseCoeff: number = 0 // EMA release (computed from sample rate)

  // Measure-then-lock: auto-gain calibrates for a short window, then freezes
  private _autoGainLocked: boolean = false // True once calibration is done and gain is frozen
  private _autoGainCalibrationStartMs: number = 0 // Timestamp when calibration began
  private _autoGainCalibrationMs: number = 3000 // Calibration window duration (3 seconds)
  private _autoGainSignalFrames: number = 0 // Frames with signal present during calibration

  // Signal presence gate — prevents auto-gain from amplifying silence into phantom peaks
  private _isSignalPresent: boolean = false
  private _silenceThresholdDb: number = SIGNAL_GATE.DEFAULT_SILENCE_THRESHOLD_DB

  // Hysteresis — recently cleared bins need extra dB to re-trigger (prevents flicker duplicates)
  private _recentlyClearedBins: Map<number, number> = new Map() // bin -> cleared timestamp
  private _analyzeCallCount: number = 0  // Frame counter for periodic housekeeping

  // Performance instrumentation — zero cost when disabled
  private _debugPerf: boolean = false
  private _perfTimings: PerfTimings | null = null

  // MSD scratch buffer — preallocated for calculateMsd() to avoid per-call modulo
  private _msdScratch: Int32Array = new Int32Array(MSD_SETTINGS.HISTORY_SIZE)

  // Advanced algorithm state — set externally by DSP pipeline, returned via getState()
  private _algorithmMode: AlgorithmMode | undefined = undefined
  private _contentType: ContentType | undefined = undefined
  private _msdFrameCount: number | undefined = undefined
  private _isCompressed: boolean | undefined = undefined
  private _compressionRatio: number | undefined = undefined

  constructor(config: Partial<AnalysisConfig> = {}, callbacks: FeedbackDetectorCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.callbacks = callbacks
    this.maxAnalysisGapMs = Math.max(2 * this.config.analysisIntervalMs, 120)
    this.updateMsdMinFrames()
    this.rafLoop = this.rafLoop.bind(this)
  }

  // ==================== Public API ====================

  async start(options: { stream?: MediaStream; audioContext?: AudioContext; deviceId?: string } = {}): Promise<void> {
    if (this.isRunning) return

    // Initialize AudioContext
    if (!this.audioContext) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx && !options.audioContext) {
        throw new Error('Web Audio API not supported')
      }
      this.audioContext = options.audioContext || new Ctx()
    }

    // Get microphone stream
    if (options.stream) {
      this.stream = options.stream
    } else if (!this.stream) {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not supported')
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        })
      } catch (e) {
        // Surface specific error messages for common getUserMedia failures
        if (e instanceof DOMException) {
          switch (e.name) {
            case 'NotAllowedError':
              throw new Error('Microphone permission denied. Please allow microphone access and try again.')
            case 'NotFoundError':
              throw new Error('No microphone found. Please connect a microphone and try again.')
            case 'NotReadableError':
              throw new Error('Microphone is in use by another application. Please close it and try again.')
            case 'OverconstrainedError':
              throw new Error('Microphone does not support the requested audio settings.')
          }
        }
        throw e
      }
      // Monitor mic disconnection — track end signals device removal
      const audioTrack = this.stream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.onended = () => {
          if (this.isRunning) {
            this.callbacks.onError?.('Microphone disconnected')
            this.stop()
          }
        }
      }
    }

    // Create analyser
    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.minDecibels = -100
      this.analyser.maxDecibels = 0
    }
    // Always apply smoothingTimeConstant from settings (it may have changed)
    this.analyser.smoothingTimeConstant = this.smoothingTimeConstant

    // Set FFT size and allocate buffers
    this.setFftSize(this.config.fftSize)

    // Recalculate EMA coefficients for this audio context's frame rate
    const fps = 1000 / this.config.analysisIntervalMs
    this._autoGainAttackCoeff = 1 - Math.exp(-1 / (0.3 * fps))
    this._autoGainReleaseCoeff = 1 - Math.exp(-1 / (1.0 * fps))
    // Auto-gain state is NOT touched here — managed entirely by updateSettings()
    // when user clicks LOUD/MED/QUIET calibration buttons

    // Connect source (PASSIVE - no output routing)
    if (this.source) {
      try { this.source.disconnect() } catch {}
      this.source = null
    }
    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.source.connect(this.analyser)

    // Resume context if needed
    if (this.audioContext.state !== 'running') {
      await this.audioContext.resume()
    }

    // Listen for device changes (mic unplugged/plugged)
    if (navigator.mediaDevices && !this._deviceChangeHandler) {
      this._deviceChangeHandler = () => {
        // Check if current stream's track is still alive
        const track = this.stream?.getAudioTracks()[0]
        if (track && track.readyState === 'ended' && this.isRunning) {
          this.callbacks.onError?.('Audio device changed — microphone disconnected')
          this.stop()
        }
      }
      navigator.mediaDevices.addEventListener('devicechange', this._deviceChangeHandler)
    }

    // Auto-resume AudioContext if browser suspends it mid-session (common on mobile background)
    if (this.audioContext && !this._stateChangeHandler) {
      this._stateChangeHandler = () => {
        const ctx = this.audioContext
        if (!ctx || !this.isRunning) return
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {
            this.callbacks.onError?.('Audio context suspended — could not resume. Try restarting.')
          })
        }
      }
      this.audioContext.addEventListener('statechange', this._stateChangeHandler)
    }

    // Start analysis loop
    this.isRunning = true
    this.lastRafTs = 0
    this.lastAnalysisTs = 0
    this.rafId = requestAnimationFrame(this.rafLoop)
  }

  stop(options: { releaseMic?: boolean } = {}): void {
    this.isRunning = false

    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }

    this.lastRafTs = 0
    this.lastAnalysisTs = 0
    this.resetHistory()

    if (this.source) {
      try { this.source.disconnect() } catch {}
      this.source = null
    }

    if (options.releaseMic && this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop()
      }
      this.stream = null
    }

    // Clean up device change listener
    if (this._deviceChangeHandler) {
      navigator.mediaDevices?.removeEventListener('devicechange', this._deviceChangeHandler)
      this._deviceChangeHandler = null
    }

    // Clean up audio context suspension listener
    if (this._stateChangeHandler) {
      this.audioContext?.removeEventListener('statechange', this._stateChangeHandler)
      this._stateChangeHandler = null
    }
  }

  // ==================== Configuration ====================

  setFftSize(fftSize: number): void {
    if (!isValidFftSize(fftSize)) {
      throw new Error('fftSize must be a power of two between 32 and 32768')
    }
    this.config.fftSize = fftSize

    if (this.analyser) {
      this.analyser.fftSize = fftSize
      this.allocateBuffers()
      this.resetHistory()
    }
  }

  updateConfig(config: Partial<AnalysisConfig>): void {
    const needsReset = 
      config.neighborhoodBins !== undefined ||
      config.minHz !== undefined ||
      config.maxHz !== undefined ||
      config.sustainMs !== undefined

    Object.assign(this.config, config)

    if (config.fftSize !== undefined) {
      this.setFftSize(config.fftSize)
    }

    if (config.analysisIntervalMs !== undefined) {
      this.maxAnalysisGapMs = Math.max(2 * this.config.analysisIntervalMs, 120)
    }

    if (needsReset) {
      this.recomputeDerivedIndices()
      this.resetHistory()
    }

    if (config.aWeightingEnabled !== undefined || config.micCalibrationEnabled !== undefined) {
      this.recomputeAnalysisDbBounds()
      this.noiseFloorDb = null
      this.resetHistory()
    }

    if (config.mode !== undefined) {
      this.updateMsdMinFrames()
    }
  }

  /**
   * Updates settings from the UI DetectorSettings interface
   * Maps DetectorSettings to the internal AnalysisConfig
   */
  updateSettings(settings: Partial<DetectorSettings>): void {
    const mappedConfig: Partial<AnalysisConfig> = {}

    if (settings.fftSize !== undefined) {
      mappedConfig.fftSize = settings.fftSize
    }
    if (settings.minFrequency !== undefined) {
      mappedConfig.minHz = settings.minFrequency
    }
    if (settings.maxFrequency !== undefined) {
      mappedConfig.maxHz = settings.maxFrequency
    }
    if (settings.feedbackThresholdDb !== undefined) {
      mappedConfig.relativeThresholdDb = settings.feedbackThresholdDb
    }
    // NOTE: holdTimeMs is UI-side "how long to show advisory cards after peak clears"
    // clearMs is DSP-side "how long to wait before declaring a peak dead"
    // These are DIFFERENT concepts - holdTimeMs should NOT be mapped to clearMs
    // The UI handles holdTimeMs display logic in KillTheRing.tsx advisory rendering
    if (settings.eqPreset !== undefined) {
      mappedConfig.preset = settings.eqPreset
    }
    if (settings.mode !== undefined) {
      // Direct assignment - OperationMode now matches AnalysisConfig['mode']
      mappedConfig.mode = settings.mode
      // Update signal presence gate threshold for this mode
      this._silenceThresholdDb = SIGNAL_GATE.MODE_SILENCE_THRESHOLDS[settings.mode]
        ?? SIGNAL_GATE.DEFAULT_SILENCE_THRESHOLD_DB
    }
    if (settings.inputGainDb !== undefined) {
      mappedConfig.inputGainDb = settings.inputGainDb
      // When user manually sets gain, seed auto-gain from that value
      if (!this._autoGainEnabled) {
        this._autoGainDb = settings.inputGainDb
      }
    }
    if (settings.autoGainEnabled !== undefined) {
      this._autoGainEnabled = settings.autoGainEnabled
      mappedConfig.autoGainEnabled = settings.autoGainEnabled
      // When switching to auto, seed from current manual setting and restart calibration
      if (settings.autoGainEnabled) {
        this._autoGainDb = this.config.inputGainDb ?? 0
        this._autoGainLocked = false
        this._autoGainCalibrationStartMs = 0
        this._autoGainSignalFrames = 0
      }
    }
    if (settings.autoGainTargetDb !== undefined) {
      this._autoGainTargetDb = settings.autoGainTargetDb
    }
    if (settings.harmonicToleranceCents !== undefined) {
      this.harmonicToleranceCents = settings.harmonicToleranceCents
    }

    // Smoothing time constant - apply directly to analyser if it exists
    if (settings.smoothingTimeConstant !== undefined) {
      this.smoothingTimeConstant = settings.smoothingTimeConstant
      if (this.analyser) {
        this.analyser.smoothingTimeConstant = settings.smoothingTimeConstant
      }
    }

    // Ring and growth thresholds - used in classification
    if (settings.ringThresholdDb !== undefined) {
      this.ringThresholdDb = settings.ringThresholdDb
    }
    if (settings.growthRateThreshold !== undefined) {
      this.growthRateThreshold = settings.growthRateThreshold
    }

    // A-weighting (IEC 61672-1) - applies perceptual loudness curve
    if (settings.aWeightingEnabled !== undefined) {
      mappedConfig.aWeightingEnabled = settings.aWeightingEnabled
    }

    // Room acoustics for Schroeder frequency calculation
    if (settings.roomRT60 !== undefined) {
      mappedConfig.roomRT60 = settings.roomRT60
    }
    if (settings.roomVolume !== undefined) {
      mappedConfig.roomVolume = settings.roomVolume
    }

    // Confidence threshold for filtering
    if (settings.confidenceThreshold !== undefined) {
      mappedConfig.confidenceThreshold = settings.confidenceThreshold
    }

    // Peak timing
    if (settings.sustainMs !== undefined) {
      mappedConfig.sustainMs = settings.sustainMs
    }
    if (settings.clearMs !== undefined) {
      mappedConfig.clearMs = settings.clearMs
    }

    // Threshold control
    if (settings.thresholdMode !== undefined) {
      mappedConfig.thresholdMode = settings.thresholdMode
    }
    // NOTE: relativeThresholdDb is NOT mapped here — it's controlled exclusively
    // via feedbackThresholdDb (the UI slider) at line 385-386 above.
    // DetectorSettings.relativeThresholdDb exists in presets but is legacy;
    // the slider value is the single source of truth for this config field.
    if (settings.prominenceDb !== undefined) {
      mappedConfig.prominenceDb = settings.prominenceDb
    }

    // Noise floor timing
    if (settings.noiseFloorAttackMs !== undefined) {
      mappedConfig.noiseFloorAttackMs = settings.noiseFloorAttackMs
    }
    if (settings.noiseFloorReleaseMs !== undefined) {
      mappedConfig.noiseFloorReleaseMs = settings.noiseFloorReleaseMs
    }

    // Whistle suppression
    if (settings.ignoreWhistle !== undefined) {
      mappedConfig.ignoreWhistle = settings.ignoreWhistle
    }

    if (Object.keys(mappedConfig).length > 0) {
      this.updateConfig(mappedConfig)
    }
  }

  // ==================== Getters ====================

  getState(): FeedbackDetectorState {
    return {
      isRunning: this.isRunning,
      noiseFloorDb: this.noiseFloorDb,
      effectiveThresholdDb: this.computeEffectiveThresholdDb(),
      sampleRate: this.audioContext?.sampleRate ?? 48000,
      fftSize: this.config.fftSize,
      autoGainEnabled: this._autoGainEnabled,
      autoGainDb: Math.round(this._autoGainDb),
      autoGainLocked: this._autoGainLocked,
      rawPeakDb: this._rawPeakDb,
      isSignalPresent: this._isSignalPresent,
      algorithmMode: this._algorithmMode,
      contentType: this._contentType,
      msdFrameCount: this._msdFrameCount,
      isCompressed: this._isCompressed,
      compressionRatio: this._compressionRatio,
      perfTimings: this._debugPerf ? this._perfTimings : undefined,
    }
  }

  /** Enable/disable performance.now() instrumentation in analyze() */
  enablePerfDebug(enabled: boolean): void {
    this._debugPerf = enabled
    if (!enabled) this._perfTimings = null
  }

  /** Get latest frame timings (null when debug is off or no frames analyzed yet) */
  getPerfTimings(): PerfTimings | null {
    return this._perfTimings
  }

  setAlgorithmState(state: {
    algorithmMode?: AlgorithmMode
    contentType?: ContentType
    msdFrameCount?: number
    isCompressed?: boolean
    compressionRatio?: number
  }): void {
    if (state.algorithmMode !== undefined) this._algorithmMode = state.algorithmMode
    if (state.contentType !== undefined) this._contentType = state.contentType
    if (state.msdFrameCount !== undefined) this._msdFrameCount = state.msdFrameCount
    if (state.isCompressed !== undefined) this._isCompressed = state.isCompressed
    if (state.compressionRatio !== undefined) this._compressionRatio = state.compressionRatio
  }

  getSpectrum(): Float32Array | null {
    return this.freqDb
  }

  getTimeDomain(): Float32Array | null {
    return this.timeDomain
  }

  getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 48000
  }

  binToFrequency(binIndex: number): number {
    const sr = this.getSampleRate()
    return (binIndex * sr) / this.config.fftSize
  }

  frequencyToBin(hz: number): number {
    const sr = this.getSampleRate()
    return Math.round((hz * this.config.fftSize) / sr)
  }

  // ==================== Internal Methods ====================

  private allocateBuffers(): void {
    if (!this.analyser) return

    const n = this.analyser.frequencyBinCount

    this.freqDb = new Float32Array(n)
    this.timeDomain = new Float32Array(this.config.fftSize) // Full waveform (fftSize, not frequencyBinCount)
    this.power = new Float32Array(n)
    this.prefix = new Float64Array(n + 1)
    this.holdMs = new Float32Array(n)
    this.deadMs = new Float32Array(n)
    this.active = new Uint8Array(n)
    this.activeHz = new Float32Array(n)
    this.activeBins = new Uint32Array(n)
    this.activeBinPos = new Int32Array(n)
    this.activeBinPos.fill(-1)
    this.activeCount = 0

    // Build A-weighting table
    this.aWeightingTable = new Float32Array(n)
    this.computeAWeightingTable()

    // Build mic calibration table
    this.micCalibrationTable = new Float32Array(n)
    this.computeMicCalibrationTable()

    this.recomputeAnalysisDbBounds()

    // MSD history buffers - ring buffer per bin
    const historySize = MSD_SETTINGS.HISTORY_SIZE
    this.msdHistory = new Array(n)
    for (let i = 0; i < n; i++) {
      this.msdHistory[i] = new Float32Array(historySize)
    }
    this.msdHistoryIndex = new Uint8Array(n)
    this.msdFrameCount = new Uint16Array(n)
    this.msdConfirmFrames = new Uint8Array(n)

    // Peak Persistence Scoring - Phase 2
    this.persistenceCount = new Uint16Array(n)
    this.persistenceLastDb = new Float32Array(n)
    
    this.noiseFloorDb = null
    this.recomputeDerivedIndices()
  }

  private resetHistory(): void {
    if (this.holdMs) this.holdMs.fill(0)
    if (this.deadMs) this.deadMs.fill(0)
    if (this.active) this.active.fill(0)
    if (this.activeHz) this.activeHz.fill(0)
    if (this.activeBinPos) this.activeBinPos.fill(-1)
    this.activeCount = 0
    
    // Reset MSD history
    if (this.msdHistory) {
      for (let i = 0; i < this.msdHistory.length; i++) {
        this.msdHistory[i].fill(0)
      }
    }
    if (this.msdHistoryIndex) this.msdHistoryIndex.fill(0)
    if (this.msdFrameCount) this.msdFrameCount.fill(0)
    if (this.msdConfirmFrames) this.msdConfirmFrames.fill(0)
    
    // Reset persistence scoring
    if (this.persistenceCount) this.persistenceCount.fill(0)
    if (this.persistenceLastDb) this.persistenceLastDb.fill(-200)

    // Reset hysteresis state
    this._recentlyClearedBins.clear()
  }

  private computeAWeightingTable(): void {
    const table = this.aWeightingTable
    if (!table) return

    const sr = this.getSampleRate()
    const fft = this.config.fftSize
    const hzPerBin = sr / fft

    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < table.length; i++) {
      const f = i * hzPerBin
      let w = this.aWeightingDb(f)
      if (!Number.isFinite(w)) w = A_WEIGHTING.MIN_DB
      table[i] = w
      if (w < min) min = w
      if (w > max) max = w
    }

    this.aWeightingMinDb = Number.isFinite(min) ? min : 0
    this.aWeightingMaxDb = Number.isFinite(max) ? max : 0
  }

  private aWeightingDb(fHz: number): number {
    if (fHz <= 0) return A_WEIGHTING.MIN_DB

    const f2 = fHz * fHz
    const { C1, C2, C3, C4, OFFSET } = A_WEIGHTING
    const c1_2 = C1 * C1
    const c2_2 = C2 * C2
    const c3_2 = C3 * C3
    const c4_2 = C4 * C4

    const num = c4_2 * (f2 * f2)
    const den = (f2 + c1_2) * (f2 + c4_2) * Math.sqrt((f2 + c2_2) * (f2 + c3_2))

    const ra = num / den
    if (ra <= 0 || !Number.isFinite(ra)) return A_WEIGHTING.MIN_DB

    return OFFSET + 20 * Math.log10(ra)
  }

  private computeMicCalibrationTable(): void {
    const table = this.micCalibrationTable
    if (!table) return

    const sr = this.getSampleRate()
    const fft = this.config.fftSize
    const hzPerBin = sr / fft
    const cal = ECM8000_CALIBRATION

    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < table.length; i++) {
      const f = i * hzPerBin
      // Interpolate the calibration curve and negate (compensation = inverse)
      let comp = 0
      if (f <= cal[0][0]) {
        comp = -cal[0][1]
      } else if (f >= cal[cal.length - 1][0]) {
        comp = -cal[cal.length - 1][1]
      } else {
        // Find bracketing points and interpolate in log-frequency space
        for (let j = 1; j < cal.length; j++) {
          if (f <= cal[j][0]) {
            const fLow = cal[j - 1][0]
            const fHigh = cal[j][0]
            const dBLow = cal[j - 1][1]
            const dBHigh = cal[j][1]
            const t = (Math.log(f) - Math.log(fLow)) / (Math.log(fHigh) - Math.log(fLow))
            comp = -(dBLow + t * (dBHigh - dBLow))
            break
          }
        }
      }

      if (!Number.isFinite(comp)) comp = 0
      table[i] = comp
      if (comp < min) min = comp
      if (comp > max) max = comp
    }

    this.micCalMinDb = Number.isFinite(min) ? min : 0
    this.micCalMaxDb = Number.isFinite(max) ? max : 0
  }

  private recomputeAnalysisDbBounds(): void {
    let minOffset = 0
    let maxOffset = 0
    if (this.config.aWeightingEnabled) {
      minOffset += this.aWeightingMinDb
      maxOffset += this.aWeightingMaxDb
    }
    if (this.config.micCalibrationEnabled) {
      minOffset += this.micCalMinDb
      maxOffset += this.micCalMaxDb
    }
    this.analysisMinDb = -100 + minOffset
    this.analysisMaxDb = 0 + maxOffset
  }

  private recomputeDerivedIndices(): void {
    const n = this.freqDb?.length ?? 0
    if (!n) return

    const sr = this.getSampleRate()
    const fft = this.config.fftSize
    const hzToBin = (hz: number) => Math.round((hz * fft) / sr)

    let start = hzToBin(this.config.minHz)
    let end = hzToBin(this.config.maxHz)

    start = clamp(start, 0, n - 1)
    end = clamp(end, 0, n - 1)
    if (end < start) [start, end] = [end, start]

    // Clamp neighborhood bins
    const nbMax = Math.floor((n - 3) / 2)
    const nb = Math.max(4, Math.min(this.config.neighborhoodBins, nbMax))
    this.effectiveNb = nb

    // Ensure room for full neighborhoods with ±1 exclusion
    start = Math.max(start, nb)
    end = Math.min(end, n - 1 - nb)

    if (end < start) {
      this.startBin = 1
      this.endBin = 0
      this.noiseSampleIdx = new Uint32Array(0)
      this.noiseSamples = new Float32Array(0)
      return
    }

    this.startBin = start
    this.endBin = end

    // Precompute noise floor sample indices
    const range = end - start + 1
    const desired = Math.min(this.config.noiseFloorSampleCount, range)

    this.noiseSampleIdx = new Uint32Array(desired)
    this.noiseSamples = new Float32Array(desired)

    if (desired === 1) {
      this.noiseSampleIdx[0] = start
      return
    }

    const step = (range - 1) / (desired - 1)
    for (let i = 0; i < desired; i++) {
      const idx = start + Math.round(i * step)
      this.noiseSampleIdx[i] = clamp(idx, start, end)
    }
  }

  private rafLoop(timestamp: number): void {
    if (!this.isRunning) return

    const rafDt = this.lastRafTs === 0 ? 0 : timestamp - this.lastRafTs
    this.lastRafTs = timestamp

    // Guard against throttling (background tab)
    if (rafDt > this.maxAnalysisGapMs) {
      this.resetHistory()
      this.lastAnalysisTs = timestamp
    }

    if (this.lastAnalysisTs === 0) {
      this.lastAnalysisTs = timestamp
    }

    const since = timestamp - this.lastAnalysisTs
    if (since >= this.config.analysisIntervalMs) {
      this.analyze(timestamp, since)
      this.lastAnalysisTs = timestamp
    }

    this.rafId = requestAnimationFrame(this.rafLoop)
  }

  private analyze(now: number, dt: number): void {
    const debugPerf = this._debugPerf
    const t0 = debugPerf ? performance.now() : 0

    const analyser = this.analyser
    const ctx = this.audioContext
    if (!analyser || !this.freqDb || !this.power || !this.prefix || !this.holdMs || !this.deadMs || !this.active) return
    if (!ctx || ctx.state !== 'running') return

    // Periodic housekeeping: prune stale cleared-bin entries every ~300 frames (~5s)
    if (++this._analyzeCallCount % 300 === 0) {
      const staleThreshold = now - this.config.clearMs * 2
      for (const [bin, ts] of this._recentlyClearedBins) {
        if (ts < staleThreshold) this._recentlyClearedBins.delete(bin)
      }
    }

    // Read spectrum + time-domain waveform (phase coherence requires raw samples)
    analyser.getFloatFrequencyData(this.freqDb)
    if (this.timeDomain) {
      analyser.getFloatTimeDomainData(this.timeDomain)
    }

    const freqDb = this.freqDb
    const power = this.power
    const prefix = this.prefix
    const n = freqDb.length

    const useAWeighting = this.config.aWeightingEnabled && !!this.aWeightingTable
    const aTable = this.aWeightingTable
    const useMicCalibration = this.config.micCalibrationEnabled && !!this.micCalibrationTable
    const micCalTable = this.micCalibrationTable

    // ── Auto-gain: measure raw peak BEFORE applying gain ──────────────────
    if (this._autoGainEnabled) {
      let rawPeak = -100
      const agStart = this.startBin > 0 ? this.startBin : 1
      const agEnd = this.endBin > 0 ? this.endBin : n - 1
      for (let i = agStart; i <= agEnd; i++) {
        const v = freqDb[i]
        if (Number.isFinite(v) && v > rawPeak) rawPeak = v
      }
      this._rawPeakDb = rawPeak

      // ── Signal presence gate ──────────────────────────────────────────
      // If the raw (pre-gain) signal is below silence threshold, there is
      // no meaningful audio. Skip all peak detection to prevent auto-gain
      // from amplifying noise floor artifacts into phantom feedback peaks.
      this._isSignalPresent = rawPeak >= this._silenceThresholdDb

      // ── Measure-then-lock calibration ─────────────────────────────────
      // Once locked, skip all EMA updates — gain stays frozen at calibrated value
      if (!this._autoGainLocked) {
        // Start calibration timer on first frame with signal
        if (this._autoGainCalibrationStartMs === 0 && this._isSignalPresent) {
          this._autoGainCalibrationStartMs = now
        }

        // Only update EMA when signal is present (don't calibrate on silence)
        if (this._isSignalPresent) {
          this._autoGainSignalFrames++

          // Desired gain: shift rawPeak to target (-12 dBFS)
          const desiredGain = clamp(
            this._autoGainTargetDb - rawPeak,
            this._autoGainMinDb,
            this._autoGainMaxDb
          )

          // EMA smoothing: attack (gain decreasing = signal loud) is fast,
          // release (gain increasing = signal quiet) is slower
          const coeff = desiredGain > this._autoGainDb
            ? this._autoGainReleaseCoeff
            : this._autoGainAttackCoeff
          this._autoGainDb += coeff * (desiredGain - this._autoGainDb)
        }

        // Lock gain after calibration window if we got enough signal frames
        // Minimum 30 frames (~0.6s of actual signal) prevents locking on a blip
        if (this._autoGainCalibrationStartMs > 0) {
          const elapsed = now - this._autoGainCalibrationStartMs
          if (elapsed >= this._autoGainCalibrationMs && this._autoGainSignalFrames >= 30) {
            this._autoGainLocked = true
            // Round to integer dB for stable operation
            this._autoGainDb = Math.round(this._autoGainDb)
          }
        }
      }

      // When no signal present, skip peak detection. Noise floor continues tracking.
      if (!this._isSignalPresent) {
        this._clearStalePeaksOnSilence(dt, now)
        return
      }
    } else {
      // Manual gain mode — still check signal presence via raw peak scan
      let rawPeak = -100
      const mgStart = this.startBin > 0 ? this.startBin : 1
      const mgEnd = this.endBin > 0 ? this.endBin : n - 1
      for (let i = mgStart; i <= mgEnd; i++) {
        const v = freqDb[i]
        if (Number.isFinite(v) && v > rawPeak) rawPeak = v
      }
      this._rawPeakDb = rawPeak
      this._isSignalPresent = rawPeak >= this._silenceThresholdDb
      if (!this._isSignalPresent) {
        this._clearStalePeaksOnSilence(dt, now)
        return
      }
    }

    // Use auto-gain when enabled, otherwise manual setting
    const inputGain = this._autoGainEnabled
      ? Math.round(this._autoGainDb) // Round to integer dB to avoid micro-jitter
      : (this.config.inputGainDb ?? 0)

    // Below-threshold skip: bins far below threshold contribute negligible power
    // to prominence averages. Skip LUT for them (saves 20-60% of lookups).
    // Uses previous frame's threshold (EMA-smoothed, changes slowly).
    const skipThreshold = this.computeEffectiveThresholdDb() - 12

    // Build power + prefix sums
    prefix[0] = 0
    for (let i = 0; i < n; i++) {
      let db = freqDb[i]

      if (!Number.isFinite(db)) db = -100

      // Apply software input gain
      db += inputGain

      db = clamp(db, -100, 0)

      // Apply A-weighting if enabled
      if (useAWeighting && aTable) db += aTable[i]
      // Apply mic calibration compensation (inverse frequency response)
      if (useMicCalibration && micCalTable) db += micCalTable[i]
      db = clamp(db, this.analysisMinDb, this.analysisMaxDb)

      freqDb[i] = db

      // Skip power computation for bins well below threshold — they can never
      // be peaks and contribute negligibly to neighborhood averages
      if (db < skipThreshold) {
        power[i] = 0
        prefix[i + 1] = prefix[i]
        continue
      }

      // LUT replaces Math.exp(db * ln10/10) — 0.1dB quantization, ~3x faster
      const lutIdx = ((db + 100) * 10 + 0.5) | 0
      const p = EXP_LUT[lutIdx < 0 ? 0 : lutIdx > 1000 ? 1000 : lutIdx]
      power[i] = p
      prefix[i + 1] = prefix[i] + p
    }

    const t1 = debugPerf ? performance.now() : 0

    // Update noise floor
    if (this.config.noiseFloorEnabled) {
      this.updateNoiseFloorDb(dt)
    }

    const effectiveThresholdDb = this.computeEffectiveThresholdDb()
    const nb = this.effectiveNb
    const start = this.startBin
    const end = this.endBin
    if (end < start) return

    const hold = this.holdMs
    const dead = this.deadMs
    const active = this.active

    for (let i = start; i <= end; i++) {
      const peakDb = freqDb[i]
      const leftDb = freqDb[i - 1]
      const rightDb = freqDb[i + 1]

      // MSD: Always update magnitude history for active or candidate peaks
      // This enables early detection of growing feedback
      if (peakDb >= effectiveThresholdDb - 6) { // Track peaks within 6dB of threshold
        this.updateMsdHistory(i, peakDb)
        this.updatePersistence(i, peakDb) // Phase 2: Also track persistence
      }

      // Local max check
      const isLocalMax = peakDb >= leftDb && peakDb >= rightDb && (peakDb > leftDb || peakDb > rightDb)
      let valid = isLocalMax && peakDb >= effectiveThresholdDb
      let prominence = -Infinity

      // MSD early detection: if peak is just below threshold but MSD confirms
      // a howl pattern (consistent growth), lower the threshold to catch it early.
      // This lets quiet feedback through before it becomes obvious.
      if (!valid && isLocalMax && peakDb >= effectiveThresholdDb - MSD_SETTINGS.THRESHOLD_REDUCTION_DB) {
        const msdResult = this.calculateMsd(i)
        if (msdResult.isHowl || msdResult.fastConfirm) {
          valid = true
        }
      }

      // Hysteresis: recently cleared bins need extra dB to re-trigger (prevents flicker duplicates)
      if (valid && active[i] === 0) {
        const clearedAt = this._recentlyClearedBins.get(i)
        if (clearedAt !== undefined) {
          if ((now - clearedAt) < this.config.clearMs) {
            // Within cooldown — require extra dB
            if (peakDb < effectiveThresholdDb + HYSTERESIS.RE_TRIGGER_DB) {
              valid = false
            }
          } else {
            // Cooldown expired — clean up
            this._recentlyClearedBins.delete(i)
          }
        }
      }

      if (valid) {
        // ±2 bin Blackman exclusion for neighborhood averaging
        const startNb = i - nb
        const endNbExcl = i + nb + 1

        // totalPower = sum(range) - power[i-2] - power[i-1] - power[i] - power[i+1] - power[i+2]
        // For ±2 exclusion as per spec
        let totalPower = prefix[endNbExcl] - prefix[startNb]
        totalPower -= power[i - 2] + power[i - 1] + power[i] + power[i + 1] + power[i + 2]
        
        // count = (2*nb+1) - 5 = 2*nb - 4
        const count = 2 * nb - 4
        if (totalPower < 0) totalPower = 0

        const avgPower = count > 0 ? totalPower / count : 0
        const avgDb = avgPower > 0 ? 10 * Math.log10(avgPower) : this.analysisMinDb

        prominence = peakDb - avgDb
        if (prominence < this.config.prominenceDb) valid = false
      }

      if (valid) {
        hold[i] += dt
        dead[i] = 0

        if (hold[i] >= this.config.sustainMs && active[i] === 0) {
          // Quadratic interpolation for true peak
          const { delta, peak: trueAmplitudeDb } = quadraticInterpolation(leftDb, peakDb, rightDb)
          
          const sr = ctx.sampleRate
          const fft = analyser.fftSize
          const hzPerBin = sr / fft
          const trueFrequencyHz = (i + delta) * hzPerBin

          // ── Harmonic detection ─────────────────────────────────────────
          // Uses cents-based tolerance (musically uniform across the spectrum)
          // instead of a flat percentage, which is too coarse in the high range
          // and can miss harmonics in the low range.
          let harmonicRootHz: number | null = null
          let isSubHarmonicRoot = false

          if (this.activeBins && this.activeHz && this.activeCount > 0) {
            const maxHarmonic = HARMONIC_SETTINGS.MAX_HARMONIC
            const tolCents = this.harmonicToleranceCents

            // ── A: Overtone check ──────────────────────────────────────────
            // Is this new peak an overtone (2nd–8th) of any active root?
            for (let j = 0; j < this.activeCount; j++) {
              const rootBin = this.activeBins[j]
              const rootHz = this.activeHz[rootBin]
              if (rootHz <= 0 || rootHz >= trueFrequencyHz) continue

              const ratio = trueFrequencyHz / rootHz
              const k = Math.round(ratio)
              if (k < 2 || k > maxHarmonic) continue

              const expectedHz = rootHz * k
              // Convert frequency deviation to cents: 1200 * log2(actual/expected)
              const cents = Math.abs(1200 * Math.log2(trueFrequencyHz / expectedHz))
              if (cents <= tolCents) {
                // Prefer the lowest matching root (closest to fundamental)
                if (harmonicRootHz === null || rootHz < harmonicRootHz) {
                  harmonicRootHz = rootHz
                }
              }
            }

            // ── B: Sub-harmonic check ──────────────────────────────────────
            // Is this new peak the FUNDAMENTAL of a partial that is already
            // active? (e.g. the 2nd partial was detected first; now we see
            // the root appear below it.)
            if (HARMONIC_SETTINGS.CHECK_SUB_HARMONICS && harmonicRootHz === null) {
              for (let j = 0; j < this.activeCount; j++) {
                const partialBin = this.activeBins[j]
                const partialHz = this.activeHz[partialBin]
                if (partialHz <= 0 || partialHz <= trueFrequencyHz) continue

                const ratio = partialHz / trueFrequencyHz
                const k = Math.round(ratio)
                if (k < 2 || k > maxHarmonic) continue

                const expectedPartialHz = trueFrequencyHz * k
                const cents = Math.abs(1200 * Math.log2(partialHz / expectedPartialHz))
                if (cents <= tolCents) {
                  // This peak is the fundamental of a harmonic series already present.
                  // harmonicRootHz stays null (this IS the root) but we mark it so
                  // the classifier can boost harmonicity scoring appropriately.
                  harmonicRootHz = null // peak is the root, not an overtone
                  isSubHarmonicRoot = true
                  break
                }
              }
            }
          }

          // Mark active
          active[i] = 1
          if (this.activeHz) this.activeHz[i] = trueFrequencyHz
          if (this.activeBins && this.activeBinPos) {
            const pos = this.activeCount
            this.activeBins[pos] = i
            this.activeBinPos[i] = pos
            this.activeCount = pos + 1
          }

          // Q estimation via -3dB bandwidth
          const { qEstimate, bandwidthHz } = this.estimateQ(i, trueAmplitudeDb, trueFrequencyHz)

          const peak: DetectedPeak = {
            binIndex: i,
            trueFrequencyHz,
            trueAmplitudeDb: clamp(trueAmplitudeDb, this.analysisMinDb, this.analysisMaxDb),
            prominenceDb: prominence,
            sustainedMs: hold[i],
            harmonicOfHz: harmonicRootHz,
            isSubHarmonicRoot,
            timestamp: now,
            noiseFloorDb: this.noiseFloorDb,
            effectiveThresholdDb,
          }

          // Q estimation
          peak.qEstimate = qEstimate
          peak.bandwidthHz = bandwidthHz

          // PHPR (Peak-to-Harmonic Power Ratio) — feedback vs music discrimination
          peak.phpr = this.calculatePHPR(i)

          // MSD analysis for howl detection
          const msdResult = this.calculateMsd(i)
          peak.msd = msdResult.msd
          peak.msdGrowthRate = msdResult.growthRate
          peak.msdIsHowl = msdResult.isHowl
          peak.msdFastConfirm = msdResult.fastConfirm

          // Phase 2: Persistence scoring
          const persistenceResult = this.getPersistenceScore(i)
          peak.persistenceFrames = persistenceResult.frames
          peak.persistenceBoost = persistenceResult.boost
          peak.isPersistent = persistenceResult.isPersistent
          peak.isHighlyPersistent = persistenceResult.isHighlyPersistent

          this.callbacks.onPeakDetected?.(peak)
        }
      } else {
        hold[i] = Math.max(0, hold[i] - dt * HOLD_DECAY_RATE_MULTIPLIER)

        if (active[i] === 1) {
          dead[i] += dt

          if (dead[i] >= this.config.clearMs) {
            const clearedHz = this.activeHz?.[i] ?? this.binToFrequency(i)

            active[i] = 0
            dead[i] = 0

            // Remove from active list (swap-remove)
            if (this.activeBins && this.activeBinPos) {
              const pos = this.activeBinPos[i]
              if (pos >= 0) {
                const lastPos = this.activeCount - 1
                if (lastPos >= 0) {
                  const lastBin = this.activeBins[lastPos]
                  this.activeBins[pos] = lastBin
                  this.activeBinPos[lastBin] = pos
                  this.activeCount = lastPos
                }
                this.activeBinPos[i] = -1
              }
            }
                if (this.activeHz) this.activeHz[i] = 0
            
            // Reset MSD history for this bin
            this.resetMsdForBin(i)

            // Record for hysteresis — recently cleared bins need extra dB to re-trigger
            this._recentlyClearedBins.set(i, now)

            this.callbacks.onPeakCleared?.({
              binIndex: i,
              frequencyHz: clearedHz,
              timestamp: now,
            })
          }
        } else {
          dead[i] = 0
        }
      }
    }

    if (debugPerf) {
      const t3 = performance.now()
      this._perfTimings = {
        total: t3 - t0,
        power: t1 - t0,
        peaks: t3 - t1, // peak detection + MSD + persistence + cleanup
        msd: 0, // included in peaks — tracked separately if needed later
      }
    }
  }

  private estimateQ(binIndex: number, peakDb: number, trueFrequencyHz?: number): { qEstimate: number; bandwidthHz: number } {
    // Find -3dB points around peak
    const freqDb = this.freqDb
    if (!freqDb) return { qEstimate: 10, bandwidthHz: 100 }

    const threshold = peakDb - 3
    const n = freqDb.length
    const sr = this.getSampleRate()
    const fft = this.config.fftSize
    const hzPerBin = sr / fft

    // Search left for -3dB crossing
    let leftBin = binIndex
    let foundLeft = false
    for (let i = binIndex - 1; i >= 0; i--) {
      if (freqDb[i] < threshold) {
        // Interpolate crossing point
        const denom = freqDb[i + 1] - freqDb[i]
        if (denom > 0) {
          const t = (threshold - freqDb[i]) / denom
          leftBin = i + t
        } else {
          leftBin = i
        }
        foundLeft = true
        break
      }
    }

    // Search right for -3dB crossing
    let rightBin = binIndex
    let foundRight = false
    for (let i = binIndex + 1; i < n; i++) {
      if (freqDb[i] < threshold) {
        // Interpolate crossing point
        const denom = freqDb[i] - freqDb[i - 1]
        if (denom < 0) {
          const t = (threshold - freqDb[i - 1]) / denom
          rightBin = i - 1 + t
        } else {
          rightBin = i
        }
        foundRight = true
        break
      }
    }

    // If no crossing found on either side, use 1-bin default bandwidth
    if (!foundLeft && !foundRight) {
      return { qEstimate: 100, bandwidthHz: hzPerBin }
    }
    // Mirror the found side if only one crossing was located
    if (!foundLeft) leftBin = binIndex - (rightBin - binIndex)
    if (!foundRight) rightBin = binIndex + (binIndex - leftBin)

    const bandwidthBins = rightBin - leftBin
    const bandwidthHz = bandwidthBins * hzPerBin
    const centerHz = trueFrequencyHz ?? binIndex * hzPerBin

    // Q = center / bandwidth
    const qEstimate = bandwidthHz > 0 ? centerHz / bandwidthHz : 100

    return { qEstimate: clamp(qEstimate, 1, 500), bandwidthHz: Math.max(bandwidthHz, hzPerBin) }
  }

  /**
   * Calculate PHPR (Peak-to-Harmonic Power Ratio) for a detected peak.
   * Feedback is sinusoidal (no harmonics), music has rich harmonics.
   *
   * PHPR = peakPower - mean(harmonicPowers) in dB
   * High PHPR (>15 dB) = likely feedback (pure tone)
   * Low PHPR (<8 dB) = likely music/speech (harmonics present)
   *
   * @param freqBin - FFT bin index of the peak
   * @returns PHPR in dB, or undefined if harmonics are out of FFT range
   */
  private calculatePHPR(freqBin: number): number | undefined {
    const spectrum = this.freqDb
    if (!spectrum) return undefined

    const n = spectrum.length
    const peakDb = spectrum[freqBin]
    let harmonicSum = 0
    let harmonicCount = 0

    for (let h = 2; h <= PHPR_SETTINGS.NUM_HARMONICS + 1; h++) {
      const harmonicBin = Math.round(freqBin * h)
      if (harmonicBin >= n) break // Harmonic out of FFT range

      // Find max within ±BIN_TOLERANCE (accounts for FFT leakage)
      let maxHarmonicDb = -Infinity
      const lo = Math.max(0, harmonicBin - PHPR_SETTINGS.BIN_TOLERANCE)
      const hi = Math.min(n - 1, harmonicBin + PHPR_SETTINGS.BIN_TOLERANCE)
      for (let b = lo; b <= hi; b++) {
        if (spectrum[b] > maxHarmonicDb) {
          maxHarmonicDb = spectrum[b]
        }
      }

      harmonicSum += maxHarmonicDb
      harmonicCount++
    }

    if (harmonicCount === 0) return undefined

    const meanHarmonicDb = harmonicSum / harmonicCount
    return peakDb - meanHarmonicDb
  }

  private updateNoiseFloorDb(dt: number): void {
    const idx = this.noiseSampleIdx
    const samples = this.noiseSamples
    if (!idx || !samples || idx.length === 0 || !this.freqDb) return

    const freqDb = this.freqDb

    // Gather samples
    for (let i = 0; i < idx.length; i++) {
      let db = freqDb[idx[i]]
      if (!Number.isFinite(db)) db = this.analysisMinDb
      db = clamp(db, this.analysisMinDb, this.analysisMaxDb)
      samples[i] = db
    }

    // Median estimation
    const estimateDb = medianInPlace(samples)

    if (this.noiseFloorDb === null) {
      this.noiseFloorDb = estimateDb
      return
    }

    // EMA update
    const tau = estimateDb > this.noiseFloorDb 
      ? this.config.noiseFloorAttackMs 
      : this.config.noiseFloorReleaseMs
    const alpha = 1 - Math.exp(-dt / tau)
    this.noiseFloorDb = this.noiseFloorDb + alpha * (estimateDb - this.noiseFloorDb)
  }

  private computeEffectiveThresholdDb(): number {
    const absT = this.config.thresholdDb

    if (!this.config.noiseFloorEnabled || this.noiseFloorDb === null) {
      return absT
    }

    const relT = this.noiseFloorDb + this.config.relativeThresholdDb
    const result = (() => {
      switch (this.config.thresholdMode) {
        case 'absolute': return absT
        case 'relative': return relT
        case 'hybrid': return Math.max(absT, relT)
        default: return Math.max(absT, relT)
      }
    })()

    return result
  }

  // ==================== MSD Algorithm (DAFx-16) ====================

  /**
   * Update msdMinFrames based on operation mode.
   * Maps detector modes to DAFx-16 content categories so the main-thread
   * min frames stay ≤ the worker's content-adaptive min frames.
   * Called from constructor and updateConfig/updateSettings when mode changes.
   */
  private updateMsdMinFrames(): void {
    const mode = this.config.mode
    if (mode === 'speech' || mode === 'broadcast') {
      this.msdMinFrames = MSD_SETTINGS.MIN_FRAMES_SPEECH  // 7
    } else if (mode === 'liveMusic' || mode === 'worship' || mode === 'outdoor') {
      this.msdMinFrames = MSD_SETTINGS.MIN_FRAMES_MUSIC   // 13
    } else {
      this.msdMinFrames = MSD_SETTINGS.DEFAULT_MIN_FRAMES  // 12
    }
  }

  /**
   * Update MSD history for a frequency bin
   * Called every analysis frame to track magnitude over time
   */
  private updateMsdHistory(binIndex: number, magnitudeDb: number): void {
    if (!this.msdHistory || !this.msdHistoryIndex || !this.msdFrameCount) return
    
    const historySize = MSD_SETTINGS.HISTORY_SIZE
    const history = this.msdHistory[binIndex]
    const idx = this.msdHistoryIndex[binIndex]
    
    // Store magnitude in ring buffer
    history[idx] = magnitudeDb
    
    // Update index (wrap around) — bitwise AND since historySize is power of 2
    this.msdHistoryIndex[binIndex] = (idx + 1) & (historySize - 1)
    
    // Track how many frames we have (up to historySize)
    if (this.msdFrameCount[binIndex] < historySize) {
      this.msdFrameCount[binIndex]++
    }
  }
  
  /**
   * Calculate Magnitude Slope Deviation (MSD) for a frequency bin
   * 
   * MSD measures how consistently the magnitude grows over time.
   * Feedback howl has exponential growth (linear on dB scale) with low gradient deviation.
   * 
   * Using "Summing MSD" method from DAFx paper (140x faster than original):
   * MSD(k,m) = sum of |G''(k,n)|^2 for n = (m-N)+1 to m
   * 
   * Where G''(k,n) is the second derivative of magnitude at bin k, frame n
   * 
   * @returns MSD value (lower = more consistent growth = more likely feedback)
   *          Returns -1 if not enough history
   */
  private calculateMsd(binIndex: number): { msd: number; growthRate: number; isHowl: boolean; fastConfirm: boolean } {
    if (!this.msdHistory || !this.msdFrameCount || !this.msdHistoryIndex || !this.msdConfirmFrames) {
      return { msd: -1, growthRate: 0, isHowl: false, fastConfirm: false }
    }

    const frameCount = this.msdFrameCount[binIndex]
    if (frameCount < this.msdMinFrames) {
      return { msd: -1, growthRate: 0, isHowl: false, fastConfirm: false }
    }

    // MINIMUM ENERGY GUARD (DAFx-16 Section 3):
    // Prevent MSD from triggering on quiet noise floor fluctuations.
    // Only run MSD analysis if the current bin energy is sufficiently
    // above the noise floor. Without this, random dB-level noise
    // fluctuations near the noise floor can produce low MSD values
    // that mimic the linear-in-dB growth pattern of feedback.
    if (this.noiseFloorDb !== null && this.freqDb) {
      const currentDb = this.freqDb[binIndex]
      const energyAboveNoise = currentDb - this.noiseFloorDb
      if (energyAboveNoise < MSD_SETTINGS.MIN_ENERGY_ABOVE_NOISE_DB) {
        return { msd: 999, growthRate: 0, isHowl: false, fastConfirm: false }
      }
    }

    const historySize = MSD_SETTINGS.HISTORY_SIZE
    const mask = historySize - 1 // Bitwise AND mask (historySize is power of 2)
    const history = this.msdHistory[binIndex]
    const currentIdx = this.msdHistoryIndex[binIndex]

    // Precompute ordered indices into scratch buffer — eliminates per-element modulo
    const ordered = this._msdScratch
    for (let i = 0; i < frameCount; i++) {
      ordered[i] = (currentIdx - frameCount + i + historySize) & mask
    }

    // Compute first derivative sum (growth rate) inline — no array allocations
    let sumFirstDeriv = 0
    let prevVal = history[ordered[0]]
    for (let i = 1; i < frameCount; i++) {
      const val = history[ordered[i]]
      sumFirstDeriv += val - prevVal
      prevVal = val
    }

    const numFirstDeriv = frameCount - 1
    const avgGrowthRate = numFirstDeriv > 0 ? sumFirstDeriv / numFirstDeriv : 0

    // Growth rate is tracked but does not gate MSD evaluation.
    // Stable feedback at GBF equilibrium (not growing) must still be detected.

    // SYNC: MSD second-derivative computation — identical math to
    // msdAnalysis.ts:MSDHistoryBuffer.calculateMSD() (3-point stencil form).
    // See __tests__/msdConsistency.test.ts
    // Second derivative = d1[i] - d1[i-1] where d1[i] = ordered[i+1] - ordered[i]
    let sumSquaredSecondDeriv = 0
    let prevD1 = history[ordered[1]] - history[ordered[0]]
    for (let i = 2; i < frameCount; i++) {
      const d1 = history[ordered[i]] - history[ordered[i - 1]]
      const d2 = d1 - prevD1
      sumSquaredSecondDeriv += d2 * d2
      prevD1 = d1
    }

    const numSecondDeriv = frameCount - 2
    const msd = numSecondDeriv > 0
      ? sumSquaredSecondDeriv / numSecondDeriv
      : 0

    // Check for howl
    const isHowl = msd < MSD_SETTINGS.HOWL_THRESHOLD

    // Fast confirmation: if MSD stays below fast threshold for N frames
    let fastConfirm = false
    if (msd < MSD_SETTINGS.FAST_CONFIRM_THRESHOLD) {
      this.msdConfirmFrames[binIndex]++
      if (this.msdConfirmFrames[binIndex] >= MSD_SETTINGS.FAST_CONFIRM_FRAMES) {
        fastConfirm = true
      }
    } else {
      this.msdConfirmFrames[binIndex] = 0
    }

    return { msd, growthRate: avgGrowthRate, isHowl, fastConfirm }
  }
  
  /**
   * Reset MSD history for a specific bin (when peak clears)
   */
  private resetMsdForBin(binIndex: number): void {
    if (!this.msdHistory || !this.msdHistoryIndex || !this.msdFrameCount || !this.msdConfirmFrames) return
    
    this.msdHistory[binIndex].fill(0)
    this.msdHistoryIndex[binIndex] = 0
    this.msdFrameCount[binIndex] = 0
    this.msdConfirmFrames[binIndex] = 0
    
    // Also reset persistence for this bin
    if (this.persistenceCount) this.persistenceCount[binIndex] = 0
    if (this.persistenceLastDb) this.persistenceLastDb[binIndex] = -200
  }
  
  /**
   * When signal gate closes, continue aging active peaks so they clear properly.
   * Prevents ghost advisories from persisting during silence.
   */
  private _clearStalePeaksOnSilence(dt: number, now?: number): void {
    const active = this.active
    const dead = this.deadMs
    if (!active || !dead) return

    for (let i = 0; i < active.length; i++) {
      if (active[i] === 1) {
        dead[i] += dt
        if (dead[i] >= this.config.clearMs) {
          const clearedHz = this.activeHz?.[i] ?? this.binToFrequency(i)

          active[i] = 0
          dead[i] = 0
          if (this.holdMs) this.holdMs[i] = 0

          // Remove from active list (swap-remove)
          if (this.activeBins && this.activeBinPos) {
            const pos = this.activeBinPos[i]
            if (pos >= 0) {
              const lastPos = this.activeCount - 1
              if (lastPos >= 0) {
                const lastBin = this.activeBins[lastPos]
                this.activeBins[pos] = lastBin
                this.activeBinPos[lastBin] = pos
                this.activeCount = lastPos
              }
              this.activeBinPos[i] = -1
            }
          }
          if (this.activeHz) this.activeHz[i] = 0

          this.resetMsdForBin(i)

          this.callbacks.onPeakCleared?.({
            binIndex: i,
            frequencyHz: clearedHz,
            timestamp: now ?? performance.now(),
          })
        }
      }
    }
  }

  // ==================== Persistence Scoring (Phase 2) ====================
  
  /**
   * Update persistence count for a frequency bin
   * Tracks consecutive frames where a peak persists at similar amplitude
   */
  private updatePersistence(binIndex: number, amplitudeDb: number): void {
    if (!this.persistenceCount || !this.persistenceLastDb) return
    
    const lastDb = this.persistenceLastDb[binIndex]
    const dbDiff = Math.abs(amplitudeDb - lastDb)
    
    // Check if amplitude is within tolerance (peak is "persisting")
    if (dbDiff <= PERSISTENCE_SCORING.AMPLITUDE_TOLERANCE_DB && lastDb > -150) {
      // Increment persistence (cap at HISTORY_FRAMES)
      this.persistenceCount[binIndex] = Math.min(
        this.persistenceCount[binIndex] + 1,
        PERSISTENCE_SCORING.HISTORY_FRAMES
      )
    } else {
      // Amplitude changed too much, reset persistence
      this.persistenceCount[binIndex] = 1
    }
    
    // Update last amplitude
    this.persistenceLastDb[binIndex] = amplitudeDb
  }
  
  /**
   * Get persistence score for a frequency bin
   * Returns: { frames, boost, isPersistent, isVeryPersistent }
   */
  private getPersistenceScore(binIndex: number): {
    frames: number
    boost: number
    penalty: number
    isPersistent: boolean
    isHighlyPersistent: boolean
    isVeryHighlyPersistent: boolean
  } {
    if (!this.persistenceCount) {
      return { frames: 0, boost: 0, penalty: 0, isPersistent: false, isHighlyPersistent: false, isVeryHighlyPersistent: false }
    }
    
    const frames = this.persistenceCount[binIndex]
    let boost = 0
    let penalty = 0
    
    if (frames >= PERSISTENCE_SCORING.VERY_HIGH_PERSISTENCE_FRAMES) {
      boost = PERSISTENCE_SCORING.VERY_HIGH_PERSISTENCE_BOOST
    } else if (frames >= PERSISTENCE_SCORING.HIGH_PERSISTENCE_FRAMES) {
      boost = PERSISTENCE_SCORING.HIGH_PERSISTENCE_BOOST
    } else if (frames >= PERSISTENCE_SCORING.MIN_PERSISTENCE_FRAMES) {
      boost = PERSISTENCE_SCORING.MIN_PERSISTENCE_BOOST
    } else if (frames < PERSISTENCE_SCORING.LOW_PERSISTENCE_FRAMES) {
      penalty = PERSISTENCE_SCORING.LOW_PERSISTENCE_PENALTY
    }
    
    return {
      frames,
      boost,
      penalty,
      isPersistent: frames >= PERSISTENCE_SCORING.MIN_PERSISTENCE_FRAMES,
      isHighlyPersistent: frames >= PERSISTENCE_SCORING.HIGH_PERSISTENCE_FRAMES,
      isVeryHighlyPersistent: frames >= PERSISTENCE_SCORING.VERY_HIGH_PERSISTENCE_FRAMES,
    }
  }
}
