# CLAUDE.md

## Project Overview

**Kill The Ring** is a real-time acoustic feedback detection and analysis tool for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using DSP algorithms, and delivers EQ recommendations with pitch translation. The app is **analysis-only** — it never outputs or modifies audio.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5.7 (strict mode)
- **UI:** shadcn/ui (New York style, Radix primitives), Tailwind CSS v4
- **Audio:** Web Audio API (AnalyserNode, Web Workers for DSP)
- **Visualization:** HTML5 Canvas
- **State:** React 19 hooks (no external state library)
- **PWA:** Serwist (service worker with controlled `skipWaiting`, offline caching, installable)
- **Package Manager:** pnpm

## Commands

```bash
pnpm dev              # Start Next.js dev server on :3000 (Turbopack, no SW)
pnpm build            # Production build (webpack, generates SW)
pnpm start            # Start production server
pnpm lint             # Run ESLint (flat config, eslint.config.mjs)
```

## Project Structure

```
app/                        # Next.js App Router pages + API routes
components/
  kill-the-ring/            # Domain components (~21 files)
    settings/               # Settings panel tab components (6 files)
  ui/                       # shadcn/ui primitives (~40 files)
contexts/                   # React context providers (PortalContainerContext)
hooks/                      # Custom React hooks (8 files)
lib/
  audio/                    # AudioAnalyzer factory
  canvas/                   # Pure canvas drawing helpers (no React dependency)
  changelog.ts              # Version history (rendered in About tab)
  dsp/                      # DSP engine: detector, classifier, advisor, worker (split into focused modules)
  utils/                    # Math helpers, pitch utilities
  utils.ts                  # cn() helper for Tailwind class merging
types/                      # TypeScript interfaces (advisory.ts)
```

## Architecture

- **Main thread:** AudioContext + AnalyserNode, FFT capture, requestAnimationFrame loop (60fps), React rendering
- **Web Worker** (`lib/dsp/dspWorker.ts`): TrackManager, Classifier, EQAdvisor — offloaded to keep UI at 60fps
- **Data flow:** Mic → GainNode → AnalyserNode → FFT data → Worker (classify) → React state → Canvas render
- Components in `components/kill-the-ring/` use barrel export via `index.ts`
- `contexts/PortalContainerContext.tsx` provides a portal mount point for mobile overlays
- **Security headers:** `next.config.mjs` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` (microphone only)
- **No environment variables required** — app is fully client-side with localStorage persistence
- **Mobile:** MobileLayout uses WAI-ARIA tabs pattern (roving tabindex, ArrowLeft/Right/Home/End keyboard nav); DesktopLayout uses `landscape:flex` CSS toggle — never modify DesktopLayout for mobile-specific changes
- **Accessibility:** Touch targets ≥44×44px (`min-h-[44px] min-w-[44px]`), `role="status"` sr-only spans for clipboard announcements

## Coding Conventions

- **Components:** PascalCase, wrapped in `memo()`, explicit `'use client'` directive when needed
- **Hooks:** `use` prefix, camelCase (e.g., `useAudioAnalyzer`)
- **Types:** PascalCase; interfaces for objects, type aliases for unions; all domain types in `types/advisory.ts`
- **Constants:** SCREAMING_SNAKE_CASE, centralized in `lib/dsp/constants.ts`
- **Functions/variables:** camelCase
- **Private class members:** `_prefixed`
- **Imports:** Use `@/*` path alias (maps to project root)
- **Code splitting:** Large modules use barrel re-exports (`export * from './subModule'`); dialogs/panels use `React.lazy()` with `.then(m => ({ default: m.X }))` for named exports
- **Canvas functions:** Pure drawing helpers in `lib/canvas/` — use `{ current: T }` params, not `React.RefObject`
- **Styling:** Tailwind utility classes + `cn()` from `lib/utils.ts` for conditional classes
- **No test framework configured** — rely on TypeScript strict mode and manual browser testing
- **ESLint:** Flat config (`eslint.config.mjs`) with `eslint-config-next` core-web-vitals + typescript + `@typescript-eslint/no-explicit-any` warn
- **Build verification:** `npx tsc --noEmit && pnpm build` — must both pass before PRs

## CI/CD

- **Versioning:** `1.{MINOR}.{PATCH}` — PR merge bumps minor + resets patch (`auto-version.yml`), direct push increments patch (`patch-on-push.yml`). Both commit with `[skip ci]`.
- **Deployment:** Vercel auto-deploys on push to `main`; the `[skip ci]` in auto-version commits prevents double-deploys
- **Version flow:** `package.json` version → `next.config.mjs` reads via `readFileSync` → `NEXT_PUBLIC_APP_VERSION` env → HeaderBar + HelpMenu
