// KillTheRing2 Feedback Detector - Core DSP engine for peak detection
// Adapted from FeedbackDetector.js with TypeScript and enhancements

import { A_WEIGHTING, LN10_OVER_10, HARMONIC_SETTINGS, MSD_SETTINGS, PERSISTENCE_SCORING } from './constants'
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

export interface FeedbackDetectorCallbacks {
  onPeakDetected?: (peak: DetectedPeak) => void
  onPeakCleared?: (peak: { binIndex: number; frequencyHz: number; timestamp: number }) => void
  onCombPatternDetected?: (pattern: CombPatternResult) => void
}

export interface FeedbackDetectorState {
  isRunning: boolean
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  sampleRate: number
  fftSize: number
  // Advanced algorithm state (populated by DSP pipeline)
  algorithmMode?: AlgorithmMode
  contentType?: ContentType
  msdFrameCount?: number
  isCompressed?: boolean
  compressionRatio?: number
}

export class FeedbackDetector {
  // Configuration
  private config: AnalysisConfig
  private callbacks: FeedbackDetectorCallbacks

  // Web Audio
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
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

  // Peak Persistence Scoring - Phase 2 Enhancement
  // Tracks consecutive frames where a peak persists at the same frequency
  // Feedback = persistent (vertical streak), transient = short-lived
  private persistenceCount: Uint16Array | null = null // Consecutive frames at this bin
  private persistenceLastDb: Float32Array | null = null // Last amplitude for comparison

  // A-weighting lookup
  private aWeightingTable: Float32Array | null = null
  private aWeightingMinDb: number = 0
  private aWeightingMaxDb: number = 0

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

  // Smoothing time constant for AnalyserNode (0-1, default 0.6)
  private smoothingTimeConstant: number = 0.6

  // Ring/growth detection thresholds (mapped from DetectorSettings)
  private ringThresholdDb: number = -10
  private growthRateThreshold: number = 1.5

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
    this.rafLoop = this.rafLoop.bind(this)
  }

  // ==================== Public API ====================

  async start(options: { stream?: MediaStream; audioContext?: AudioContext } = {}): Promise<void> {
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
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })
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

    if (config.aWeightingEnabled !== undefined) {
      this.recomputeAnalysisDbBounds()
      this.noiseFloorDb = null
      this.resetHistory()
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
    }
    if (settings.inputGainDb !== undefined) {
      mappedConfig.inputGainDb = settings.inputGainDb
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
    if (settings.relativeThresholdDb !== undefined) {
      mappedConfig.relativeThresholdDb = settings.relativeThresholdDb
    }
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
      algorithmMode: this._algorithmMode,
      contentType: this._contentType,
      msdFrameCount: this._msdFrameCount,
      isCompressed: this._isCompressed,
      compressionRatio: this._compressionRatio,
    }
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

  private recomputeAnalysisDbBounds(): void {
    if (this.config.aWeightingEnabled) {
      this.analysisMinDb = -100 + this.aWeightingMinDb
      this.analysisMaxDb = 0 + this.aWeightingMaxDb
    } else {
      this.analysisMinDb = -100
      this.analysisMaxDb = 0
    }
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
    const nb = Math.max(2, Math.min(this.config.neighborhoodBins, nbMax))
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
    const analyser = this.analyser
    const ctx = this.audioContext
    if (!analyser || !this.freqDb || !this.power || !this.prefix || !this.holdMs || !this.deadMs || !this.active) return
    if (!ctx || ctx.state !== 'running') return

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
    const inputGain = this.config.inputGainDb ?? 0

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
      db = clamp(db, this.analysisMinDb, this.analysisMaxDb)

      freqDb[i] = db
      const p = Math.exp(db * LN10_OVER_10)
      power[i] = p
      prefix[i + 1] = prefix[i] + p
    }

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
          const { qEstimate, bandwidthHz } = this.estimateQ(i, trueAmplitudeDb)

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
        hold[i] = 0

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
  }

  private estimateQ(binIndex: number, peakDb: number): { qEstimate: number; bandwidthHz: number } {
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
    const centerHz = binIndex * hzPerBin
    
    // Q = center / bandwidth
    const qEstimate = bandwidthHz > 0 ? centerHz / bandwidthHz : 100

    return { qEstimate: clamp(qEstimate, 1, 500), bandwidthHz: Math.max(bandwidthHz, hzPerBin) }
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

    switch (this.config.thresholdMode) {
      case 'absolute': return absT
      case 'relative': return relT
      case 'hybrid': return Math.max(absT, relT)
      default: return Math.max(absT, relT)
    }
  }

  // ==================== MSD Algorithm (DAFx-16) ====================
  
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
    
    // Update index (wrap around)
    this.msdHistoryIndex[binIndex] = (idx + 1) % historySize
    
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
    if (frameCount < MSD_SETTINGS.DEFAULT_MIN_FRAMES) {
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
    const history = this.msdHistory[binIndex]
    const currentIdx = this.msdHistoryIndex[binIndex]

    // Compute first derivative sum (growth rate) inline — no array allocations
    // Ring buffer: read oldest→newest via modular index
    let sumFirstDeriv = 0
    let prevVal = history[(currentIdx - frameCount + historySize) % historySize]
    for (let i = 1; i < frameCount; i++) {
      const val = history[(currentIdx - frameCount + i + historySize) % historySize]
      sumFirstDeriv += val - prevVal
      prevVal = val
    }

    const numFirstDeriv = frameCount - 1
    const avgGrowthRate = numFirstDeriv > 0 ? sumFirstDeriv / numFirstDeriv : 0

    // If not growing, not feedback
    if (avgGrowthRate < this.growthRateThreshold) {
      this.msdConfirmFrames[binIndex] = 0
      return { msd: 999, growthRate: avgGrowthRate, isHowl: false, fastConfirm: false }
    }

    // Compute MSD (second derivative RMS) inline — no array allocations
    // Second derivative = d1[i] - d1[i-1] where d1[i] = ordered[i+1] - ordered[i]
    let sumSquaredSecondDeriv = 0
    let prevD1 = history[(currentIdx - frameCount + 1 + historySize) % historySize]
                - history[(currentIdx - frameCount + historySize) % historySize]
    for (let i = 2; i < frameCount; i++) {
      const cur = history[(currentIdx - frameCount + i + historySize) % historySize]
      const prev = history[(currentIdx - frameCount + i - 1 + historySize) % historySize]
      const d1 = cur - prev
      const d2 = d1 - prevD1
      sumSquaredSecondDeriv += d2 * d2
      prevD1 = d1
    }

    const numSecondDeriv = frameCount - 2
    const msd = numSecondDeriv > 0
      ? Math.sqrt(sumSquaredSecondDeriv / numSecondDeriv)
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
