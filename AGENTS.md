# AGENTS.md — DoneWell Audio

> Living repo instructions. Verify exact version, file counts, and test totals from the current working tree before quoting them.

## Critical Rules

- **NEVER run `git push`** unless the user explicitly says "push" or "send to GitHub". Committing locally is fine. Pushing is NOT.
- **Build verification after every change:** `npx tsc --noEmit && pnpm test`
- **Do not modify audio output.** DoneWell Audio is analysis-only. It listens and advises. It never modifies the audio signal.
- **Use `pnpm`, not `npm` or `yarn`.** The project enforces `pnpm@10.30.1` via `packageManager` in `package.json`.
- **Zero `any` types.** TypeScript strict mode is enforced. `@typescript-eslint/no-explicit-any: error`.

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack)
pnpm build            # Production build (webpack, generates SW)
pnpm test             # Vitest
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Vitest with V8 coverage
pnpm lint             # ESLint (flat config)
npx tsc --noEmit      # Type-check (run BEFORE pnpm build)
```

Build gate — all must pass before committing:
```bash
npx tsc --noEmit && pnpm test
```

## Project Overview

**DoneWell Audio** is a browser-based real-time acoustic feedback detection PWA for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using six fused detection algorithms plus an ML model, and delivers EQ recommendations with pitch translation. All audio processing runs locally in the browser — no audio is transmitted.

**URL:** donewellaudio.com
**Repo:** github.com/donwellsav/donewellaudio

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack dev / webpack prod)
- **Language:** TypeScript 5.7 (strict mode)
- **UI:** shadcn/ui (New York), Tailwind CSS v4, Radix primitives
- **Audio:** Web Audio API (AnalyserNode, 8192-point FFT at 50fps)
- **DSP Offload:** Web Worker (`dspWorker.ts`)
- **Visualization:** HTML5 Canvas at 30fps
- **State:** React 19 hooks + 4 context providers (no external state library)
- **Testing:** Vitest
- **Error Reporting:** Sentry
- **PWA:** Serwist (service worker, offline caching)
- **Package Manager:** pnpm 10.30.1

## Architecture

### Audio Pipeline

```
Mic → getUserMedia → GainNode → AnalyserNode (8192 FFT)
  → FeedbackDetector.analyze() at 50fps (main thread)
    → Peak detection with MSD/prominence/persistence
    → postMessage(peak, spectrum, timeDomain) [transferable]
      → Web Worker: AlgorithmEngine.computeScores()
      → fuseAlgorithmResults() [content-adaptive weights]
      → classifyTrackWithAlgorithms() [11 features]
      → generateEQAdvisory()
      → AdvisoryManager.createOrUpdate() [3-layer dedup]
      → postMessage(advisory) back to main thread
        → useAdvisoryMap → React render → Canvas + Advisory cards
```

### Thread Model

- **Main thread:** AudioContext, AnalyserNode, FeedbackDetector (peak detection), requestAnimationFrame (canvas 30fps), React rendering
- **Web Worker:** Classification, algorithm fusion, EQ advisory, track management. Communicates via transferable Float32Arrays (zero-copy).

### Detection Algorithms (7 total)

1. **MSD** — Magnitude stability (feedback ≈ 0, music >> 0)
2. **Phase Coherence** — Frame-to-frame phase stability
3. **Spectral Flatness** — Geometric/arithmetic mean + kurtosis + crest
4. **Comb Pattern** — Evenly-spaced peaks from acoustic loop
5. **IHR** — Inter-harmonic energy ratio
6. **PTMR** — Peak-to-median ratio
7. **ML (ONNX)** — Bootstrap MLP 11→32→16→1 (929 params, 4KB)

Content-adaptive weights vary by mode (speech, worship, liveMusic, theater, monitors, ringOut, broadcast, outdoor).

### Post-Fusion Gates

- **IHR gate:** harmonics ≥ 3 AND IHR > 0.35 → pFeedback *= 0.65 (instrument suppression)
- **PTMR gate:** PTMR score < 0.2 → pFeedback *= 0.80 (broad peak suppression)
- **Formant gate:** 2+ peaks in vocal formant bands + Q 3–20 → pFeedback *= 0.65
- **Chromatic gate:** Frequency on 12-TET grid ±5 cents + coherence > 0.80 → phase *= 0.60
- **Comb stability gate:** Spacing CV > 0.05 over 16 frames → comb *= 0.25
- **Mains hum gate:** Peak on 50n/60n Hz + 2 corroborating peaks → pFeedback *= 0.40

## Key File Paths

```
app/layout.tsx                    # Root layout
app/page.tsx                      # Entry point
components/analyzer/              # Domain components
  AudioAnalyzer.tsx               #   Root orchestrator
  HeaderBar.tsx                   #   Header bar (amber sidecar theme)
  DesktopLayout.tsx               #   Desktop 3-panel layout
  MobileLayout.tsx                #   Mobile portrait/landscape layouts
  IssuesList.tsx                  #   Advisory cards with swipe gestures
  VerticalGainFader.tsx           #   Fader strip (w-20, 80px)
  settings/SettingsPanel.tsx      #   4-tab settings with controlled tabs
  help/HelpShared.tsx             #   HelpSection + HelpGroup components
