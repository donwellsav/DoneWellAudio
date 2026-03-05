# Kill The Ring

**Professional real-time acoustic feedback detection and analysis for live sound engineers.**

Kill The Ring analyzes microphone input in the browser using the Web Audio API, identifies feedback frequencies using advanced DSP algorithms based on peer-reviewed academic research, and delivers specific EQ recommendations with pitch translation. This is an **analysis tool only** - it does not output or modify audio.

Built by [Don Wells AV](https://donwellsav.com).

---

## Quick Reference for AI Systems

**What this app does:** Real-time feedback frequency detection and EQ recommendations for live sound engineers.

**Key files to understand the system:**
- `lib/dsp/feedbackDetector.ts` - Core FFT analysis engine
- `lib/dsp/advancedDetection.ts` - MSD, Phase, Spectral, Comb algorithms
- `lib/dsp/classifier.ts` - Feedback vs music classification
- `lib/dsp/constants.ts` - All tunable parameters and defaults
- `types/advisory.ts` - All TypeScript interfaces

**Current default values (as of last update):**
- Input Gain: **+15 dB**
- Confidence Threshold: **30%**
- Algorithm Mode: **Combined (MSD + Phase)**
- MSD Min Frames: **15**
- Phase Coherence Threshold: **75%**
- Fusion Feedback Threshold: **65%**

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [DSP Architecture](#dsp-architecture)
- [Advanced Detection Algorithms](#advanced-detection-algorithms)
- [Algorithm Fusion System](#algorithm-fusion-system)
- [Detection Engine](#detection-engine)
- [Mathematical Foundations](#mathematical-foundations)
- [Operation Modes](#operation-modes)
- [Settings Reference](#settings-reference)
- [EQ Recommendations](#eq-recommendations)
- [Severity Levels](#severity-levels)
- [Default Configuration](#default-configuration)
- [Development Guide](#development-guide)
- [Academic References](#academic-references)

---

## Features

### Core Analysis
- **Real-time FFT spectrum analysis** via Web Audio API (4096, 8192, or 16384 bins)
- **Three simultaneous live visualizations:** RTA Spectrum, 31-Band GEQ, and Waterfall
- **Adaptive noise floor** with configurable attack/release time constants
- **Peak detection with quadratic interpolation** for sub-bin frequency accuracy
- **Harmonic tracking** suppresses harmonics (up to 8th) of detected fundamentals

### Advanced Detection (Based on Academic Research)
- **MSD Algorithm** (DAFx-16): Magnitude Slope Deviation detects feedback's characteristic linear dB growth
- **Phase Coherence** (Nyquist): Feedback maintains constant phase relationships
- **Spectral Flatness**: Pure tones have near-zero Wiener entropy
- **Comb Pattern Detection** (DBX): Identifies feedback from acoustic path reflections
- **Compression Detection**: Adapts thresholds for dynamically compressed content
- **Algorithm Fusion**: Weighted combination of all algorithms with content-aware tuning

### Professional Features
- **GEQ band mapping** to ISO 31-band center frequencies with cut depth recommendations
- **PEQ recommendations** with filter type, Q estimation, and gain
- **Pitch translation** - every frequency shown as musical note (e.g., A4, C#3 +15 cents)
- **8 operation modes** tailored for speech, worship, live music, theater, monitors, ring out, broadcast, and outdoor
- **Feedback history** with repeat offender tracking (localStorage persistence)
- **EQ Notepad** for accumulating applied cuts during a session
- **PWA support** — installable, works offline via Serwist service worker

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| UI Components | shadcn/ui |
| Styling | Tailwind CSS v4 |
| Audio | Web Audio API (`AnalyserNode`) |
| Visualization | HTML5 Canvas (custom rendering) |
| State | React 19 hooks (no external state library) |
| PWA | Serwist (service worker, offline caching, installable) |

**No external audio processing libraries.** All DSP runs client-side in the browser.

**No environment variables required.** The app is fully client-side with localStorage persistence.

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (preferred), npm, or yarn
- Modern browser with Web Audio API (Chrome 89+, Firefox 76+, Safari 14.1+, Edge 89+)
- Microphone access (HTTPS required in production)

### Installation

```bash
# Clone the repository
git clone https://github.com/donwellsav/v0sucks-killthering2.git
cd v0sucks-killthering2

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), grant microphone permission, and click **Start**.

---

## Project Structure

```
kill-the-ring/
├── app/
│   ├── layout.tsx                    # Root layout with metadata
│   └── page.tsx                      # Entry point - renders KillTheRing
│
├── components/
│   ├── kill-the-ring/
│   │   ├── KillTheRing.tsx           # Main orchestration component
│   │   ├── KillTheRingClient.tsx     # Client-side wrapper
│   │   ├── SpectrumCanvas.tsx        # RTA Spectrum visualization
│   │   ├── GEQBarView.tsx            # 31-Band GEQ bar visualization
│   │   ├── IssuesList.tsx            # Active issues with Apply buttons
│   │   ├── EQNotepad.tsx             # Accumulated applied cuts
│   │   ├── AlgorithmStatusBar.tsx    # Real-time algorithm state display
│   │   ├── InputMeterSlider.tsx      # Combined input gain + level meter
│   │   ├── SettingsPanel.tsx         # Settings dialog (5 tabs: Detection, Algorithms, Display, Room, Advanced)
│   │   ├── DetectionControls.tsx     # Sidebar mode/threshold controls
│   │   ├── HelpMenu.tsx              # Help documentation (5 tabs: Guide, Modes, Algorithms, Reference, About)
│   │   ├── FeedbackHistoryPanel.tsx  # Historical feedback tracking
│   │   ├── ResetConfirmDialog.tsx    # Settings reset confirmation
│   │   └── ErrorBoundary.tsx         # Error boundary wrapper
│   └── ui/                           # shadcn/ui components
│
├── hooks/
│   ├── useAudioAnalyzer.ts           # Main audio analyzer lifecycle
│   ├── useAdvisoryLogging.ts         # Advisory → feedback history recording
│   └── useAnimationFrame.ts          # rAF utility hook
│
├── lib/
│   ├── audio/
│   │   └── createAudioAnalyzer.ts    # AudioAnalyzer factory
│   ├── changelog.ts                  # Version history (rendered in About tab)
│   ├── dsp/
│   │   ├── feedbackDetector.ts       # Core FFT analysis engine
│   │   ├── advancedDetection.ts      # MSD, Phase, Spectral, Comb, IHR, PTMR
│   │   ├── classifier.ts             # Feedback/whistle/instrument classifier
│   │   ├── eqAdvisor.ts              # GEQ/PEQ recommendation generator
│   │   ├── trackManager.ts           # Peak track lifecycle management
│   │   ├── acousticUtils.ts          # Room acoustics (RT60, Schroeder, air absorption)
│   │   ├── feedbackHistory.ts        # Repeat offender tracking (localStorage)
│   │   ├── severityUtils.ts          # Shared severity/urgency calculation
│   │   ├── dspWorker.ts              # Web Worker entry point
│   │   └── constants.ts              # All tunable parameters and mode presets
│   ├── utils.ts                      # cn() helper for Tailwind class merging
│   └── utils/
│       ├── mathHelpers.ts            # DSP math utilities
│       └── pitchUtils.ts             # Hz to note/octave/cents
│
├── types/
│   └── advisory.ts                   # All TypeScript interfaces
│
└── styles/
    └── globals.css                   # Tailwind globals (OKLch theme)
```

---

## DSP Architecture

### Signal Flow (Analysis Only - No Audio Output)

```
Microphone
    │
    ▼
MediaStream (getUserMedia)
    │
    ▼
GainNode (software input gain, +15 dB default)
    │
    ▼
AnalyserNode (passive, no output connection)
    │
    ├──► getFloatFrequencyData() → Float32Array (freqDb)
    │
    ▼
rafLoop (requestAnimationFrame @ 60fps)
    │
    ├── analyze() every analysisIntervalMs (20ms default)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  CORE ANALYSIS PIPELINE                                 │
├─────────────────────────────────────────────────────────┤
│  1. Apply input gain + optional A-weighting            │
│  2. Build power array + prefix sum for neighborhoods   │
│  3. Update adaptive noise floor (EMA attack/release)   │
│  4. Update MSD history buffer (for advanced detection) │
│  5. Update amplitude buffer (compression detection)    │
│  6. Detect content type (speech/music/compressed)      │
│                                                        │
│  For each bin in [startBin, endBin]:                   │
│    • Local max check (prominence filter)               │
│    • Neighborhood background via prefix sum            │
│    • Prominence threshold gate                         │
│    • Quadratic interpolation → true freq + amplitude   │
│    • Hold timer → confirmed peak                       │
│    • Harmonic suppression (up to 8th, 1.5% tolerance)  │
│    • Q estimation from -3 dB bandwidth                 │
│    • Calculate algorithm scores (MSD, Phase, etc.)     │
│    • Fuse algorithm results → verdict                  │
│    • onPeakDetected callback → TrackManager            │
└─────────────────────────────────────────────────────────┘
    │
    ▼
TrackManager → Classifier → EQ Advisor → Advisory
    │
    ▼
React State Update → UI Render
```

**Key design decision:** The `AnalyserNode` is connected in passive/analysis-only mode. Kill The Ring **never** affects the actual audio signal.

---

## Advanced Detection Algorithms

Kill The Ring uses five complementary detection algorithms based on peer-reviewed academic research. Each algorithm exploits a different physical property of acoustic feedback.

### 1. MSD (Magnitude Slope Deviation) - DAFx-16 Paper

**Physical principle:** Feedback amplitude grows exponentially, which appears as **linear growth in dB scale**. The second derivative of dB magnitude over time is therefore near-zero for feedback.

**Formula:**
```
MSD(k,m) = Σ |G''(k,n)|²  for n = (m-N)+1 to m
```

Where:
- `G''(k,n)` = second derivative of dB magnitude at bin k, frame n
- `N` = number of frames in analysis window
- Low MSD = likely feedback, High MSD = likely music

**Performance (from paper):**
| Content Type | Accuracy | Frames Needed |
|--------------|----------|---------------|
| Speech | 100% | 7 frames (~160ms) |
| Classical Music | 100% | 13 frames (~300ms) |
| Rock Music | 22% | 50+ frames (needs compression detection) |

**Implementation:** `lib/dsp/advancedDetection.ts` - `MSDHistoryBuffer` class

### 2. Phase Coherence Analysis - Nyquist Stability

**Physical principle:** True feedback occurs when the Nyquist phase condition is met:
```
∠G(ω)·F(ω) = n·2π
```

Feedback frequencies maintain **constant phase relationships** across consecutive frames. Music does not.

**Formula:**
```
φ_coherence(k) = |1/N Σ e^(jΔφ(k,n))|  for n = 1 to N
```

Where:
- `Δφ(k,n)` = phase difference between frames at bin k
- Coherence = 1.0 means perfect phase lock (feedback)
- Coherence < 0.7 means random phase (music)

**Thresholds:**
- High coherence: > 0.85 (strong feedback indicator)
- Medium coherence: 0.65-0.85 (uncertain)
- Low coherence: < 0.4 (likely music/noise)

**Implementation:** `lib/dsp/advancedDetection.ts` - `PhaseHistoryBuffer` class

### 3. Spectral Flatness + Kurtosis

**Physical principle:** Feedback is a **near-pure tone** with very low spectral flatness (Wiener entropy) around the peak frequency. The amplitude distribution also has high kurtosis (peaky, not Gaussian).

**Formulas:**

Spectral Flatness (Wiener entropy):
```
SF = (∏ X(k))^(1/N) / (1/N Σ X(k))
```

Kurtosis:
```
K = E[(X-μ)⁴] / (E[(X-μ)²])² - 3
```

**Thresholds:**
| Signal Type | Spectral Flatness | Kurtosis |
|-------------|-------------------|----------|
| Pure tone (feedback) | ≈ 0 | > 10 |
| Speech | 0.05-0.15 | 1-5 |
| Music | > 0.1 | < 3 |

**Implementation:** `lib/dsp/advancedDetection.ts` - `calculateSpectralFlatness()` function

### 4. Comb Filter Pattern Detection - DBX Paper

**Physical principle:** Multiple feedback frequencies appear at **regular intervals** due to the round-trip delay of the acoustic path:
```
f_n = n·c / 2d
```

Where:
- `c` = speed of sound (343 m/s)
- `d` = acoustic path length
- `n` = harmonic number

If we detect 3+ peaks at regular frequency spacing, it strongly indicates a feedback system from a specific acoustic path.

**Algorithm:**
1. Collect all candidate peak frequencies
2. Calculate frequency spacing between all pairs
3. Find common divisors (GCD pattern)
4. If 3+ peaks share common spacing → feedback pattern detected
5. Predict next feedback frequencies

**Implementation:** `lib/dsp/advancedDetection.ts` - `detectCombPattern()` function

### 5. Compression Detection

**Physical principle:** Dynamically compressed audio (common in rock/pop music) has sustained notes that look like early-stage feedback - sustained amplitude with low MSD. We detect compression by analyzing crest factor and dynamic range.

**Detection criteria:**
- Normal crest factor: ~12 dB (peak-to-RMS)
- Compressed crest factor: < 6 dB
- Normal dynamic range: > 20 dB
- Compressed dynamic range: < 8 dB

When compression is detected, the system:
1. Raises the MSD threshold
2. Increases required analysis frames
3. Weights phase coherence more heavily

**Implementation:** `lib/dsp/advancedDetection.ts` - `AmplitudeHistoryBuffer` class

---

## Algorithm Fusion System

All algorithm scores are combined using a weighted voting system with content-aware weights.

### Fusion Formula

```
Score_feedback = w₁·S_MSD + w₂·S_phase + w₃·S_spectral + w₄·S_comb + w₅·S_existing
```

### Content-Aware Weights

| Content Type | MSD | Phase | Spectral | Comb | Existing |
|--------------|-----|-------|----------|------|----------|
| Speech | 0.45 | 0.25 | 0.15 | 0.05 | 0.10 |
| Music | 0.20 | 0.40 | 0.15 | 0.10 | 0.15 |
| Compressed | 0.15 | 0.45 | 0.20 | 0.10 | 0.10 |
| Unknown | 0.35 | 0.30 | 0.15 | 0.10 | 0.10 |

### Decision Matrix

| MSD Score | Phase Score | Existing Score | Verdict |
|-----------|-------------|----------------|---------|
| High | High | High | **FEEDBACK** (confirmed) |
| High | High | Low | POSSIBLE_FEEDBACK (early) |
| High | Low | High | POSSIBLE_FEEDBACK (room mode?) |
| Low | High | High | UNCERTAIN (sustained note?) |
| Low | Low | * | NOT_FEEDBACK |

**Implementation:** `lib/dsp/advancedDetection.ts` - `fuseAlgorithmResults()` function

---

## Detection Engine

### FeedbackDetector Class

Location: `lib/dsp/feedbackDetector.ts`

The core class wrapping `AnalyserNode`. Contains 800+ lines of DSP code.

#### Key Parameters

| Parameter | Default | Description |
|---|---|---|
| `fftSize` | 8192 | FFT window size (frequency resolution) |
| `analysisIntervalMs` | 20 ms | Analysis loop interval |
| `sustainMs` | 250 ms | Time peak must persist before triggering |
| `clearMs` | 400 ms | Time peak must be absent before clearing |
| `relativeThresholdDb` | 18 dB | Peak must exceed local background by this |
| `prominenceDb` | 12 dB | Minimum prominence above neighborhood |
| `neighborhoodBins` | 8 | Bins each side for background calculation |

#### History Buffers (for Advanced Algorithms)

| Buffer | Purpose | Size |
|--------|---------|------|
| `MSDHistoryBuffer` | Stores dB magnitude for MSD calculation | fftSize × 50 frames |
| `PhaseHistoryBuffer` | Stores phase data for coherence | fftSize × 10 frames |
| `AmplitudeHistoryBuffer` | Stores peak/RMS for compression detection | 100 samples |

#### Public Methods

```typescript
// Lifecycle
start(inputNode: MediaStreamAudioSourceNode): void
stop(): void

// Configuration
updateSettings(settings: Partial<DetectorSettings>): void
setAlgorithmMode(mode: AlgorithmMode): void
setMSDMinFrames(frames: number): void
updateFusionConfig(config: Partial<FusionConfig>): void

// State
getState(): FeedbackDetectorState
getSpectrum(): Float32Array
getContentType(): ContentType
getCompressionResult(): CompressionResult | null
getAlgorithmScoresForBin(binIndex: number): AlgorithmScores | undefined

// Callbacks
onPeakDetected?: (peak: DetectedPeak) => void
onPeakCleared?: (peak: ClearedPeak) => void
onAlgorithmScores?: (scores: AlgorithmScoresEvent) => void
onContentTypeDetected?: (contentType: ContentType) => void
onCombPatternDetected?: (pattern: CombPatternResult) => void
```

### Classifier

Location: `lib/dsp/classifier.ts`

Distinguishes feedback from whistles and instruments using weighted scoring.

#### Classification Inputs

- Stability: How stable is the frequency over time?
- Harmonicity: Are harmonics present in expected ratios?
- Modulation: Is there vibrato/tremolo (suggests instrument)?
- Sideband noise: Is the peak surrounded by broadband content?
- Growth rate: How fast is the amplitude increasing?
- Algorithm scores: MSD, Phase, Spectral, Comb results

#### Output Labels

| Label | Description |
|-------|-------------|
| `ACOUSTIC_FEEDBACK` | High confidence feedback |
| `WHISTLE` | Detected whistle or sibilance |
| `INSTRUMENT_HARMONIC` | Likely musical content |
| `POSSIBLE_RING` | Uncertain, may need attention |

### EQ Advisor

Location: `lib/dsp/eqAdvisor.ts`

Generates GEQ and PEQ recommendations based on detected issues.

#### GEQ Mapping

Maps detected frequency to nearest ISO 31-band center frequency (1/3 octave):
```
20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
10000, 12500, 16000, 20000 Hz
```

#### Cut Depths by Severity and Style

| Severity | Surgical | Heavy |
|----------|----------|-------|
| RUNAWAY | -18 dB | -12 dB |
| GROWING | -9 dB | -6 dB |
| RESONANCE | -4 dB | -3 dB |
| POSSIBLE_RING | -3 dB | -3 dB |

---

## Mathematical Foundations

### Quadratic Interpolation for Peak Frequency

True peak frequency is estimated using parabolic interpolation:

```
δ = 0.5 × (α - γ) / (α - 2β + γ)
true_freq = (peak_bin + δ) × sample_rate / fft_size
```

Where:
- α = magnitude at bin - 1
- β = magnitude at peak bin
- γ = magnitude at bin + 1

### Adaptive Noise Floor

Exponential moving average with separate attack and release:

```
if current_level > noise_floor:
    noise_floor += (current_level - noise_floor) × attack_coefficient
else:
    noise_floor += (current_level - noise_floor) × release_coefficient
```

Default time constants:
- Attack: 200 ms (track loud transients quickly)
- Release: 1000 ms (recover slowly from loud events)

### A-Weighting Curve

Per IEC 61672-1, applied to prioritize speech frequencies:

```
R_A(f) = 12194² × f⁴ / ((f² + 20.6²) × √((f² + 107.7²)(f² + 737.9²)) × (f² + 12194²))
A(f) = 20 × log₁₀(R_A(f)) + 2.0
```

### Q Factor Estimation

Estimated from -3 dB bandwidth:

```
Q = f_center / bandwidth_3dB
```

Where `bandwidth_3dB` is measured by finding bins 3 dB below the peak on each side.

### Schroeder Frequency

Below this frequency, room modes are isolated (feedback-prone):

```
f_Schroeder = 2000 × √(RT60 / Volume)
```

Where RT60 is reverberation time in seconds and Volume is in cubic meters.

---

## Operation Modes

| Mode | Threshold | Ring | Growth | Use Case |
|---|---|---|---|---|
| **Speech** (Default) | 6 dB | 3 dB | 1.0 dB/s | Corporate conferences, lectures |
| **Worship** | 8 dB | 5 dB | 2.0 dB/s | Churches, reverberant spaces |
| **Live Music** | 14 dB | 8 dB | 4.0 dB/s | Concerts, clubs, festivals |
| **Theater** | 7 dB | 4 dB | 1.5 dB/s | Drama, musicals, body mics |
| **Monitors** | 5 dB | 3 dB | 0.8 dB/s | Stage wedges, sidefills |
| **Ring Out** | 4 dB | 2 dB | 0.5 dB/s | System calibration, sound check |
| **Broadcast** | 5 dB | 3 dB | 1.0 dB/s | Studio, podcast, radio |
| **Outdoor** | 10 dB | 6 dB | 2.5 dB/s | Open air, festivals |

---

## Settings Reference

### Detection Tab

| Setting | Range | Default | Description |
|---|---|---|---|
| FFT Size | 4096/8192/16384 | 8192 | Frequency resolution |
| Smoothing | 0-95% | 50% | Frame averaging |
| Hold Time | 0.5-8s | 4s | Issue visibility duration |
| Input Gain | -40 to +40 dB | **+15 dB** | Software boost before analysis |
| Confidence | 30-95% | **30%** | Minimum confidence to display |

### Algorithms Tab

| Setting | Range | Default | Description |
|---|---|---|---|
| Algorithm Mode | Auto/MSD/Phase/Combined/All | **Combined** | Which algorithms to use |
| MSD Min Frames | 7-50 | **15** | Frames for MSD analysis |
| Phase Threshold | 40-95% | **75%** | Phase coherence threshold |
| Fusion Threshold | 40-90% | **65%** | Combined probability threshold |
| Compression Detection | on/off | **on** | Adapt for compressed content |
| Comb Pattern Detection | on/off | **on** | Detect acoustic path patterns |

### Display Tab

| Setting | Range | Default | Description |
|---|---|---|---|
| Graph Font Size | 8-26 px | 15 px | Canvas label size |
| Max Issues | 3-12 | 8 | Maximum displayed issues |
| EQ Style | Surgical/Heavy | Surgical | Cut depth preset |
| Show Algorithm Scores | on/off | off | Display advanced metrics |

---

## Severity Levels

| Level | Color | Meaning | Action Required |
|---|---|---|---|
| **RUNAWAY** | Red | Active feedback, rapidly increasing | Immediate cut |
| **GROWING** | Orange | Feedback building, not critical yet | Apply cut soon |
| **RESONANCE** | Yellow | Stable resonant peak | Monitor, cut if grows |
| **POSSIBLE_RING** | Purple | Subtle ring detected | Watch closely |
| **WHISTLE** | Cyan | Sibilance or whistle | Consider HPF/de-esser |
| **INSTRUMENT** | Green | Likely musical content | Ignore |

---

## Default Configuration

```typescript
// lib/dsp/constants.ts - DEFAULT_SETTINGS

{
  // Core detection
  mode: 'speech',
  fftSize: 8192,
  smoothingTimeConstant: 0.5,
  minFrequency: 200,
  maxFrequency: 8000,
  feedbackThresholdDb: 6,
  ringThresholdDb: 4,
  growthRateThreshold: 1.5,
  
  // Timing
  holdTimeMs: 4000,
  noiseFloorDecay: 0.98,
  
  // Display
  maxDisplayedIssues: 8,
  eqPreset: 'surgical',
  graphFontSize: 15,
  
  // Input
  inputGainDb: 15,                    // Default input gain (+15 dB)
  
  // Filtering
  confidenceThreshold: 0.30,          // 30% — very aggressive, load-in optimized
  aWeightingEnabled: true,
  
  // Advanced algorithms
  algorithmMode: 'combined',
  msdMinFrames: 15,
  phaseCoherenceThreshold: 0.75,
  enableCompressionDetection: true,
  enableCombPatternDetection: true,
  fusionFeedbackThreshold: 0.65,
  showAlgorithmScores: false,
  showPhaseDisplay: false,
  
  // Room acoustics
  roomRT60: 1.0,
  roomVolume: 1000,
  roomPreset: 'large',
}
```

---

## Development Guide

### Adding a New Algorithm

1. Define types in `lib/dsp/advancedDetection.ts`:
   ```typescript
   export interface NewAlgorithmResult {
     score: number
     isFeedbackLikely: boolean
     // ... other fields
   }
   ```

2. Add to `AlgorithmScores` interface:
   ```typescript
   export interface AlgorithmScores {
     msd: MSDResult | null
     phase: PhaseCoherenceResult | null
     // ... existing
     newAlgorithm: NewAlgorithmResult | null  // add
   }
   ```

3. Implement the algorithm class/function in `advancedDetection.ts`

4. Integrate in `feedbackDetector.ts`:
   - Add buffer in `allocateBuffers()`
   - Calculate in `calculateAlgorithmScores()`
   - Reset in `resetHistory()`

5. Update fusion weights in `fuseAlgorithmResults()`

6. Add UI controls in `SettingsPanel.tsx` (Algorithms tab)

7. Update `HelpMenu.tsx` and this README

### Modifying Detection Thresholds

All tunable constants are in `lib/dsp/constants.ts`:

- `DEFAULT_SETTINGS` - Default values for all settings
- `OPERATION_MODES` - Per-mode threshold overrides
- `SEVERITY_THRESHOLDS` - Classification thresholds
- `CLASSIFIER_WEIGHTS` - Scoring weights
- `MSD_SETTINGS`, `PHASE_SETTINGS`, etc. - Algorithm constants

---

## Academic References

1. **DAFx-16 Paper**: "Automatic Detection of Acoustic Feedback Using Magnitude Slope Deviation"
   - Source of MSD algorithm
   - Key finding: Feedback grows linearly in dB scale

2. **DBX Feedback Prevention Paper**: "Feedback Prevention and Suppression"
   - Source of comb filter pattern detection
   - Key finding: Feedback occurs at regular frequency intervals

3. **KU Leuven 2025**: "2-ch Acoustic Feedback Cancellation System"
   - Mathematical framework for phase coherence analysis
   - Identifiability conditions for feedback path estimation

4. **Carl Hopkins - "Sound Insulation" (2007)**
   - Schroeder frequency calculation
   - Modal density and room acoustics theory

5. **F. Alton Everest - "Master Handbook of Acoustics"**
   - Reverberation time effects on feedback
   - Room mode behavior and standing waves

---

## Browser Requirements

- **Chrome / Edge 89+** - Full support, recommended
- **Firefox 76+** - Full support
- **Safari 14.1+** - Supported (different mic permission flow)
- HTTPS or `localhost` required for `getUserMedia`
- Web Audio API required (all modern browsers)

---

## License

Copyright 2024-2026 Don Wells AV. All rights reserved.
