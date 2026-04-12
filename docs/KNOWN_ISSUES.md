# DoneWell Audio — Known Issues & Recommendations

> **Last updated:** April 12, 2026 | **Version:** 0.92.0

---

## Open Known Issues

### Accessibility

| Issue | Impact | Location | Suggested Fix |
|-------|--------|----------|---------------|
| Canvas not accessible to screen readers | High — blind users cannot use the tool | CLAUDE.md, SpectrumCanvas.tsx | Add aria-live region announcing detected peaks with frequency and severity |
| ~~Focus indicators inconsistent~~ | ~~Medium~~ Fixed | Multiple components | Standardized `focus-visible:ring-[3px]` across all components (v0.80.0+) |

### Skipped Tests

| Test | File | Reason |
|------|------|--------|
| V2 Fusion Weight Regression Tests | `tests/dsp/algorithmFusion.test.ts:768` | `describe.skip` — V2 weights from Gemini analysis ready but not validated in production |
| Broad peak spectral flatness | `tests/dsp/compressionDetection.test.ts:54` | `it.todo` — Formula returns 0.035 instead of expected >0.2 for wide peaks |

### Architecture Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| Worker message runtime validation | Medium | `satisfies` is compile-time only. Malformed messages silently ignored. |
| Worker restart race condition | ~~Medium~~ Fixed | ~~Component unmount during restart timeout window could attach stale handlers~~ Fixed in v0.92.0: exponential backoff (500ms→1s→2s) + max 3 restarts |
| Buffer pool epoch tracking | Low | Buffers from crashed worker could pollute new pool |
| Settings schema validation | Low | No range checking on `updateSettings()` — invalid values propagate to worker |

### GDPR/Privacy

| Issue | Status |
|-------|--------|
| Data collection is opt-out (US model) | Needs opt-in for GDPR jurisdictions before EU launch |

---

## Feature Roadmap (from v0.148+ planning)

### Completed This Session
- [x] Temporal envelope content type detection (v0.145.0)
- [x] Dark/Light theme toggle with full canvas support (v0.146.0)
- [x] Ring-Out guided wizard + dual entry point UX (v0.147.0)
- [x] Mobile inline resizable graphs, 2-tab layout (v0.148.0)
- [x] Swipe actions rework (dismiss/confirm/FP) (v0.148.0)
- [x] Fullscreen icon separation (v0.148.0)
- [x] onnxruntime-web warning suppressed (v0.150.0)
- [x] Sensitivity guidance (3 layers) + default tuning (v0.151.0)

### Planned (Not Yet Started)
- [ ] **Landscape tablet layout** — dedicated layout for 768-1024px (iPad)
- [ ] **Multi-mic support** — architecture planned, 2-3 week implementation
- [ ] **History timeline** — show soundcheck frequency history for pre-notching
- [ ] **Console EQ format export** — Yamaha CL/QL, Allen & Heath dLive, DiGiCo SD formats
- [ ] **Notification/alert sounds** — subtle audio alert through headphones on new feedback
- [ ] **Room profile comparison** — load previous venue profiles
- [ ] **Full offline PWA** — precache ONNX model + WASM (deferred due to onnx risk)

---

## Prioritized Fix Recommendations

### Immediate (< 1 hour each)

| # | Fix | File | Effort |
|---|-----|------|--------|
| 1 | Add `isUnmountedRef` guard to worker restart callback | `hooks/useDSPWorker.ts` | 15 min |
| 2 | Log fullscreen errors to Sentry instead of swallowing | `contexts/UIContext.tsx` | 15 min |
| 3 | Validate session ID as UUID v4 in API | `app/api/v1/ingest/route.ts` | 15 min |
| 4 | Add visibility check before fullscreen attempt | `contexts/UIContext.tsx` | 15 min |

### Soon (1-2 hours each)

| # | Fix | File | Effort |
|---|-----|------|--------|
| 5 | Add `validateDetectorSettings()` with range checks | New util + SettingsContext | 1 hour |
| 6 | Buffer pool generation counter for crash recovery | `hooks/useDSPWorker.ts` | 30 min |
| 7 | Use `useReducer` for advisory state (atomic transitions) | `contexts/AdvisoryContext.tsx` | 2 hours |

### Nice-to-Have

| # | Fix | File | Effort |
|---|-----|------|--------|
| 8 | Runtime worker message validation (zod or manual) | `lib/dsp/dspWorker.ts` | 2 hours |
| 9 | Consistent focus indicators across all components | Multiple TSX files | 1 hour |
| 10 | Canvas aria-live region for peak announcements | `SpectrumCanvas.tsx` | 2 hours |

---

## Test Coverage Summary

| Suite | Tests | Pass | Skip | Todo |
|-------|-------|------|------|------|
| DSP integration | ~135 | All | 4 | 1 |
| Hook unit tests | ~22 | All | 0 | 0 |
| Context unit tests | ~15 | All | 0 | 0 |
| Storage tests | 15 | All | 0 | 0 |
| Export tests | ~12 | All | 0 | 0 |
| ML inference | 12 | All | 0 | 0 |
| Temporal envelope | 6 | All | 0 | 0 |
| **Total** | **476** | **471** | **4** | **1** |

**Pass rate: 99.0%**
