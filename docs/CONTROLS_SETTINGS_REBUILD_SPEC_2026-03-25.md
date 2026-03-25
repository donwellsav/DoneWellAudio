# Controls, Presets, and Settings Rebuild Spec - 2026-03-25

## Goal

Rebuild controls, presets, and settings from scratch without inheriting the old flat-state math. Keep the current mode family names for continuity, but retune their defaults and ownership model from first principles.

This spec is intentionally not backward-compatible with current saved presets or default snapshots.

## Non-Negotiable Design Rules

1. One behavior, one owner.
2. `DetectorSettings` becomes derived runtime state, not the primary persisted user model.
3. Mode baseline, room/environment, and live overrides are separate concepts.
4. Ring sensitivity stays explicit internally even if the public room UI only shows a simpler feedback offset.
5. Desktop and mobile can have different surfaces, but must sit on the same underlying state contract.
6. Display preferences must not live in the same preset model as DSP policy.

## Current-State Blockers This Spec Solves

- Flat mixed state in `types/advisory.ts:311-370`
- One semantic mode write path in `AudioAnalyzerContext.tsx:104-123`
- Partial preset snapshots in `SettingsPanel.tsx:38-43`
- Full-session auto-persist in `useAudioAnalyzer.ts:116-119`
- Room presets writing absolute thresholds in `RoomTab.tsx:285-288`
- `75` live `onSettingsChange(...)` write sites spread across multiple layouts

## Proposed Ownership Model

### 1. Mode baseline

Purpose:

- Defines the tuned detector/report policy for `speech`, `worship`, `liveMusic`, `theater`, `monitors`, `ringOut`, `broadcast`, and `outdoor`.

Owns:

- detector thresholds
- timing
- FFT and smoothing defaults
- report policy defaults
- default focus range
- default EQ recommendation style
- default advanced/internal values

### 2. Environment / room model

Purpose:

- Represents venue context and derived acoustic adjustments.

Owns:

- room template id or custom environment
- dimensions
- treatment
- derived RT60 and volume
- explicit internal threshold offsets:
  - `feedbackOffsetDb`
  - `ringOffsetDb`
- provenance:
  - selected template
  - measured dimensions
  - manual edits

### 3. Live operator overrides

Purpose:

- Captures what an engineer might change during a show or soundcheck without redefining the rig.

Owns:

- live sensitivity offset
- input gain / auto-gain mode
- focus range
- recommendation style override
- optional expert ring offset override

### 4. Display preferences

Purpose:

- All rendering, visibility, and ergonomics state.

Owns:

- graph window
- graph legibility
- diagnostics visibility
- tooltip behavior
- desktop gesture preferences

### 5. Diagnostics / expert policy

Purpose:

- Explicitly opt-in low-level DSP controls for troubleshooting and benchmarking.

Owns:

- ML enable/disable
- algorithm custom mode
- threshold mode
- noise floor timing
- merge window
- track limits
- harmonic tolerance
- FFT override
- confidence and growth policy overrides

### 6. Calibration workspace

Purpose:

- Venue metadata and measurement workflow, separate from live detector tuning.

Owns:

- measurement mic profile
- room profile library
- ambient capture
- calibration session exports
- venue notes and mic inventory

## Proposed State Contract

