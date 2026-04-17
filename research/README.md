# Research Dossier Suite

## Purpose

This folder collects research artifacts that are meant to support product decisions for DoneWell Audio without changing runtime behavior. The suite combines three different kinds of evidence:

1. Acoustic literature evidence from F. Alton Everest's *Master Handbook of Acoustics*.
2. Repo history evidence from the shipped first-parent range `v0.91.0 -> v0.100.0`.
3. Current working-tree evidence from the uncommitted Claude patch that is present in this repository right now.

The intent is to keep those sources separate, cite them differently, and make it obvious where the product still requires judgment rather than pretending the literature or the code history settles every question.

## Source Corpus

- Everest PDF:
  `C:/Users/dwell/Documents/BOOKS/books/Master_Handbook_Of_Acoustics_-_F._Alton_Everest.pdf`
- Shipped repo history:
  first-parent range from `49c377b` (`v0.91.0`) to `79b3f30` (`v0.100.0`)
- Current working-tree patch review:
  dirty state observed in this repo on `2026-04-17`, including the current `0.102.0` package version and the room/speech/default changes now present in the tree

## Reading Order

1. [everest-pdf-executive-synthesis.md](./everest-pdf-executive-synthesis.md)
2. [everest-pdf-room-modes-placement-and-feedback.md](./everest-pdf-room-modes-placement-and-feedback.md)
3. [everest-pdf-measurement-and-ui-implications.md](./everest-pdf-measurement-and-ui-implications.md)
4. [everest-pdf-third-pass-targeted-reading-list.md](./everest-pdf-third-pass-targeted-reading-list.md)
5. [everest-pdf-speech-intelligibility-formants-and-operator-guidance.md](./everest-pdf-speech-intelligibility-formants-and-operator-guidance.md)
6. [feedback-prevention-and-suppression-pdf-assessment.md](./feedback-prevention-and-suppression-pdf-assessment.md)
7. [filtutv1-ppt-assessment.md](./filtutv1-ppt-assessment.md)
8. [implementation-checklist-from-literature-and-audits.md](./implementation-checklist-from-literature-and-audits.md)
9. [threshold-defaults-room-policy-audit.md](./threshold-defaults-room-policy-audit.md)
10. [current-claude-patch-review.md](./current-claude-patch-review.md)

## Key Conclusions

The Everest book is useful for acoustic policy, placement logic, room-mode reasoning, reflection/comb-filter interpretation, and measurement-view design. It is not a strong authority for exact modern DSP constants such as `feedbackThresholdDb`, fusion weights, or gate multipliers. The shipped repo audit shows one clear silent startup-default drift (`25 -> 20`) plus several intentional detection/reporting retunes. The current Claude patch fixes the startup drift only by also broadening the live speech-mode baseline and recomputing room offsets, which turns a narrow default fix into a wider product retune.

## Important Warnings

- The PDF supports acoustic principles and measurement design. It does **not** directly justify exact modern detector constants.
- The shipped-history audit and the current working-tree patch review are intentionally separated. The shipped audit describes what users actually received in `v0.100.0`; the current patch review describes what is merely present and uncommitted in the working tree.
- Repo claims in this suite are cited by commit SHA and/or repo path. PDF claims are paraphrased and cited by page number.

## File Roles

- `everest-pdf-executive-synthesis.md`
  Top-level book-to-product synthesis.
- `everest-pdf-room-modes-placement-and-feedback.md`
  Deepest acoustic reasoning file for room modes, placement, and feedback-relevant implications.
- `everest-pdf-measurement-and-ui-implications.md`
  Translation of Everest's measurement thinking into operator-facing UI and measurement-mode implications.
- `everest-pdf-third-pass-targeted-reading-list.md`
  A focused reading map for room presets, measurement mode, placement advice, and what should or should not move feedback sensitivity.
- `everest-pdf-speech-intelligibility-formants-and-operator-guidance.md`
  A speech-specific implementation note covering vocal formants, early reflections, perceptual smoothing, current code touchpoints, and a later-use implementation checklist.
- `feedback-prevention-and-suppression-pdf-assessment.md`
  Assessment of the dbx feedback-suppression whitepaper, focused on gain-before-feedback, ring-out workflow, clustered-problem interpretation, filter-width tradeoffs, and the correct trust level for later implementation work.
- `filtutv1-ppt-assessment.md`
  Assessment of the filter-theory slide deck, focused on FIR/IIR tradeoffs, poles and zeros, phase, implementation caution, and the limited relevance to practical live-sound EQ recommendations.
- `implementation-checklist-from-literature-and-audits.md`
  One implementation-facing synthesis that turns the PDFs and repo audits into phased workstreams, concrete repo touchpoints, acceptance checks, and an explicit "do not do this" list.
- `threshold-defaults-room-policy-audit.md`
  Shipped-history analysis for the `v0.91.0 -> v0.100.0` range.
- `current-claude-patch-review.md`
  Review of the current uncommitted tree, including what it fixes and what new product choices it creates.

## Citation Conventions

- `Everest, p. 291`
  One page supports the claim.
- `Everest, pp. 349-351`
  Adjacent pages support the claim together.
- `02a2ef0`, `93ab90a`
  Commit SHAs identify repo-history claims.
- ``lib/settings/modeBaselines.ts``
  Current repo path identifies a code location or current working-tree fact.
