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