```ts
type ModeId =
  | 'speech'
  | 'worship'
  | 'liveMusic'
  | 'theater'
  | 'monitors'
  | 'ringOut'
  | 'broadcast'
  | 'outdoor'

interface RigPresetV1 {
  schemaVersion: 1
  id: string
  name: string
  modeId: ModeId
  environment: EnvironmentSelection
  liveDefaults: LiveDefaults
  diagnosticsProfileId?: string
  createdAt: string
  updatedAt: string
}

interface EnvironmentSelection {
  templateId: string | 'custom'
  dimensionsM?: { length: number; width: number; height: number }
  treatment?: 'untreated' | 'typical' | 'treated'
  feedbackOffsetDb: number
  ringOffsetDb: number
  provenance: 'template' | 'measured' | 'manual'
}

interface LiveDefaults {
  sensitivityOffsetDb: number
  focusRange:
    | { kind: 'preset'; id: 'vocal' | 'monitor' | 'full' | 'sub' }
    | { kind: 'custom'; minHz: number; maxHz: number }
  eqStyle: 'surgical' | 'heavy'
  input:
    | { kind: 'manual'; gainDb: number }
    | { kind: 'auto'; targetDbfs: number }
}

interface DisplayPrefs {
  rtaWindow: { minDb: number; maxDb: number }
  graphFontSize: number
  spectrumLineWidth: number
  canvasTargetFps: number
  showTooltips: boolean
  showAlgorithmScores: boolean
  showPeqDetails: boolean
  showFreqZones: boolean
  spectrumWarmMode: boolean
  maxDisplayedIssues: number
}

interface DiagnosticsState {
  mlEnabled: boolean
  algorithmMode: 'auto' | 'custom'
  enabledAlgorithms?: Array<'msd' | 'phase' | 'spectral' | 'comb' | 'ihr' | 'ptmr' | 'ml'>
  overrides?: Partial<DerivedDetectorSettings>
}
```

`DerivedDetectorSettings` is the only object the runtime DSP stack receives. It is computed, never directly authored by UI controls.

## Surface Model

### A. Live surface

Audience:

- FOH during a show
- tablet-first

Must be fast, obvious, and low risk.

Keep:

- start / stop
- live sensitivity
- input gain / auto
- quick focus range
- clear RTA / freeze
- issue actions

Do not expose by default:

- room dimensions
- threshold mode
- merge windows
- track limits
- algorithm selection

### B. Setup / tuning surface

Audience:

- soundcheck
- ring-out
- pre-show system alignment

Keep:

- mode selection
- environment selection / measurement
- focus range
- EQ recommendation style
- measurement mic profile
- ring-out tools
- calibration workspace entry points

### C. Advanced diagnostics surface

Audience:

- power users only

Keep here only:

- ML toggle
- custom algorithm grid
- threshold mode
- growth / confidence / sustain / clear overrides
- FFT / smoothing
- merge window
- track management
- harmonic tolerance
- noise floor timing

## Control Taxonomy

### Detection and live controls

| Current control / field | Current location | Decision | New owner | New surface |
| --- | --- | --- | --- | --- |
| `mode` | `SoundTab` chips | Keep | Mode baseline | Setup |
| `feedbackThresholdDb` | Hero sensitivity, RTA drag, vertical fader | Keep, but as offset over baseline | Live operator overrides | Live |
| `ringThresholdDb` | `SoundTab` Detection | Move to advanced by default; keep explicit internally | Environment + diagnostics override | Advanced |
| `inputGainDb` | Input slider, vertical fader | Keep | Live operator overrides | Live |
| `autoGainEnabled` | Input slider / fader | Keep | Live operator overrides | Live |
| `autoGainTargetDb` | `SoundTab` when AG enabled | Keep, but move behind auto input policy | Live operator overrides | Setup / Advanced |
| `minFrequency` + `maxFrequency` | `SoundTab`, RTA drag | Merge into `Focus Range` | Live operator overrides | Live / Setup |
| `eqPreset` | `SoundTab` | Keep | Live operator overrides | Setup |
| `faderMode` | `SoundTab`, vertical fader | Keep, but display-only | Display prefs | Local UI only |
| `confidenceThreshold` | `SoundTab` | Remove from normal UI | Mode baseline or diagnostics override | Advanced only |
| `growthRateThreshold` | `SoundTab` | Remove from normal UI | Mode baseline or diagnostics override | Advanced only |
| `sustainMs` | `SoundTab` Timing | Remove from normal UI | Mode baseline or diagnostics override | Advanced only |
| `clearMs` | `SoundTab` Timing | Remove from normal UI | Mode baseline or diagnostics override | Advanced only |
| `peakMergeCents` | `SoundTab` Advanced | Move to diagnostics | Diagnostics | Advanced only |
| `thresholdMode` | `SoundTab` Advanced | Move to diagnostics | Diagnostics | Advanced only |
| `prominenceDb` | `SoundTab` Advanced | Remove from normal UI | Mode baseline or diagnostics override | Advanced only |
| `noiseFloorAttackMs` | `SoundTab` Advanced | Move to diagnostics | Diagnostics | Advanced only |
| `noiseFloorReleaseMs` | `SoundTab` Advanced | Move to diagnostics | Diagnostics | Advanced only |
| `maxTracks` | `SoundTab` Advanced | Internal only unless debugging | Diagnostics | Advanced only |
| `trackTimeoutMs` | `SoundTab` Advanced | Internal only unless debugging | Diagnostics | Advanced only |
| `harmonicToleranceCents` | `SoundTab` Advanced | Move to diagnostics | Diagnostics | Advanced only |
| `fftSize` | `SoundTab` Advanced | Keep for setup experts only | Mode baseline or diagnostics override | Advanced only |
| `smoothingTimeConstant` | `SoundTab` Advanced | Move to diagnostics | Diagnostics | Advanced only |
| `aWeightingEnabled` | `SoundTab` Detection | Move to setup expert section | Mode baseline or diagnostics override | Advanced only |
| `ignoreWhistle` | `SoundTab` Detection | Keep as expert toggle | Mode baseline or diagnostics override | Advanced only |

