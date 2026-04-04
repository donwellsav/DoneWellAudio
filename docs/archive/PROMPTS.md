# DoneWell Audio — AI Prompt Library

> **Purpose:** Battle-tested prompts for improving, extending, and maintaining the DoneWell Audio codebase using AI assistants.
> **Version:** 1.0 | **Date:** 2026-03-14
> **Compatible with:** Claude (Opus 4.6, Sonnet), ChatGPT (5.4, Codex), Gemini Ultra

---

## Table of Contents

1. [How to Use This Library](#1-how-to-use-this-library)
2. [DSP Engine Prompts](#2-dsp-engine-prompts)
3. [UI & Component Prompts](#3-ui--component-prompts)
4. [Testing Prompts](#4-testing-prompts)
5. [Integration Prompts](#5-integration-prompts)
6. [Architecture & Refactoring Prompts](#6-architecture--refactoring-prompts)
7. [Code Review & Audit Prompts](#7-code-review--audit-prompts)
8. [Performance Optimization Prompts](#8-performance-optimization-prompts)
9. [Documentation Prompts](#9-documentation-prompts)
10. [Bug Fix Prompts](#10-bug-fix-prompts)

---

## 1. How to Use This Library

### Context Setup

Before using any prompt, provide the AI with project context:

1. **For Claude Code:** CLAUDE.md is already loaded. Just reference the file paths.
2. **For ChatGPT/Gemini:** Feed `docs/AI_CONTEXT.md` as initial context, then the specific files referenced in the prompt.
3. **For Codex:** Use Repomix to pack the relevant subset of the codebase.

### Prompt Format

Each prompt includes:
- **Best AI** — which model handles this type of task best
- **Context files** — which files to provide/read first
- **The prompt** — copy-paste ready
- **Expected output** — what you should get back
- **Verification** — how to validate the result

---

## 2. DSP Engine Prompts

### PROMPT-DSP-001: Add a New Detection Algorithm

**Best AI:** Gemini Ultra (mathematical precision) or Claude Opus (architecture consistency)

**Context files:** `lib/dsp/msdAnalysis.ts`, `lib/dsp/algorithmFusion.ts`, `lib/dsp/constants.ts`, `types/advisory.ts`

**Prompt:**
```
I need to add a new detection algorithm to DoneWell Audio's fusion engine. The algorithm is [ALGORITHM NAME] based on [PAPER/METHOD].

Follow these patterns exactly:

1. Create `lib/dsp/[algorithmName].ts`:
   - Export a result interface: `[AlgorithmName]Result` with fields including a `feedbackScore: number` (0-1)
   - Export a class with a ring buffer for temporal analysis
   - Export constants object: `[ALGORITHM]_CONSTANTS`
   - Include energy gate (skip processing when signal is too low)
   - Include min-frames gate (don't return results until enough data)
   - Use `Float32Array` for buffers (preallocated, not per-frame)

2. Add constants to `lib/dsp/constants.ts`:
   - Group under a descriptive comment block
   - Use SCREAMING_SNAKE_CASE naming
   - Add content-type-adaptive values if applicable

3. Integrate into `lib/dsp/algorithmFusion.ts`:
   - Add to `AlgorithmScores` interface
   - Add weight to `FusionConfig` and `DEFAULT_FUSION_CONFIG`
   - Add to `fuseAlgorithmResults()` weighted sum calculation
   - Add to `contributingAlgorithms` array when score is significant

4. Connect to worker pipeline in `lib/dsp/workerFft.ts`:
   - Call the algorithm in `processFrame()`
   - Include result in returned data

5. Add type to `types/advisory.ts`:
   - Add algorithm name to `Algorithm` type union

The algorithm should [DESCRIBE WHAT IT DETECTS AND HOW].

Reference implementation pattern: `lib/dsp/msdAnalysis.ts`
Reference constant pattern: search for `MSD_SETTINGS` in `lib/dsp/constants.ts`
Reference fusion pattern: search for `msd` in `lib/dsp/algorithmFusion.ts`
```

**Expected output:** Complete implementation files with tests

**Verification:** `pnpm test && npx tsc --noEmit`

---

### PROMPT-DSP-002: Audit Fusion Weights

**Best AI:** All three (consensus approach)

**Context files:** `lib/dsp/algorithmFusion.ts`, `tests/dsp/algorithmFusion.test.ts`, `lib/dsp/constants.ts`

**Prompt:**
```
Audit the algorithm fusion weights in DoneWell Audio's detection engine.

Read `lib/dsp/algorithmFusion.ts` — specifically the `DEFAULT_FUSION_CONFIG` weights and the `fuseAlgorithmResults()` function.

Generate 20 test scenarios covering edge cases where the current weights might produce incorrect verdicts. For each scenario:

1. Describe the real-world audio situation
2. Specify realistic algorithm score values for all 7 algorithms
3. Show the expected verdict (FEEDBACK / POSSIBLE_FEEDBACK / NOT_FEEDBACK / UNCERTAIN)
4. Show what the current weights would actually produce
5. If there's a mismatch, explain why and suggest weight adjustments

Scenarios must include:
- Solo sustained organ note (very feedback-like but isn't)
- Compressed pop music with strong vocal (compressed detection should help)
- Two simultaneous feedback frequencies
- Feedback in a reverberant church (long RT60)
- Saxophone solo with vibrato (should reject)
- Monitor wedge feeding back at 2.5 kHz (classic feedback)
- Sibilant consonants in speech (transient, not feedback)
- Electronic bass synth (sustained pure tone, not feedback)
- Slowly building feedback over 10 seconds
- Feedback through in-ear monitors (different acoustic path)

Format each scenario as a Vitest test case that can be added to `tests/dsp/algorithmFusion.test.ts`.
```

**Expected output:** 20 `it()` test cases with realistic score values

**Verification:** Add to test file, run `pnpm test`

---

### PROMPT-DSP-003: Optimize the Hot Loop

**Best AI:** Gemini Ultra (algorithmic optimization)

**Context files:** `lib/dsp/feedbackDetector.ts` (full file), `lib/dsp/constants.ts`

**Prompt:**
```
Review and optimize the hot loop in DoneWell Audio's `FeedbackDetector.analyze()` method in `lib/dsp/feedbackDetector.ts`.

This method is called 25-60 times per second and processes 4096-8192 FFT bins per call. Current optimizations:
- EXP_LUT: precomputed dB→power lookup table (4KB, L1 cache)
- Preallocated Float32Array buffers
- buildPrefixSum() for O(1) local median queries
- A-weighting + ECM8000 calibration applied in same loop pass

Profile the method conceptually and identify:
1. Any remaining bottlenecks
2. Branch misprediction hotspots
3. Memory access pattern issues
4. Opportunities for SIMD-like optimization (even in JS)
5. Unnecessary allocations or GC pressure
6. Math operations that could be replaced with bitwise or LUT

For each optimization:
- Show the current code
- Show the optimized code
- Estimate the performance improvement
- Explain any accuracy trade-offs

CRITICAL: Do not break existing behavior. All 326 tests must still pass.
```

**Expected output:** Specific code changes with benchmarks

**Verification:** `pnpm test` and manual performance profiling

---

### PROMPT-DSP-004: Implement Temporal Envelope Analysis

**Best AI:** Claude Opus (best at integrating with existing architecture)

**Context files:** `lib/dsp/feedbackDetector.ts`, `lib/dsp/algorithmFusion.ts`, `lib/dsp/constants.ts`, `types/advisory.ts`

**Prompt:**
```
Add temporal envelope analysis to DoneWell Audio's detection engine. This is a new algorithm that analyzes the amplitude envelope of detected peaks over time.

Key insight: Feedback has a characteristic constant-amplitude or monotonically growing envelope. Music and speech have attack-decay-sustain-release (ADSR) patterns.

Implementation requirements:
1. Track amplitude history per peak frequency (ring buffer, ~2 seconds at current analysis rate)
2. Classify the envelope shape:
   - CONSTANT: amplitude varies < 2dB over 500ms → feedback-like
   - GROWING: amplitude increases > 3dB/s monotonically → strong feedback indicator
   - DECAYING: amplitude decreases → not feedback
   - ADSR: attack then decay → music/speech
   - FLUCTUATING: random amplitude changes → noise/music
3. Output a feedbackScore (0-1) where GROWING = 1.0, CONSTANT = 0.8, others = 0.0-0.3
4. Include onset slope analysis: feedback onset is typically > 10dB/s sustained over > 200ms

Follow the exact patterns from `lib/dsp/msdAnalysis.ts`:
- Ring buffer with pooled Float32Array
- Result interface with feedbackScore
- Constants in `lib/dsp/constants.ts`
- Energy gate and min-frames gate
- Content-type-adaptive parameters

Integrate into the fusion engine with appropriate weight (suggest a weight based on the algorithm's discriminative power).
```

**Expected output:** New algorithm module + fusion integration + tests

---

### PROMPT-DSP-005: Fix the Spectral Flatness Bug

**Best AI:** Gemini Ultra (mathematical precision)

**Context files:** `lib/dsp/compressionDetection.ts`, `tests/dsp/compressionDetection.test.ts`

**Prompt:**
```
Fix BUG-001 in DoneWell Audio: the spectral flatness (Wiener entropy) calculation returns 0.035 for broad spectral peaks when it should return > 0.2.

The test case is at `tests/dsp/compressionDetection.test.ts` line 51, currently marked as `it.todo()`.

The issue: The Wiener entropy formula `geometric_mean / arithmetic_mean` behaves differently for narrow peaks (correct: low flatness ~0) vs broad peaks (incorrect: also returns low flatness when it should return moderate values).

Analyze the current implementation in `lib/dsp/compressionDetection.ts`:
1. Find the spectral flatness calculation
2. Understand why broad peaks produce unexpectedly low values
3. Determine if the issue is:
   a) The window/region size for the calculation
   b) The normalization method
   c) Zero or near-zero values dominating the geometric mean
   d) The bin selection around the peak

Fix the calculation so that:
- Narrow peaks (feedback-like): flatness < 0.1 ✓ (already works)
- Broad peaks (resonance-like): flatness 0.2 - 0.5 ✓ (currently broken)
- White noise: flatness > 0.8 ✓ (already works)

Then un-`todo` the test and verify all 326+ tests pass.
```

**Expected output:** Fixed calculation + passing test

**Verification:** `pnpm test` — specifically the compressionDetection tests

---

## 3. UI & Component Prompts

### PROMPT-UI-001: Create a New Settings Tab

**Best AI:** Claude Opus (React architecture, accessibility)

**Context files:** `components/analyzer/settings/DetectionTab.tsx`, `components/analyzer/settings/SettingsShared.tsx`, `components/analyzer/SettingsPanel.tsx`

**Prompt:**
```
Create a new settings tab component for DoneWell Audio. The tab is called "[TAB_NAME]" and its purpose is [DESCRIPTION].

Follow the exact pattern from `components/analyzer/settings/DetectionTab.tsx`:

1. File: `components/analyzer/settings/[TabName]Tab.tsx`
2. Must include:
   - 'use client' directive
   - memo() wrapper
   - Props interface using shared types from SettingsShared.tsx
   - shadcn/ui primitives (Slider, Select, Label, etc.)
   - Tailwind CSS with cn() for conditional classes
   - Touch targets ≥ 44×44px
   - Proper aria labels for all interactive elements

3. Register in `components/analyzer/SettingsPanel.tsx`:
   - Add to the tab list
   - Add tab content panel

4. Settings should be:
   - [LIST THE SETTINGS THIS TAB CONTROLS]
   - Connected to DetectorSettings via updateSettings()
   - Persisted via the existing settings persistence

The tab should contain: [DESCRIBE THE UI LAYOUT AND CONTROLS]
```

---

### PROMPT-UI-002: Add a New Visualization

**Best AI:** Claude Opus (canvas + architecture)

**Context files:** `lib/canvas/spectrumDrawing.ts`, `components/analyzer/SpectrumCanvas.tsx`

**Prompt:**
```
Add a [VISUALIZATION_NAME] visualization to DoneWell Audio's spectrum display.

Follow the drawing helper pattern in `lib/canvas/spectrumDrawing.ts`:
- Pure functions (no React dependency)
- Use `{ current: T }` params, NOT `React.RefObject`
- Accept canvas context, dimensions, and data as parameters
- Handle high-DPI displays (devicePixelRatio)

Create:
1. `lib/canvas/[vizName]Drawing.ts` — pure drawing helper functions
2. Integration into `SpectrumCanvas.tsx` — call drawing functions in the rAF loop

The visualization should display: [DESCRIBE WHAT IT SHOWS]
Data source: [DESCRIBE WHERE THE DATA COMES FROM]

Render constraints:
- Must not drop below 30fps on desktop
- Must not cause layout thrashing
- Use requestAnimationFrame, never setInterval
- Clear only the region being redrawn if possible
```

---

### PROMPT-UI-003: Create Spectral Waterfall Display

**Best AI:** Claude Opus or Gemini Ultra

**Context files:** `lib/canvas/spectrumDrawing.ts`, `components/analyzer/SpectrumCanvas.tsx`

**Prompt:**
```
Create a spectral waterfall (spectrogram) display for DoneWell Audio. This shows a scrolling time × frequency × amplitude visualization.

Technical requirements:
1. Canvas-based rendering (no libraries)
2. Vertical axis: frequency (20Hz - 20kHz, log scale)
3. Horizontal axis: time (scrolling left, configurable 10-60 second window)
4. Color: amplitude mapped to color gradient (blue→green→yellow→red)
5. New column added each analysis frame (25-60fps)
6. Advisory markers overlaid as semi-transparent rectangles at detected frequencies
7. Performance: use ImageData for pixel-level rendering, double-buffer for smooth scrolling

Implementation pattern:
- Drawing helper: `lib/canvas/waterfallDrawing.ts` (pure function, no React)
- Component: `components/analyzer/WaterfallCanvas.tsx`
- Data: Read from `spectrumRef` in AudioAnalyzerContext (same data source as SpectrumCanvas)
- Toggle: Add a display mode switch (Spectrum | Waterfall | Split) in DisplayTab settings

Optimization: Pre-allocate an ImageData buffer for the full waterfall. On each frame, shift existing pixels left by 1 column and draw the new column on the right edge. Use `putImageData()` for the bulk copy.

Reference: The `spectrumRef` contains `SpectrumData` with `spectrum: Float32Array` (dB values per FFT bin).
```

---

## 4. Testing Prompts

### PROMPT-TEST-001: Increase FeedbackDetector Coverage

**Best AI:** ChatGPT 5.4 (fast test generation)

**Context files:** `lib/dsp/feedbackDetector.ts`, `lib/dsp/__tests__/feedbackDetector.test.ts`

**Prompt:**
```
The FeedbackDetector class in DoneWell Audio has only 12.7% test coverage. Add comprehensive unit tests to increase coverage to 80%+.

Read `lib/dsp/feedbackDetector.ts` and the existing tests in `lib/dsp/__tests__/feedbackDetector.test.ts`.

The challenge: FeedbackDetector uses Web Audio API (AudioContext, AnalyserNode, MediaStream) which aren't available in Node.js test environment.

Strategy:
1. Create mock objects for AudioContext, AnalyserNode, MediaStreamAudioSourceNode
2. Test the `analyze()` method's logic by:
   - Feeding mock Float32Array data through the analysis pipeline
   - Verifying peak detection, persistence scoring, MSD updates
   - Testing noise floor tracking
   - Testing auto-gain logic
3. Test configuration changes (updateConfig, applyPreset)
4. Test edge cases: empty spectrum, all zeros, single peak, maximum peaks

Add tests following the existing pattern in the file (describe blocks, clear names, academic references where applicable).

Target: At least 30 new test cases covering:
- analyze() with synthetic feedback tone (single peak at known frequency)
- analyze() with synthetic noise (flat spectrum)
- analyze() with multiple peaks
- Noise floor calculation and tracking
- Auto-gain enable/disable/lock
- Persistence frame counting
- MSD ring buffer updates via analyze()
- Peak callback firing
- Configuration validation
```

---

### PROMPT-TEST-002: Add Real Audio Fixture Tests

**Best AI:** Claude Opus (test architecture) + Gemini (audio signal generation)

**Prompt:**
```
Create a test harness for DoneWell Audio that processes pre-generated audio signals through the detection pipeline and validates classification results.

Since we can't use real WAV files in Vitest (no Web Audio API), generate synthetic signals that simulate real-world scenarios:

1. Create `tests/fixtures/signalGenerator.ts`:
   - `generateFeedbackTone(freq, durationMs, sampleRate)` → Float32Array of dB values (simulated FFT output with single narrow peak at freq, -20dB)
   - `generateMusicSpectrum(fundamentalHz, harmonics, durationMs)` → Float32Array with decaying harmonic series (-6dB/octave)
   - `generateSpeechSpectrum(formants, durationMs)` → Float32Array with broad formant peaks
   - `generateNoise(durationMs)` → Float32Array with flat spectrum
   - `generateFeedbackWithMusic(feedbackHz, musicFundamental)` → combined

2. Create `tests/dsp/realWorldScenarios.test.ts`:
   - Feed each generated signal through the full classification pipeline
   - Verify verdicts match expected:
     - Pure feedback tone → FEEDBACK
     - Music spectrum → NOT_FEEDBACK
     - Speech spectrum → NOT_FEEDBACK
     - Noise → NOT_FEEDBACK
     - Feedback + music → POSSIBLE_FEEDBACK or FEEDBACK
     - Two feedback tones → FEEDBACK for both
     - Slowly building tone → FEEDBACK (after persistence threshold)

Follow Vitest patterns from `tests/dsp/algorithmFusion.test.ts`.
```

---

### PROMPT-TEST-003: Generate Vulnerability Test Scenarios

**Best AI:** All three (multi-model consensus)

**Prompt:**
```
You are a hostile adversary trying to break DoneWell Audio's feedback detection algorithm. Your goal is to find audio scenarios that cause:
1. False positives (detecting feedback when there is none)
2. False negatives (missing real feedback)
3. Verdict oscillation (rapid switching between FEEDBACK and NOT_FEEDBACK)
4. Performance degradation (scenarios that cause excessive computation)

Read the fusion engine in `lib/dsp/algorithmFusion.ts` and the algorithm modules.

Generate 15 adversarial test scenarios with specific algorithm score values that exploit weaknesses in the weighted fusion logic. For each:
- Describe the real-world scenario
- Explain which algorithm(s) are fooled and why
- Provide exact score values
- Show the expected vs actual verdict
- Suggest a fix (weight adjustment, new gate, etc.)

Format as Vitest test cases for `tests/dsp/algorithmFusion.test.ts`.

Focus on edge cases at decision boundaries (probability near 0.4 and 0.7 where verdict changes).
```

---

## 5. Integration Prompts

### PROMPT-INT-001: WebSocket API Server

**Best AI:** Claude Opus (architecture) or ChatGPT/Codex (integration patterns)

**Context files:** `lib/dsp/dspWorker.ts` (message types), `contexts/AdvisoryContext.tsx`, `types/advisory.ts`

**Prompt:**
```
Implement a WebSocket API server for DoneWell Audio that exposes advisory state for external integrations (Bitfocus Companion, custom dashboards, etc.).

Create `lib/companion/wsServer.ts`:
- WebSocket server on configurable port (default 9741)
- Bind to localhost by default (configurable for LAN access)
- Handle connections with optional API key authentication
- Broadcast advisory events (new, updated, cleared) to all connected clients
- Handle incoming commands (dismiss, clear all, mode change, etc.)
- Send state snapshot on initial connection

Message format: JSON over WebSocket (see `docs/INTEGRATIONS.md` Section 5 for full spec).

Follow the message type patterns from `lib/dsp/dspWorker.ts`:
- Discriminated union types for inbound/outbound messages
- Type-safe message dispatch

Create `lib/companion/stateSync.ts`:
- Subscribe to AdvisoryContext changes
- Convert Advisory objects to WebSocket event payloads
- Manage connected client list
- Handle reconnection and cleanup

Add WebSocket port configuration to `components/analyzer/settings/AdvancedTab.tsx`.

Security:
- API key generated on first run, stored in localStorage
- Rate limit incoming commands (10/second per client)
- Max 5 concurrent connections
- Validate all incoming messages against schema
```

---

### PROMPT-INT-002: Behringer X32 OSC Adapter

**Best AI:** ChatGPT/Codex (protocol implementation)

**Context files:** `docs/INTEGRATIONS.md` (Section 3.2.1)

**Prompt:**
```
Create a Behringer X32 OSC adapter for DoneWell Audio's mixer integration system.

Implement `lib/mixer/behringer.ts`:
- Implements the `MixerConnection` interface (see `docs/INTEGRATIONS.md` Section 3.3)
- OSC over UDP to port 10023
- Value mapping functions for frequency (20Hz-20kHz log), gain (-15dB to +15dB), Q (10 to 0.3)
- Keepalive mechanism (/xremote every 8 seconds)
- Subscribe to EQ changes for monitoring (/subscribe)
- Support for channel EQ (4 bands, ch 01-32), bus EQ (6 bands), and main EQ (6 bands)

Since browsers can't send UDP, this must work in one of:
a) Node.js bridge service
b) Tauri native plugin (Rust)
c) Companion module context

For now, implement as a Node.js module that can be imported by any of these environments.

Include safety controls from `docs/INTEGRATIONS.md` Section 3.4:
- Max cut depth enforcement
- Rate limiting
- Undo stack (last 20 changes)
- Channel whitelist
- Confirmation callback

Reference the unofficial X32 OSC protocol:
- Frequency mapping: 0.0-1.0 → 20Hz-20kHz (logarithmic)
- Gain mapping: 0.0-1.0 → -15dB to +15dB (linear)
- Q mapping: 0.0-1.0 → 10 to 0.3 (inverse logarithmic)
- Band types: 0=LCut, 1=LShv, 2=PEQ, 3=VEQ, 4=HShv, 5=HCut
```

---

## 6. Architecture & Refactoring Prompts

### PROMPT-ARCH-001: Extract Worker Message Logic

**Best AI:** Claude Opus

**Context files:** `lib/dsp/dspWorker.ts`

**Prompt:**
```
Refactor `lib/dsp/dspWorker.ts` to extract the message handling logic into testable pure functions.

Currently, the `onmessage` handler contains classification smoothing (ring-buffer majority vote) and fusion config management that are untestable because they're embedded in the worker's `onmessage` closure.

Extract:
1. `lib/dsp/classificationSmoother.ts` — ring-buffer majority vote logic
   - `ClassificationSmoother` class with `addVote(verdict)` → smoothed verdict
   - Configurable ring buffer size
   - Pure, no worker dependency

2. `lib/dsp/fusionConfigManager.ts` — fusion config from user settings
   - `buildFusionConfig(settings: DetectorSettings)` → `FusionConfig`
   - Pure function, no worker dependency

3. Update `dspWorker.ts` to import and use these extracted modules

4. Add tests for both extracted modules

The worker should remain a thin orchestrator that:
- Receives messages
- Delegates to extracted modules
- Posts results back

Do NOT change any external behavior. All 326 tests must still pass.
```

---

### PROMPT-ARCH-002: Add Multi-Channel Support Architecture

**Best AI:** Claude Opus (system design)

**Context files:** `contexts/AudioAnalyzerContext.tsx`, `hooks/useAudioAnalyzer.ts`, `lib/dsp/dspWorker.ts`

**Prompt:**
```
Design the architecture for multi-channel audio analysis in DoneWell Audio (up to 16 simultaneous microphone inputs).

Current architecture: Single FeedbackDetector → single Web Worker → single advisory stream.

Requirements:
1. Each channel gets its own FeedbackDetector instance on the main thread
2. Each channel gets its own Web Worker for classification (or share workers with channel ID tagging)
3. Per-channel advisory state (which channel is feeding back)
4. Cross-channel correlation analysis (feedback appears at same freq across channels)
5. Per-channel EQ recommendations (which channel's EQ to adjust)
6. Combined dashboard view showing all channels

Design decisions to make:
- One worker per channel (isolated, parallel) vs shared worker pool (less memory)?
- How to handle AudioContext multi-input (multiple getUserMedia calls or single with channel splitting)?
- How to modify AdvisoryContext to support per-channel advisories?
- How to extend the existing single-channel UI to show multi-channel data?

Output a detailed architecture document with:
- Component diagram
- Data flow diagram
- Interface changes to existing types
- New types needed
- File list with responsibilities
- Migration plan from single to multi-channel
```

---

## 7. Code Review & Audit Prompts

### PROMPT-REVIEW-001: Full Security Audit

**Best AI:** Claude Opus or ChatGPT 5.4

**Prompt:**
```
Perform a comprehensive security audit of DoneWell Audio. Check for:

1. XSS vectors — any user-controlled content rendered as HTML?
2. Injection — any string interpolation in queries, commands, or eval-like constructs?
3. CSP compliance — does the current Content-Security-Policy in next.config.mjs prevent common attacks?
4. Data exfiltration — could the spectral data collection system be exploited?
5. localStorage — any sensitive data stored without encryption?
6. postMessage — are worker messages validated on receipt?
7. Third-party dependencies — any known vulnerabilities in current dependency versions?
8. API endpoint security — is /api/v1/ingest properly protected?
9. Service worker — could the PWA cache be poisoned?
10. Permissions — is the Permissions-Policy header properly restrictive?

For each finding:
- Severity: Critical / High / Medium / Low / Info
- File and line number
- Description of the vulnerability
- Proof of concept (if applicable)
- Recommended fix with code

Read these files:
- next.config.mjs (CSP headers)
- app/api/v1/ingest/route.ts (API endpoint)
- lib/data/ (data collection system)
- lib/storage/dwaStorage.ts (localStorage)
- lib/dsp/dspWorker.ts (worker messages)
- app/sw.ts (service worker)
```

---

### PROMPT-REVIEW-002: Accessibility Audit

**Best AI:** Claude Opus (accessibility expertise)

**Prompt:**
```
Perform a WCAG 2.1 AA accessibility audit of DoneWell Audio's UI components.

Read all components in `components/analyzer/` and check:

1. **Keyboard navigation** — can every interactive element be reached via Tab? Are keyboard shortcuts documented?
2. **Screen reader** — are all advisories announced via role="status" or aria-live? Are canvas visualizations described?
3. **Color contrast** — do severity colors (green/yellow/orange/red) meet 4.5:1 contrast ratio on both light and dark backgrounds?
4. **Touch targets** — are all interactive elements ≥ 44×44px? (Convention requires min-h-[44px] min-w-[44px])
5. **Focus management** — when an advisory appears/disappears, where does focus go?
6. **Motion** — does the spectrum animation respect prefers-reduced-motion?
7. **Labels** — do all form controls (sliders, selects, toggles) have associated labels?
8. **Error messaging** — are errors announced to screen readers?
9. **Mobile** — does MobileLayout's WAI-ARIA tabs pattern (roving tabindex, ArrowLeft/Right/Home/End) work correctly?

For each issue, provide:
- WCAG criterion violated (e.g., "1.4.3 Contrast")
- Component and file location
- Current behavior
- Required behavior
- Code fix
```

---

## 8. Performance Optimization Prompts

### PROMPT-PERF-001: Bundle Size Analysis

**Best AI:** Any

**Prompt:**
```
Analyze DoneWell Audio's production bundle for optimization opportunities.

1. Run `pnpm build` and examine `.next/static/chunks/` output
2. Identify the largest chunks
3. Check for:
   - Dependencies that should be dynamically imported (jspdf is already — good)
   - Unused exports from barrel files
   - Duplicate code across chunks
   - Tree-shaking failures
4. Recommend specific optimizations with expected size savings

Add @next/bundle-analyzer configuration:
- Add to devDependencies
- Add `ANALYZE=true pnpm build` script
- Show how to interpret the visualization

Target: Main chunk < 200KB gzipped
```

---

### PROMPT-PERF-002: Worker Communication Optimization

**Best AI:** Gemini Ultra (performance)

**Context files:** `lib/dsp/feedbackDetector.ts`, `lib/dsp/dspWorker.ts`

**Prompt:**
```
Optimize the Web Worker communication in DoneWell Audio.

Current pattern:
1. Main thread: FFT data → FeedbackDetector.analyze() → postMessage(peak + spectrum)
2. Worker: processPeak → classify → postMessage(advisory)
3. Main thread: returnBuffers message returns Float32Array for reuse

Audit and optimize:
1. Verify all Float32Array transfers use the transferable objects API (second arg to postMessage)
2. Consider SharedArrayBuffer for zero-copy spectrum sharing (requires COOP/COEP headers)
3. Batch multiple peaks into a single postMessage (reduce message overhead)
4. Profile the serialization cost of Advisory objects (consider a binary format)
5. Consider using MessagePort for dedicated communication channel

For each optimization:
- Current code and the optimized version
- Performance impact (ms saved per frame)
- Compatibility implications
- Required header changes (for SharedArrayBuffer)
```

---

## 9. Documentation Prompts

### PROMPT-DOC-001: Generate API Documentation

**Best AI:** Claude Opus (documentation quality)

**Prompt:**
```
Generate comprehensive JSDoc documentation for all public interfaces in DoneWell Audio's type system.

Read `types/advisory.ts`, `types/calibration.ts`, `types/data.ts` and add JSDoc comments to every:
- Type alias (explain what it represents and valid values)
- Interface (explain its purpose and usage context)
- Interface field (explain what the field means, its unit of measurement, and valid range)
- Enum/union member (explain when this value is used)

Follow this format:
/**
 * Brief description.
 *
 * @example
 * const peak: DetectedPeak = { trueFrequencyHz: 2512, ... }
 */

Do not modify any type definitions — only add JSDoc comments.
```

---

## 10. Bug Fix Prompts

### PROMPT-BUG-001: General Bug Fix Template

**Best AI:** Depends on bug domain

**Prompt:**
```
Fix the following bug in DoneWell Audio:

**Bug description:** [DESCRIBE THE BUG]
**Steps to reproduce:** [HOW TO TRIGGER IT]
**Expected behavior:** [WHAT SHOULD HAPPEN]
**Actual behavior:** [WHAT ACTUALLY HAPPENS]
**File(s) involved:** [WHICH FILES]

Context files to read first:
- [FILE 1]
- [FILE 2]

Requirements:
1. Fix the root cause, not just the symptom
2. Add a test case that would have caught this bug
3. Verify all existing 326+ tests still pass
4. Follow DoneWell Audio's code conventions (see CLAUDE.md):
   - @/* imports
   - SCREAMING_SNAKE constants in constants.ts
   - memo() on components
   - No `any` types

Run verification: `npx tsc --noEmit && pnpm test`
```

---

### PROMPT-BUG-002: Complete FUTURE-002

**Best AI:** Claude Opus (understanding existing architecture)

**Context files:** `lib/dsp/feedbackDetector.ts`, `lib/dsp/constants.ts`, `lib/dsp/__tests__/feedbackDetector.test.ts`

**Prompt:**
```
Complete the FUTURE-002 enhancement in DoneWell Audio: frame-rate-independent persistence scoring.

Background: Persistence scoring counts consecutive frames a peak appears. Currently, frame-based thresholds are partially converted to millisecond-based:

- PERSISTENCE_SCORING.MIN_PERSISTENCE_MS = 100
- PERSISTENCE_SCORING.HIGH_PERSISTENCE_MS = 300
- PERSISTENCE_SCORING.VERY_HIGH_PERSISTENCE_MS = 600
- PERSISTENCE_SCORING.LOW_PERSISTENCE_MS = 60

But the conversion in `recomputePersistenceThresholds()` (line ~1722) is incomplete.

Search for all `FUTURE-002` markers in the codebase (6 locations in feedbackDetector.ts, 1 in constants.ts, 1 in test file).

Complete the implementation:
1. Ensure `recomputePersistenceThresholds()` correctly converts ms → frames based on `analysisIntervalMs`
2. Ensure all persistence comparisons use the computed frame thresholds
3. Add parameterized tests that verify identical behavior at:
   - 20ms interval (50fps desktop)
   - 33ms interval (30fps)
   - 40ms interval (25fps mobile)
4. Remove all FUTURE-002 comments once implemented

The behavior should be identical regardless of analysis interval — a peak that persists for 300ms should be classified the same whether analyzed at 20ms or 40ms intervals.
```

---

*This prompt library is a living document. Add new prompts as you discover effective patterns. Test prompts across multiple AI models and note which model produces the best results for each category.*
