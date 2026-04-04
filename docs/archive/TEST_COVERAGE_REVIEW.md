# Test Coverage Review

Date: 2026-03-31

Audit basis:
- Live codebase audit in `C:\DoneWellAV\DoneWellAudio`
- Live `pnpm test:coverage` run on 2026-03-31
- Cross-check against `C:\DoneWellAV\DoneWellAudio\repomix-output.xml`

## Executive Summary

The test suite is strong in the pure DSP core, selected storage/settings hooks, and the `POST /api/v1/ingest` contract. It is weak where the application becomes orchestration-heavy: browser hooks, worker lifecycle, bridge polling, upload/export flows, calibration, and nearly the entire React component tree.

The current coverage report is below threshold and fails the configured gate in `vitest.config.ts`:

- Statements: `51.93%`
- Branches: `44.13%`
- Functions: `49.29%`
- Lines: `52.87%`

Configured thresholds:
- Lines: `80%`
- Functions: `80%`
- Branches: `70%`

Live test run context from `pnpm test:coverage`:
- `52` test files passed
- `1076` tests passed
- `4` tests skipped
- Coverage command failed because global thresholds were not met

This is not a “few missing tests” problem. It is a scope problem in the current test matrix plus a quality problem in a subset of tests that read source text or log scenarios without asserting behavior.

## Audit Method

I reviewed:
- `vitest.config.ts` for discovery and coverage scope
- Route tests in `app/api/**/__tests__`
- Hook tests in `hooks/__tests__`
- Core unit tests in `lib/**/__tests__` and `tests/dsp/**`
- High-risk runtime files with `0%` or low coverage
- `repomix-output.xml` findings related to testing and worker/bridge risks

Relevant `repomix-output.xml` anchors:
- `repomix-output.xml:3096` records the configured coverage thresholds
- `repomix-output.xml:3178` flags log-only and placeholder “vulnerability” tests
- `repomix-output.xml:3392-3396` summarizes placeholder and log-only scenario tests
- `repomix-output.xml:4519-4551` reiterates worker lifecycle risks and weak scenario-test coverage

## 1. Untested Components And Runtime Surfaces

### A. Entire React component tree is outside the current test matrix

`vitest.config.ts` only discovers tests in:
- `lib/**/__tests__/**/*.test.ts`
- `tests/**/*.test.ts`
- `hooks/__tests__/**/*.test.ts`
- `contexts/__tests__/**/*.test.ts`

There is no `components/**` discovery path, so the component layer is effectively untested by Vitest today.

Observed component surface:
- `67` component files under `components/**`

High-value untested components:
- `components/analyzer/AudioAnalyzer.tsx`
- `components/analyzer/AudioAnalyzerClient.tsx`
- `components/analyzer/DesktopLayout.tsx`
- `components/analyzer/MobileLayout.tsx`
- `components/analyzer/SpectrumCanvas.tsx`
- `components/analyzer/IssuesList.tsx`
- `components/analyzer/IssueCard.tsx`
- `components/analyzer/HeaderBar.tsx`
- `components/analyzer/FeedbackHistoryPanel.tsx`
- `components/analyzer/settings/SettingsPanel.tsx`
- `components/analyzer/settings/CalibrationTab.tsx`
- `components/analyzer/help/*.tsx`

Risk:
- Layout regressions, rendering errors, missing controls, broken mobile behavior, and wiring issues between providers and UI can ship without any automated signal.

### B. Hooks are the largest measured blind spot

Coverage report for `hooks/**`:
- Lines: `15.01%`

Hooks currently at `0%` line coverage:
- `hooks/useAnimationFrame.ts`
- `hooks/useAudioAnalyzer.ts`
- `hooks/useAudioDevices.ts`
- `hooks/useCalibrationSession.ts`
- `hooks/useCompanion.ts`
- `hooks/useDataCollection.ts`
- `hooks/useDSPWorker.ts`
- `hooks/useFullscreen.ts`
- `hooks/usePA2Bridge.ts`
- `hooks/useSessionHistory.ts`
- `hooks/useSignalTint.ts`
- `hooks/useSwipeGesture.ts`

Highest-risk untested hooks:
- `hooks/useAudioAnalyzer.ts`
  Why it matters:
  This is the analyzer lifecycle coordinator. It owns start/stop, analyzer creation, worker init/reset/update wiring, early warning state, room measurement state, and session archiving integration.
- `hooks/useDSPWorker.ts`
  Why it matters:
  This is the worker lifecycle boundary with crash recovery, buffer pooling, backpressure, and settings replay. `repomix-output.xml` specifically calls out restart/state-loss risks here.
- `hooks/usePA2Bridge.ts`
  Why it matters:
  This owns the browser-to-PA2 polling loop, abort handling, auto-send behavior, dedupe, and mixed-content error handling.