### Environment and room controls

| Current control / field | Current location | Decision | New owner | New surface |
| --- | --- | --- | --- | --- |
| `roomPreset` | `RoomTab` | Keep, but redefine as template selection | Environment model | Setup |
| `roomLengthM`, `roomWidthM`, `roomHeightM` | `RoomTab` | Keep | Environment model | Setup |
| `roomTreatment` | `RoomTab` | Keep | Environment model | Setup |
| `roomDimensionsUnit` | `RoomTab` | Keep, but display-only | Display prefs / local UI | Setup |
| `roomRT60` | derived in `RoomTab` | Internal only | Environment model | Derived |
| `roomVolume` | derived in `RoomTab` | Internal only | Environment model | Derived |
| Auto-detect room | `RoomTab` | Keep as tool, not as preset side effect | Environment model | Setup |

### Calibration and venue metadata

| Current control / field | Current location | Decision | New owner | New surface |
| --- | --- | --- | --- | --- |
| `micCalibrationProfile` | `CalibrationTab` | Keep | Calibration workspace | Setup |
| Venue name / dimensions / materials / mic inventory | `CalibrationTab`, `roomStorage` | Keep, but separate from detector preset | Calibration workspace / venue library | Setup |
| Ambient capture | `CalibrationTab` | Keep | Calibration workspace | Setup |
| Calibration recording / export | `CalibrationTab` | Keep | Calibration workspace | Setup |

### Display and diagnostics controls

| Current control / field | Current location | Decision | New owner | New surface |
| --- | --- | --- | --- | --- |
| `showThresholdLine` | `SoundTab`, `SpectrumCanvas` | Move out of Sound; keep as graph-local toggle | Display prefs | Display |
| `maxDisplayedIssues` | `SoundTab` | Move out of Sound | Display prefs | Display |
| `showAlgorithmScores` | `DisplayTab` | Keep | Display prefs | Display |
| `showPeqDetails` | `DisplayTab` | Keep | Display prefs | Display |
| `showFreqZones` | `DisplayTab` | Keep | Display prefs | Display |
| `spectrumWarmMode` | `DisplayTab` | Keep | Display prefs | Display |
| `rtaDbMin` + `rtaDbMax` | `DisplayTab` | Merge into `RTA Window` | Display prefs | Display |
| `spectrumLineWidth` | `DisplayTab` | Keep | Display prefs | Display |
| `canvasTargetFps` | `DisplayTab` | Keep, but expert display perf | Display prefs | Display / Advanced |
| `graphFontSize` | `DisplayTab` | Keep | Display prefs | Display |
| `swipeLabeling` | `DisplayTab` | Remove from global rig settings; make platform-aware | Display prefs / platform rule | Local UI only |
| `showTooltips` | `DisplayTab` | Keep | Display prefs | Display |