contexts/                         # 4 context providers + compound wrapper
  AudioAnalyzerContext.tsx        #   Engine/Settings/Metering/Detection
  AdvisoryContext.tsx             #   Advisory state management
  UIContext.tsx                   #   UI state (tabs, freeze, fullscreen)
hooks/                            # Custom hooks
  useDSPWorker.ts                 #   Worker lifecycle, crash recovery
lib/dsp/                          # DSP engine
  feedbackDetector.ts             #   Core: peak detection, auto-gain (HOT PATH)
  constants.ts                    #   All tuning constants, 8 mode presets
  classifier.ts                   #   11-feature Bayesian classification
  algorithmFusion.ts              #   6-algo fusion + gates
  dspWorker.ts                    #   Worker orchestrator
  eqAdvisor.ts                    #   GEQ/PEQ/shelf recommendations
  trackManager.ts                 #   Track lifecycle, cents-based association
lib/canvas/spectrumDrawing.ts     # Canvas rendering (no React deps)
types/advisory.ts                 # All DSP interfaces
```

## Coding Conventions

- **Components:** PascalCase, `memo()`, `'use client'` directive
- **Hooks:** `use` prefix, camelCase
- **Constants:** SCREAMING_SNAKE_CASE in `lib/dsp/constants.ts`
- **Imports:** Always `@/*` path alias
- **Styling:** Tailwind utilities + `cn()` from `lib/utils.ts`
- **JSDoc:** Required on all DSP functions with academic references
- **Testing:** Vitest. Co-located unit tests in `__tests__/`, scenario tests in `tests/dsp/`

## Performance Constraints

- `FeedbackDetector.analyze()` is the **hot path** — runs every 20ms (50fps)
- MSD uses pooled sparse allocation: 256 slots × 64 frames = 64KB
- Canvas renders at 30fps (not 60fps)
- Worker backpressure: if worker is still processing, next peak is DROPPED
- Transferable buffers: Float32Arrays are zero-copy transferred to worker

## Testing

- Coverage thresholds: lines 80%, functions 80%, branches 70%
- Test patterns: `lib/**/__tests__/**`, `tests/**`, `hooks/__tests__/**`, `contexts/__tests__/**`
- Run after every change: `npx tsc --noEmit && pnpm test`

## Version Scheme

`0.{PR_NUMBER}.0` — minor version matches the GitHub PR number.

## Security

- CSP: Nonce-based `script-src` in prod (`middleware.ts`)
- Permissions-Policy: `microphone=(self), camera=(), geolocation=()`
- API: Ingest endpoint validates schema, dual rate-limiting, strips IP
- All localStorage access via `dwaStorage.ts` abstraction

## Figma Design System Rules

These rules apply whenever implementing a Figma design in this repo.

### Project Structure

- **App shell:** `app/` (Next.js 16 App Router)
- **Reusable UI primitives:** `components/ui/`
- **Product UI:** `components/analyzer/`
- **Analyzer sub-features:** `components/analyzer/settings/`, `components/analyzer/help/`
- **Shared logic:** `hooks/`, `contexts/`, `lib/`
- **Public assets:** `public/`, especially `public/images/` and `public/models/`

### Framework and Styling

- **Framework:** React 19 + Next.js App Router
- **Styling:** Tailwind CSS v4 only. Do not introduce CSS Modules, styled-components, or inline style-heavy component patterns unless the existing file already needs inline styles for canvas or one-off geometry.
- **Utility merge:** use `cn()` from `lib/utils.ts` for composed class strings.
- **Primitives:** prefer existing shadcn/ui and Radix-based components from `components/ui/` before creating new primitives.
- **Component shape:** use PascalCase components, typed props, and `memo()` where the surrounding code already follows that pattern.
- **Imports:** always use the `@/*` alias, never long relative traversals.

### Tokens and Visual Language

- **Theme tokens live in:** `app/globals.css`
- **Token format:** CSS custom properties on `:root` and `.light`, then mapped into Tailwind v4 tokens via `@theme inline`.
- **Primary semantic tokens:** `--background`, `--foreground`, `--card`, `--border`, `--primary`, `--muted`, `--accent`, `--destructive`, `--ring`
- **Product-specific tokens:** severity colors, console colors, sidebar colors, signal tint channels, and radius values also live in `app/globals.css`.
- **IMPORTANT:** never hardcode hex colors in Figma-derived React components if an equivalent semantic token already exists. Use Tailwind classes such as `bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`, `bg-primary`, or CSS vars already defined in `app/globals.css`.
- **IMPORTANT:** preserve the existing "pro-audio instrument" look. This UI is not generic SaaS. Prefer recessed panels, amber/blue console accents, mono readouts, and hardware-like states over flat card grids.
- **Typography:** Geist Sans and Geist Mono are loaded in `app/layout.tsx`. Reuse those through Tailwind classes like `font-sans` and `font-mono`; do not add extra font packages for Figma implementations.
- **Radius:** use the shared radius tokens from Tailwind classes (`rounded-md`, `rounded-lg`, etc.), not one-off pixel radii unless already established in the target file.

### Component Reuse Rules

- Reuse `components/ui/button.tsx`, `dialog.tsx`, `sheet.tsx`, `tabs.tsx`, `select.tsx`, `slider.tsx`, `tooltip.tsx`, `card.tsx`, and related primitives before creating new base components.
- If the design belongs to the analyzer product surface, place it in `components/analyzer/` and match nearby files rather than dropping it into `components/ui/`.
- If the design is a settings surface, prefer the existing settings architecture in `components/analyzer/settings/SettingsPanel.tsx` and the tab components under `components/analyzer/settings/`.
- If the design is informational/help content, follow the existing grouping in `components/analyzer/help/`.
- Do not duplicate existing control patterns such as the analyzer header, issue cards, ring-out wizard panels, fader strips, or settings rows if a nearby component can be extended instead.

### Responsive and Layout Rules

- Mobile and desktop layouts are intentionally separated into `MobileLayout.tsx` and `DesktopLayout.tsx`. Prefer adapting each layout explicitly instead of forcing one giant responsive component.
- The repo uses Tailwind plus custom variants from `app/globals.css`, including `landscape:` and tablet/lg breakpoints. Follow those existing variants instead of inventing a second breakpoint system.
- For desktop split panes, reuse the resizable panel primitives from `components/ui/resizable.tsx`.
- For canvas-based analyzer areas, keep layout chrome in React and styling, but do not try to rebuild the actual spectrum rendering in DOM.

### Asset and Icon Rules

- Existing static assets belong in `public/`. Put new Figma-exported raster or SVG assets under `public/images/` unless there is a stronger existing location.
- This project already uses `lucide-react` broadly for product UI icons. Reuse Lucide for standard controls when the design calls for generic icons that already exist in the product.
- If Figma provides a bespoke logo, illustration, or non-Lucid icon, use the Figma asset instead of approximating it with Lucide.
- `next/image` is already used for image assets such as the logo. Use it for real image assets when appropriate, but note that `next.config.mjs` sets `images.unoptimized = true`.
- IMPORTANT: if the Figma MCP server returns localhost asset URLs, use them directly during implementation and then place the finalized assets in `public/images/` if the task requires storing them in the repo.
- IMPORTANT: do not add a new icon package.
- IMPORTANT: do not use placeholders if Figma already provides the asset.

### State and Architecture Rules

- Analyzer state is split across context providers: `AudioAnalyzerContext`, `AdvisoryContext`, `UIContext`, and related engine/settings/metering contexts. Hook new UI into existing providers before adding new global state.
- Keep product logic in hooks and contexts, not inside large presentational JSX blocks.
- Keep DSP, audio, and worker logic out of Figma-driven UI work unless the design explicitly requires wiring to existing analyzer behavior.
- DoneWell Audio is analysis-only. UI changes must not imply that the product changes or processes live audio output.

### Testing and Quality Rules

- Add or update Vitest coverage for meaningful UI behavior changes. Existing test locations include `components/**/__tests__/`, `hooks/__tests__/`, and `contexts/__tests__/`.
- Keep TypeScript strict. Do not introduce `any`.
- Prefer targeted regression tests for new interaction behavior rather than broad snapshot tests.
- Preserve accessibility basics already present in the codebase: labeled controls, keyboard focus states, and semantic buttons.

## Figma MCP Implementation Flow

Follow this sequence for Figma-driven work in this repo:

1. Run `get_design_context` for the exact node.
2. If the node is large, narrow the fetch instead of implementing from a truncated payload.
3. Run `get_screenshot` for the same node and use it as the visual truth source.
4. Translate the Figma output into this repo's conventions:
   - React function components
   - Tailwind CSS v4 classes
   - `cn()` for class composition
   - shadcn/ui and analyzer-specific primitives where possible
   - semantic tokens from `app/globals.css`
5. Reuse existing layout and context patterns before inventing new architecture.
6. Validate the final implementation against the screenshot for spacing, typography, color, and interaction states.

## Figma-to-Code Guardrails

- Treat Figma MCP code output as a structural reference, not final code style.
- Do not paste raw generated Tailwind if it duplicates existing local components or violates the analyzer visual language.
- Do not hardcode design-token values already represented by project tokens.
- Do not collapse desktop and mobile analyzer layouts into one oversized component just because Figma shows both states in one frame.
- Do not introduce decorative styles that conflict with the established instrument-console aesthetic in `app/globals.css`.
- Do not remove `memo()`, path aliases, or context boundaries from nearby code unless there is a clear technical reason.
