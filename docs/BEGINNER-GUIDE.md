# Kill The Ring — Beginner Developer Guide

> A comprehensive guide for navigating, understanding, and troubleshooting this codebase.

---

## Table of Contents

1. [What Does This App Do?](#1-what-does-this-app-do)
2. [Getting It Running](#2-getting-it-running)
3. [Project Map — Where Everything Lives](#3-project-map--where-everything-lives)
4. [How Audio Flows Through the App](#4-how-audio-flows-through-the-app)
5. [The Component Tree — What Renders What](#5-the-component-tree--what-renders-what)
6. [The DSP Engine — Where the Math Lives](#6-the-dsp-engine--where-the-math-lives)
7. [The Type System — Your Safety Net](#7-the-type-system--your-safety-net)
8. [Settings and State — How Data Moves](#8-settings-and-state--how-data-moves)
9. [Styling — How the UI Looks](#9-styling--how-the-ui-looks)
10. [Common Troubleshooting](#10-common-troubleshooting)
11. [How to Make Changes](#11-how-to-make-changes)
12. [Glossary](#12-glossary)

---

## 1. What Does This App Do?

Kill The Ring listens to a microphone in real time, finds frequencies that are "feeding back" (that loud ringing/squealing sound at concerts), and tells the sound engineer exactly which EQ knob to turn to fix it.

**It NEVER plays or modifies audio.** It only listens and analyzes.

Key concepts:
- **Feedback** = when a mic picks up its own speaker output, creating a loop that gets louder and louder (the "ring")
- **FFT** = Fast Fourier Transform — converts audio from a waveform into individual frequency measurements
- **Advisory** = a detected issue with a recommendation (e.g., "Cut 3dB at 2.5kHz")
- **GEQ/PEQ** = Graphic EQ / Parametric EQ — two types of equalizer hardware that engineers use

---

## 2. Getting It Running

### Prerequisites
- **Node.js** 18+ installed
- **pnpm** package manager (`npm install -g pnpm`)
- A browser with microphone access (Chrome recommended)

### First-Time Setup
```bash
cd C:\ktr\killthering
pnpm install          # Install all dependencies
pnpm dev              # Start dev server on http://localhost:3000
```

### Daily Commands
| Command | What It Does |
|---------|-------------|
| `pnpm dev` | Start dev server (hot reload, fast, no service worker) |
| `pnpm build` | Production build (slower, generates service worker for offline) |
| `pnpm start` | Run the production build locally |
| `pnpm lint` | Check code for style issues |

### Verifying Your Changes
Before pushing any code:
```bash
npx tsc --noEmit      # Type-check — must have 0 errors
pnpm test             # Run 335 DSP unit tests — must all pass
pnpm build            # Production build — must complete with 0 errors
```
The DSP engine has 335 unit tests across 14 test suites covering algorithm fusion, classification, EQ advisories, MSD, phase coherence, compression detection, and more. Always run them before committing.

---

## 3. Project Map — Where Everything Lives

```
C:\ktr\killthering\
│
├── app/                          # ENTRY POINT — Next.js pages
│   ├── layout.tsx                #   HTML wrapper (fonts, metadata, PWA config)
│   ├── page.tsx                  #   The one page — just renders <KillTheRingClient />
│   ├── globals.css               #   Global styles + Tailwind theme colors
│   ├── sw.ts                     #   Service worker config (for offline/PWA)
│   └── ~offline/page.tsx         #   Shown when user is offline
│
├── components/
│   ├── kill-the-ring/            # YOUR MAIN WORK AREA — all app components
│   │   ├── KillTheRingClient.tsx #   Wrapper: dynamic import + error boundary
│   │   ├── KillTheRing.tsx       #   THE MAIN COMPONENT — layout, state, wiring
│   │   ├── HeaderBar.tsx         #   Top bar (mic button, logo, toolbar icons)
│   │   ├── DesktopLayout.tsx     #   Desktop resizable panel layout
│   │   ├── MobileLayout.tsx      #   Mobile portrait tab layout
│   │   ├── IssuesList.tsx        #   Issue cards (detected feedback problems)
│   │   ├── SpectrumCanvas.tsx    #   RTA graph (frequency spectrum visualization)
│   │   ├── GEQBarView.tsx        #   Graphic EQ bar chart visualization
│   │   ├── SettingsPanel.tsx     #   Settings dialog (6 tabs)
│   │   ├── HelpMenu.tsx          #   Help/documentation dialog (5 tabs)
│   │   ├── DetectionControls.tsx #   Mode selector + quick-adjust sliders
│   │   ├── InputMeterSlider.tsx  #   Input gain slider with level meter
│   │   ├── VerticalGainFader.tsx #   Vertical gain slider component
│   │   ├── FeedbackHistoryPanel.tsx  # Historical feedback frequency log (dynamic multi-column)
│   │   ├── MissedFeedbackButton.tsx # Mark false negatives for calibration
│   │   ├── EarlyWarningPanel.tsx     # Pre-feedback warning indicators
│   │   ├── AlgorithmStatusBar.tsx    # Shows which detection algorithm is active
│   │   ├── FullscreenOverlay.tsx     # Fullscreen RTA overlay
│   │   ├── OnboardingOverlay.tsx     # First-run welcome/permissions flow
│   │   ├── ResetConfirmDialog.tsx    # "Are you sure?" dialog for reset
│   │   ├── ErrorBoundary.tsx     #   Catches React crashes gracefully
│   │   ├── index.ts              #   Barrel file — re-exports everything
│   │   └── settings/             #   Settings panel tab components
│   │       ├── DetectionTab.tsx  #     Sensitivity/threshold controls
│   │       ├── AlgorithmsTab.tsx #     Detection algorithm selection
│   │       ├── DisplayTab.tsx    #     Visual preferences
│   │       ├── RoomTab.tsx       #     Room preset & dimensions
│   │       ├── AdvancedTab.tsx   #     Advanced/debug settings
│   │       ├── CalibrationTab.tsx #    Room profile, ambient capture, mic cal (ECM8000/RTA-M/Smartphone), session recording
│   │       └── SettingsShared.tsx #    Shared Section/Grid layout components
│   │
│   └── ui/                       # SHADCN PRIMITIVES — don't edit these
│       ├── button.tsx            #   Pre-built accessible components
│       ├── dialog.tsx            #   from the shadcn/ui library
│       ├── tabs.tsx              #   (Button, Dialog, Tabs, Slider, etc.)
│       ├── slider.tsx
│       ├── accordion.tsx
│       ├── tooltip.tsx
│       └── ... (20 total)
│
├── contexts/                     # REACT CONTEXTS
│   └── PortalContainerContext.tsx #   Portal mount point for mobile overlays
│
├── hooks/                        # REACT HOOKS — reusable logic
│   ├── useAudioAnalyzer.ts       #   THE BIG ONE — manages mic + FFT + DSP worker
│   ├── useDSPWorker.ts           #   Creates and talks to the Web Worker
│   ├── useCalibrationSession.ts  #   Calibration session data collection
│   ├── useAnimationFrame.ts      #   requestAnimationFrame loop helper
│   ├── useAdvisoryLogging.ts     #   Records advisories to feedback history
│   ├── useFpsMonitor.ts          #   Real-time FPS counter for canvas
│   ├── useFullscreen.ts          #   Fullscreen API wrapper
│   ├── useAudioDevices.ts        #   Enumerate/select audio input devices
│   ├── use-mobile.ts             #   Detect mobile/portrait orientation
│   └── use-toast.ts              #   Toast notification hook (shadcn)
│
├── lib/                          # LIBRARY CODE — pure logic, no React
│   ├── audio/
│   │   └── createAudioAnalyzer.ts  # Mic access + AudioContext + FFT capture
│   │
│   ├── canvas/
│   │   └── spectrumDrawing.ts      # Pure canvas drawing helpers (spectrum/GEQ)
│   │
│   ├── calibration/              # CALIBRATION SYSTEM
│   │   ├── calibrationSession.ts #   Session data collection (detections, missed, spectra)
│   │   ├── calibrationExport.ts  #   JSON export builder with room profile + session data
│   │   └── index.ts              #   Barrel export
│   │
│   ├── dsp/                      # DSP ENGINE (14 modules) — the brain
│   │   ├── constants.ts          #   All magic numbers + operation mode presets
│   │   ├── feedbackDetector.ts   #   Peak detection from FFT data
│   │   ├── trackManager.ts       #   Tracks peaks over time (is it sustained?)
│   │   ├── classifier.ts         #   Decides: feedback vs whistle vs instrument
│   │   ├── eqAdvisor.ts          #   Generates EQ cut recommendations
│   │   ├── dspWorker.ts          #   Web Worker entry — runs classifier off main thread
│   │   ├── advancedDetection.ts  #   Barrel re-export for MSD, phase, compression, fusion
│   │   ├── msdAnalysis.ts        #   Magnitude Slope Deviation (DAFx-16)
│   │   ├── phaseCoherence.ts     #   Phase coherence analysis
│   │   ├── compressionDetection.ts # Spectral flatness + compression detection
│   │   ├── algorithmFusion.ts    #   Weighted fusion of all algorithm scores → verdict
│   │   ├── feedbackHistory.ts    #   Remembers repeat offender frequencies
│   │   ├── acousticUtils.ts      #   Room acoustics calculations
│   │   └── severityUtils.ts      #   Severity level helpers
│   │
│   ├── export/                   # MULTI-FORMAT EXPORT
│   │   ├── downloadFile.ts       #   Browser download via Blob + <a> element
│   │   ├── exportPdf.ts          #   PDF report generation (jsPDF, dynamic import)
│   │   └── exportTxt.ts          #   Fixed-width plain text report
│   │
│   ├── utils/
│   │   ├── pitchUtils.ts         #   Hz → musical note conversion (e.g., 440Hz → A4)
│   │   └── mathHelpers.ts        #   Generic math utilities
│   │
│   ├── changelog.ts              #   Version history (auto-updated by CI, shown in About tab)
│   └── utils.ts                  #   cn() helper for combining CSS classes
│
├── types/
│   ├── advisory.ts               #   Core DSP types (Advisory, DetectorSettings, Track, etc.)
│   └── calibration.ts            #   Room profile, session data, export formats
│
├── public/                       #   Static files (icons, manifest)
├── .github/workflows/
│   └── auto-version.yml          #   Auto-bumps version on PR merge
│
├── package.json                  #   Dependencies + scripts
├── tsconfig.json                 #   TypeScript config
├── next.config.mjs               #   Next.js config (reads version from package.json)
├── CLAUDE.md                     #   AI assistant instructions for this project
└── docs/
    └── plans/                    #   Design documents and implementation plans
```

### The Golden Rule
- **`components/kill-the-ring/`** = UI changes (what you see)
- **`lib/dsp/`** = Detection logic (what it calculates)
- **`hooks/`** = Glue between UI and logic
- **`types/advisory.ts`** = Core DSP data shapes
- **`types/calibration.ts`** = Room profile + session data shapes

---

## 4. How Audio Flows Through the App

This is the most important thing to understand. Data flows in one direction:

```
Microphone
    │
    ▼
[createAudioAnalyzer.ts]     ◄── Gets mic permission, creates AudioContext
    │
    │  AudioContext + AnalyserNode (browser API)
    │  Captures FFT data 60 times per second
    │
    ▼
[feedbackDetector.ts]         ◄── Finds peaks in the FFT spectrum
    │
    │  DetectedPeak objects (frequency, amplitude, etc.)
    │
    ▼
[useDSPWorker.ts]             ◄── Sends peaks to the Web Worker
    │
    │  postMessage() to worker thread
    │
    ▼
[dspWorker.ts]  ─── runs in Web Worker (separate thread, keeps UI smooth)
    │
    ├── [trackManager.ts]     ◄── Tracks peaks over time (is it sustained or a blip?)
    ├── [classifier.ts]       ◄── Decides: is this feedback, a whistle, or an instrument?
    └── [eqAdvisor.ts]        ◄── Generates EQ recommendation (which knob, how much)
    │
    │  Advisory objects (frequency + severity + EQ recommendation)
    │
    ▼
[useAudioAnalyzer.ts]         ◄── Receives advisories, updates React state
    │
    │  React state: advisories[], spectrum, settings
    │
    ▼
[KillTheRing.tsx]             ◄── Passes state to child components
    │
    ├── [IssuesList.tsx]      ◄── Renders issue cards
    ├── [SpectrumCanvas.tsx]  ◄── Draws the frequency graph
    └── [GEQBarView.tsx]      ◄── Draws the EQ bar chart
```

**Why a Web Worker?** The classifier math is CPU-intensive. If it ran on the main thread, the UI would stutter. The worker runs in a separate thread so the graph stays smooth at 60fps.

---

## 5. The Component Tree — What Renders What

```
app/page.tsx
  └── KillTheRingClient         (dynamic import, error boundary)
       └── KillTheRing          ★ THE HUB — owns all state
            │
            ├── HeaderBar
            │   ├── Start/Stop button (mic circle)
            │   ├── Logo + branding
            │   ├── InputMeterSlider (gain control + level meter)
            │   ├── FeedbackHistoryPanel (history icon)
            │   ├── HelpMenu (? icon → 5-tab dialog)
            │   └── SettingsPanel (gear icon → 6-tab settings)
            │       └── settings/ tabs (Detection, Algorithms, Display, Room, Advanced, Calibrate)
            │
            ├── OnboardingOverlay (first-run, conditional)
            ├── FullscreenOverlay (fullscreen RTA, conditional)
            │
            ├── MobileLayout (portrait orientation)
            │   ├── Issues tab → IssuesList
            │   ├── Graph tab → SpectrumCanvas / GEQBarView / DetectionControls
            │   └── Settings tab → DetectionControls + InputMeterSlider
            │
            └── DesktopLayout (landscape orientation)
                ├── Sidebar (resizable)
                │   ├── AlgorithmStatusBar
                │   ├── EarlyWarningPanel
                │   ├── Issues tab → IssuesList
                │   └── Controls tab → DetectionControls + InputMeterSlider
                │
                └── Graph Area (resizable panels)
                    ├── Top panel → SpectrumCanvas / GEQBarView / Controls
                    ├── Bottom-left → SpectrumCanvas / GEQBarView / Controls
                    └── Bottom-right → SpectrumCanvas / GEQBarView / Controls
```

**Important:** `KillTheRing.tsx` is the central hub. It:
- Calls `useAudioAnalyzer()` to get all state
- Passes state down as props to every child
- Handles all callbacks (start, stop, apply, dismiss, settings changes)

---

## 6. The DSP Engine — Where the Math Lives

All in `lib/dsp/`. Here's what each file does:

| File | Purpose | When It Runs |
|------|---------|-------------|
| `constants.ts` | All tuning numbers, thresholds, mode presets | Imported everywhere |
| `feedbackDetector.ts` | Scans FFT for peaks above threshold | Every frame (60fps) on main thread |
| `trackManager.ts` | Groups peaks into "tracks" over time | In worker, per peak |
| `classifier.ts` | Classifies: feedback vs instrument vs whistle | In worker, per track |
| `advancedDetection.ts` | Barrel re-export for MSD, phase, compression, fusion | In worker, per track |
| `msdAnalysis.ts` | Magnitude Slope Deviation — feedback growth detection | In worker, per track |
| `phaseCoherence.ts` | Phase coherence analysis — feedback phase lock | In worker, per track |
| `compressionDetection.ts` | Spectral flatness + compression ratio | In worker, per frame |
| `algorithmFusion.ts` | Weighted fusion of all algorithm scores → verdict | In worker, per track |
| `eqAdvisor.ts` | Maps frequency → nearest GEQ band + PEQ params | In worker, per classification |
| `dspWorker.ts` | Worker entry point, coordinates the above | In Web Worker thread |
| `feedbackHistory.ts` | Tracks repeat offenders, stores EQ recs, exports CSV/JSON | Main thread |
| `acousticUtils.ts` | Room mode calculations, Schroeder frequency | In worker |
| `severityUtils.ts` | Severity level helpers | Shared |

### The Classification Pipeline
```
Peak detected (frequency, amplitude, prominence)
    │
    ▼
Track created/updated (is this peak sustained over time?)
    │
    ▼
Features extracted (stability, Q factor, harmonics, modulation)
    │
    ▼
Classification (probability scores: pFeedback, pWhistle, pInstrument)
    │
    ▼
Severity assigned (RUNAWAY > GROWING > RESONANCE > RING > WHISTLE)
    │
    ▼
EQ advisory generated (GEQ band + PEQ frequency/Q/gain)
    │
    ▼
Advisory emitted back to main thread
```

---

## 7. The Type System — Your Safety Net

**Core DSP types live in `types/advisory.ts`** — detection results, advisories, settings, tracks.
**Calibration types live in `types/calibration.ts`** — room profiles, session data, export formats.

Key types you'll encounter constantly:

```typescript
// What the detector finds in the FFT
interface DetectedPeak {
  trueFrequencyHz: number    // Exact frequency (e.g., 2547.3)
  trueAmplitudeDb: number    // How loud (-60 to 0, 0 = max)
  prominenceDb: number       // How much it sticks out from neighbors
  // ... more fields
}

// What gets shown as an issue card
interface Advisory {
  id: string                 // Unique ID for this issue
  trueFrequencyHz: number    // The problem frequency
  severity: SeverityLevel    // 'RUNAWAY' | 'GROWING' | 'RESONANCE' | etc.
  confidence: number         // 0.0 to 1.0 — how sure we are
  advisory: EQAdvisory       // The fix recommendation
  // ... more fields
}

// The fix recommendation inside each Advisory
interface EQAdvisory {
  geq: GEQRecommendation     // { bandHz: 2500, suggestedDb: -6 }
  peq: PEQRecommendation     // { hz: 2547, q: 8, gainDb: -4 }
  pitch: PitchInfo            // { note: 'D#', octave: 7, cents: +12 }
}

// All the knobs and switches
interface DetectorSettings {
  mode: OperationMode         // 'speech' | 'worship' | 'liveMusic' | etc.
  fftSize: 4096 | 8192 | 16384
  feedbackThresholdDb: number
  // ... 40+ settings
}
```

**Calibration types** (`types/calibration.ts`) define the room profiling system:
- `RoomProfile` — venue name, dimensions, materials, mic types
- `CalibrationSession` — recorded detections, missed annotations, spectra, settings history
- `CalibrationExport` — complete JSON v1.1 export combining room profile + session data + mic calibration metadata
- `CalibrationStats` — live session counters (detections, false positives, missed, snapshots)
- `MicCalibrationMetadata` — Mic compensation metadata (mic model, calibration ID, response curve, reversal note). Supports ECM8000, RTA-M, and Smartphone MEMS profiles

**Pro tip:** When you're confused about what data a component has, check what props it receives and trace them back to `Advisory` or `DetectorSettings`.

---

## 8. Settings and State — How Data Moves

### State Management
There's no Redux or Zustand — just React hooks:

```
useAudioAnalyzer()  ←── single hook that owns ALL state
    │
    │ Returns:
    │   isRunning, spectrum, advisories, settings,
    │   start(), stop(), updateSettings(), resetSettings()
    │
    ▼
KillTheRing.tsx passes these as props to children
```

### Settings Persistence
- Settings save to **localStorage** automatically
- Key: look for `localStorage.getItem()` / `setItem()` in the code
- Layout preferences: `ktr-layout-prefs`
- Resizable panel sizes: `react-resizable-panels:*`

### Settings Flow
```
User changes slider in SettingsPanel
    │
    ▼
onSettingsChange({ feedbackThresholdDb: -35 })
    │
    ▼
KillTheRing.handleSettingsChange()
    │
    ▼
useAudioAnalyzer.updateSettings()
    │
    ├── Updates React state (re-renders UI)
    ├── Updates AudioAnalyzer (main thread FFT params)
    └── Sends to DSP Worker (worker-side thresholds)
```

---

## 9. Styling — How the UI Looks

### Tailwind CSS v4
All styling uses utility classes directly in JSX:
```tsx
<div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border">
```

Common patterns:
- `bg-card` / `bg-background` / `bg-muted` = theme-aware backgrounds
- `text-foreground` / `text-muted-foreground` = theme-aware text colors
- `text-primary` = the blue accent color
- `border-border` = theme-aware border color

### Responsive Design
The app has TWO completely different layouts:
- **Portrait/Mobile** (`landscape:hidden`): 3-tab bottom navigation (Issues / Graph / Settings)
- **Landscape/Desktop** (`hidden landscape:flex`): Resizable panel layout with sidebar

The switch happens via CSS media queries, not JavaScript:
```tsx
<div className="landscape:hidden">    {/* Mobile only */}
<div className="hidden landscape:flex"> {/* Desktop only */}
```

### The `cn()` Helper
For conditional classes:
```tsx
import { cn } from '@/lib/utils'

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  isError && "error-classes"
)} />
```

---

## 10. Common Troubleshooting

### Build Errors

**"Cannot find module '@/components/ui/xyz'"**
Some shadcn/ui components reference packages that aren't installed. If the component isn't used anywhere, it's harmless. If you need it:
```bash
pnpm add @radix-ui/react-xyz
```

**TypeScript errors after editing**
Run `pnpm build` to see exact errors. The error message tells you the file and line number. Most common: wrong prop type or missing required prop.

### Runtime Issues

**"Permission denied" or mic not working**
- Check browser permissions (click the lock icon in the URL bar)
- Must be on `localhost` or HTTPS (browser security requirement)
- Some browsers block mic in iframes

**No issues detected even with feedback**
- Check the Input Gain slider — if the signal is too quiet, nothing will be detected
- Try a different Operation Mode (Settings → Detection tab)
- Lower the Confidence Threshold in Settings
- Check if Auto-Gain is on (it should be by default)

**UI is frozen/laggy**
- The Web Worker might have crashed. Check browser DevTools Console for errors
- Try refreshing the page
- Check if another tab is using the microphone

**Blank graph / no spectrum**
- Make sure you clicked the mic button to START analysis
- Check that audio is actually reaching the mic (watch the level meter)

### DevTools Tips

**See what the DSP worker is doing:**
Open browser DevTools → Console. The `useAdvisoryLogging` hook logs every advisory.

**Inspect an Advisory object:**
```javascript
// In browser console while running:
// Look for logged advisory objects — they contain all detection data
```

**Check localStorage settings:**
```javascript
// In browser console:
JSON.parse(localStorage.getItem('ktr-settings'))
```

---

## 11. How to Make Changes

### Changing the UI (what users see)

1. Find the component in `components/kill-the-ring/`
2. Edit the JSX/Tailwind classes
3. Run `pnpm dev` and check in browser
4. Run `pnpm build` before committing

**Example: Change the issue card layout**
→ Edit `IssuesList.tsx`, specifically the `IssueCard` function

**Example: Add a new setting**
→ Multiple files needed:
1. `types/advisory.ts` — add to `DetectorSettings` interface
2. `lib/dsp/constants.ts` — add default value to `DEFAULT_SETTINGS`
3. `components/kill-the-ring/SettingsPanel.tsx` — add the UI control
4. Whatever DSP file needs to USE the setting

### Changing detection behavior (how it works)

1. Find the relevant file in `lib/dsp/`
2. Understand the data flow (see Section 4)
3. Make changes
4. Test with `pnpm dev` — use a tone generator app to create test frequencies

**Example: Change how severity is calculated**
→ Edit `classifier.ts`, look for severity assignment logic

**Example: Change EQ recommendations**
→ Edit `eqAdvisor.ts`

### Adding a new export format

1. Create a formatter in `lib/export/` (e.g., `exportCsv.ts`)
2. Follow the pattern in `exportTxt.ts` — pure function that takes advisories + settings, returns a string
3. Wire it into `FeedbackHistoryPanel.tsx` export dropdown
4. PDF uses dynamic `import()` to avoid bundling jsPDF unless needed; simpler formats can be synchronous

### Modifying calibration data collection

1. Extend the `CalibrationSession` class in `lib/calibration/calibrationSession.ts`
2. Update types in `types/calibration.ts` if adding new data fields
3. Update `lib/calibration/calibrationExport.ts` to include new data in the JSON export
4. The React hook `hooks/useCalibrationSession.ts` wraps the session class — update it if the API surface changes

**Mic calibration system:** Compensation curves live in `lib/dsp/constants.ts` (`ECM8000_CALIBRATION`, `RTA_M_CALIBRATION`, `SMARTPHONE_MEMS_CALIBRATION`). Each is interpolated per FFT bin in `feedbackDetector.ts`. Profile selection is in the Calibrate tab (`CalibrationTab.tsx`). Calibration exports (v1.1) include per-event `micCalibrationApplied` flags and the full curve in `MicCalibrationMetadata`.

### Adding a new component

1. Create `components/kill-the-ring/MyComponent.tsx`
2. Follow the pattern:
```tsx
'use client'

import { memo } from 'react'

interface MyComponentProps {
  // your props
}

export const MyComponent = memo(function MyComponent({ ...props }: MyComponentProps) {
  return (
    <div>
      {/* your JSX */}
    </div>
  )
})
```
3. Add to `components/kill-the-ring/index.ts`:
```tsx
export { MyComponent } from "./MyComponent"
```
4. Import and use in `KillTheRing.tsx` or wherever needed

### Import Paths
Always use the `@/` alias:
```tsx
import { Advisory } from '@/types/advisory'        // ✅
import { Advisory } from '../../types/advisory'     // ❌
```

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **Advisory** | A detected problem + its EQ fix recommendation |
| **FFT** | Fast Fourier Transform — breaks audio into frequency bins |
| **FFT Size** | Number of samples per analysis (4096/8192/16384). Bigger = more frequency detail, slower |
| **ECM8000** | Behringer ECM8000 measurement microphone — flat response mic used for calibration. Kill The Ring compensates its +4.7 dB rise at 10–16 kHz. Also supports dbx RTA-M and Smartphone MEMS profiles |
| **GEQ** | Graphic Equalizer — fixed frequency bands (31-band standard) |
| **PEQ** | Parametric Equalizer — adjustable frequency, Q, and gain |
| **Q Factor** | How narrow/wide an EQ cut is. High Q = surgical, Low Q = broad |
| **Prominence** | How much a peak sticks above its neighbors (in dB) |
| **Severity** | How urgent: RUNAWAY > GROWING > RESONANCE > RING > WHISTLE |
| **Sustain** | How long a peak must persist before it's considered real |
| **Track** | A peak being monitored over time (created by TrackManager) |
| **MSD** | Magnitude Slope Deviation — algorithm for detecting feedback growth patterns |
| **RTA** | Real-Time Analyzer — the frequency spectrum graph |
| **Web Worker** | Browser thread that runs DSP math without blocking the UI |
| **PWA** | Progressive Web App — installable, works offline |
| **Serwist** | Library that generates the service worker for offline support |
| **shadcn/ui** | Pre-built accessible UI components (buttons, dialogs, etc.) |
| **Tailwind** | CSS framework — style with utility classes instead of CSS files |
| **HSL** | Color model used for the theme (hue, saturation, lightness) |
| **Barrel export** | An `index.ts` that re-exports everything from a folder |

---

*Last updated: March 2026 — Kill The Ring v0.95.0*
