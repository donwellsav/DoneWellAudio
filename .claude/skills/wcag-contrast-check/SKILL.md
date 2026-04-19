---
name: wcag-contrast-check
description: Run the VIZ_COLORS WCAG AA contrast regression against both dark and light card backgrounds and report the ratios table. Use when touching severity colors, shadcn/ui theme tokens, or any card-surface foreground.
disable-model-invocation: true
---

## What this does

Runs `pnpm test -- lib/canvas/__tests__/contrast.test.ts` and prints the contrast table — every severity color on both the dark card (`#181a1e`) and the light card (`#ffffff`), with pass/fail against WCAG AA body-text 4.5:1.

## Steps

1. From the repo root:
   ```
   pnpm test -- lib/canvas/__tests__/contrast.test.ts
   ```
2. On pass: report the ratios per severity per theme in a small table.
3. On fail: identify the specific color that dropped below 4.5:1 and suggest a nearest-hue darkening using the table below.

## Darkening suggestions

When a **light-theme** color fails, pick from these Tailwind stops as safe AA replacements. Verify with the contrast test after substituting:

| Current hue (light-theme fail) | Try | Hex |
|---|---|---|
| red (any <700 stop) | `red-700` | `#b91c1c` |
| orange (any <700 stop) | `orange-700` | `#c2410c` |
| yellow | `yellow-700` | `#a16207` |
| green (any <700 stop) | `green-700` | `#15803d` or `green-800` `#166534` |
| cyan | `cyan-700` | `#0e7490` |
| blue | `blue-700` | `#1d4ed8` |
| purple | `purple-700` | `#7e22ce` |

Keep the WCAG 2.1 math in `lib/canvas/__tests__/contrast.test.ts` authoritative — this skill wraps the test, not the math.

## What NOT to do

- Do not modify `VIZ_COLORS` (dark-theme table). Those are already calibrated for the dark card background and are covered by this test; regressing them breaks dark-mode users.
- Do not accept "close enough" — WCAG AA is a hard floor. Aim ≥ 5:1 for a buffer in case Tailwind stops shift.
- Do not change the card background to fix a failure — the card is a design-system anchor. Fix the foreground color instead.
- Do not add dark-only or light-only workarounds that dodge the test. The test is the contract.
