---
name: cia
description: Auto-generate a Change Impact Audit from staged or unstaged changes
---

# Change Impact Audit Generator

Generate a CIA from the current git diff, mapping changes to the 16-system table.

## Instructions

1. Run `git diff --cached --name-only` (staged) and `git diff --name-only` (unstaged) to get changed files
2. For each changed file, map it to the affected system(s) using this table:

| File Pattern | System |
|-------------|--------|
| `lib/dsp/*` | DSP / Detection |
| `lib/dsp/feedbackDetector.ts` | Audio Pipeline |
| `lib/dsp/dspWorker.ts`, `lib/dsp/workerFft.ts` | Worker / Threading |
| `contexts/*`, `hooks/*` | React State |
| `components/*` | UI Components |
| `lib/canvas/*` | Canvas / Visualization |
| `lib/storage/*` | Settings / Storage |
| `app/sw.ts`, `serwist*` | PWA / Service Worker |
| `middleware.ts` | Security / CSP |
| `app/api/*` | API / Ingest |
| `vitest*`, `*test*` | Testing |
| `next.config*`, `.github/*`, `ci.yml` | Build / CI |
| `*aria*`, `*focus*`, `*a11y*` | Accessibility |
| `lib/dsp/feedbackDetector.ts` (hot path) | Performance |
| `scripts/ml/*`, `*.onnx`, `mlInference*` | ML Pipeline |
| `lib/data/*`, `*consent*`, `*gdpr*` | Data / Privacy |

3. Read the actual diffs to understand what changed
4. Classify each system impact as POSITIVE, NEGATIVE, or NEUTRAL with evidence
5. Output the CIA in the exact format below — the pre-commit gate validates this format
6. Write the audit to `$TEMP/claude-cia-audit.md` so the pre-commit hook can find it

## Output Format

The pre-commit gate checks for these exact patterns (case-insensitive):
- `**change:**`
- `**classification:**`
- `| system |` (the impact table header)
- `**verdict:**`
- `## <system name>` for each system touched (e.g. `## DSP / Detection`)

Use this template exactly:

```
**CHANGE:** [one-line description]
**CLASSIFICATION:** 🟢 POSITIVE | 🔴 NEGATIVE | ⚪ NEUTRAL
**SCOPE:** [comma-separated list of affected systems]

## [System 1 Name]

[Evidence — trace values, render paths, data flows as appropriate for the system type]

## [System 2 Name]

[Evidence]

| System | Impact | Evidence |
|--------|--------|----------|
| [System 1] | 🟢/🔴/⚪ | [one-line proof] |
| [System 2] | 🟢/🔴/⚪ | [one-line proof] |

**VERDICT:** [Summary — "Strict improvement because..." / "Trade-off: improves X but risks Y..." / "Functionally invariant because..."]
```

## Notes

- The `## <System Name>` sections must match the exact system names used by the edit tracker:
  `DSP / Detection`, `Audio Pipeline`, `Worker / Threading`, `React State`, `UI Components`,
  `Canvas / Visualization`, `Settings / Storage`, `PWA / Service Worker`, `Security / CSP`,
  `API / Ingest`, `Testing`, `Build / CI`, `Accessibility`, `Performance`, `ML Pipeline`,
  `Data / Privacy`
- For trivial changes (typo, comment, single-value tweak), a one-line audit is sufficient:
  `**CHANGE:** Fixed typo | **CLASSIFICATION:** ⚪ NEUTRAL | **VERDICT:** Text-only change, no logic impact.`
  But still write it to `$TEMP/claude-cia-audit.md`.
