# False Positive & Duplicate Elimination v1.0.4

## Problem

v1.0.3 added signal gate, hysteresis, prominence floor, and hotspot cooldown but users still report:
1. False positives in silence AND during real audio across all modes
2. Multiple advisory cards for nearby frequencies
3. Same frequency re-appearing as new card after auto-clear
4. Inflated hotspot history counts

## Root Causes Identified

1. **Signal gate thresholds too low** — ambient room noise in live venues sits around -55 to -50 dBFS; current thresholds (-55 to -70) let noise through
2. **Merge radius gap** — track association (100 cents) < advisory merge (150 cents), allowing two tracks at ~120 cents to spawn separate advisories
3. **No auto-clear cooldown** — `bandClearedAt` only fires on user-initiated clears, not natural peak decay; same frequency re-triggers instantly
4. **No global rate limit** — multiple peaks in the same frame flood UI with simultaneous advisory cards
5. **sustainMs too short** — 150-200ms allows transient noise bursts to pass
6. **Prominence floor too low** — 8 dB lets moderate noise spikes through

## Changes (5 files + version bump)

### 1. constants.ts — Thresholds, Merge Windows, Cooldowns

**Signal gate thresholds raised by 10 dB:**

| Mode | v1.0.3 | v1.0.4 |
|------|--------|--------|
| DEFAULT | -65 | -55 |
| speech | -65 | -55 |
| worship | -60 | -50 |
| liveMusic | -55 | -45 |
| theater | -68 | -58 |
| monitors | -55 | -45 |
| ringOut | -70 | -60 |
| broadcast | -70 | -60 |
| outdoor | -55 | -45 |

**Merge windows unified at 200 cents:**
- `TRACK_SETTINGS.ASSOCIATION_TOLERANCE_CENTS`: 100 → 200
- `TRACK_SETTINGS.HARMONIC_DEDUP.TOLERANCE_CENTS`: 100 → 200
- `DEFAULT_SETTINGS.peakMergeCents`: 150 → 200
- `DEFAULT_SETTINGS.harmonicToleranceCents`: 100 → 200

**Cooldowns increased:**
- `BAND_COOLDOWN_MS`: 1500 → 3000
- `HOTSPOT_COOLDOWN_MS`: 2000 → 3000

**sustainMs raised to 250ms** for all modes

### 2. classifier.ts — Prominence Floor

- `prominenceDb` minimum: 8 → 10 dB

### 3. dspWorker.ts — Auto-Clear Cooldown + Rate Limiter

- **Auto-clear cooldown**: `clearPeak` handler already sets `bandClearedAt` — verify it fires on ALL clears (natural + manual)
- **Global rate limiter**: New `lastAdvisoryCreatedAt` timestamp; max 1 new advisory per 1000ms

### 4. feedbackHistory.ts — Hotspot Cooldown

- `HOTSPOT_COOLDOWN_MS` already imported from constants; value change propagates automatically

### 5. package.json — Version Bump

- 1.0.3 → 1.0.4

## Implementation Order

1. `constants.ts` — all threshold/window/cooldown changes (no deps)
2. `classifier.ts` — prominence floor (no deps)
3. `dspWorker.ts` — auto-clear cooldown + rate limiter (deps: constants)
4. `package.json` — version bump
5. Verify: `npx tsc --noEmit`

## Verification

1. `npx tsc --noEmit` — zero type errors
2. Manual: muted mic → no advisories appear
3. Manual: quiet room ambient noise → no advisories appear
4. Manual: play audio → advisories appear normally, limited to ~1/second
5. Manual: stop audio → no re-triggering within 3 seconds
6. Manual: two close tones (e.g., 990 Hz + 1020 Hz) → single advisory card
7. Manual: sustained tone → hotspot count increments at most once per 3 seconds
