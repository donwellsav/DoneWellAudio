# DoneWell Audio — Bug Bible

> **Complete catalog of bugs found and fixed.** Organized by subsystem. 50+ entries from v0.89.0 to v0.151.0.

---

## DSP / Detection Engine

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 1 | MSD sample std deviation wrong | v0.118.0 | Used n instead of n-1 (Bessel's correction) | Changed denominator to n-1 |
| 2 | MSD buffer status always 0 | v0.129.0 | `createAudioAnalyzer` hardcoded `msdFrameCount: undefined`; LRU eviction made pool maxFrameCount unreliable | Use analyzeCallCount as readiness proxy |
| 3 | 400 Hz hard floor false negatives | v0.114.0 | Erroneous frequency floor blocking sub-400Hz detection | Removed hard floor |
| 4 | LOW band multiplier over-penalizing | v0.114.0 | Triple-stacking prominence/sustain penalties | Reduced prominence 1.4x→1.15x, sustain 1.5x→1.2x |
| 5 | Schroeder room mode penalty too harsh | v0.113.0 | -0.25 penalty blocked sub-300Hz detection | Reduced to -0.12 |
| 6 | Prominence floor not synced to settings | v0.113.0 | Hardcoded 10dB instead of `settings.prominenceDb` | Synced with user settings |
| 7 | Prominence gate bypass with 2 bins | v0.118.0 | Minimum neighborhood too small | Raised minimum to 4 bins |
| 8 | Sideband dB averaging domain error | v0.118.0 | Averaging in dB instead of linear power | Convert to linear before averaging |
| 9 | GEQ band index formula error | v0.118.0 | Inline log2 calculation incorrect | Replaced with `findNearestGEQBand()` lookup |
| 10 | ERB depth scale discontinuity | v0.118.0 | Jump at 2kHz boundary | Smoothed transition |
| 11 | Room mode proximity tracking | v0.118.0 | Only tracked first match | Now tracks best match across all modes |
| 12 | Hotspot map key collision | v0.118.0 | Hash collisions in hotspot tracking | Replaced with unique string IDs |
| 13 | Early feedback detection weak | v0.103.0 | Quiet/early feedback missed | MSD-lowered threshold gate |

## Content Type Classification

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 14 | Content type always "---" | v0.129.0 | Worker computed contentType but no message carried it to UI | Extended tracksUpdate message with contentType field |
| 15 | Speech misclassified as music | v0.129.0 | flatness > 0.2 gate fired before crestFactor > 8 check | Reordered gates |
| 16 | Content type stuck on "unknown" | v0.131.0 | Only computed per-peak; speech without peaks never classified | Main thread computes every 500ms regardless of peaks |
| 17 | Content type flickering | v0.131.0 | Single-frame classifications flip-flopped | Majority-vote smoothing over 10 frames (~5s) |
| 18 | Spectral features overlap speech/music | v0.145.0 | Crest factor and flatness unreliable alone | Added temporal envelope (energy variance + silence gap ratio, 40% weight) |

## Algorithm Fusion

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 19 | Confidence formula wrong | v0.111.0 | UNCERTAIN state unreachable | Changed to `prob * (0.5 + 0.5 * agreement)` |
| 20 | Post-override normalization undid RUNAWAY | v0.111.0 | Normalization after overrides | Apply normalization before overrides |
| 21 | Comb weight doubling dilutes | v0.111.0 | Doubled in both numerator and denominator | Double only in numerator |

## EQ Advisory

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 22 | Advisory card duplication | v0.114.0 | Accumulated instead of replacing | Frequency-proximity matching (200 cents) replaces |
| 23 | Duplicate advisories not clearing | v0.113.0 | Cleared advisories not removed by ID | Remove by ID before re-detection |
| 24 | Shelf overlap/deduplication | v0.110.0 | Multiple shelves in same band | `validateShelves()` post-processor |
| 25 | HPF mud threshold collision | v0.110.0 | HPF raising mud frequency caused overlap | HPF-active raises mud threshold +2dB |

## Auto-Gain

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 26 | Auto-gain EMA coefficients stale | v0.111.0 | `updateConfig()` didn't recompute | Added `recompute()` call |
| 27 | Auto-gain off by default | v0.89.0 | Always active on startup | Off by default, user enables |
| 28 | Default sensitivity too high (HVAC FP) | v0.151.0 | 30dB caught ambient noise | Changed speech/ring-out to 27dB |

## Worker Communication

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 29 | Buffer transfer missing | v0.118.0 | Typed arrays not in transfer list | Added to postMessage transfer |
| 30 | useAudioAnalyzer stale closures | v0.118.0 | Wrong refs in dependency arrays | Fixed dependency arrays |
| 31 | SnapshotCollector not loading | v0.118.0 | Dynamic import failing in worker | Changed to static import |
| 32 | Collection queue before ready | v0.118.0 | enableCollection before worker init | Queue until ready |
| 33 | onnxruntime-web Turbopack warning | v0.150.0 | Bundler tries to resolve optional dep | `/* webpackIgnore: true */` comment |

## Data Collection / API

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 34 | Gzip compression upload failure | v0.119.0 | Zero browser uploads | Removed gzip compression |
| 35 | Consent dialog stuck state | v0.120.0 | Users stuck in 'prompted' state | Re-show for stuck users |
| 36 | Spectral snapshot collection gap | v0.120.0 | Only collecting for reported peaks | Collect for all classified peaks |

## UI / Layout

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 37 | Tablet breakpoint mismatch | v0.110.0 | 768px threshold too high | Lowered to 600px |
| 38 | Fullscreen icons confusion | v0.148.0 | One button for both app and RTA fullscreen | Separated into two distinct buttons |
| 39 | Mobile tab swipe conflict | v0.148.0 | Page swipe fought card swipe-to-label | Disabled tab swipe on Issues tab |
| 40 | Mobile graph resize handle broken | v0.149.0 | Touch target too small + passive listener conflict | Larger target, removed preventDefault |
| 41 | Canvas theme stale closure | v0.146.0 | RAF callback captured old theme | Use refs for RAF reads |
| 42 | Amber spectrum hard to read in light mode | v0.146.0 | Warm mode amber on light bg | Force blue in light mode |
| 43 | Glass cards unreadable in light mode | v0.146.0 | Dark-only hardcoded rgba | Added `.light .glass-card` override |

## Security / Build

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 44 | CSP unsafe-inline in production | v0.128.0 | Static unsafe-inline for scripts | Per-request nonce via middleware.ts |
| 45 | CSP nonce hydration mismatch | v0.128.0 | Nonce in script tag caused React warning | `suppressHydrationWarning` on body |
| 46 | Webpack SHA256 hash error | v0.124.0 | Node 22 LTS incompatibility | Updated webpack hash config |

## Error Handling

| # | Bug | Version | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 47 | RAF loop silent death | v0.129.0 | Callback errors crashed loop | Wrapped in try-catch |
| 48 | localStorage quota exceeded | v0.129.0 | Silent failure on save | try-catch with graceful degradation |
| 49 | ResizeObserver errors breaking canvas | v0.129.0 | Observer callback errors | Wrapped in try-catch |
| 50 | Object URL leak in export | v0.118.0 | CSV/JSON downloads leaked URLs | `revokeObjectURL()` after download |

---

## Statistics

- **Total bugs cataloged:** 50
- **DSP/Detection:** 13
- **Content Type:** 5
- **Algorithm Fusion:** 3
- **UI/Layout:** 7
- **Worker/Communication:** 5
- **Security/Build:** 3
- **Error Handling:** 4
- **All P1-P3 bugs resolved** as of v0.127.0
- **Test suite:** 476 tests (471 pass, 4 skip, 1 todo) — 99% pass rate
