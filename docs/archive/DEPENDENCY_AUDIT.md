# DoneWell Audio Dependency Audit

> Audited on 2026-03-31 against the live repository, `pnpm-lock.yaml`, live registry queries, local audit output, and `repomix-output.xml`.
> Source-of-truth order for this document: live manifests and lockfile > live `pnpm outdated` / `pnpm audit` results > `repomix-output.xml` > older prose docs.

## Audit Basis

This audit covers the three package manifests confirmed both in the repo tree and in `repomix-output.xml`:

- Root app: `package.json`
- DoneWell Companion module: `companion-module/package.json`
- dbx PA2 Companion package: `companion-module-dbx-driverack-pa2/package.json`

Current live dependency surface:

- Root app: `24` production deps, `23` dev deps
- `companion-module/`: `1` production dep, `1` dev dep
- `companion-module-dbx-driverack-pa2/`: `1` production dep, `2` dev deps

Important audit note:

- The root app is managed by `pnpm@10.30.1`.
- `companion-module-dbx-driverack-pa2/` still declares `yarn@4.12.0`.
- The root CI and `pnpm audit` cover the root app only; the two Companion packages are not part of a pnpm workspace and are not represented in the root lockfile.

## Executive Summary

- The root app has no currently reported security vulnerabilities from `pnpm audit --prod --dev`.
- The root app's runtime dependency set is in good shape. `pnpm outdated` did not flag any production dependency as stale on 2026-03-31.
- Most actionable upgrades are in dev tooling, not in runtime libraries.
- The biggest structural dependency risk is governance drift:
  the main app uses pnpm and is covered by CI audit, while the Companion packages sit outside that workflow.
- A few direct dev dependencies appear removable or should at least be validated for removal, especially `@testing-library/jest-dom` and possibly `autoprefixer`.
- The PA2 Companion package is the furthest behind strategically because its `@companion-module/base` line is still on `1.14.1` while the current latest is `2.0.3`.

## 1. Outdated Packages

### Root App: Recommended Low-Risk Upgrades Now

These are same-major patch or minor updates with low expected migration cost.

| Package | Current | Recommended | Reason |
|---|---:|---:|---|
| `@tailwindcss/postcss` | `4.2.0` | `4.2.2` | Patch update; aligns PostCSS adapter with current Tailwind v4 patch line. |
| `tailwindcss` | `4.2.0` | `4.2.2` | Patch update for the active styling stack. |
| `postcss` | `8.5.6` | `8.5.8` | Patch update; part of build toolchain stability. |
| `autoprefixer` | `10.4.24` | `10.4.27` | Patch update if retained. |
| `serwist` | `9.5.6` | `9.5.7` | Patch update; brings the dev package in line with `@serwist/next@9.5.7`. |
| `eslint-config-next` | `16.1.6` | `16.2.1` | Should match the active `next@16.2.1` line more closely. |
| `vitest` | `4.0.18` | `4.1.2` | Current 4.x patch/minor line. |
| `@vitest/coverage-v8` | `4.0.18` | `4.1.2` | Keep aligned with `vitest`. |
| `jsdom` | `29.0.0` | `29.0.1` | Small patch update for test infrastructure. |
| `tw-animate-css` | `1.3.3` | `1.4.0` | Small CSS tooling bump; low migration risk. |
| `eslint` | `9.39.3` | `9.39.4` | Safe same-major patch before considering ESLint 10. |
| `@types/node` | `22.19.11` | `22.19.15` | Stay on the Node 22 type line to match CI/runtime. |

### Root App: Upgrade, But Not Directly to Latest Major

These packages have newer majors available, but the latest major is not the best first move for this repo.