### C. API route coverage is narrow

Route handlers present:
- `app/api/companion/proxy/route.ts`
- `app/api/companion/relay/[code]/route.ts`
- `app/api/geo/route.ts`
- `app/api/sentry-example-api/route.ts`
- `app/api/v1/ingest/route.ts`

Route tests present:
- `app/api/v1/ingest/__tests__/route.test.ts`

Untested public API handlers:
- `app/api/companion/proxy/route.ts`
- `app/api/companion/relay/[code]/route.ts`
- `app/api/geo/route.ts`
- `app/api/sentry-example-api/route.ts`

Risk:
- SSRF guards, in-memory relay queue behavior, rate limiting, and geo/GDPR handling are shipping without direct route-level assertions.

### D. Calibration, export, upload, and session persistence are still mostly dark

Files at `0%` line coverage:
- `lib/calibration/calibrationSession.ts`
- `lib/calibration/calibrationExport.ts`
- `lib/data/uploader.ts`
- `lib/export/exportPdf.ts`
- `lib/storage/sessionHistoryStorage.ts`

Why these matter:
- `lib/calibration/calibrationSession.ts` contains the in-memory collection/export logic for calibration sessions, including false positive annotation, mic calibration reporting, and capped histories.
- `lib/data/uploader.ts` owns rate limiting, retry behavior, fetch error handling, and IndexedDB fallback.
- `lib/export/exportPdf.ts` generates a user-facing report with dynamic imports and multi-page content.
- `lib/storage/sessionHistoryStorage.ts` is persistence glue for archived sessions.

### E. DSP coverage is materially better, but still leaves important runtime gaps

Notable DSP weak spots from the live coverage report:
- `lib/dsp/advancedDetection.ts`: `0%`
- `lib/dsp/workerFft.ts`: `18.18%` lines
- `lib/dsp/mlInference.ts`: `38.46%` lines
- `lib/dsp/feedbackHistory.ts`: `53.1%` lines
- `lib/dsp/feedbackDetector.ts`: `65.01%` lines
- `lib/dsp/calibrationTables.ts`: `63.63%` lines
- `lib/dsp/classifier.ts`: `77.2%` lines

Special note:
- `lib/dsp/dspWorker.ts` is explicitly excluded from coverage in `vitest.config.ts`, even though it is central runtime code.

## 2. Additional Test Cases To Add

### Priority 0: Worker/analyzer orchestration

#### `hooks/useDSPWorker.ts`

Add real behavioral tests for:
- `init()` gating:
  `processPeak`, `clearPeak`, and `sendSpectrumUpdate` should be blocked or queued correctly before worker readiness.
- Crash restart behavior:
  Verify the restarted worker receives the latest settings, not only the last init snapshot.
- Unmount cleanup:
  Verify replacement workers created during crash recovery are terminated.
- Backpressure:
  Verify peaks are dropped while busy and accepted once the worker clears.
- Buffer pool routing:
  Verify `spectrumUpdate` buffers return to the correct pool.
- FFT-size change behavior:
  Verify wrong-sized returned buffers are discarded and do not pollute reuse paths.

These cases are directly justified by `repomix-output.xml:3174-3176`, `repomix-output.xml:3303-3351`, and `repomix-output.xml:4519-4538`.

#### `hooks/useAudioAnalyzer.ts`

Add tests for:
- Start flow:
  Creates analyzer, starts analysis, initializes worker with live sample rate and FFT size.
- Stop flow:
  Stops analyzer, clears timers, resets session/archive state.
- Settings propagation:
  Updating layered settings updates both analyzer and worker.
- Early warning behavior:
  Comb-pattern callback sets and clears `earlyWarning`.
- Room measurement:
  Progress updates stop measurement when the configured window elapses.
- Throttled state:
  Hot-path spectrum updates should not re-render on every frame.
- Error behavior:
  Analyzer errors flip `isRunning` false and populate `error`.

### Priority 1: PA2 and data movement

#### `hooks/usePA2Bridge.ts`

Add tests for:
- Poll loop startup and teardown with fake timers
- Abort on unmount
- `Failed to fetch` + HTTPS page + HTTP base URL mapping to the mixed-content message
- Auto-send interval throttling
- GEQ merge behavior and PEQ resend threshold
- Cross-validation confidence boost/reduction against PA2 RTA
- Panic mute path for runaway advisories
- Disabled state and missing `baseUrl` behavior

#### `lib/data/uploader.ts`

Add tests for:
- Rate-limited queue scheduling
- Session cap enforcement
- 4xx response returns no retry
- 5xx response retries with `1s -> 2s -> 4s`
- Network failure queues to IndexedDB
- `retryQueued()` re-enqueues stored batches and clears them after success
- IndexedDB unavailable path fails silently without throwing

