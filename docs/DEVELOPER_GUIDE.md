# DoneWell Audio Developer Guide

This is the current day-to-day workflow guide for contributors.

## Prerequisites

- Node.js 22+
- `pnpm` 10.30.1
- a secure origin for microphone testing (`localhost` is fine in development)

## Setup

```bash
git clone https://github.com/donwellsav/donewellaudio.git
cd donewellaudio
pnpm install
pnpm dev
```

Production-parity run:

```bash
pnpm build
pnpm start
```

## Required Verification

Repo gate:

```bash
npx tsc --noEmit && pnpm test
```

Useful supporting commands:

```bash
pnpm lint
pnpm test:coverage
pnpm run audit:prod -- --audit-level=high
```

Accuracy workflows for DSP tuning:

```bash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
```

## Repo Rules That Matter

- Use `pnpm`, not `npm` or `yarn`.
- Keep TypeScript strict. Do not introduce `any`.
- Treat `lib/dsp/feedbackDetector.ts` and the worker classification path as performance-sensitive.
- Keep the product analysis-only. Do not create code paths that modify browser audio output.
- Do not duplicate default values in multiple places when the layered settings model already owns them.

## Where To Make Changes

UI, help, and settings:
- `components/analyzer/`
- `components/analyzer/help/`
- `components/analyzer/settings/`

State and orchestration:
- `contexts/`
- `hooks/`

Detector and advisory logic:
- `lib/dsp/`
- `types/advisory.ts`

Layered defaults and presets:
- `lib/settings/`
- `types/settings.ts`

Companion integration:
- `app/api/companion/`
- `companion-module/`

Docs and wiki:
- `README.md`
- `docs/*.md`
- `C:\projects\donewellaudio-wiki`
- `components/analyzer/help/`

## Common Change Recipes

Add or adjust a settings default:
1. update the correct owner in `lib/settings/`
2. make sure `deriveDetectorSettings()` still produces the intended runtime value
3. update any UI reset path that should clear back to the owner instead of hardcoding a number
4. update help/docs if the behavior is user-facing

Tune detector recall or suppression:
1. identify whether the regression is in peak detection, fusion, classification, or reporting
2. add or update targeted regression tests near the affected module
3. run synthetic and snapshot replay evaluation when the change affects verdict behavior
4. update docs only after the measured behavior is verified

Change Companion behavior:
1. verify the app relay contract in `app/api/companion/relay/[code]/route.ts`
2. verify the module contract in `companion-module/src/`
3. keep the distinction between analysis, relay transport, and control-side action explicit

## Documentation Hygiene

Prefer current code, tests, and help surfaces over older audit notes when they disagree. If a markdown file becomes stale, fix it immediately instead of carrying contradictory explanations.