| Package | Current | Recommended Next Step | Latest Overall | Recommendation |
|---|---:|---:|---:|---|
| `typescript` | `5.7.3` | `5.9.3` | `6.0.2` | Move to latest stable 5.x first. Do not jump directly to TS 6 until Next/Vitest/eslint rules are revalidated. |
| `eslint` | `9.39.3` | `9.39.4` | `10.1.0` | Take the patch first. Treat ESLint 10 as a separate compatibility pass. |
| `@types/node` | `22.19.11` | `22.19.15` | `25.5.0` | Do not move the type surface ahead of the declared Node 22 runtime without an explicit runtime bump. |

### Root App: Runtime Dependencies Not Flagged as Outdated

`pnpm outdated` did not report stale production dependencies in the root app on 2026-03-31. That means the shipping app libraries are already current enough on the registry's latest line for the versions declared here, including the core stack around:

- `next@16.2.1`
- `react@19.2.4`
- `react-dom@19.2.4`
- `@sentry/nextjs@10.46.0`
- `onnxruntime-web@1.24.3`
- `@serwist/next@9.5.7`

### Companion Packages

These packages are outside the root pnpm lockfile, so version recommendations are based on live registry queries plus source inspection.

| Package | Scope | Current | Recommended | Latest Overall | Recommendation |
|---|---|---:|---:|---:|---|
| `@companion-module/base` | `companion-module/` | `~1.14.1` | `~1.14.1` for now | `2.0.3` | No newer 1.x is available. Treat 2.x as a deliberate migration project, not a routine bump. |
| `@companion-module/base` | `companion-module-dbx-driverack-pa2/` | `~1.14.1` | `~1.14.1` for now | `2.0.3` | Same conclusion as above. |
| `@companion-module/tools` | `companion-module-dbx-driverack-pa2/` | `^2.6.1` | `2.7.1` | `3.0.0` | Take `2.7.1` first. Evaluate 3.x only after package-manager and build flow cleanup. |
| `prettier` | `companion-module-dbx-driverack-pa2/` | `^3.7.4` | `3.8.1` | `3.8.1` | Safe patch/minor bump. |
| `typescript` | `companion-module/` | `~5.9.3` | stay | `6.0.2` | Already on latest 5.x line. No urgent action. |

## 2. Security Vulnerabilities

### Current Result

`pnpm audit --prod --dev` at the root returned:

- `No known vulnerabilities found`

That is the live result from the checked-in root install state on 2026-03-31.

### Security Posture Already in the Repo

The repo is in better shape than many projects because dependency security is already operationalized:

- CI runs `pnpm audit --prod --audit-level=high` in `.github/workflows/ci.yml`
- Dependabot is configured in `.github/dependabot.yml`
- Root manifest pins `picomatch` via overrides to `>=4.0.4`

That last point matters because it shows the repo has already responded to a known transitive-risk area rather than relying entirely on upstream timing.

### Limitations of the Current Security Coverage

- The root audit does not cover `companion-module/` or `companion-module-dbx-driverack-pa2/` because they are not part of the root pnpm dependency graph.
- The PA2 Companion package has its own package-manager declaration and lockfile (`yarn.lock`), which creates a blind spot relative to the root CI gate.
- "No known vulnerabilities found" is only as strong as the currently installed root tree. It does not automatically certify the two standalone Companion package graphs.

## 3. Alternative Package Suggestions

These are not blanket replacement recommendations. They are targeted alternatives where the current package choice has a clear tradeoff.

### `jspdf` / `jspdf-autotable`

Current usage:

- `lib/export/exportPdf.ts`
- dynamically imported, which is a good usage pattern

Alternatives:

- `pdf-lib`: better low-level PDF control, often cleaner for programmatic editing
- headless HTML-to-PDF approach: better layout fidelity if reports become design-heavy

Recommendation:

- Keep the current stack for now. It is already code-split correctly and contained to export behavior.
- Revisit only if typography, Unicode/font support, or layout fidelity becomes a product issue.

### `next-themes`

Current usage:

- app shell and multiple analyzer components

Alternative:

- a small custom theme provider using `data-theme` and local storage

Recommendation:

- Keep `next-themes` unless the app deliberately simplifies theming.
- It is not worth replacing while theme state is still shared across the app.

### `react-resizable-panels`

Current usage:

- local wrapper in `components/ui/resizable.tsx`

Alternative:

- `allotment` for more desktop-style splitter behavior

Recommendation:

- Keep current package. The app already hides it behind a local wrapper, which lowers future migration cost.

### `docx`, `pptxgenjs`, `sharp`, `@napi-rs/canvas`

Current usage:

- document and asset generation scripts, not the runtime app

Alternative:

- move these into a dedicated `docs-tools` workspace/package instead of the main app package

Recommendation:

- Do not replace the libraries immediately.
- Do isolate them from the main app install surface if cold install speed or CI footprint becomes a concern.

### `@testing-library/jest-dom`

Current usage:

- no tracked imports
- no setup file in the current Vitest config

Alternative:

- remove it rather than replace it

Recommendation:

- This is the clearest removal candidate in the root devDependency list.

## 4. Dependency Usage Patterns

### Pattern: Runtime Dependencies Are Lean and Mostly Infrastructure-Facing

The main app's production dependencies are not bloated with business logic libraries. Most runtime packages fall into one of these buckets:

- platform shell: `next`, `react`, `react-dom`
- UI primitives: Radix packages, `lucide-react`
- styling helpers: `class-variance-authority`, `clsx`, `tailwind-merge`
- observability/PWA: `@sentry/nextjs`, `@serwist/next`
- specialized runtime logic: `onnxruntime-web`

The DSP engine, advisory logic, and most actual product behavior are first-party code in `lib/`, `hooks/`, and `contexts/`.

That is a good dependency posture.

### Pattern: UI Libraries Are Encapsulated Behind Local Wrappers

Radix packages are mostly consumed through local wrappers in `components/ui/*.tsx`.

This is a strong usage pattern because:

- vendor APIs are not sprayed across the feature code
- upgrades are localized
- package replacement cost is lower

### Pattern: Heavy Tools Are Already Kept Off the Initial Runtime Path

Examples:

- `jspdf` and `jspdf-autotable` are dynamically imported in `lib/export/exportPdf.ts`
- `onnxruntime-web` is isolated to `lib/dsp/mlInference.ts`
- `serwist` and `@serwist/next` are kept at the PWA/config boundary

This is a good sign: the repo is not casually pulling heavy packages into hot UI paths.

### Pattern: Script-Only Tooling Lives in the Root App Package

Several packages are only used by scripts and document-generation tooling:

- `docx`
- `pptxgenjs`
- `sharp`
- `@napi-rs/canvas`

That is workable, but it inflates the main app's install surface and CI dependency set even though the production app does not need those libraries.

Recommendation:

- medium-term, split docs/report generators into a dedicated package or workspace

### Pattern: Some Dev Dependencies Look Redundant

Based on code search and config inspection:

- `@testing-library/jest-dom` appears unused
- `autoprefixer` is declared but not referenced in `postcss.config.mjs`
- `postcss` is not imported directly, though it is part of the build toolchain transitively
- `jsdom` is used through `@vitest-environment jsdom` tests, but the project does not use a global jsdom environment

Recommendation:

- remove `@testing-library/jest-dom` after a quick verification pass
- treat `autoprefixer`, `postcss`, and direct `jsdom` as "validate before removing", not automatic removals

### Pattern: Dependency Governance Is Split Across Package Managers

This is the main structural smell:

- root app: pnpm-managed, CI-audited
- PA2 Companion package: Yarn 4 metadata and lockfile
- Companion packages: not included in root audit/install/test flow

This means dependency freshness and security posture are uneven across the repo.

## 5. Specific Upgrade Recommendations

### Recommendation 1: Do a Low-Risk Root Tooling Sweep First

Apply these updates together in one small maintenance pass:

```bash
pnpm up -D @tailwindcss/postcss@4.2.2 tailwindcss@4.2.2 postcss@8.5.8 autoprefixer@10.4.27 serwist@9.5.7 eslint-config-next@16.2.1 jsdom@29.0.1 tw-animate-css@1.4.0 vitest@4.1.2 @vitest/coverage-v8@4.1.2 eslint@9.39.4 @types/node@22.19.15
```

Why this first:

- same-major changes
- little expected runtime risk
- better alignment between `next` and `eslint-config-next`
- better alignment between `vitest` and its coverage provider
- removes the current lag in the CSS/PWA build toolchain

### Recommendation 2: Upgrade TypeScript to Latest 5.x, Not 6.x

Recommended move:

- `typescript: 5.7.3 -> 5.9.3`

Do not jump directly to `6.0.2` yet. The repo is tightly typed, uses strict settings, and sits on a modern Next/Vitest/eslint stack. TS 6 should be a separate compatibility exercise.

Suggested command:

```bash
pnpm up -D typescript@5.9.3
```

### Recommendation 3: Remove or Validate Redundant Dev Dependencies

Priority order:

1. Remove `@testing-library/jest-dom` if no setup file is added and no matcher imports are introduced.
2. Validate whether `autoprefixer` is still needed under the current Tailwind v4 setup.
3. Validate whether direct `postcss` pinning is required or whether relying on the build toolchain's transitive version is acceptable.
4. Decide whether `jsdom` should remain a direct devDependency or be left to Vitest/transitive install behavior.

This is the most likely place to reduce maintenance noise without changing product behavior.

### Recommendation 4: Isolate Script-Only Packages

Move the following out of the main app package if install weight matters:

- `docx`
- `pptxgenjs`
- `sharp`
- `@napi-rs/canvas`

Rationale:

- they are not needed to run the main PWA
- they increase root install and audit surface
- they are best treated as documentation/build tooling, not app runtime tooling

### Recommendation 5: Unify Dependency Governance Across the Repo

The best repo-level improvement is not a package bump. It is process cleanup:

- either convert the Companion packages into a pnpm workspace
- or make them explicitly independent and give each its own CI install/audit step

Without that, the root audit result can stay green while Companion dependency drift grows unchecked.

### Recommendation 6: Treat `@companion-module/base` 2.x as a Planned Migration

Both Companion packages are on `@companion-module/base@~1.14.1`. There is no newer 1.x target, so the next real move is `2.0.3`.

That should be treated as a migration project because:

- the package crosses a major boundary
- the PA2 module contains a large amount of protocol and HTTP control logic in `src/main.js`
- the DoneWell module is TypeScript and smaller, but still depends on Companion lifecycle APIs like `InstanceBase`, `runEntrypoint`, statuses, variables, and feedbacks

Practical order:

1. unify package-manager strategy first
2. upgrade `@companion-module/tools` from `2.6.1` to `2.7.1`
3. review Companion 2.x migration guidance
4. migrate the smaller `companion-module/` package first
5. migrate the larger PA2 package second

## Recommended Priority Order

### P1 - Do Now

- Root tooling patch sweep
- `typescript` to `5.9.3`
- Remove `@testing-library/jest-dom` if confirmed unused

### P2 - Do Soon

- Validate `autoprefixer` / `postcss` direct pins
- Decide whether `jsdom` should remain direct
- Isolate script-only packages if install weight matters

### P3 - Planned Project

- Unify repo dependency governance
- Migrate Companion packages toward `@companion-module/base@2.x`

## Bottom Line

The dependency picture is healthier than the repo's mixed packaging structure suggests:

- root runtime packages are current
- root audit is clean
- the main app's heavy dependencies are mostly contained or dynamically loaded

The real work is not emergency patching. It is housekeeping:

- keep root tooling current
- prune clearly unused dev deps
- stop letting the Companion packages drift outside the root dependency governance model

That will give the project a cleaner long-term dependency story than simply chasing every latest major.