### Priority 1: Routes

#### `app/api/companion/proxy/route.ts`

Add route tests for:
- Missing URL returns `400`
- Blocked schemes/hosts return `403`
- JSON response passthrough
- Text response passthrough via `{ raw }`
- POST body forwarding
- Upstream timeout/network error returns `502`

#### `app/api/companion/relay/[code]/route.ts`

Add route tests for:
- Invalid code returns `400`
- POST validation errors
- Queue drain semantics on `GET`
- Queue cap at `MAX_QUEUE`
- `DELETE` clears relay state
- Rate limiting returns `429`
- Control messages vs advisory payloads

#### `app/api/geo/route.ts`

Add route tests for:
- EU country returns `isEU: true`
- Non-EU country returns `false`
- Missing header returns `false`

### Priority 1: Calibration and reporting

#### `lib/calibration/calibrationSession.ts`

Add tests for:
- `downsampleSpectrum()` peak-hold grouping and rounding
- False positive flag/unflag behavior
- Max-cap behavior for detections, snapshots, missed detections, and transitions
- Mic-calibration profile tracking across settings changes
- `buildExport()` output when calibration is active vs inactive
- Summary precision/top-frequency calculation

#### `lib/export/exportPdf.ts`

Add tests that execute the real module with mocked `jspdf` and `jspdf-autotable`:
- Dynamic import success path
- Empty hotspots path
- Repeat-offender and hotspot table generation
- Multi-page footer application
- Metadata inclusion
- Version metadata fallback when `meta[name="app-version"]` is missing

### Priority 2: UI/component coverage

At minimum, add smoke and interaction tests for:
- `components/analyzer/AudioAnalyzer.tsx`
- `components/analyzer/DesktopLayout.tsx`
- `components/analyzer/MobileLayout.tsx`
- `components/analyzer/SpectrumCanvas.tsx`
- `components/analyzer/IssuesList.tsx`
- `components/analyzer/settings/SettingsPanel.tsx`
- `components/analyzer/FeedbackHistoryPanel.tsx`

Focus on:
- Provider wiring
- Empty/loading/error states
- Mobile vs desktop rendering
- Keyboard and pointer interactions
- Advisory rendering and dismissal controls

## 3. Test Quality Review

### Strong areas

The best tests in the repo are behavior-first and execute the real contract:

- `app/api/v1/ingest/__tests__/route.test.ts`
  Why it is good:
  It constructs real `NextRequest` objects, exercises the actual route handler, checks schema/rate-limit/size behavior, and verifies concrete responses.
- `lib/dsp/__tests__/*`
  Why they are good:
  The better DSP tests run real inputs through production functions and assert on outputs, thresholds, or invariants.
- `hooks/__tests__/useLayeredSettings.test.ts`
- `hooks/__tests__/useRigPresets.test.ts`
- `lib/data/__tests__/snapshotCollector.test.ts`

These tests correlate with the parts of the codebase that actually show good coverage.

### Weak areas

#### A. Source-inspection tests are being counted as if they were runtime coverage

`hooks/__tests__/useDSPWorker.test.ts` does not execute the hook. It reads source files and checks strings:
- `hooks/__tests__/useDSPWorker.test.ts:13-15`
- `hooks/__tests__/useDSPWorker.test.ts:18-31`
- `hooks/__tests__/useDSPWorker.test.ts:36-56`

Why this is weak:
- It does not exercise worker lifecycle behavior.
- It does not prove the hook works under React.
- It gives the appearance of coverage while `hooks/useDSPWorker.ts` still reports `0%`.

#### B. Mirror-logic tests do not test the actual module

`lib/export/__tests__/exportPdf.test.ts` re-implements private helpers instead of executing `exportPdf.ts`:
- `lib/export/__tests__/exportPdf.test.ts:2-7`
- `lib/export/__tests__/exportPdf.test.ts:17-32`

Why this is weak:
- The actual export module still reports `0%` coverage.
- Dynamic imports, document generation flow, pagination, and metadata/footer logic are untested.
- The test can stay green while the real implementation breaks.

#### C. Some scenario tests are documentation, not assertions

Examples:
- `tests/dsp/algorithmFusion.gpt.test.ts:76-85`
  This scenario logs output and asserts nothing.
- `tests/dsp/algorithmFusion.chatgpt-context.test.ts:282-289`
  This computes and logs a confidence difference but asserts nothing.
- `tests/dsp/algorithmFusion.chatgpt-context.test.ts:301-326`
  These “structural recall floor” cases log results without verifying expected behavior.
- `tests/dsp/algorithmFusion.chatgpt-context.test.ts:360-363`
  This is a pure placeholder: `expect(true).toBe(true)`.

This is also called out in `repomix-output.xml:3178`, `repomix-output.xml:3392-3396`, and `repomix-output.xml:4551`.

