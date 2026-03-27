export type ChangeType = 'feat' | 'fix' | 'perf' | 'refactor' | 'ui'

export interface Change {
  type: ChangeType
  description: string
}

export interface ChangelogEntry {
  version: string
  date: string
  highlights?: string
  changes: Change[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.22.8',
    date: '2026-03-27',
    changes: [
      { type: 'fix', description: 'fix: resolve changelog merge conflict (keep proper descriptions)' },
    ],
  },
  {
    version: '0.22.7',
    date: '2026-03-27',
    highlights: 'CORS proxy fix for Companion bridge',
    changes: [
      { type: 'fix', description: 'Added **server-side proxy** (`/api/companion/proxy`) to bypass CORS — Companion HTTP server does not return CORS headers, so direct browser fetch was blocked' },
      { type: 'fix', description: 'Bridge now routes all requests through the Next.js API proxy where CORS does not apply' },
    ],
  },
  {
    version: '0.22.6',
    date: '2026-03-27',
    highlights: 'Companion module zip with bundled dependencies',
    changes: [
      { type: 'fix', description: 'Companion module zip now includes **pre-installed node_modules** — no npm/yarn install step needed' },
      { type: 'fix', description: 'Removed npm install requirement from help tab install instructions' },
    ],
  },
  {
    version: '0.22.5',
    date: '2026-03-27',
    highlights: 'Companion manifest fix',
    changes: [
      { type: 'fix', description: 'Added missing **runtime block** to Companion `manifest.json` (`type: node22`, `api: nodejs-ipc`, `entrypoint: dist/main.js`) — module was not loading in Companion without it' },
      { type: 'fix', description: 'Added `$schema`, `maintainers`, `bugs`, and `legacyIds` fields to match official Companion module template' },
    ],
  },
  {
    version: '0.22.4',
    date: '2026-03-27',
    highlights: 'Pre-built companion module zip',
    changes: [
      { type: 'feat', description: 'Companion module zip now includes **pre-built dist/** folder — no build step required' },
      { type: 'fix', description: 'Updated install instructions to reflect simpler setup (unzip + point Companion to folder)' },
    ],
  },
  {
    version: '0.22.3',
    date: '2026-03-27',
    highlights: 'Downloadable companion module',
    changes: [
      { type: 'feat', description: 'Added **downloadable zip** at `/downloads/companion-module-donewell-audio.zip` for direct in-app download' },
      { type: 'feat', description: 'Download button in Help → Companion tab with step-by-step install instructions' },
    ],
  },
  {
    version: '0.22.2',
    date: '2026-03-27',
    highlights: 'Companion download and install docs',
    changes: [
      { type: 'feat', description: 'Added **Download & Setup** section to Companion help tab with install steps and quick start guide' },
      { type: 'feat', description: 'Separated **App Settings** reference into its own help section' },
    ],
  },
  {
    version: '0.22.1',
    date: '2026-03-27',
    highlights: 'Companion help tab',
    changes: [
      { type: 'feat', description: 'New **Companion** tab in Help menu with full integration manual — setup, data flow, variables reference, wiring examples, Stream Deck presets, module config, safety, and troubleshooting' },
      { type: 'feat', description: 'Updated **GuideTab** with SEND button documentation and Companion mention in Advanced settings' },
    ],
  },
  {
    version: '0.22.0',
    date: '2026-03-27',
    changes: [
      { type: 'feat', description: '**New Bitfocus Companion module** that receives EQ advisories via HTTP POST and exposes them as Companion variables' },
      { type: 'feat', description: 'Implements HTTP endpoints: `/advisory` (POST) and `/status` (GET) with CORS support' },
      { type: 'feat', description: 'Configurable confidence/severity gates and safety clamps on cut depth' },
      { type: 'feat', description: 'Auto-acknowledge timer for hands-free operation' },
      { type: 'feat', description: 'Three actions: acknowledge latest, acknowledge all, clear all' },
      { type: 'feat', description: 'Three feedbacks: advisory pending, severity runaway, severity growing' },
      { type: 'feat', description: 'Three preset buttons: latest advisory, clear all, status display' },
      { type: 'feat', description: '12 variables exposed: PEQ/GEQ parameters, pitch, severity, confidence, pending count, timestamp' },
      { type: 'feat', description: '**HTTP client** for sending advisories from DoneWell PWA to Companion module' },
      { type: 'feat', description: 'Handles connection state, error tracking, and timeout management' },
      { type: 'feat', description: 'Singleton pattern with dynamic reconfiguration support' },
      { type: 'feat', description: 'Payload extraction (minimal subset of advisory data for Companion)' },
      { type: 'feat', description: '**New `CompanionSettings` type** with enable/disable, URL, instance name, auto-send, confidence threshold, ring-out auto-send' },
      { type: 'feat', description: '**`companionStorage`** for persisting Companion settings to localStorage' },
      { type: 'feat', description: '**`useCompanion()` hook** for React components to manage settings, connection state, and send advisories' },
      { type: 'feat', description: '**AdvancedTab** now includes Companion section with:' },
      { type: 'feat', description: 'Toggle to enable/disable bridge' },
      { type: 'feat', description: 'URL and instance name inputs' },
      { type: 'feat', description: 'Live connection indicator (LED + status text)' },
      { type: 'feat', description: 'Manual connection check button' },
      { type: 'feat', description: '**IssuesList** auto-sends new advisories to Companion when enabled and auto-send is active' },
      { type: 'feat', description: '**RingOutWizard** auto-sends notched frequencies to Companion during ring-out steps (when enabled)' },
      { type: 'feat', description: 'Module manifest, package.json, TypeScript configs for Companion module build' },
      { type: 'feat', description: 'Help documentation explaining variables, setup, and example trigger workflow' },
      { type: 'feat', description: '**Severity ranking system** (RUNAWAY > GROWING > RESONANCE > POSSIBLE_RING) for filtering' },
      { type: 'feat', description: '**Safety clamps** on PEQ/GEQ gain to prevent excessive cuts' },
      { type: 'feat', description: '**CORS-enabled HTTP handler** for cross-origin requests from browser PWA' },
      { type: 'feat', description: '**Confidence gating** at both PWA and Companion module levels' },
      { type: 'feat', description: '**Auto-acknowledge** with configurable timeout to clear advisories automatically' },
      { type: 'feat', description: '**Pitch notation** formatted as note+octave+cents (e.g., "D#5+12c") for readability' },
      { type: 'feat', description: '**Minimal payload** sent to Companion (no raw audio, no internal state)' },
      { type: 'feat', description: '**Graceful degradation** when Companion is unreachable (logged but non-blocking)' },
      { type: 'feat', description: 'Companion module requires Node.js ≥22.20 and `@companion-module/base` ~1.14.1' },
      { type: 'feat', description: 'HTTP endpoints should be tested with CORS preflight requests' },
      { type: 'feat', description: 'Connection state should be verified before sending advisories' },
      { type: 'feat', description: 'Safety clamps should prevent cuts deeper than configured maximum' },
    ],
  },
  {
    version: '0.21.1',
    date: '2026-03-26',
    changes: [
      { type: 'feat', description: 'feat: P3 export discoverability + P4 session history persistence' },
    ],
  },
  {
    version: '0.21.0',
    date: '2026-03-26',
    changes: [
      { type: 'feat', description: 'Ring-out wizard warns when detected frequency is near an axial room mode' },
      { type: 'feat', description: 'Per-mode track timeout via sentinel type (worship 2s, liveMusic 5s, monitors 500ms)' },
      { type: 'feat', description: 'Deploy guard hook with one-shot atomic marker pattern' },
      { type: 'feat', description: 'Dead code removal (ALGORITHM_MODES, MIN_FRAMES_ROCK)' },
      { type: 'feat', description: 'CLAUDE.md freshness (7 algorithms, 4-tab layout, file counts)' },
      { type: 'feat', description: '8 rounds of GPT adversarial plan review' },
      { type: 'feat', description: '[x] tsc clean, 940/944 tests pass' },
      { type: 'feat', description: '[x] Sentinel derivation test updated and passing' },
      { type: 'feat', description: '[x] Deploy guard marker consumed atomically on use' },
      { type: 'feat', description: '[x] All 4 wizard instances wired with roomModes prop' },
    ],
  },
  {
    version: '0.20.0',
    date: '2026-03-26',
    changes: [
      { type: 'feat', description: 'Room mode reference lines on live RTA — faint dashed axial modes below min(Schroeder, 300Hz), multiplicity-aware stroke weight' },
      { type: 'feat', description: 'Storage backfill — existing users get new display/session fields from defaults instead of undefined (flat + nested merge)' },
      { type: 'feat', description: '4-tab control surface: Live, Setup, Display, Advanced' },
      { type: 'feat', description: 'Mains hum enable/disable + 50/60Hz selector (environment-layer, preset-aware)' },
      { type: 'feat', description: 'Gate multiplier overrides in DiagnosticsProfile (expert-only, persisted)' },
      { type: 'feat', description: 'Per-mode persistence thresholds and track timeouts' },
      { type: 'feat', description: 'Deploy guard hook for mechanical enforcement' },
      { type: 'feat', description: '7 rounds of GPT adversarial cross-review' },
      { type: 'feat', description: '[x] tsc clean, 940/944 tests pass' },
      { type: 'feat', description: '[x] Visual: Medium Room preset shows ~5 faint dashed axial mode lines below 119Hz' },
      { type: 'feat', description: '[x] Visual: Room preset none = no lines' },
      { type: 'feat', description: '[x] All 3 mobile + 1 desktop SpectrumCanvas instances wired' },
      { type: 'feat', description: '[x] Backfill tests pass for flat and nested storage' },
      { type: 'feat', description: '[x] Unit conversion verified (feet dimensions → meters before mode calc)' },
    ],
  },
  {
    version: '0.21.0',
    date: '2026-03-26',
    highlights: 'Room mode lines on live RTA, 4-tab control surface, DSP tuning, storage backfill',
    changes: [
      { type: 'feat', description: 'Room mode reference lines on live RTA — faint dashed verticals show predicted axial modes below Schroeder frequency. Multiplicity-aware stroke weight.' },
      { type: 'feat', description: 'Display toggle for room mode lines in Display tab' },
      { type: 'feat', description: '4-tab control surface: Live (sensitivity, gain, freq range), Setup (mode, room, calibration, presets), Display, Advanced' },
      { type: 'feat', description: 'Mains hum enable/disable + 50/60Hz selector in Setup > Room (environment-layer, preset-aware)' },
      { type: 'feat', description: 'Gate multiplier overrides in DiagnosticsProfile — expert-only, persisted, flows through to classifier/fusion' },
      { type: 'fix', description: 'Storage backfill — existing users get new display/session fields from defaults instead of undefined (nested merge for DwaSessionState)' },
      { type: 'fix', description: 'Unit conversion for room mode calculation — feet values converted to meters before calculateRoomModes()' },
      { type: 'fix', description: 'Clutter cap: Math.min(schroederHz, 300) prevents overdrawing in high-Schroeder rooms' },
      { type: 'refactor', description: 'Remove standalone RoomAnalysisView from SetupTab — replaced by RTA-integrated room mode overlay' },
      { type: 'refactor', description: 'Remove legacy applyLegacyPartial shim — all controls route through semantic actions (Phase 6 complete)' },
      { type: 'perf', description: 'Per-mode persistence thresholds and track timeouts — liveMusic gets 500ms persistence, monitors 150ms' },
    ],
  },
  {
    version: '0.20.1',
    date: '2026-03-26',
    changes: [
      { type: 'fix', description: 'release: v0.20.0 — Legacy shim removal + GPT cross-review bug fixes' },
    ],
  },
  {
    version: '0.20.0',
    date: '2026-03-25',
    highlights: 'Legacy shim removal — all controls use semantic actions, dead-code fallbacks stripped',
    changes: [
      { type: 'fix', description: 'Fix resetAll() debounce race condition — stale persistence timer could resurrect pre-reset settings on reload (P1, GPT cross-review)' },
      { type: 'fix', description: 'Fix setEnvironment unit toggle — changing m/ft now triggers room param recomputation (P2, GPT cross-review)' },
      { type: 'refactor', description: 'Remove legacy applyLegacyPartial shim from useLayeredSettings — all UI controls route through semantic actions' },
      { type: 'refactor', description: 'Strip dead-code defensive fallback guards from SoundTab, AdvancedTab, DisplayTab, RoomTab, CalibrationTab' },
      { type: 'refactor', description: 'Remove legacy useEffect RT60 recomputation from RoomTab — derivation engine handles it' },
      { type: 'refactor', description: 'Make setMicProfile and setEnvironment required props (no longer optional)' },
    ],
  },
  {
    version: '0.19.0',
    date: '2026-03-25',
    highlights: 'Layered settings architecture — mode, environment, live, display, and diagnostics ownership model',
    changes: [
      { type: 'refactor', description: 'Replace flat DetectorSettings editing model with 6-layer ownership contract (mode baseline, environment, live overrides, display, diagnostics, calibration)' },
      { type: 'feat', description: 'Structured rig presets (RigPresetV1) — save/load captures operator intent, not raw field bags' },
      { type: 'feat', description: 'Semantic actions API: setMode, setEnvironment, setSensitivityOffset, setInputGain, setAutoGain, setFocusRange, setEqStyle, setMicProfile, updateDisplay, updateDiagnostics' },
      { type: 'fix', description: 'Room presets now apply threshold offsets relative to mode baseline instead of writing absolute values' },
      { type: 'refactor', description: 'DisplayTab writes directly to display layer instead of routing through DSP settings shim' },
      { type: 'refactor', description: 'CalibrationTab mic profile selection routes through setMicProfile semantic action' },
      { type: 'refactor', description: 'SettingsPanel preset logic replaced with useRigPresets hook (structured save/load/delete/rename/duplicate)' },
      { type: 'refactor', description: 'Deprecated legacy presetStorage and customDefaultsStorage — replaced by v2 layered persistence' },
    ],
  },
  {
    version: '0.18.0',
    date: '2026-03-25',
    changes: [
      { type: 'feat', description: 'Add ML Scoring toggle to Advanced settings in SoundTab — works in all modes including Auto' },
    ],
  },
  {
    version: '0.16.0',
    date: '2026-03-24',
    changes: [
      { type: 'feat', description: 'Merge pull request #15 from donwellsav/main' },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-03-24',
    highlights: 'Control surface cleanup + worker-owned content-type + hot-path test harness',
    changes: [
      { type: 'fix', description: 'Fix mic calibration bridge gap — updateSettings() now maps micCalibrationProfile to updateConfig()' },
      { type: 'fix', description: 'Fix wrapper posterior divergence — classifyTrackWithAlgorithms() renormalizes after severity overrides' },
      { type: 'refactor', description: 'Remove 8 dead controls: musicAware, autoMusicAware, autoMusicAwareHysteresisDb, noiseFloorDecay, harmonicFilterEnabled, holdTimeMs, quickControlsMode, relativeThresholdDb UI slider' },
      { type: 'fix', description: 'Fix peakMergeCents default from 1000 to 100 (synced with ASSOCIATION_TOLERANCE_CENTS)' },
      { type: 'ui', description: 'Room preset selector now discloses sensitivity coupling' },
      { type: 'feat', description: 'ML (ONNX) toggle added to custom algorithm mode across all 4 UI surfaces' },
      { type: 'refactor', description: 'Classifier comments updated from Bayesian language to confidence scores; AlgorithmsTab help text synced with runtime formulas' },
      { type: 'feat', description: 'Content-type detection moved to worker thread with periodic spectrum feed independent of peak backpressure' },
      { type: 'feat', description: 'Hot-path test harness: 27 new tests covering analyze() pipeline (silence gate, prominence, sustain, PHPR, Q, persistence)' },
    ],
  },
  {
    version: '0.8.1',
    date: '2026-03-23',
    changes: [
      { type: 'fix', description: 'Fix Sentry setup and add ONNX runtime dependency' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-03-23',
    changes: [
      { type: 'feat', description: 'The ML inference worker does a dynamic `import(\'onnxruntime-web\')`, but the runtime package was not declared as a dependency, causing the worker to fall back and disable ML scoring in production.' },
      { type: 'feat', description: 'Add `onnxruntime-web@^1.24.3` to `dependencies` in `package.json` and update `pnpm-lock.yaml` so the browser worker\'s dynamic ONNX import can resolve at runtime.' },
      { type: 'feat', description: 'Ran `pnpm test` (full test suite) and `pnpm exec vitest run lib/dsp/__tests__/mlInference.test.ts`, both passed; `eslint lib/dsp/mlInference.ts` timed out in this environment but produced no reported lint failures.' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-03-23',
    highlights: 'Comprehensive UX audit — tooltips, accessibility, touch optimization',
    changes: [
      { type: 'ui', description: 'Tooltip prop on LEDToggle and PillToggle — help icons across all settings controls' },
      { type: 'ui', description: 'Hz range labels on frequency preset buttons (Vocal, Monitor, Full, Sub)' },
      { type: 'ui', description: 'Full mic names on Calibration abbreviations via title attribute' },
      { type: 'ui', description: 'Replace emoji icons with Lucide SVGs in RoomTab, SoundTab, UnifiedControls' },
      { type: 'ui', description: 'Move theme toggle between Help and Reset Layout icons in header' },
      { type: 'fix', description: 'Sensitivity slider invisible track/thumb — CSS layer specificity with Tailwind v4' },
      { type: 'fix', description: 'Add touch-action: manipulation on html element for mobile tap delay' },
      { type: 'fix', description: 'Add overscroll-behavior: contain to prevent pull-to-refresh interference' },
      { type: 'fix', description: 'Darken light mode muted-foreground for better contrast at small text sizes' },
      { type: 'fix', description: 'Standardize focus-visible ring to 3px across all component files' },
      { type: 'fix', description: 'Expand prefers-reduced-motion to suppress all CSS transitions and animations' },
      { type: 'fix', description: 'Increase desktop FALSE+/CONFIRM button touch targets' },
      { type: 'fix', description: 'Reduce progress bar animation duration in EarlyWarningPanel and IssuesList' },
      { type: 'feat', description: 'Skip-to-main-content link for keyboard navigation (WCAG 2.4.1)' },
      { type: 'feat', description: 'Range hint labels on Advanced tab sliders (Fast/Slow, Sensitive/Conservative)' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-03-23',
    highlights: 'Deep audit fixes, bundle optimization, Companion design doc',
    changes: [
      { type: 'perf', description: 'Remove radix-ui meta-package — 25 packages eliminated from dependency tree' },
      { type: 'perf', description: 'Stabilize useDSPWorker return value with useMemo to prevent EngineContext cascade re-renders' },
      { type: 'perf', description: 'Replace Math.pow with EXP_LUT in worker hot path — eliminates ~35K Math.pow calls/sec' },
      { type: 'perf', description: 'Pre-allocate ML feature buffer in workerFft — eliminates 50 Float32Array allocs/sec' },
      { type: 'perf', description: 'Use calibrationRef pattern in handleSettingsChange to prevent callback recreation' },
      { type: 'fix', description: 'Add roomAutoStopRef cleanup on unmount to prevent stale timeout firing' },
      { type: 'fix', description: 'Constrain sessionId length and format in ingest API to prevent abuse' },
      { type: 'fix', description: 'Change X-Frame-Options from SAMEORIGIN to DENY to match CSP frame-ancestors' },
      { type: 'fix', description: 'Add .env to .gitignore to prevent accidental secret commits' },
      { type: 'ui', description: '3-row header layout: DONEWELL / AUDIO / version on separate lines' },
      { type: 'ui', description: 'Move fullscreen button to far right of header for better ergonomics' },
      { type: 'ui', description: 'Enable Next.js image optimization on DwaLogo' },
      { type: 'ui', description: 'Advisory card cluster merging — nearby frequencies display as range cards' },
      { type: 'feat', description: 'Companion integration design doc with Wing OSC PEQ protocol analysis' },
      { type: 'feat', description: 'Supabase RLS policies added for spectral_snapshots table' },
    ],
  },
  {
    version: '0.3.7',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'fix: cast Float32Array at Web Audio call sites for CI TS compat' },
    ],
  },
  {
    version: '0.3.6',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'audit: deep codebase audit — 10 fixes across security, performance, React' },
    ],
  },
  {
    version: '0.3.5',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'fix: increase PWA icon fill to 92% and sharpen small sizes' },
    ],
  },
  {
    version: '0.3.4',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'fix: reduce PWA icon padding and sharpen small sizes' },
    ],
  },
  {
    version: '0.3.3',
    date: '2026-03-22',
    changes: [
      { type: 'feat', description: 'feat: regenerate PWA icons from DW Audio logo' },
    ],
  },
  {
    version: '0.3.2',
    date: '2026-03-22',
    changes: [
      { type: 'feat', description: 'feat: configure Sentry source maps, tunnel route, and ad-blocker bypass' },
    ],
  },
  {
    version: '0.3.1',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'fix: explicit Float32Array<ArrayBuffer> type for TS 5.7 CI compat' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-03-22',
    changes: [
      { type: 'feat', description: '`@dependabot rebase` will rebase this PR' },
      { type: 'feat', description: '`@dependabot recreate` will recreate this PR, overwriting any edits that have been made to it' },
      { type: 'feat', description: '`@dependabot show <dependency name> ignore conditions` will show all of the ignore conditions of the specified dependency' },
      { type: 'feat', description: '`@dependabot ignore this major version` will close this PR and stop Dependabot creating any more for this major version (unless you reopen the PR or upgrade to it yourself)' },
      { type: 'feat', description: '`@dependabot ignore this minor version` will close this PR and stop Dependabot creating any more for this minor version (unless you reopen the PR or upgrade to it yourself)' },
      { type: 'feat', description: '`@dependabot ignore this dependency` will close this PR and stop Dependabot creating any more for this dependency (unless you reopen the PR or upgrade to it yourself)' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-03-22',
    changes: [
      { type: 'feat', description: '`@dependabot rebase` will rebase this PR' },
      { type: 'feat', description: '`@dependabot recreate` will recreate this PR, overwriting any edits that have been made to it' },
      { type: 'feat', description: '`@dependabot show <dependency name> ignore conditions` will show all of the ignore conditions of the specified dependency' },
      { type: 'feat', description: '`@dependabot ignore this major version` will close this PR and stop Dependabot creating any more for this major version (unless you reopen the PR or upgrade to it yourself)' },
      { type: 'feat', description: '`@dependabot ignore this minor version` will close this PR and stop Dependabot creating any more for this minor version (unless you reopen the PR or upgrade to it yourself)' },
      { type: 'feat', description: '`@dependabot ignore this dependency` will close this PR and stop Dependabot creating any more for this dependency (unless you reopen the PR or upgrade to it yourself)' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-03-22',
    changes: [
      { type: 'feat', description: '`@dependabot rebase` will rebase this PR' },
      { type: 'feat', description: '`@dependabot recreate` will recreate this PR, overwriting any edits that have been made to it' },
      { type: 'feat', description: '`@dependabot show <dependency name> ignore conditions` will show all of the ignore conditions of the specified dependency' },
      { type: 'feat', description: '`@dependabot ignore this major version` will close this PR and stop Dependabot creating any more for this major version (unless you reopen the PR or upgrade to it yourself)' },
      { type: 'feat', description: '`@dependabot ignore this minor version` will close this PR and stop Dependabot creating any more for this minor version (unless you reopen the PR or upgrade to it yourself)' },
      { type: 'feat', description: '`@dependabot ignore this dependency` will close this PR and stop Dependabot creating any more for this dependency (unless you reopen the PR or upgrade to it yourself)' },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'docs: update remaining KTR references in docs/ to DoneWell Audio' },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'rebrand: Kill The Ring → DoneWell Audio (complete)' },
    ],
  },
  {
    version: '0.187.1',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'audit: deep codebase audit — 15 fixes, 2 new test suites (+17 tests) (#187) (#187)' },
    ],
  },
  {
    version: '0.187.0',
    date: '2026-03-22',
    highlights: 'Deep codebase audit: 15 fixes across security, privacy, accessibility, code quality, and testing',
    changes: [
      { type: 'fix', description: 'Security: SSRF defense — invalid Supabase URL now throws at module load instead of silent log' },
      { type: 'fix', description: 'Security: Rate limit maps bounded to 10K entries with LRU eviction to prevent memory exhaustion DoS' },
      { type: 'fix', description: 'Security: Added `upgrade-insecure-requests` CSP directive' },
      { type: 'fix', description: 'Security: Environment variable validation warns on missing service key in production' },
      { type: 'fix', description: 'Security: Sanitized Supabase error logs (status + bytes only, no response body)' },
      { type: 'fix', description: 'Privacy: Consent model changed from opt-out to opt-in — collection requires explicit acceptance via dialog' },
      { type: 'fix', description: 'Privacy: DataConsentDialog re-enabled on first audio start for new users' },
      { type: 'fix', description: 'Accessibility: Advisory dismiss buttons increased to 44px minimum (WCAG AA touch target)' },
      { type: 'refactor', description: 'ML `predict()` method marked @deprecated — hot path correctly uses `predictCached()`' },
      { type: 'fix', description: 'Worker init guard: `processPeak` now checks initialization before accessing trackManager' },
      { type: 'refactor', description: 'PRESET_KEYS uses `as const satisfies` for compile-time type safety' },
      { type: 'feat', description: 'New test suite: consent state machine (12 tests) — opt-in model, version migration, state transitions' },
      { type: 'feat', description: 'New test suite: useDSPWorker verification (5 tests) — init guard, crash recovery, backpressure' },
    ],
  },
  {
    version: '0.186.0',
    date: '2026-03-22',
    changes: [
      { type: 'feat', description: 'Multi-stage development safeguards: risk assessment, scope tracking, build gate, pre-commit CIA enforcement, and CI backstop hooks' },
      { type: 'feat', description: 'Risk-First Planning section in CLAUDE.md requiring risk assessment before implementation' },
      { type: 'feat', description: 'CI workflow now warns on PRs missing Change Impact Audit markers' },
    ],
  },
  {
    version: '0.185.0',
    date: '2026-03-22',
    changes: [
      { type: 'fix', description: 'Deep audit: security, DSP, performance, and test coverage improvements' },
    ],
  },
  {
    version: '0.184.1',
    date: '2026-03-20',
    changes: [
      { type: 'ui', description: 'ui: adjust notch overlay opacity from 27% back to 42% (#184)' },
    ],
  },
  {
    version: '0.184.0',
    date: '2026-03-20',
    changes: [
      { type: 'ui', description: 'Adjust notch overlay opacity from 27% back to 42% — better balance of visibility and spectrum readability' },
    ],
  },
  {
    version: '0.183.0',
    date: '2026-03-20',
    changes: [
      { type: 'ui', description: 'Reduce notch overlay opacity from 42% to 27% for even better spectrum readability' },
    ],
  },
  {
    version: '0.182.0',
    date: '2026-03-20',
    changes: [
      { type: 'ui', description: 'Reduce notch overlay and marker line opacity from 60% to 42% — spectrum trace more readable beneath EQ cut zones' },
    ],
  },
  {
    version: '0.181.1',
    date: '2026-03-20',
    changes: [
      { type: 'fix', description: 'fix: deep audit part 2 — type safety, dead code, CSP, coverage, comb isolation (#181)' },
    ],
  },
  {
    version: '0.181.0',
    date: '2026-03-20',
    highlights: 'Deep audit part 2: type safety, dead code removal, CSP hardening, coverage expansion',
    changes: [
      { type: 'fix', description: 'Remove dead `advisoryReplaced` message type — no producer existed, handler was unreachable' },
      { type: 'fix', description: 'Reset canvas text state after frequency zone labels — prevents baseline/alignment bleed into subsequent draws' },
      { type: 'fix', description: 'Add exhaustive switch check in worker message handler — unhandled message types now caught at compile time' },
      { type: 'fix', description: 'ktrStorage now warns on save failure instead of silently swallowing — surfaces QuotaExceeded and serialization errors' },
      { type: 'refactor', description: 'Consolidate `Severity` → `SeverityLevel` with deprecated alias for backward compatibility' },
      { type: 'refactor', description: 'Tighten wire types: `string` → `SeverityLevel`/`ContentType`/`AlgorithmMode` on calibration and data collection interfaces' },
      { type: 'fix', description: 'Isolate CombStabilityTracker per track — module-level singleton caused cross-peak contamination of comb spacing history' },
      { type: 'fix', description: 'Fix test helper `makeTestAdvisory` — remove `as Advisory` cast, correct 6 mismatched field names to match actual interfaces' },
      { type: 'refactor', description: 'Expand vitest coverage config to include hooks, contexts, canvas, export, storage, calibration, and data modules' },
      { type: 'fix', description: 'Add `frame-ancestors \'none\'` to CSP — prevents clickjacking via iframe embedding' },
      { type: 'refactor', description: 'Convert 8 production `console.log` calls to `console.debug` — hidden by default in browser DevTools' },
    ],
  },
  {
    version: '0.180.0',
    date: '2026-03-20',
    highlights: 'Deep audit: 5 critical/important fixes from 4-agent code review',
    changes: [
      { type: 'fix', description: 'Activate low-frequency phase suppression — pass peakFrequencyHz to fusion, halving phase weight below 200 Hz to reduce sub-bass FPs' },
      { type: 'fix', description: 'Fix stale closure in FALSE+/CONFIRM callbacks — ref-ify fpIds, confirmedIds, advisories to send correct ML labels and eliminate ~50/s callback churn' },
      { type: 'fix', description: 'Patch Next.js 16.1.6 → 16.1.7 (HTTP request smuggling CVE)' },
      { type: 'fix', description: 'Harden ingest API: IP-based rate limiting (30/min primary gate), actual body size enforcement, stop leaking error messages in 500 responses' },
      { type: 'fix', description: 'Fix SnapshotCollector re-enable — always recreate with new sessionId/fftSize/sampleRate instead of resetting stale instance' },
    ],
  },
  {
    version: '0.179.0',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'Advisory merge threshold widened to 1000 cents (minor seventh) — wider problem zone consolidation for practical EQ recommendations' },
      { type: 'ui', description: 'Notch overlay fill and marker line opacity reduced to 60% for better spectrum visibility through problem zones' },
    ],
  },
  {
    version: '0.173.0',
    date: '2026-03-20',
    changes: [
      { type: 'ui', description: 'Notch overlay fill opacity increased to 70% for solid bar appearance (was 20%)' },
      { type: 'ui', description: 'Marker vertical line opacity increased to 75% (was 70%)' },
    ],
  },
  {
    version: '0.172.0',
    date: '2026-03-20',
    changes: [
      { type: 'ui', description: 'Notch overlays now render as a single solid severity-colored bar instead of two thin boundary lines with faint fill — theme-aware (20% dark, 25% light)' },
    ],
  },
  {
    version: '0.171.0',
    date: '2026-03-20',
    highlights: 'Stronger frequency zone bands, merged range highlight fills',
    changes: [
      { type: 'ui', description: 'Frequency zone bands (SUB, LOW MID, MID, PRESENCE, AIR) now theme-aware with stronger fills — 10-12% dark mode, 6-8% light mode (up from 4-6%)' },
      { type: 'ui', description: 'Zone separator lines and labels more visible (opacity 0.25, font 10px)' },
      { type: 'feat', description: 'Merged range labels now draw a severity-tinted highlight band across the full RTA height, marking the problem frequency region' },
    ],
  },
  {
    version: '0.170.0',
    date: '2026-03-20',
    highlights: 'RTA label overlap fix + nearby label range merging',
    changes: [
      { type: 'fix', description: 'RTA label pills no longer visually overlap — collision padding increased to account for full pill width (padding + border + shadow + gap)' },
      { type: 'feat', description: 'Nearby suppressed RTA labels merge into range pills (e.g. "820–950Hz" or "1.2–1.5kHz ×3") instead of being hidden' },
    ],
  },
  {
    version: '0.169.0',
    date: '2026-03-20',
    highlights: 'RTA label pill positioning fix, refined instrument-grade label styling',
    changes: [
      { type: 'fix', description: 'Fix RTA frequency label pill rendering above text — now uses actualBoundingBoxAscent/Descent for pixel-perfect text centering inside pill' },
      { type: 'ui', description: 'Refined frosted glass label styling: tighter padding, thinner accent strip (1.5px), higher accent opacity for precision instrument-panel feel' },
    ],
  },
  {
    version: '0.167.1',
    date: '2026-03-20',
    changes: [
      { type: 'fix', description: 'chore: bump v0.167.0, changelog, GuideTab, CLAUDE.md (#168)' },
    ],
  },
  {
    version: '0.167.0',
    date: '2026-03-20',
    highlights: 'Pro audio RTA labels, cluster-aware Q, notch overlays, PEQ card details',
    changes: [
      { type: 'ui', description: 'RTA frequency labels now render as FabFilter-inspired frosted glass callout badges with severity-tinted borders and LED accent strips' },
      { type: 'ui', description: 'Full light/dark mode support for RTA labels — frosted white glass in light mode with stronger border opacity' },
      { type: 'feat', description: 'PEQ details toggle in Display settings — show recommended parametric EQ cut (type, freq, Q, gain) on each issue card' },
      { type: 'feat', description: 'Notch-width overlay on RTA shows the frequency span covered by each advisory\'s EQ cut' },
      { type: 'feat', description: 'Cluster-aware Q widening — merged advisories automatically widen PEQ Q to cover the full cluster span with 1.5× margin' },
      { type: 'feat', description: 'Auto-Detect Room UI wired up via EngineContext — measure button, progress bar, and Apply to Room Settings flow' },
    ],
  },
  {
    version: '0.164.2',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'feat: PEQ details toggle + RTA label readability fix (#166)' },
    ],
  },
  {
    version: '0.164.1',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'feat: notch-width overlay on RTA for advisory markers (#165)' },
    ],
  },
  {
    version: '0.164.0',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'When multiple nearby feedback peaks merge into one advisory, the PEQ Q is now **widened to cover the full cluster span** with 1.5× margin' },
      { type: 'feat', description: 'Adds `clusterAwareQ()` function: `coverageQ = centerHz / (span × 1.5)`, picks the wider (lower Q) of severity-based vs cluster-based' },
      { type: 'feat', description: 'Tracks `clusterMinHz`/`clusterMaxHz` on Advisory through both merge paths (absorption + supersede)' },
      { type: 'feat', description: 'Cluster tooltip now shows frequency range: "3 peaks merged (820–850 Hz)"' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — 0 errors' },
      { type: 'feat', description: '[x] `pnpm test` — 511 pass (7 new), 4 skip, 1 todo' },
      { type: 'feat', description: '[ ] Visual: generate clustered detections → verify advisory shows widened Q and range tooltip' },
    ],
  },
  {
    version: '0.162.2',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'feat: cluster-aware Q widening for merged advisories (#164)' },
    ],
  },
  {
    version: '0.162.1',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'feat: wire up Auto-Detect Room UI via EngineContext (#163)' },
    ],
  },
  {
    version: '0.162.0',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'Adds inverse eigenvalue solver that estimates room dimensions (L×W×H) from detected resonance frequencies at high sensitivity' },
      { type: 'feat', description: 'Density-weighted harmonic series extraction prevents spurious "super-series" from absorbing multiple axes' },
      { type: 'feat', description: 'Worker accumulates stable low-frequency peaks during measurement, then runs solver with forward validation' },
      { type: 'feat', description: '"Auto-Detect Room" UI section in Room settings with progress bar, confidence meter, and "Apply to Room Settings" button' },
      { type: 'feat', description: '13 new unit tests (504 total passing)' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — clean' },
      { type: 'feat', description: '[x] `pnpm test` — 504 pass, 4 skip, 1 todo' },
      { type: 'feat', description: '[ ] Manual: run KTR in ringOut mode, click "Measure Room" in Room settings, verify dimension estimates appear' },
      { type: 'feat', description: '[ ] Manual: click "Apply to Room Settings" and verify dimensions populate the input fields' },
    ],
  },
  {
    version: '0.161.0',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'Add 11 ML columns to `spectral_snapshots` table (algo scores, fused probability/confidence, user feedback, model version, schema version)' },
      { type: 'feat', description: 'Update Supabase Edge Function to persist v1.1/1.2 batch data with algorithm scores and user feedback labels' },
      { type: 'feat', description: 'Add Supabase env vars to `.env.example`' },
      { type: 'feat', description: 'FALSE+/CONFIRM labels from advisory cards now flow end-to-end to Supabase' },
      { type: 'feat', description: 'Algorithm scores (MSD, phase, spectral, comb, IHR, PTMR) stored alongside each snapshot' },
      { type: 'feat', description: '`scripts/ml/export_training_data.py` can now pull labeled training data' },
      { type: 'feat', description: 'Weekly ML training workflow can produce improved ONNX models' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` passes' },
      { type: 'feat', description: '[x] `pnpm test` — 491 pass, 4 skip, 1 todo' },
      { type: 'feat', description: '[x] Migration applied to Supabase (table verified with 26 columns)' },
      { type: 'feat', description: '[x] Edge Function deployed (version 5, ACTIVE)' },
      { type: 'feat', description: '[ ] End-to-end: trigger detection → click FALSE+ → verify row in Supabase dashboard' },
    ],
  },
  {
    version: '0.160.1',
    date: '2026-03-20',
    changes: [
      { type: 'feat', description: 'feat: mains hum gate (6th gate) + document suite (#160)' },
    ],
  },
  {
    version: '0.160.0',
    date: '2026-03-20',
    highlights: 'Mains hum gate (6th multiplicative gate) + document suite',
    changes: [
      { type: 'feat', description: '**Mains hum gate** — 6th multiplicative gate suppresses HVAC/electrical equipment false positives (×0.40 when peak on 50n/60n Hz series + 2 corroborating peaks + phase coherence > 0.70)' },
      { type: 'feat', description: 'Auto-detects 50 Hz (EU/Asia) vs 60 Hz (NA) mains frequency from active peak pattern — no user config needed' },
      { type: 'feat', description: 'Multi-condition activation: frequency match + corroborating harmonics + AC phase lock — single peaks at 120 Hz won\'t trigger' },
      { type: 'feat', description: 'Stacks with IHR gate for rich-harmonic mains hum: combined 0.40 × 0.65 = 0.26 probability' },
      { type: 'feat', description: '**Document suite**: scientific pitch deck, investor pitch deck, executive brief, conference poster, AES paper, whitepaper, provisional patent, internal reference' },
      { type: 'feat', description: '7 new classifier tests for mains hum gate (496 total tests)' },
    ],
  },
  {
    version: '0.159.1',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'Merge branch \'main\' of https://github.com/donwellsav/killthering' },
    ],
  },
  {
    version: '0.159.0',
    date: '2026-03-19',
    changes: [
      { type: 'feat', description: '**14 UI/UX improvements** across 3 phases (quick wins, medium effort, larger features)' },
      { type: 'feat', description: '**2 RTA placeholder PNGs** (A-weighted, dark amber + light blue, 2560×1280 retina)' },
      { type: 'feat', description: 'Targets live-performance workflow: touch targets, discoverability, cognitive load, accessibility' },
      { type: 'feat', description: 'Larger advisory card button touch targets (WCAG-compliant sizing)' },
      { type: 'feat', description: 'Per-card dismiss (X) button on desktop' },
      { type: 'feat', description: 'Enhanced threshold line drag affordance (larger handle + glow hint)' },
      { type: 'feat', description: 'Haptic feedback on mobile swipe gestures' },
      { type: 'feat', description: 'Font size clamp fix (22px → 18px max)' },
      { type: 'feat', description: 'Swipe gesture onboarding tooltip (first-time, auto-dismiss)' },
      { type: 'feat', description: 'Distinct fullscreen icons (App=Maximize2, RTA=Expand/Shrink)' },
      { type: 'feat', description: 'Advisory card freshness indicator bar (visual age decay)' },
      { type: 'feat', description: 'aria-live region for screen reader feedback announcements' },
      { type: 'feat', description: 'Settings progressive disclosure (Simple 3-control vs full Advanced)' },
      { type: 'feat', description: 'Mobile card button 2×2 grid layout (FALSE+|X / CONFIRM|COPY)' },
      { type: 'feat', description: 'Header overflow menu for mobile (⋮ dropdown)' },
      { type: 'feat', description: 'Keyboard shortcuts modal (? key) + Replay Tutorial' },
      { type: 'feat', description: 'GEQ empty state text + responsive fader width' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — 0 errors' },
      { type: 'feat', description: '[x] `pnpm test` — 483 passed, 4 skipped, 1 todo' },
      { type: 'feat', description: '[ ] Visual verification at 375px, 768px, 1440px' },
      { type: 'feat', description: '[ ] Dark + light theme check' },
      { type: 'feat', description: '[ ] Mobile swipe gesture testing' },
      { type: 'feat', description: '[ ] Keyboard shortcut modal (? key)' },
    ],
  },
  {
    version: '0.158.0',
    date: '2026-03-19',
    changes: [
      { type: 'feat', description: '**Tablet portrait layout** — iPads/tablets (600-1024px) in portrait now show touch-friendly MobileLayout instead of cramped 3-panel DesktopLayout. Tablets in landscape still get full DesktopLayout.' },
      { type: 'feat', description: '**SpectrumCanvas deps fix** — `showFreqZones` and `spectrumWarmMode` were missing from render callback and dirty-flag deps. Toggling these settings now takes effect immediately.' },
      { type: 'feat', description: '**Advisory identity optimization** — skip `setAdvisories()` when severity, confidence, and amplitude are unchanged, reducing unnecessary React reconciliation from ~50fps to only on actual changes.' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — clean' },
      { type: 'feat', description: '[x] `pnpm test` — 483 passed, 4 skipped, 1 todo' },
      { type: 'feat', description: '[x] Preview at 768x1024 (tablet portrait) — MobileLayout shown' },
      { type: 'feat', description: '[x] Preview at 1280x800 (desktop) — DesktopLayout unchanged' },
      { type: 'feat', description: '[x] Preview at 375x812 (mobile) — MobileLayout unchanged' },
      { type: 'feat', description: '[x] Zero console errors' },
    ],
  },
  {
    version: '0.158.1',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'v0.158.0: tablet portrait layout, canvas deps fix, advisory perf (#158)' },
    ],
  },
  {
    version: '0.158.0',
    date: '2026-03-19',
    highlights: 'Tablet layout, canvas fixes, advisory perf',
    changes: [
      { type: 'fix', description: 'SpectrumCanvas missing deps — freq zones and warm mode toggle now take effect immediately instead of requiring another event to trigger redraw' },
      { type: 'perf', description: 'Advisory array identity stabilization — skip re-renders when severity/confidence/amplitude unchanged, reducing React reconciliation from ~50fps to only on actual changes' },
      { type: 'ui', description: 'Tablet portrait layout — iPads and tablets (600-1024px) in portrait now show touch-friendly MobileLayout instead of cramped 3-panel DesktopLayout' },
    ],
  },
  {
    version: '0.157.0',
    date: '2026-03-19',
    changes: [
      { type: 'feat', description: '**Rate limit map pruning** — expired entries cleaned up when map exceeds 1000 entries' },
      { type: 'feat', description: '**Error sanitization** — 502 responses no longer expose Supabase error text to clients' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — clean' },
      { type: 'feat', description: '[x] `pnpm test` — 483 passed, 4 skipped, 1 todo' },
    ],
  },
  {
    version: '0.156.1',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'v0.156.0: architecture audit — diagnostics, breadcrumbs, worker tests (#156)' },
    ],
  },
  {
    version: '0.156.0',
    date: '2026-03-19',
    highlights: 'Architecture audit: diagnostics, Sentry breadcrumbs, worker tests',
    changes: [
      { type: 'fix', description: 'Worker error messages now include peak frequency and bin index for faster crash diagnosis' },
      { type: 'feat', description: 'Sentry breadcrumbs at worker init, ready, and crash events — gives crash reports a timeline of what happened before the error' },
      { type: 'feat', description: 'Worker message type contract tests (12 tests) — validates WorkerOutboundMessage type safety and error format' },
    ],
  },
  {
    version: '0.155.0',
    date: '2026-03-19',
    highlights: 'Canvas polish, light mode severity fix, header icon grouping',
    changes: [
      { type: 'ui', description: 'RTA idle state shows frequency zone labels (SUB, LOW MID, MID, PRESENCE, AIR) with separator lines and more visible placeholder curve' },
      { type: 'fix', description: 'Light mode severity colors — darker tones for WCAG AA contrast (yellow-700, orange-600, etc.) replace unreadable bright colors on light backgrounds' },
      { type: 'ui', description: 'Header icons grouped by function — primary actions (mic, fullscreen, trash) separated from utility (theme, history, help) with thin vertical divider' },
      { type: 'ui', description: 'Theme toggle icon bumped to consistent size (w-5 h-5) matching other header icons' },
    ],
  },
  {
    version: '0.154.0',
    date: '2026-03-19',
    changes: [
      { type: 'feat', description: '**Git Workflow** — fetch before reporting state, never push without permission, no force-push' },
      { type: 'feat', description: '**Version Release Checklist** — standardized "update the usuals" steps' },
      { type: 'feat', description: '**Deployment** — post-deploy verification, hotfix protocol' },
      { type: 'feat', description: '**Testing / Validation** — tsc before commit, visual verify canvas changes' },
      { type: 'feat', description: '[x] Documentation only — no code changes' },
      { type: 'feat', description: '[x] Section order verified (logical flow)' },
      { type: 'feat', description: '[x] No duplicate rules with existing sections' },
    ],
  },
  {
    version: '0.153.1',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'v0.153.0: context prompt, CLAUDE.md accuracy fixes (#153)' },
    ],
  },
  {
    version: '0.153.0',
    date: '2026-03-19',
    highlights: 'Context prompt, CLAUDE.md accuracy fixes',
    changes: [
      { type: 'feat', description: 'World-class context prompt (docs/CONTEXT_PROMPT.md) — copy-paste into any new AI session for full project context, built from deep code audit' },
      { type: 'fix', description: 'CLAUDE.md fusion weights corrected — added ML column (0.10), fixed all per-mode values to match actual algorithmFusion.ts code' },
      { type: 'fix', description: 'CLAUDE.md project structure corrected — removed nonexistent useSwipeGesture.ts and useOnlineStatus.ts, fixed hooks count from 13 to 11' },
    ],
  },
  {
    version: '0.152.0',
    date: '2026-03-19',
    changes: [
      { type: 'feat', description: '**Architecture Audit Report** — thread model, context providers, memory management, security, performance, type safety. 3 critical, 3 medium, 6 low findings.' },
      { type: 'feat', description: '**Bug Bible** — 50 bugs cataloged across 8 subsystems (DSP, content type, fusion, EQ, auto-gain, worker, UI, security)' },
      { type: 'feat', description: '**Known Issues** — open accessibility gaps, skipped tests, feature roadmap, 8 prioritized fix recommendations with effort estimates' },
      { type: 'feat', description: '**PDF** — combined professional document with tables and color coding' },
      { type: 'feat', description: '**PDF generator** — `scripts/generate_audit_pdf.py` for regeneration' },
    ],
  },
  {
    version: '0.149.3',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'v0.151.0: sensitivity guidance, default tuning, onnx warning fix (#151)' },
    ],
  },
  {
    version: '0.151.0',
    date: '2026-03-19',
    highlights: 'Sensitivity guidance, default tuning, onnx warning fix',
    changes: [
      { type: 'fix', description: 'Suppressed onnxruntime-web Turbopack warning via webpackIgnore magic comment' },
      { type: 'fix', description: 'Speech + Ring-out default sensitivity changed to 27dB — reduces HVAC/ambient false positives' },
      { type: 'ui', description: 'Three-layer sensitivity guidance: tooltip on slider, "Drag to adjust" hint on RTA threshold (one-time), idle text below start buttons' },
    ],
  },
  {
    version: '0.149.2',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'v0.150.0: suppress onnxruntime-web warning, ring-out max sensitivity (#150)' },
    ],
  },
  {
    version: '0.150.0',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'Suppressed onnxruntime-web Turbopack warning via webpackIgnore magic comment — no more noisy build output' },
      { type: 'fix', description: 'Ring-out mode default sensitivity reduced to 2dB (maximum sensitivity) for catching every resonance during calibration' },
    ],
  },
  {
    version: '0.149.1',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'v0.149.0: fix mobile graph resize handle (#149)' },
    ],
  },
  {
    version: '0.149.0',
    date: '2026-03-19',
    changes: [
      { type: 'fix', description: 'Mobile graph resize handle now works — larger touch target (py-3), removed passive preventDefault conflict, default height increased to 18vh' },
    ],
  },
  {
    version: '0.148.0',
    date: '2026-03-19',
    highlights: 'Mobile inline graphs, resizable, swipe gestures rework, fullscreen fixes',
    changes: [
      { type: 'feat', description: 'Mobile inline graphs — compact RTA/GEQ above issue cards (~12vh default). Swipe horizontally on graph to switch between RTA and GEQ.' },
      { type: 'feat', description: 'Resizable graph — drag handle between graph and cards. Pull down to expand (up to 40vh), push up to shrink (min 8vh).' },
      { type: 'feat', description: 'Graph fullscreen overlay — tap fullscreen icon on inline graph to show both RTA + GEQ stacked full-viewport.' },
      { type: 'ui', description: 'Mobile simplified to 2 tabs (Issues + Settings). Graph tab removed — graphs now inline.' },
      { type: 'ui', description: 'Full EQ names on desktop — "Real-Time Analyzer" and "Graphic Equalizer" shown when panel width allows.' },
      { type: 'fix', description: 'Fullscreen icons separated — header button toggles app fullscreen, RTA panel button toggles RTA fullscreen.' },
      { type: 'fix', description: 'Mobile tab swipe disabled on Issues tab — prevents conflict with card swipe-to-label.' },
      { type: 'fix', description: 'Swipe actions reworked — left = dismiss, right = confirm, long-press (500ms) = false positive.' },
    ],
  },
  {
    version: '0.147.0',
    date: '2026-03-19',
    highlights: 'Ring-Out Wizard, dual entry point UX',
    changes: [
      { type: 'feat', description: 'Ring-Out guided wizard — step-by-step feedback notching with EQ recommendations, session tracking, and export' },
      { type: 'ui', description: 'Dual entry point — "Press to Start Analysis" and "Ring Out Room" buttons on idle screen. Ring Out auto-switches mode and launches wizard.' },
      { type: 'ui', description: 'Simplified start button — logo + two-line "Press to Start / Analysis" text, removed redundant "Kill The Ring" label' },
    ],
  },
  {
    version: '0.146.0',
    date: '2026-03-19',
    highlights: 'Dark/Light theme toggle',
    changes: [
      { type: 'feat', description: 'Dark/Light theme toggle — Sun/Moon icon in header. Persists via localStorage. Defaults to dark.' },
      { type: 'ui', description: 'Full theme support across all canvases (RTA, GEQ, fader meter), sidebars, cards, and header' },
      { type: 'ui', description: 'Light mode glass cards with white background, blue border, subtle shadow' },
      { type: 'fix', description: 'Spectrum line forces blue in light mode — amber warm mode hard to read on light backgrounds' },
      { type: 'fix', description: 'Canvas theme uses refs for RAF loop reads — prevents stale closure on theme switch' },
    ],
  },
  {
    version: '0.145.0',
    date: '2026-03-18',
    highlights: 'Temporal envelope content type detection',
    changes: [
      { type: 'feat', description: 'Temporal envelope analysis for speech/music classification — uses energy variance and silence gap ratio from a 1-second ring buffer (50 frames at 50fps)' },
      { type: 'fix', description: 'Content type classifier now weights temporal features at 40% when available, with spectral features scaling to 60%. Speech silence gaps and music continuous energy are the strongest discriminators.' },
    ],
  },
  {
    version: '0.144.0',
    date: '2026-03-19',
    changes: [
      { type: 'feat', description: 'Draggable sensitivity threshold on RTA, compact start area, header icon hierarchy, GEQ ghost bars, resolved badge removed, tighter algorithm scores padding' },
    ],
  },
  {
    version: '0.143.1',
    date: '2026-03-18',
    changes: [
      { type: 'fix', description: 'v0.143.0: tighter algorithm scores padding on issue cards (#143)' },
    ],
  },
  {
    version: '0.143.0',
    date: '2026-03-18',
    changes: [
      { type: 'ui', description: 'Tighter algorithm scores padding on issue cards — reduced gap and line-height for compact debug display' },
    ],
  },
  {
    version: '0.142.0',
    date: '2026-03-18',
    highlights: 'Draggable threshold, compact start area, header hierarchy, GEQ ghost bars',
    changes: [
      { type: 'feat', description: 'Draggable sensitivity threshold on RTA — drag the dashed line up/down to adjust detection sensitivity directly on the spectrum' },
      { type: 'ui', description: 'Threshold grab handle — visible 8×28px rounded rect with drag-affordance notches on the right side of the threshold line' },
      { type: 'ui', description: 'Compact start button area — logo 80px (was 144px), shorter text, less dead space in issues panel' },
      { type: 'ui', description: 'Monitoring standby shows animated scanning sweep line instead of static text' },
      { type: 'ui', description: 'Header icon hierarchy — mic selector larger+brighter, active-state icons get blue pill background, Clear All shows red notification dot' },
      { type: 'ui', description: 'Thin separator before Help/History icons in header for visual grouping' },
      { type: 'ui', description: 'GEQ ghost bars — breathing opacity animation on inactive bands, indicates "waiting for data" instead of empty void' },
      { type: 'ui', description: 'Removed redundant "Resolved" text badge from issue cards — dimmed styling already communicates resolved state' },
    ],
  },
  {
    version: '0.140.0',
    date: '2026-03-18',
    highlights: 'UI overhaul: frosted glass, amber spectrum, audio-reactive logo, freq zones',
    changes: [
      { type: 'ui', description: 'Frosted glass issue cards with backdrop blur and translucent backgrounds' },
      { type: 'ui', description: 'Button hover glow + press scale on all header icons and card actions' },
      { type: 'ui', description: 'Issue card entrance animation — slide-in from left with brief blue pulse' },
      { type: 'ui', description: 'Severity pill badges with colored dot indicators replace plain text badges' },
      { type: 'feat', description: 'KTR logo equalizer bars respond to actual audio input level in real time' },
      { type: 'feat', description: 'Frequency zone overlay on RTA — labeled Sub/Voice/Presence/Air bands (Display settings toggle)' },
      { type: 'feat', description: 'Warm amber spectrum mode — default on, toggle in Display settings' },
      { type: 'ui', description: 'Issues panel subtle blue left accent border for visual hierarchy' },
      { type: 'ui', description: 'Default spectrum line width reduced to 0.5px, canvas FPS default 15 for better device compatibility' },
    ],
  },
  {
    version: '0.139.0',
    date: '2026-03-18',
    highlights: 'KTR brand logo, settings persistence, algorithm scores debug',
    changes: [
      { type: 'ui', description: 'KTR frequency analyzer logo replaces generic speaker icon in header and Start Analysis button' },
      { type: 'feat', description: 'Settings auto-persist across page refreshes — all settings saved to localStorage on every change' },
      { type: 'feat', description: 'Algorithm scores debug display — toggle in Display settings shows MSD/Phase/Spectral/Comb/IHR/PTMR/ML scores on each issue card' },
      { type: 'ui', description: 'Mobile layout always enables swipe-to-label — Display settings toggle only affects desktop/tablet' },
      { type: 'ui', description: 'Start Analysis button text updated to "Press Here To Start Analysis"' },
    ],
  },
  {
    version: '0.136.0',
    date: '2026-03-18',
    highlights: 'Swipe-to-label, content type fix',
    changes: [
      { type: 'feat', description: 'Swipe-to-label on issue cards — swipe left for FALSE+, right for CONFIRM. Enable in Display settings. Works on any touchscreen.' },
      { type: 'fix', description: 'Content type classifier rewritten — removed unreliable single-feature gates, uses 4-feature scoring (centroid, rolloff, flatness, crest factor) with temporal smoothing' },
      { type: 'fix', description: 'Content type no longer stuck on "unknown" for speech — detection runs on main thread every 500ms regardless of peak detection' },
      { type: 'fix', description: 'Content type display priority: main-thread classification (runs every 500ms) now takes priority over worker per-peak classification' },
      { type: 'ui', description: 'Removed Quick/Full controls toggle — accordion sections make it redundant. Sensitivity & Range open by default, rest closed.' },
    ],
  },
  {
    version: '0.134.0',
    date: '2026-03-17',
    highlights: 'MSD status, content type detection, unified settings',
    changes: [
      { type: 'fix', description: 'MSD buffer status now displays correctly — uses analysis call count as readiness proxy instead of unreliable pool frame count' },
      { type: 'fix', description: 'Content type (SPEECH / MUSIC / COMP) now reaches the UI — worker piggybacks status on tracksUpdate message' },
      { type: 'fix', description: 'Speech no longer misclassified as music — crest factor check (speech) now evaluated before spectral flatness (music)' },
      { type: 'feat', description: 'Unified settings sidebar with icon sub-tabs (Detect, Display, Room, Advanced, Calibrate) and accordion sections' },
      { type: 'ui', description: 'Issue card buttons streamlined — FALSE+ promoted to top row beside Copy, CONFIRM beneath, dismiss removed' },
      { type: 'ui', description: 'Fader mode toggle switched to vertical stacking for better touch targets' },
    ],
  },
  {
    version: '0.129.0',
    date: '2026-03-17',
    highlights: 'Defensive hardening from code audit',
    changes: [
      { type: 'fix', description: 'Animation frame loop now survives callback errors — try-catch prevents silent rAF death' },
      { type: 'fix', description: 'Preset storage load/save wrapped in try-catch — graceful degradation on localStorage quota exceeded' },
      { type: 'fix', description: 'ResizeObserver callback in SpectrumCanvas wrapped in try-catch — prevents resize errors from breaking canvas' },
      { type: 'refactor', description: 'HelpSection component wrapped with memo() — all 38/38 domain components now memoized' },
      { type: 'refactor', description: 'Worker message handler default case added — dev-mode warning for unrecognized message types' },
    ],
  },
  {
    version: '0.128.0',
    date: '2026-03-17',
    highlights: 'ML pipeline + CSP hydration fix',
    changes: [
      { type: 'feat', description: 'ML false positive filter as 7th fusion algorithm — ONNX Runtime Web inference in Web Worker with 11-input meta-model' },
      { type: 'feat', description: 'Bootstrap ONNX model (929 params) encoding existing gate logic (IHR, PTMR, formant, chromatic, comb stability)' },
      { type: 'feat', description: 'CONFIRM feedback button on advisory cards — symmetric labeling for balanced ML training data' },
      { type: 'feat', description: 'Cloud training pipeline: Supabase schema, export script, numpy-only trainer, GitHub Actions workflow' },
      { type: 'fix', description: 'CSP nonce hydration mismatch — add suppressHydrationWarning to body element, remove unused headers() import' },
    ],
  },
  {
    version: '0.127.0',
    date: '2026-03-17',
    highlights: 'Security scanning in CI — pnpm audit + Dependabot',
    changes: [
      { type: 'fix', description: 'Bug #8: Add pnpm audit --prod --audit-level=high to CI — fails build on high/critical CVEs in production dependencies' },
      { type: 'feat', description: 'Add .github/dependabot.yml — weekly grouped npm update PRs (prod + dev), monthly GitHub Actions version bumps' },
    ],
  },
  {
    version: '0.126.0',
    date: '2026-03-17',
    highlights: 'Nonce-based CSP — replace unsafe-inline with per-request nonces',
    changes: [
      { type: 'fix', description: 'Bug #7: Replace unsafe-inline in script-src CSP with per-request nonce via middleware.ts' },
      { type: 'feat', description: 'New middleware.ts generates random nonce per request, sets strict-dynamic for lazy chunk trust' },
      { type: 'refactor', description: 'CSP moved from static next.config.mjs headers to dynamic middleware — other security headers remain static' },
    ],
  },
  {
    version: '0.125.0',
    date: '2026-03-17',
    highlights: 'Tablet responsive breakpoint — portrait tablets get desktop layout',
    changes: [
      { type: 'fix', description: 'Bug #6: Wire tablet: Tailwind v4 prefix (600px) to MobileLayout, DesktopLayout, and HeaderBar' },
      { type: 'ui', description: 'Portrait tablets (≥600px) now see desktop 3-panel layout instead of phone carousel' },
      { type: 'fix', description: 'useIsMobile() threshold lowered 768→600 so tablets skip smartphone MEMS mic calibration' },
    ],
  },
  {
    version: '0.124.0',
    date: '2026-03-16',
    highlights: 'Split HelpMenu.tsx (991 lines) into thin orchestrator + 5 tab files',
    changes: [
      { type: 'refactor', description: 'Bug #5: Split HelpMenu.tsx into ~90-line orchestrator + help/ subdirectory (6 files), mirroring settings/ pattern' },
      { type: 'refactor', description: 'New help/ files: HelpShared, GuideTab, ModesTab, AlgorithmsTab, ReferenceTab, AboutTab — all memo()-wrapped' },
    ],
  },
  {
    version: '0.123.0',
    date: '2026-03-16',
    highlights: 'Shelf overlap validation — HPF + lowShelf no longer double-dip',
    changes: [
      { type: 'fix', description: 'Bug #4: Add validateShelves() post-processor — dedup by type, HPF < lowShelf sanity check, cap at 3' },
      { type: 'fix', description: 'HPF-active raises mud threshold +2 dB to prevent overlap in 80–300 Hz region' },
      { type: 'perf', description: 'Cross-advisory shelf dedup: shelves computed once per analysis frame in worker, shared across all peaks' },
    ],
  },
  {
    version: '0.122.0',
    date: '2026-03-16',
    highlights: 'Split god-context (28 fields) into 4 focused contexts',
    changes: [
      { type: 'refactor', description: 'Bug #3: Split AudioAnalyzerContext into EngineContext (11), SettingsContext (5), MeteringContext (10), DetectionContext (3)' },
      { type: 'perf', description: 'Re-render savings — HeaderBar, AdvisoryContext, UIContext no longer re-render on metering updates (~4/sec eliminated per component)' },
      { type: 'feat', description: 'New hooks: useEngine(), useSettings(), useMetering(), useDetection() — consumers subscribe only to needed data' },
    ],
  },
  {
    version: '0.121.0',
    date: '2026-03-16',
    highlights: 'Decompose analyze() from ~420 lines to ~45-line pipeline',
    changes: [
      { type: 'refactor', description: 'Bug #2: Extract 4 private methods from analyze() — _measureSignalAndApplyGain, _buildPowerSpectrum, _scanAndProcessPeaks, _registerPeak' },
    ],
  },
  {
    version: '0.119.0',
    date: '2026-03-16',
    highlights: '62 new tests for hooks, contexts, storage, exports',
    changes: [
      { type: 'feat', description: 'Bug #1: Add 62 tests across 10 previously untested modules — useAdvisoryMap, useFpsMonitor, useAdvisoryLogging, useIsMobile, AdvisoryContext, UIContext, ktrStorage, exportTxt, exportPdf, downloadFile' },
      { type: 'feat', description: 'Total: 435 tests (431 pass, 4 skip, 1 todo) across 25 suites' },
    ],
  },
  {
    version: '0.117.0',
    date: '2026-03-16',
    highlights: 'UI overhaul — simplified cards, RTA fullscreen, landscape mobile, MEMS auto-calibration',
    changes: [
      { type: 'ui', description: 'Issue cards simplified — GEQ removed (PEQ only), compact buttons with larger icons, 3s minimum display stability' },
      { type: 'feat', description: 'RTA fullscreen via element-level Fullscreen API — works on mobile and desktop' },
      { type: 'ui', description: 'Landscape mobile layout — 40/55/5 (Issues/Graph/Controls) split; bottom tab bar removed in landscape' },
      { type: 'feat', description: 'Auto MEMS calibration — smartphone mic profile auto-applied on mobile devices' },
      { type: 'ui', description: 'Permanent Clear All button in header — clears advisories, GEQ bars, and RTA markers in one click' },
      { type: 'feat', description: 'FALSE+ button repositioned to own row beneath Copy/Dismiss for better visual hierarchy' },
      { type: 'feat', description: 'RTA label overlap suppression — greedy algorithm prioritizes highest-severity labels' },
    ],
  },
  {
    version: '0.106.0',
    date: '2026-03-15',
    highlights: 'ML data pipeline — algorithm score enrichment + ground truth labeling',
    changes: [
      { type: 'feat', description: 'Snapshot enrichment with all 6 algorithm scores (MSD, phase, spectral, comb, IHR, PTMR) plus fused probability and confidence (v1.1 schema)' },
      { type: 'feat', description: 'Always-on FALSE+ button on every advisory card — user feedback flows to worker for ground truth labeling' },
      { type: 'feat', description: 'Ingest API v1.1 — accepts optional algorithmScores and userFeedback fields' },
    ],
  },
  {
    version: '0.105.0',
    date: '2026-03-15',
    highlights: '12 bug fixes + 3 false positive gates (formant, chromatic, comb stability)',
    changes: [
      { type: 'fix', description: 'Auto-gain EMA coefficients stale in updateConfig() — recompute called from both start() and updateConfig()' },
      { type: 'fix', description: 'Confidence formula floors at 0.5 — changed to prob * (0.5 + 0.5 * agreement), UNCERTAIN now reachable' },
      { type: 'fix', description: 'Post-override normalization undoes RUNAWAY — normalization before overrides, overrides are final' },
      { type: 'fix', description: 'Comb weight doubling dilutes others — doubled weight in numerator only, base weight in denominator' },
      { type: 'feat', description: 'Formant gate: pFeedback *= 0.65 when 2+ vocal formant bands active + Q 3–20 (sustained vowel FP mitigation)' },
      { type: 'feat', description: 'Chromatic quantization gate: phase boost *= 0.60 when on 12-TET grid ±5 cents (Auto-Tune FP mitigation)' },
      { type: 'feat', description: 'Comb stability tracker: comb confidence *= 0.25 when spacing CV > 0.05 over 16 frames (flanger/phaser FP mitigation)' },
      { type: 'feat', description: 'Worker crash recovery — auto-restart with 500ms debounce, max 3 retries, Sentry logging' },
      { type: 'fix', description: 'SpectrumCanvas missing devicePixelRatio — full DPR scaling for Retina displays' },
      { type: 'fix', description: 'ms-based persistence thresholds replace frame-count-based (FUTURE-002)' },
    ],
  },
  {
    version: '0.103.0',
    date: '2026-03-14',
    highlights: 'Storage abstraction, dbx RTA-M calibration, algorithm consolidation',
    changes: [
      { type: 'feat', description: 'Typed localStorage abstraction (ktrStorage.ts) — typedStorage, stringStorage, flagStorage APIs' },
      { type: 'feat', description: 'dbx RTA-M measurement mic calibration profile' },
      { type: 'refactor', description: 'Remove legacy existing weight, consolidate to 6 detection algorithms' },
    ],
  },
  {
    version: '0.98.0',
    date: '2026-03-15',
    highlights: 'MSD consolidation — single source of truth, 16× worker memory reduction',
    changes: [
      { type: 'refactor', description: 'Consolidate dual MSD implementations into single MSDPool class — eliminates divergence risk between feedbackDetector.ts and msdAnalysis.ts (P2 bug #9)' },
      { type: 'perf', description: 'Worker MSD memory reduced from 1MB (dense 4096-bin buffer) to 64KB (256-slot sparse pool with LRU eviction)' },
      { type: 'refactor', description: 'Remove ~180 lines of inline MSD code from feedbackDetector.ts — replaced by thin wrapper over MSDPool' },
      { type: 'feat', description: 'Add 35 new MSD tests: 28 MSDPool unit tests + 7 cross-validation tests proving numerical equivalence with deprecated MSDHistoryBuffer' },
    ],
  },
  {
    version: '0.97.0',
    date: '2026-03-15',
    highlights: 'Smartphone mic calibration, autoresearch framework',
    changes: [
      { type: 'feat', description: 'Add Smartphone (Generic MEMS) mic calibration profile — compensates −12 dB LF roll-off and +3.8 dB presence peak typical of all smartphone MEMS microphones' },
      { type: 'feat', description: 'Add autoresearch framework for autonomous DSP fusion weight optimization (scenarios, evaluator, program loop)' },
    ],
  },
  {
    version: '0.96.0',
    date: '2026-03-14',
    highlights: 'Documentation overhaul, remove legacy existing weight from fusion',
    changes: [
      { type: 'refactor', description: 'Remove legacy `existing` weight from algorithm fusion — redistribute to IHR and PTMR' },
      { type: 'fix', description: 'Consolidate from 7 to 6 detection algorithms — merge Compression Detection into Spectral Flatness' },
      { type: 'fix', description: 'Update fusion weight tables in HelpMenu and README to match current code' },
      { type: 'fix', description: 'CLAUDE.md: comprehensive rewrite with audio pipeline, known bugs, performance constraints' },
      { type: 'fix', description: 'BEGINNER-GUIDE: add test suite instructions (335 tests)' },
    ],
  },
  {
    version: '0.95.0',
    date: '2026-03-13',
    highlights: 'Sentry error reporting, dead code cleanup, repo rename, docs refresh',
    changes: [
      { type: 'feat', description: 'Add Sentry error reporting — browser, server, and edge runtime integration with source maps' },
      { type: 'feat', description: 'Add `ErrorBoundary` Sentry capture and DSP worker crash reporting' },
      { type: 'refactor', description: 'Delete 14 unused UI components and `@radix-ui/react-separator` (20 UI components remain)' },
      { type: 'refactor', description: 'Rename repository from `v0sucks-killthering2` to `killthering`' },
      { type: 'fix', description: 'Update all documentation to reflect current codebase (326 tests, 4 contexts, Sentry integration)' },
    ],
  },
  {
    version: '0.92.1',
    date: '2026-03-13',
    changes: [
      { type: 'fix', description: 'test: DSP unit tests for fusion weights, MSD, phase coherence (#93)' },
    ],
  },
  {
    version: '0.92.0',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: '**next.config.mjs**: Add `webpack.output.hashFunction = \'sha256\'` — fixes production build crash on Windows where OpenSSL 3.x disables md4 and webpack\'s WASM fallback crashes' },
      { type: 'feat', description: '**ci.yml**: Bump CI from Node 20 to Node 22 LTS (supported until April 2027)' },
      { type: 'feat', description: '**.nvmrc**: Pin local dev to Node 22' },
      { type: 'feat', description: '**.claude/launch.json**: Fix dev server configuration' },
      { type: 'feat', description: '[ ] `npx tsc --noEmit` passes' },
      { type: 'feat', description: '[ ] `pnpm test` — 195 tests pass' },
      { type: 'feat', description: '[ ] `pnpm build` — production build succeeds with Serwist SW (no more WasmHash crash)' },
      { type: 'feat', description: '[ ] CI passes on Node 22' },
      { type: 'feat', description: '[ ] Dev server starts and mic input works in Chrome' },
    ],
  },
  {
    version: '0.91.0',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: '**Root cause found**: `SnapshotUploader` used `CompressionStream(\'gzip\')` to compress payloads before POST. Next.js `request.json()` does NOT decompress gzip request bodies → 400 "Invalid JSON" → no retry (4xx = client error) → batch silently lost to IndexedDB' },
      { type: 'feat', description: 'All modern browsers support `CompressionStream`, so **100% of real browser uploads were failing**. Test scripts worked because they send plain JSON.' },
      { type: 'feat', description: '**Fix**: Removed `compressPayload()` entirely (payloads are 2-10KB, compression unnecessary)' },
      { type: 'feat', description: 'Added edge function request logging and pipeline test scripts' },
      { type: 'feat', description: '[ ] `npx tsc --noEmit` passes' },
      { type: 'feat', description: '[ ] `pnpm test` — 195 tests pass' },
      { type: 'feat', description: '[ ] `pnpm build` succeeds' },
      { type: 'feat', description: '[ ] After deploy: open killthering.com, start analysis, trigger feedback → verify new rows in `spectral_snapshots`' },
      { type: 'feat', description: '[ ] Run `node scripts/test-pipeline.mjs` to verify server-side still works' },
    ],
  },
  {
    version: '0.89.1',
    date: '2026-03-13',
    changes: [
      { type: 'fix', description: 'fix: load uploader before worker collection + stale comment cleanup (#90)' },
    ],
  },
  {
    version: '0.89.0',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: '**Root cause**: `import(\'../data/snapshotCollector\')` inside the Web Worker was silently failing in production. Webpack\'s dynamic chunk resolution doesn\'t work reliably in worker contexts, leaving `snapshotCollector` permanently `null`. Every `if (snapshotCollector)` guard evaluates to false — zero data collected.' },
      { type: 'feat', description: '**Fix**: Static import since the module has zero runtime dependencies (all imports are `import type`, erased at compile time). The "premium tier code splitting" optimization was premature and introduced a catastrophic silent failure.' },
      { type: 'feat', description: '**Diagnostic logging**: Added `console.log` at every critical pipeline point so future issues are immediately visible in DevTools:' },
      { type: 'feat', description: '`[DataCollection]` — enableCollection called, uploader created' },
      { type: 'feat', description: '`[DSP Worker]` — enableCollection received, collector created, batch posted' },
      { type: 'feat', description: '`[Uploader]` — batch enqueued, upload success/failure with status' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` passes' },
      { type: 'feat', description: '[x] `pnpm test` — 195 tests pass' },
      { type: 'feat', description: '[x] `pnpm build` succeeds' },
      { type: 'feat', description: '[ ] Deploy → open on phone → start analysis → check Supabase `spectral_snapshots` table for new rows' },
      { type: 'feat', description: '[ ] Open DevTools console → verify log sequence: `[DataCollection] Enabling collection` → `[DSP Worker] enableCollection received` → `[DSP Worker] Posting snapshot batch` → `[Uploader] Enqueued batch` → `[Uploader] Upload SUCCESS`' },
    ],
  },
  {
    version: '0.88.0',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: '**Root cause found**: `enableCollection` message was silently dropped by the `postMessage` gate in `useDSPWorker` because the worker hadn\'t posted its `\'ready\'` response yet' },
      { type: 'feat', description: 'The `isRunning` state update and the `init` message happen in the same render cycle, so the `useEffect` that calls `promptIfNeeded → enableCollection` fires before the worker is ready' },
      { type: 'feat', description: '**Fix**: Queue the `enableCollection` params in a ref, replay when `\'ready\'` arrives' },
      { type: 'feat', description: '`hooks/useDSPWorker.ts` — added `pendingCollectionRef`, queue logic in `enableCollection`, replay in `\'ready\'` handler' },
      { type: 'feat', description: '[ ] Start analysis → detections appear → check Supabase table for rows' },
      { type: 'feat', description: '[ ] `pnpm test` — 195 pass' },
      { type: 'feat', description: '[ ] `npx tsc --noEmit` — clean' },
    ],
  },
  {
    version: '0.86.1',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: 'feat: remove consent dialog, auto-enable data collection (opt-out model) (#87)' },
    ],
  },
  {
    version: '0.86.0',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: 'Consent dialog only showed once — if dismissed without clicking Accept/Decline, localStorage stayed in `\'prompted\'` state and the dialog never appeared again' },
      { type: 'feat', description: 'Now `\'prompted\'` is treated the same as `\'not_asked\'`: dialog re-appears each time audio starts until user makes an explicit choice' },
      { type: 'feat', description: 'Only `\'declined\'` (explicit No Thanks click) prevents re-prompting' },
      { type: 'feat', description: '[ ] Clear localStorage (`localStorage.removeItem(\'ktr-data-consent\')`) and start audio — consent dialog should appear' },
      { type: 'feat', description: '[ ] Dismiss dialog (if possible) without clicking a button, restart audio — dialog should reappear' },
      { type: 'feat', description: '[ ] Click "Share Data" — collection should start, dialog should not reappear on next audio start' },
      { type: 'feat', description: '[ ] Click "No Thanks" — dialog should not reappear on next audio start' },
      { type: 'feat', description: '[ ] Verify spectral_snapshots table receives rows after accepting consent' },
    ],
  },
  {
    version: '0.85.0',
    date: '2026-03-13',
    changes: [
      { type: 'feat', description: 'Moves `markFeedbackEvent()` before the `shouldReportIssue()` gate in the DSP worker' },
      { type: 'feat', description: 'Snapshot collection now triggers for ALL classified peaks — POSSIBLE_RING (purple), sub-threshold, instruments, and false positives' },
      { type: 'feat', description: 'Previously only confirmed feedback that created UI advisories would trigger collection, meaning ring detections were silently dropped from the ML training pipeline' },
      { type: 'feat', description: '[x] `tsc --noEmit` — zero errors' },
      { type: 'feat', description: '[x] `pnpm test` — 195/195 pass' },
      { type: 'feat', description: '[ ] Deploy → start analysis → verify rows appear in `spectral_snapshots` table for ring/purple detections' },
    ],
  },
  {
    version: '0.84.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: 'Implements the Spectral Snapshot Collector for the free tier — anonymous spectral data collection to train a future ML feedback detection model' },
      { type: 'feat', description: 'Full consent state machine (NOT_ASKED → PROMPTED → ACCEPTED | DECLINED) with versioned re-consent support' },
      { type: 'feat', description: 'Three-level lazy loading: consent dialog via React.lazy(), uploader via dynamic import after consent, collector via worker import on enable' },
      { type: 'feat', description: 'Ring buffer (240 slots, 4 captures/sec = 60s history) with Float32→Uint8 quantization (-100..0 dB → 0..255, ~0.4 dB resolution)' },
      { type: 'feat', description: 'Upload pipeline: gzip compression, exponential retry (1s/2s/4s), IndexedDB fallback, rate limiting (1 req/10s), 5MB session cap' },
      { type: 'feat', description: 'Settings toggle in Advanced tab with privacy summary and collection status indicator' },
      { type: 'feat', description: '`types/data.ts` — All data collection types (ConsentState, SnapshotBatch, etc.)' },
      { type: 'feat', description: '`lib/data/snapshotCollector.ts` — Ring buffer, quantization, batch extraction' },
      { type: 'feat', description: '`lib/data/consent.ts` — localStorage consent state machine' },
      { type: 'feat', description: '`lib/data/uploader.ts` — Compressed upload with retry + IndexedDB queue' },
      { type: 'feat', description: '`hooks/useDataCollection.ts` — Orchestration hook (consent + worker + uploader)' },
      { type: 'feat', description: '`components/kill-the-ring/DataConsentDialog.tsx` — One-time consent modal' },
      { type: 'feat', description: '`app/api/v1/ingest/route.ts` — POST handler with validation + rate limiting' },
      { type: 'feat', description: '`supabase/functions/ingest/index.ts` — Deno Edge Function' },
      { type: 'feat', description: '`supabase/migrations/001_spectral_snapshots.sql` — Table + RLS' },
      { type: 'feat', description: '`hooks/useAudioAnalyzer.ts` — Exposes dspWorker handle + external callbacks' },
      { type: 'feat', description: '`hooks/useDSPWorker.ts` — enableCollection/disableCollection + onSnapshotBatch' },
      { type: 'feat', description: '`lib/dsp/dspWorker.ts` — Dynamic import of collector, recordFrame in hot loop' },
      { type: 'feat', description: '`components/kill-the-ring/KillTheRing.tsx` — Wires consent, worker ref, settings props' },
      { type: 'feat', description: '`components/kill-the-ring/HeaderBar.tsx` — Passes dataCollection to SettingsPanel' },
      { type: 'feat', description: '`components/kill-the-ring/SettingsPanel.tsx` — Forwards to AdvancedTab' },
      { type: 'feat', description: '`components/kill-the-ring/settings/AdvancedTab.tsx` — Data Collection toggle UI' },
      { type: 'feat', description: '[x] `tsc --noEmit` — zero errors' },
      { type: 'feat', description: '[x] `pnpm test` — 195/195 pass' },
      { type: 'feat', description: '[x] Dev server loads with zero console/server errors' },
      { type: 'feat', description: '[ ] Supabase project setup (migration + edge function deploy)' },
      { type: 'feat', description: '[ ] Vercel env vars (SUPABASE_INGEST_URL, SUPABASE_SERVICE_ROLE_KEY)' },
      { type: 'feat', description: '[ ] E2E: enable collection → verify batches upload to Supabase' },
    ],
  },
  {
    version: '0.83.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: '**Console-style fader redesign**: Recessed groove with inset shadows, side rails, wider 3D thumb with bevel highlight, mode-aware dB scale markings (gain mode: white labels with prominent 0dB unity line; sensitivity mode: blue-tinted labels with 25dB reference)' },
      { type: 'feat', description: '**Clear All header button**: Trash2 icon in header bar for quick advisory dismissal (uses `useDetection()` hook directly; moved HeaderBar inside DetectionProvider to fix context crash)' },
      { type: 'feat', description: '**Signal guidance UX**: Pulsing "Increase gain" hint in IssuesList standby state when input level is below -45dB, helping new engineers understand they need to push the fader up' },
      { type: 'feat', description: '**MSD memory optimization**: Replace dense 1MB MSD ring buffer (4096 bins × 64 frames) with pooled sparse allocation (256 slots × 64 frames = 64KB) using LRU eviction — 16x memory reduction' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — clean' },
      { type: 'feat', description: '[x] `pnpm test` — 195/195 pass' },
      { type: 'feat', description: '[x] `pnpm build` — production build succeeds' },
      { type: 'feat', description: '[x] Visual verification: fader groove, thumb, scale markings in both gain and sensitivity modes' },
      { type: 'feat', description: '[x] Clear All button appears in header when advisories exist' },
      { type: 'feat', description: '[x] Low-signal hint renders in standby state' },
    ],
  },
  {
    version: '0.82.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: '**EXP_LUT**: Replace 4096 `Math.exp()` calls/frame with precomputed 1001-entry Float32Array lookup table (0.1dB quantization, ~4KB L1 cache)' },
      { type: 'feat', description: '**Below-threshold skip**: Skip power computation for bins 12dB below effective threshold (saves 20-60% of LUT lookups)' },
      { type: 'feat', description: '**Bitwise MSD**: Replace modulo with `& (size-1)` + precomputed scratch buffer in MSD ring buffer `calculateMsd()`' },
      { type: 'feat', description: '**Instrumentation**: `enablePerfDebug(true)` adds `performance.now()` timing to `analyze()`, exposed via `getState().perfTimings`' },
      { type: 'feat', description: '**Mobile constant**: `MOBILE_ANALYSIS_INTERVAL_MS = 40` for 25fps analysis on resource-constrained devices' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — type check passes' },
      { type: 'feat', description: '[x] `pnpm test` — all 195 DSP tests pass (behavior-preserving optimizations)' },
      { type: 'feat', description: '[x] `pnpm build` — production build succeeds' },
      { type: 'feat', description: '[ ] Manual: enable perf debug in console, verify frame timings display' },
      { type: 'feat', description: '[ ] Manual: compare detection results before/after on test audio — no regressions' },
    ],
  },
  {
    version: '0.81.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: 'Add synthetic signal/phase generators (`signalGenerator.ts`, `phaseGenerator.ts`) for deterministic FFT test inputs' },
      { type: 'feat', description: 'Create new test suites for **phaseCoherence** (12 tests) and **compressionDetection** (16 tests) — both had 0% coverage' },
      { type: 'feat', description: 'Enhance existing tests: feedbackDetector (+5), algorithmFusion (+11), msdConsistency (+4) with confidence formula, verdict boundary, and feedbackScore edge cases' },
      { type: 'feat', description: 'Total: **195 tests** across 7 test files (up from ~135 across 5 files)' },
      { type: 'feat', description: '[x] `pnpm test` — all 195 tests pass' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — type check passes' },
      { type: 'feat', description: '[ ] CI pipeline validates build + tests' },
    ],
  },
  {
    version: '0.80.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: '**Dual-mode vertical fader** (Gain/Sensitivity) with console-style capsule thumb featuring gradient shading, 3-ridge groove lines, and mode-dependent glow shadows' },
      { type: 'feat', description: '**Mobile fader sidecar** — persistent right-side fader strip visible across all 3 mobile tabs (Issues, Graph, Settings)' },
      { type: 'feat', description: '**Sensitivity as default mode** with conservative 42dB threshold for new engineers' },
      { type: 'feat', description: '**Dark metallic blue thumb** for sensitivity mode (dark navy gradient + cyan border/glow) vs white/metallic for gain mode — instantly distinguishable' },
      { type: 'feat', description: '**Arrow indicators** (▲) guide new engineers to push the sensitivity fader up — fade out once they\'ve adjusted past 25dB' },
      { type: 'feat', description: '**Fader mode toggle** wired into DetectionControls and DetectionTab settings panels' },
      { type: 'feat', description: '[ ] Desktop: verify dark navy sensitivity thumb is visually distinct from white gain thumb' },
      { type: 'feat', description: '[ ] Desktop: toggle between Gain/Sens modes — thumb color changes immediately' },
      { type: 'feat', description: '[ ] Mobile (portrait): fader sidecar visible on all 3 tabs (Issues, Graph, Settings)' },
      { type: 'feat', description: '[ ] Mobile: swipe between tabs — fader stays fixed on right edge' },
      { type: 'feat', description: '[ ] Arrow indicators visible when sensitivity fader is near bottom (≥25dB)' },
      { type: 'feat', description: '[ ] Arrows fade out as fader is pushed up past 25dB' },
      { type: 'feat', description: '[ ] Default sensitivity starts at 42dB on fresh load' },
      { type: 'feat', description: '[ ] `npx tsc --noEmit` passes' },
      { type: 'feat', description: '[ ] `pnpm test` passes (151 tests)' },
      { type: 'feat', description: '[ ] `pnpm build` succeeds' },
    ],
  },
  {
    version: '0.79.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: '**Removes max-pool downsampling** in worker MSD path — both main-thread and worker now analyze full-resolution bins, eliminating the biggest source of divergence' },
      { type: 'feat', description: '**Unifies buffer depth** (MAX_FRAMES 50→64), **energy gate** (relative noise-floor gate with absolute fallback), and **min frames** (content-adaptive based on operation mode)' },
      { type: 'feat', description: '**Adds 20 new consistency tests** verifying numerical equivalence, energy gating, min-frame behavior, multi-bin isolation, and reset' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — type check passes' },
      { type: 'feat', description: '[x] `pnpm test` — 151/151 tests pass (131 existing + 20 new)' },
      { type: 'feat', description: '[x] `pnpm build` — production build succeeds' },
      { type: 'feat', description: '[x] Dev server starts and app renders without console errors' },
      { type: 'feat', description: '[ ] Manual mic test: verify MSD threshold-reduction peaks align with fusion verdicts across Speech/Worship/Live modes' },
    ],
  },
  {
    version: '0.78.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: 'Reduces dead space above Settings/Help tab icons on mobile by tightening SheetContent gap, SheetHeader padding, and Tabs margin (all behind `max-sm:` — zero desktop impact)' },
      { type: 'feat', description: 'Shortens sheet descriptions (Settings, Help, Feedback History) to fit on one line at 375px, giving each header a clean 2-line layout' },
      { type: 'feat', description: '[ ] Mobile (375px): Open Settings sheet — header is 2 lines, tab icons closer to header' },
      { type: 'feat', description: '[ ] Mobile (375px): Open Help sheet — same compact header' },
      { type: 'feat', description: '[ ] Mobile (375px): Open Feedback History — same compact header' },
      { type: 'feat', description: '[ ] Desktop (1400px): All three sheets look identical to before' },
    ],
  },
  {
    version: '0.77.1',
    date: '2026-03-12',
    changes: [
      { type: 'fix', description: 'fix: add unsafe-inline to production CSP script-src' },
    ],
  },
  {
    version: '0.77.0',
    date: '2026-03-12',
    changes: [
      { type: 'feat', description: '**Batch 1 — CI + Bug Fixes**: GitHub Actions build gate (`tsc --noEmit` + `pnpm build`), bound `advisories` Map (MAX_ADVISORIES=200), prune `recentDecays` (30s TTL), revert temporary `skipWaiting` workaround in service worker' },
      { type: 'feat', description: '**Batch 2 — Vitest Tests**: 131 unit tests across `feedbackDetector`, `classifier`, `eqAdvisor`, and `algorithmFusion` DSP modules' },
      { type: 'feat', description: '**Batch 3 — React Contexts**: Extract `DetectionContext` + `AudioStateContext` from KillTheRing\'s 34-40 prop drilling chain → layouts consume via hooks' },
      { type: 'feat', description: '**Batch 4 — Worker Decomposition**: Split 910-line `dspWorker.ts` into `workerFft`, `advisoryManager`, `decayAnalyzer` modules (~200-line orchestrator remains)' },
      { type: 'feat', description: '**Batch 5 — Hook Decomposition**: Extract `useAdvisoryMap` from `useAudioAnalyzer` (379→~150 lines), fix memoization-breaking inline computations' },
      { type: 'feat', description: '**Batch 6 — Security + Bundle + Perf**: CSP header, ESLint hardening (`no-explicit-any` → error), remove 16 unused Radix UI packages + 19 dead wrapper files, memoize IssuesList/IssueCard, eliminate N+1 feedbackHistory lookups' },
      { type: 'feat', description: '52 files changed, +3,852 / −3,425 lines' },
      { type: 'feat', description: '16 Radix packages removed, 19 dead files deleted' },
      { type: 'feat', description: '131 new DSP unit tests' },
      { type: 'feat', description: '0 `tsc` errors, 0 ESLint errors, clean production build' },
      { type: 'feat', description: '[x] `npx tsc --noEmit` — type-check clean' },
      { type: 'feat', description: '[x] `npx eslint .` — 0 errors (43 warnings, all pre-existing)' },
      { type: 'feat', description: '[x] `pnpm test` — 131 tests passing' },
      { type: 'feat', description: '[x] `pnpm build` — production build clean' },
      { type: 'feat', description: '[ ] Manual browser test: start detection, run 5+ minutes, verify issue cards render correctly' },
      { type: 'feat', description: '[ ] Verify CSP header in browser DevTools (no violations in console)' },
      { type: 'feat', description: '[ ] Check mobile layout: tabs, settings panel, issue dismissal' },
    ],
  },
  {
    version: '0.76.22',
    date: '2026-03-11',
    changes: [
      { type: 'feat', description: 'feat: UI/UX improvements — loading states, ARIA, reduced motion, mobile sliding tabs' },
    ],
  },
  {
    version: '0.76.21',
    date: '2026-03-11',
    changes: [
      { type: 'fix', description: 'docs: update all documentation for ECM8000 mic calibration + export v1.1' },
    ],
  },
  {
    version: '0.76.20',
    date: '2026-03-11',
    highlights: 'ECM8000 mic calibration compensation + calibration export v1.1',
    changes: [
      { type: 'feat', description: 'feat: ECM8000 mic calibration compensation — flattens measurement mic frequency response in the DSP hot loop for true SPL readings' },
      { type: 'feat', description: 'feat: calibration export v1.1 — per-detection/snapshot micCalibrationApplied flags, MicCalibrationMetadata with 38-point calibration curve' },
      { type: 'feat', description: 'feat: ECM8000 toggle in Calibrate tab with live "ECM8000 compensated" session indicator' },
    ],
  },
  {
    version: '0.76.19',
    date: '2026-03-11',
    changes: [
      { type: 'fix', description: 'fix: calibration mode never started recording' },
    ],
  },
  {
    version: '0.76.18',
    date: '2026-03-11',
    changes: [
      { type: 'fix', description: 'style: visual DNA alignment + docs audit to match codebase' },
    ],
  },
  {
    version: '0.76.17',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'docs: audit and correct Help Menu against live codebase' },
    ],
  },
  {
    version: '0.76.16',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'docs: comprehensive documentation overhaul for calibration, export, and new features' },
    ],
  },
  {
    version: '0.76.15',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: three-column settings layout, calibration system, UX overhaul' },
    ],
  },
  {
    version: '0.76.14',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: recalibrate all presets from real-world data + fix detection bugs' },
    ],
  },
  {
    version: '0.76.13',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'revert: undo all backend hardening — restore sw, manifest, KillTheRingClient' },
    ],
  },
  {
    version: '0.76.12',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'fix: remove CSP header entirely — was breaking app functionality' },
    ],
  },
  {
    version: '0.76.11',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'fix: switch CSP to report-only mode — unblock app while diagnosing violations' },
    ],
  },
  {
    version: '0.76.10',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: backend hardening — CSP header, custom SW cache, update notifications, manifest polish' },
    ],
  },
  {
    version: '0.76.9',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: branded start button in issues box — large CTA with speaker icon, wordmark, and breathing glow' },
    ],
  },
  {
    version: '0.76.8',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: single-row mobile header — icons scaled to 36px next to 3-line wordmark' },
    ],
  },
  {
    version: '0.76.7',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: two-row instrument panel — 3-line wordmark + full-width 56px icon bar' },
    ],
  },
  {
    version: '0.76.6',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: two-row mobile header with bigger buttons and branding row' },
    ],
  },
  {
    version: '0.76.5',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'fix: compact mobile header — normalize buttons to 44px, hide version' },
    ],
  },
  {
    version: '0.76.4',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: font size bump (12→14px), wider panels, unified responsive logo' },
    ],
  },
  {
    version: '0.76.2',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: UI polish — canvas glow, panel depth, badge vibrancy, micro-interactions, background texture' },
    ],
  },
  {
    version: '0.76.1',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'docs: update CLAUDE.md with v1.0.118 conventions' },
    ],
  },
  {
    version: '0.76.0',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Add TXT export: fixed-width plain text report with session info, frequency band breakdown, repeat offenders, hotspot tables, EQ recommendations, and recent events' },
      { type: 'feat', description: 'Add PDF export: professional multi-page report with dark header, metric boxes, vector bar charts, styled tables (amber/blue/green), event timeline scatter plot, and page footers — uses jsPDF + jspdf-autotable, dynamically imported to keep initial bundle clean' },
      { type: 'feat', description: 'Consolidate all 4 export formats (TXT, CSV, JSON, PDF) into a single Export dropdown menu' },
      { type: 'feat', description: 'Extract shared `downloadFile()` helper, tighten SheetHeader spacing' },
      { type: 'feat', description: 'Open Feedback History panel — Export dropdown and Clear button visible' },
      { type: 'feat', description: 'Both buttons disabled when no data' },
      { type: 'feat', description: 'Dropdown shows 4 items: TXT, CSV, JSON, PDF' },
      { type: 'feat', description: 'TXT export downloads readable `.txt` file' },
      { type: 'feat', description: 'PDF export shows loading spinner, then downloads multi-page PDF with charts' },
      { type: 'feat', description: 'CSV/JSON exports still work' },
      { type: 'feat', description: 'Clear button works with confirmation dialog' },
      { type: 'feat', description: 'Mobile layout (375x812) renders correctly' },
      { type: 'feat', description: 'Zero console errors' },
      { type: 'feat', description: '`pnpm build` passes' },
    ],
  },
  {
    version: '0.75.0',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Moved export/clear actions from bottom to top of panel' },
      { type: 'feat', description: 'Replaced fixed-height `ScrollArea h-[250px]` with natural `overflow-y-auto` panel scrolling' },
      { type: 'feat', description: 'Added `SheetDescription` and `text-lg` title to match SettingsPanel/HelpMenu patterns' },
      { type: 'feat', description: 'Replaced magic width classes with standard `sm:max-w-md`' },
      { type: 'feat', description: 'Made Clear button visible with text label and destructive hover styling' },
      { type: 'feat', description: 'Open Feedback History panel — action buttons visible at top' },
      { type: 'feat', description: 'Panel scrolls naturally when content overflows' },
      { type: 'feat', description: 'Empty state shows no wasted space' },
      { type: 'feat', description: 'Clear button shows destructive hover styling' },
      { type: 'feat', description: 'AlertDialog confirmation still works on Clear' },
      { type: 'feat', description: 'Mobile viewport renders cleanly' },
    ],
  },
  {
    version: '0.74.1',
    date: '2026-03-09',
    highlights: 'Codebase audit — 27 bug fixes',
    changes: [
      { type: 'fix', description: 'GEQ band index formula corrected (inline log2 → findNearestGEQBand lookup)' },
      { type: 'fix', description: 'Prominence gate bypass when neighborhood bins = 2 (minimum raised to 4)' },
      { type: 'fix', description: 'Web Worker buffer transfer now includes typed arrays in message payload' },
      { type: 'fix', description: 'Sample standard deviation uses Bessel\'s correction (n−1)' },
      { type: 'fix', description: 'Room mode proximity tracks best match across all modes instead of first' },
      { type: 'fix', description: 'Hotspot map key collision resolved with unique string IDs' },
      { type: 'fix', description: 'Stale closure fixes in useAudioAnalyzer (dspWorkerRef, switchDevice)' },
      { type: 'fix', description: 'ERB depth scale interpolation discontinuity at 2kHz boundary' },
      { type: 'fix', description: 'Sideband dB averaging converted to linear power domain' },
      { type: 'fix', description: 'Object URL leak in CSV/JSON export downloads' },
      { type: 'feat', description: 'HTTP security headers: X-Content-Type-Options, X-Frame-Options, Permissions-Policy' },
      { type: 'feat', description: 'ARIA dialog attributes on onboarding overlay' },
      { type: 'refactor', description: 'Controlled service worker activation (message-based skipWaiting)' },
      { type: 'refactor', description: 'Removed dead styles/globals.css, dead getBinHistory methods, duplicate F-key handler' },
    ],
  },
  {
    version: '1.0.117',
    date: '2026-03-09',
    highlights: 'Quick controls, custom presets, mobile polish',
    changes: [
      { type: 'feat', description: 'Quick/Full controls toggle — pill buttons switch between essential and full detection controls' },
      { type: 'feat', description: 'Custom detection presets — save up to 5 named presets, load from mode selector dropdown' },
      { type: 'feat', description: 'Early warning elapsed timer with color-coded urgency and persistence progress bar' },
      { type: 'feat', description: 'Active algorithm indicators in Auto mode — ring highlights show which algorithms are running' },
      { type: 'feat', description: 'Frame-drop indicator with live FPS counter in algorithm status bar' },
      { type: 'feat', description: 'EQ copy-to-clipboard button on issue cards (frequency, GEQ band, PEQ cut in one string)' },
      { type: 'feat', description: 'Mobile swipe navigation between Issues, Graph, and Settings tabs' },
      { type: 'feat', description: 'Onboarding step 5: keyboard shortcuts summary (Space, F, P, 1/2/3)' },
      { type: 'ui', description: 'Mobile tab labels enlarged from 9px to 11px for stage-light readability' },
      { type: 'ui', description: 'GEQ band labels: raised minimum font to 9px with text shadow for contrast' },
      { type: 'fix', description: 'Quick/Full controls toggle enlarged with full labels after usability feedback' },
    ],
  },
  {
    version: '1.0.116',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'EQ recommendations (GEQ band/cut, PEQ Q/gain) now included in CSV and JSON exports' },
    ],
  },
  {
    version: '1.0.115',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Noise floor line more visible with 5% fill below for region clarity' },
      { type: 'ui', description: 'Axis labels brighter (zinc-300) with dark text shadow for outdoor readability' },
    ],
  },
  {
    version: '1.0.114',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Velocity shown on all active issue cards — "↑ building" for slow growth, amber/red for warnings' },
      { type: 'feat', description: 'Issue age indicator shows how long each issue has been active (just now, Xs, Xm)' },
    ],
  },
  {
    version: '1.0.113',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Keyboard shortcut labels added to header tooltips (L, F, P)' },
      { type: 'feat', description: 'Hover tooltip on spectrum canvas shows frequency + dB at cursor position' },
      { type: 'ui', description: 'Subtle crosshair lines follow cursor over spectrum display' },
    ],
  },
  {
    version: '1.0.112',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'Header icons now actually render at 24px (shadcn Button was overriding w/h classes)' },
    ],
  },
  {
    version: '1.0.111',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Header buttons enlarged to 40px with 24px icons to fill dead space' },
    ],
  },
  {
    version: '1.0.110',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Header icons enlarged from 16px to 20px for better visibility' },
    ],
  },
  {
    version: '1.0.109',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: dismiss ✕ separated into its own column away from badges' },
    ],
  },
  {
    version: '1.0.108',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: badge rows flush-right aligned to same edge' },
    ],
  },
  {
    version: '1.0.107',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'Minor stability improvements' },
    ],
  },
  {
    version: '1.0.106',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: larger frequency text (18px) with Hz/kHz suffix' },
    ],
  },
  {
    version: '1.0.105',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: badges split into 2 rows — status/action top, classification bottom' },
    ],
  },
  {
    version: '1.0.104',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: EQ recommendation moved to left column under pitch (flex-wraps when narrow)' },
    ],
  },
  {
    version: '1.0.103',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: 2-column layout — frequency anchors left, badges and EQ right' },
    ],
  },
  {
    version: '1.0.102',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Larger frequency readout on issue cards (14px → 16px)' },
      { type: 'fix', description: 'Normalize badge heights in issue cards for uniform appearance' },
    ],
  },
  {
    version: '1.0.101',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Enforce 12px minimum text across all sidebar components (39 elements upgraded)' },
    ],
  },
  {
    version: '1.0.100',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Larger noise floor text on gain fader for at-a-glance readability' },
    ],
  },
  {
    version: '1.0.99',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Noise floor overlay — higher contrast white text with drop shadow' },
    ],
  },
  {
    version: '1.0.98',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Move noise floor readout from header to gain fader strip' },
    ],
  },
  {
    version: '1.0.97',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Sheet padding fix, revert tab labels to full words' },
    ],
  },
  {
    version: '1.0.96',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Header button cleanup, tab label shortening, help icons' },
    ],
  },
  {
    version: '1.0.95',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'ESLint strictness, early warning panel, tsconfig cleanup' },
    ],
  },
  {
    version: '1.0.94',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Canvas keyboard accessibility, peak hold indicator, backpressure metrics' },
    ],
  },
  {
    version: '1.0.93',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'Enlarge touch targets and improve mobile graph readability' },
    ],
  },
  {
    version: '1.0.92',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'WCAG AA contrast, badge overflow, resizable handle affordance' },
    ],
  },
  {
    version: '1.0.91',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Graceful mic error handling — rich error banner with contextual guidance, retry button, and dismiss; error-aware canvas placeholder' },
    ],
  },
  {
    version: '1.0.90',
    date: '2026-03-08',
    changes: [
      { type: 'refactor', description: 'Decompose SettingsPanel (1,226 lines) into modular tab components — Detection, Algorithms, Display, Advanced, Room' },
    ],
  },
  {
    version: '1.0.89',
    date: '2026-03-08',
    changes: [
      { type: 'fix', description: 'Fix portals (Settings, Help, dropdowns, tooltips) not rendering in fullscreen mode' },
    ],
  },
  {
    version: '1.0.88',
    date: '2026-03-08',
    changes: [
      { type: 'fix', description: 'Fix mobile header logo alignment — shrink button/text to match desktop proportions' },
    ],
  },
  {
    version: '1.0.87',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Replay Onboarding button added to Settings → Display tab' },
    ],
  },
  {
    version: '1.0.86',
    date: '2026-03-08',
    changes: [
      { type: 'feat', description: 'Interactive first-run onboarding walkthrough (4 steps) for new users' },
    ],
  },
  {
    version: '1.0.85',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Settings panel converted from blocking modal to slide-in sheet for consistency' },
    ],
  },
  {
    version: '1.0.84',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Help menu converted from blocking modal to slide-in sheet panel' },
    ],
  },
  {
    version: '1.0.83',
    date: '2026-03-08',
    highlights: 'Issue card redesign',
    changes: [
      { type: 'ui', description: 'Redesigned issue cards — frequency hero row, badges on dedicated row, niche metadata in tooltip' },
      { type: 'ui', description: 'Cleaner EQ recommendation row with proper column layout' },
    ],
  },
  {
    version: '1.0.82',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Wider gain fader strip (48px → 64px) with proportionally larger thumb and input' },
    ],
  },
  {
    version: '1.0.81',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Standardized font sizes — collapsed 6 arbitrary sizes to 3 semantic tiers (micro/caption/label)' },
      { type: 'fix', description: 'Changelog cleanup — sorted versions, removed dev checklists, fixed entry types' },
    ],
  },
  {
    version: '1.0.80',
    date: '2026-03-08',
    highlights: 'UI polish & blue theme unification',
    changes: [
      { type: 'ui', description: 'Vertical gain fader with venue quick-cal pills (Quiet / Med / Loud)' },
      { type: 'ui', description: 'Blue theme unification — RTA spectrum, input meters, and issue badges now use site primary blue' },
      { type: 'ui', description: 'Canvas-drawn RTA placeholder replaces static JPEG — stays in sync with theme colors' },
      { type: 'fix', description: 'Auto-gain now off by default — user clicks a venue pill to start calibration' },
      { type: 'fix', description: 'Default input gain lowered from +15 dB to +6 dB' },
      { type: 'ui', description: 'Default layout opens all three sidecars (Controls, Issues, Graphs)' },
      { type: 'fix', description: 'Canvas axis labels no longer clip at edges — proper padding and textBaseline alignment' },
    ],
  },
  {
    version: '1.0.79',
    date: '2026-03-08',
    highlights: 'Audio source selection',
    changes: [
      { type: 'feat', description: 'Audio input device selector — switch microphones without restarting' },
      { type: 'ui', description: 'Dark title bar for native app feel' },
    ],
  },
  {
    version: '1.0.78',
    date: '2026-03-07',
    changes: [
      { type: 'perf', description: 'Canvas FPS throttle reduces frame stuttering on lower-end hardware' },
    ],
  },
  {
    version: '1.0.77',
    date: '2026-03-07',
    highlights: 'Component architecture split',
    changes: [
      { type: 'refactor', description: 'Split KillTheRing into HeaderBar, MobileLayout, and DesktopLayout components' },
      { type: 'feat', description: 'Remapped keyboard shortcuts for new layout' },
    ],
  },
  {
    version: '1.0.76',
    date: '2026-03-07',
    changes: [
      { type: 'feat', description: 'RTA freeze — pause the spectrum display for closer inspection' },
    ],
  },
  {
    version: '1.0.75',
    date: '2026-03-07',
    changes: [
      { type: 'fix', description: 'Fixed all 15 ESLint issues across kill-the-ring components' },
      { type: 'ui', description: 'Pro audio dark theme refresh, removed EQNotepad, layout tuning' },
    ],
  },
  {
    version: '1.0.74',
    date: '2026-03-07',
    changes: [
      { type: 'fix', description: 'Worker stability — DSP worker message handler wrapped in try/catch so soft errors no longer crash the worker' },
      { type: 'fix', description: 'Crash recovery — worker auto-recreated on next Start press after a hard crash' },
    ],
  },
  {
    version: '1.0.73',
    date: '2026-03-07',
    changes: [
      { type: 'refactor', description: 'Removed unused `applyFrequencyDependentThreshold` function' },
    ],
  },
  {
    version: '1.0.72',
    date: '2026-03-07',
    changes: [
      { type: 'refactor', description: 'Removed unused `analyzeFormantStructure` function and constants' },
    ],
  },
  {
    version: '1.0.71',
    date: '2026-03-07',
    changes: [
      { type: 'feat', description: 'Widened harmonic tolerance range from 25–100 to 25–400 cents (default 200) for better reverberant room support' },
    ],
  },
  {
    version: '1.0.70',
    date: '2026-03-06',
    highlights: 'RTA threshold overlay',
    changes: [
      { type: 'feat', description: 'RTA threshold line overlay — dashed blue line shows effective detection threshold on the spectrum graph' },
      { type: 'ui', description: 'Show on RTA toggle under Threshold slider to show/hide threshold line' },
    ],
  },
  {
    version: '1.0.69',
    date: '2026-03-05',
    highlights: 'Low-frequency detection restored',
    changes: [
      { type: 'fix', description: 'Removed erroneous 400 Hz hard floor — low-frequency feedback is now detectable again' },
      { type: 'fix', description: 'Reduced LOW band multipliers (prominence 1.4×→1.15×, sustain 1.5×→1.2×) to prevent triple-stacking penalties' },
      { type: 'fix', description: 'Advisory card dedup — frequency-proximity matching (200 cents) replaces same-frequency cards instead of accumulating duplicates' },
    ],
  },
  {
    version: '1.0.68',
    date: '2026-03-05',
    changes: [
      { type: 'fix', description: 'Reduced Schroeder room-mode penalty from -0.25 to -0.12 — old value blocked sub-300 Hz detection' },
      { type: 'fix', description: 'Prominence floor now synced with `settings.prominenceDb` instead of hardcoded 10 dB' },
      { type: 'fix', description: 'Duplicate advisories — cleared advisories now properly removed by ID before re-detection' },
    ],
  },
  {
    version: '1.0.67',
    date: '2026-03-05',
    highlights: 'Pro convention EQ recommendations',
    changes: [
      { type: 'feat', description: 'Raised PEQ Q values to pro convention (surgical Q60, heavy Q30) matching dbx AFS standards' },
      { type: 'feat', description: 'ERB-scaled cut depth — shallower cuts below 500 Hz to protect warmth, deeper above 2 kHz' },
      { type: 'feat', description: 'PHPR (Peak-to-Harmonic Power Ratio) detection for feedback vs. music discrimination' },
      { type: 'fix', description: 'Improved early/quiet feedback detection with MSD-lowered threshold gate' },
    ],
  },
  {
    version: '1.0.66',
    date: '2026-03-05',
    highlights: 'Speech preset retune',
    changes: [
      { type: 'fix', description: 'Retuned Speech (Corporate & Conference) preset for balanced soundcheck + live use' },
      { type: 'fix', description: 'Extended frequency range to 10 kHz to catch condenser sibilance feedback' },
      { type: 'fix', description: 'Raised confidence threshold, prominence, and sustain to reduce false positives' },
    ],
  },
  {
    version: '1.0.65',
    date: '2026-03-05',
    highlights: 'Measure-then-lock auto-gain',
    changes: [
      { type: 'feat', description: 'Auto-gain calibrates for 3 seconds on start, then freezes at the computed gain value' },
      { type: 'feat', description: 'Eliminates gain pumping that caused noise floor tracking instability' },
      { type: 'ui', description: 'UI toggle shows Cal (pulsing amber) during calibration and Lock (green) when frozen' },
    ],
  },
  {
    version: '1.0.7',
    date: '2026-03-04',
    highlights: 'UI overhaul & auto-versioning',
    changes: [
      { type: 'ui', description: 'HelpMenu consolidated from 7 tabs to 5 with accordion-based algorithms' },
      { type: 'ui', description: 'SettingsPanel reorganized into 5 tabs with collapsible sections and Room Acoustics tab' },
      { type: 'feat', description: 'Auto-versioning GitHub Action bumps version on PR merge' },
      { type: 'ui', description: 'Issue cards now show captured frequency as primary display' },
    ],
  },
  {
    version: '1.0.6',
    date: '2026-03-04',
    highlights: 'Codebase hardening & cleanup',
    changes: [
      { type: 'refactor', description: 'Removed Neon PostgreSQL database layer and session persistence' },
      { type: 'refactor', description: 'Removed in-memory EventLogger and log export UI' },
      { type: 'fix', description: 'Capped hotspot events to 50 to prevent unbounded localStorage growth' },
      { type: 'refactor', description: 'Removed 8 unused dependencies, migrated to ESLint flat config' },
    ],
  },
  {
    version: '1.0.5',
    date: '2026-03-04',
    highlights: 'Acoustic physics engine',
    changes: [
      { type: 'feat', description: 'Eyring RT60 reverberation time estimation' },
      { type: 'feat', description: 'Air absorption modeling for high-frequency Q adjustment' },
      { type: 'feat', description: 'Room mode filtering and mode clustering' },
      { type: 'feat', description: 'Frequency-dependent prominence thresholds' },
    ],
  },
  {
    version: '1.0.4',
    date: '2026-03-04',
    highlights: 'False positive elimination',
    changes: [
      { type: 'fix', description: 'Raised signal gate and prominence floor to 10 dB' },
      { type: 'fix', description: 'Unified merge windows and increased cooldowns' },
      { type: 'feat', description: 'Global advisory rate limiter (max 1 new/sec)' },
    ],
  },
  {
    version: '1.0.3',
    date: '2026-03-04',
    highlights: 'Duplicate detection fixes',
    changes: [
      { type: 'fix', description: 'Reduced false positive and duplicate feedback detections' },
      { type: 'fix', description: 'Fixed 42 audit findings: DSP correctness, component bugs, API hardening' },
      { type: 'fix', description: 'Widened merge tolerance with band cooldown and bidirectional harmonic check' },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-03-04',
    highlights: 'Auto-gain, mobile layout, PWA',
    changes: [
      { type: 'feat', description: 'Auto-gain control with settings UI' },
      { type: 'feat', description: 'GEQ-band advisory deduplication (one per 1/3 octave)' },
      { type: 'ui', description: 'Mobile layout: replaced hamburger with bottom tab bar' },
      { type: 'feat', description: 'About tab with dynamic version display' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-03',
    highlights: 'Initial release',
    changes: [
      { type: 'feat', description: 'Replaced Electron with PWA via Serwist' },
      { type: 'ui', description: 'Resizable layout with research-driven operation mode presets' },
      { type: 'feat', description: '7-algorithm fusion: MSD, Phase, Spectral, Comb, IHR, PTMR, Compression' },
      { type: 'feat', description: 'Acoustic classifier with RT60-aware Q adjustments' },
      { type: 'feat', description: 'Feedback history with repeat offender tracking' },
      { type: 'feat', description: 'Real-time spectrum, GEQ, and amplitude visualization' },
    ],
  },
]