### Diagnostics algorithm controls

| Current control / field | Current location | Decision | New owner | New surface |
| --- | --- | --- | --- | --- |
| `mlEnabled` | `SoundTab` Advanced | Keep | Diagnostics | Advanced |
| `algorithmMode` | `SoundTab` Advanced | Keep only for diagnostics | Diagnostics | Advanced |
| `enabledAlgorithms` | `SoundTab` Advanced | Keep only for diagnostics | Diagnostics | Advanced |

## Preset and Persistence Redesign

### Replace all current preset behavior

Current system:

- custom presets are partial snapshots (`SettingsPanel.tsx:38-43`)
- saved defaults are full snapshots (`dwaStorage.ts:167-168`)
- session changes auto-save into defaults (`useAudioAnalyzer.ts:116-119`)

New system:

1. `sessionState`
   - last open live state
   - display prefs
   - not treated as an explicit preset

2. `startupPreference`
   - optional preset id to load on launch
   - separate from the last session

3. `rigPresets`
   - structured mode + environment + live-default bundles
   - schema versioned
   - display prefs excluded
   - diagnostics excluded by default

4. `venueLibrary`
   - calibration metadata and measured environment records
   - reusable across rig presets

### Preset recall rule

Preset load must reconstruct intent, not raw field coincidence.

Load order:

1. apply mode baseline
2. apply environment selection and explicit room offsets
3. apply live defaults
4. apply optional diagnostics profile only if user explicitly chose one

## Proposed Control Layout

### Mobile

- Live page:
  - Sensitivity
  - Input gain / auto
  - Focus range
  - Issue list
  - RTA / GEQ
- Setup sheet:
  - Mode
  - Environment
  - Mic calibration
  - EQ style
  - Ring-out tools
- Advanced sheet:
  - Diagnostics only

### Desktop

- Left rail:
  - Issues or live controls
- Main canvas:
  - RTA + GEQ
- Setup sidecar:
  - Mode
  - Environment
  - Rig preset management
- Diagnostics drawer:
  - hidden by default

## Implementation Backlog

### Safe fixes first

1. Freeze a single baseline and remove conflicting defaults.
2. Split session persistence from explicit defaults immediately.
3. Move storage migration/versioning out of UI.
4. Stop room presets from directly writing absolute thresholds into shared settings.
5. Remove display-only fields from any future rig preset payload.

### Architectural refactor next

1. Introduce the layered state contract and derivation function.
2. Replace `updateSettings(partial)` with semantic actions.
3. Implement new preset schema and one-way migration that invalidates legacy snapshots.
4. Rebuild setup, live, and display surfaces on top of the new model.
5. Add test coverage for:
   - mode + environment composition
   - preset recall reconstruction
   - live override precedence
   - diagnostics isolation

## Explicit Deletions

The rebuild should intentionally remove these from the normal operator surface:

- raw confidence threshold
- raw growth threshold
- raw sustain / clear timing
- raw merge window
- raw noise floor attack / release
- raw track limits
- raw harmonic tolerance
- raw threshold mode
- global swipe behavior toggle

They can survive only as diagnostics if they still prove useful after retuning.

## Bottom Line

The right rebuild is not "a cleaner panel for the same fields." The right rebuild is:

1. freeze ownership
2. derive runtime settings from layered intent
3. separate live controls from setup controls
4. separate setup controls from diagnostics
5. rebuild presets around reconstructed rig state, not partial field bags

If that ordering is not followed, the UI will look newer while the core math and ownership problems stay exactly where they are now.