#### D. Console-heavy tests reduce signal

The coverage run emits a large amount of scenario logging from the algorithm fusion suites. The logs are sometimes useful during exploration, but in CI they make it harder to spot regressions quickly and create a false sense that observed output equals validated behavior.

### Quality conclusion

The suite has real strengths, but it currently overstates its protection level because:
- major runtime surfaces are excluded or untested
- some tests validate source text rather than behavior
- some scenario suites narrate results instead of asserting contracts

## 4. Recommended Testing Strategies

### A. Split the suite into four clear layers

#### 1. Pure unit tests

Keep and expand the strong DSP/storage/settings tests for deterministic logic:
- fusion math
- detector helpers
- advisory transforms
- storage serialization
- calibration summary math

#### 2. Hook orchestration tests in JSDOM

Add real hook tests using React Testing Library or `renderHook` with:
- fake timers
- mocked `Worker`
- mocked `AudioContext` and media devices
- mocked `fetch`
- mocked `indexedDB`

This is the missing middle layer where most regressions currently hide.

#### 3. Route contract tests

Use the same style as the ingest route tests for every route handler:
- build real `NextRequest`
- call exported route functions directly
- assert status/body/headers

This gives high signal with low runtime cost.

#### 4. Minimal component smoke tests

Do not try to snapshot every shadcn primitive. Instead cover the domain surfaces:
- analyzer shell
- settings panel
- advisory list/card
- mobile/desktop layout switching
- canvas wrapper and key overlays

### B. Stop counting documentation as tests

For the algorithm-fusion scenario files:
- Convert log-only cases into asserted invariants, or
- Move them into a markdown/design-notes artifact if they are intentionally exploratory.

Good examples of assertable invariants:
- verdict must stay below `FEEDBACK`
- probability must stay above/below a boundary
- confidence delta must be positive
- a gate must reduce score by at least some minimum

### C. Expand coverage scope deliberately

Current coverage scope excludes too much of the app to make the global thresholds meaningful. Recommended changes:
- Add `components/**/*.tsx` to coverage include
- Add `app/api/**/*.ts` to coverage include
- Revisit whether excluding `lib/dsp/dspWorker.ts` is still justified

If the worker remains excluded, document why and compensate with route/hook/message-contract tests.

### D. Use separate Vitest projects or file-level environments

The repo currently defaults to `environment: 'node'`. That is appropriate for DSP and route tests, but it discourages DOM-facing coverage.

Recommended approach:
- Keep a Node project for DSP, storage, and route tests
- Add a JSDOM project for hooks/components

This gives cleaner setup than relying on scattered per-file overrides.

### E. Prioritize behavior around failure modes, not only happy paths

The most important missing tests are not “renders correctly” tests. They are failure-path tests:
- worker crash/restart
- mixed-content errors
- relay rate limiting
- fetch retry exhaustion
- IndexedDB unavailability
- unmount cleanup
- queue/drain semantics
- timer-driven state changes

These are exactly the areas most likely to regress and least visible in manual testing.

## Prioritized Upgrade Plan

### Phase 1: Replace false confidence

1. Replace source-inspection tests in `hooks/__tests__/useDSPWorker.test.ts` with runtime hook tests.
2. Replace mirror-logic tests in `lib/export/__tests__/exportPdf.test.ts` with real module execution against mocked PDF dependencies.
3. Remove or convert placeholder/log-only algorithm-fusion tests into asserted invariants.

### Phase 2: Cover the orchestration layer

1. Add tests for `useAudioAnalyzer.ts`
2. Add tests for `usePA2Bridge.ts`
3. Add tests for `lib/data/uploader.ts`
4. Add tests for `lib/calibration/calibrationSession.ts`
5. Add tests for `lib/storage/sessionHistoryStorage.ts`

### Phase 3: Close public-route gaps

1. Add route tests for `companion/proxy`
2. Add route tests for `companion/relay/[code]`
3. Add route tests for `geo`
4. Add route tests for `sentry-example-api`

### Phase 4: Add domain UI smoke coverage

1. `AudioAnalyzer`
2. `DesktopLayout`
3. `MobileLayout`
4. `SpectrumCanvas`
5. `IssuesList`
6. `SettingsPanel`

## Final Assessment

If the current suite is judged by usefulness rather than raw test count, it earns credit for the DSP core and the ingest contract, but not yet for overall application confidence.

The critical gap is that the most failure-prone runtime code is the least tested:
- worker lifecycle
- analyzer orchestration
- PA2 bridge polling
- upload/export flows
- calibration tracking
- public API edges
- UI composition

The fastest path to materially better confidence is not adding more DSP math tests. It is adding behavior-first tests around the browser/runtime boundaries and replacing tests that only inspect source or print logs.
