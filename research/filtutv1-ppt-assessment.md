# filtutv1.ppt Assessment

## Source

- Deck:
  `C:/DoneWellAV/filtutv1.ppt`
- Working conversion used for review:
  `C:/DoneWellAV/tmp/filtutv1_from_ppt.pdf`
- Title slide:
  `The Basic Theory of Filtering`
- Authors:
  James D. Johnston, Steve R. Hastings, and boB Gudgel

## Bottom Line

Yes, this can help, but not in the same way as the dbx feedback paper.

This deck is mainly a `filter-theory tutorial`, not a live-sound feedback or system-tuning guide. It is useful for:

- understanding FIR vs. IIR tradeoffs,
- impulse response vs. frequency response,
- poles and zeros,
- phase behavior,
- filter sharpness vs. time-domain length,
- and some implementation cautions around IIR numerical behavior.

It is **not** a strong source for:

- practical EQ recommendations for venues,
- ring-out workflow,
- notch-filter placement strategy,
- or feedback-specific live-sound operating policy.

## What It Is Good For

## 1. FIR vs. IIR tradeoffs

### Evidence

- The deck spends much of its content on the basic difference between FIR and IIR filters, including impulse response, phase response, and implementation behavior (pp. 3-6, 34-39, 67-68, 74-82).
- It explicitly compares similar FIR and IIR responses while noting different phase behavior (p. 39).
- It states that long impulse response is what gives sharp frequency resolution, whether implemented directly or through IIR behavior (pp. 35, 51, 82).

### Inference

This is useful if DoneWell Audio ever needs to:

- explain why a filter shape sounds or behaves the way it does,
- compare narrowness vs. ringing tradeoffs,
- or justify why one class of filter is better for one implementation goal than another.

For an analysis-only app, this is more relevant to `internal design understanding` and `future documentation` than to operator workflow.

## 2. Poles, zeros, and filter shape intuition

### Evidence

- The deck introduces poles and zeros as the main descriptive language for IIR filters (pp. 59-63, 70, 74-75).
- It frames FIR filters as zero-based structures and IIR filters as pole-plus-zero systems (pp. 34, 59-63).

### Inference

This is useful background if you later revisit:

- parametric-EQ style sections,
- resonant behavior,
- peaking behavior,
- or how narrow cuts and boosts arise mathematically.

It is still not a practical notch-filter guide. It gives the mathematical vocabulary, not the live-sound procedure.

## 3. Phase and time-domain consequences

### Evidence

- The deck emphasizes that equal-looking magnitude responses can have different phase behavior (pp. 37, 39, 43, 45-46).
- It explains linear phase, minimum phase, and the fact that sharp filters imply longer time response (pp. 37, 43, 51, 82).

### Inference

This can help later if DoneWell Audio needs to reason about:

- what narrow filters imply in time,
- whether a filterbank or smoothing approach introduces delay or ringing tradeoffs,
- or how to explain filter behavior in technical help content.

For EQ recommendations, this is useful mostly in the background. It does not directly tell you which filter to recommend in a venue.

## 4. Implementation cautions for IIR structures

### Evidence

- The deck warns that direct-form IIR implementations can create numerical trouble, especially beyond low order, and mentions instability and limit-cycle behavior (pp. 65, 67-68).
- It notes that coefficient magnitude and accumulator depth matter in implementation (pp. 35, 65, 68).

### Inference

This is useful if you later implement or simulate:

- very narrow digital notch sections,
- cascaded biquad-style behavior,
- or filter-design tooling in the repo.

This is one of the more practically valuable parts of the deck for engineering, even though it is not live-sound advice.

## What It Does Not Really Help With

## 1. Practical notch filtering for feedback suppression

### Evidence

- The converted slide text contains no real notch-filter tutorial.
- The deck does not present a feedback-specific band-stop or notch-filter workflow.
- It does not discuss mic/speaker geometry, gain-before-feedback, performer movement, or ring-out.

### Inference

Do not over-credit this deck for feedback suppression. It is too general.

If the product question is:

- where to place notches,
- how wide notches should be in live use,
- when clustered notches indicate a broader EQ problem,
- or how to ring out a system,

the dbx paper is much more useful than this deck.

## 2. Venue EQ recommendations

### Evidence

- The deck is not about rooms, mics, loudspeakers, or venue tuning.
- The only direct mention of equalizers in the extracted text is a late remark that oversampled filterbanks can be used for things like equalizers (p. 91).

### Inference

This deck will not tell DoneWell Audio what to recommend for:

- speech room EQ,
- monitor wedge cuts,
- PA system tonality,
- or room-correction strategy.

It is too abstract for that.

## 3. User-facing operator workflow

### Evidence

- The deck is a classroom-style tutorial on filtering fundamentals, not an operator guide.

### Inference

Most of it should not flow directly into user-facing help unless the audience is specifically technical and wants DSP education.

## Best Use in DoneWell Audio

## Engineering background

Use this deck when reviewing or implementing:

- narrow filter behavior,
- IIR vs. FIR tradeoffs,
- phase consequences,
- or numerical stability concerns.

## Technical help content

Use selected ideas if the app later needs an advanced "how filters work" explanation for:

- phase,
- impulse response,
- and sharpness vs. ringing tradeoffs.

## Filter-design discussions

If you later discuss:

- whether a future analysis stage should use FIR-like smoothing,
- whether a simulated notch model should be narrow or broad,
- or how to describe pole/zero intuition in internal docs,

this deck is useful background.

## Recommended Trust Level

Use this deck as:

- `Medium value` for digital-filter theory and implementation intuition
- `Low value` for live-sound EQ policy
- `Low value` for feedback-suppression workflow
- `Low value` for exact app tuning constants

## Comparison to Other Sources in This Folder

- `Everest` is better for room acoustics, placement, measurement interpretation, and speech clarity.
- The `dbx feedback paper` is better for gain-before-feedback, ring-out, notch-width tradeoffs, and live workflow.
- `filtutv1.ppt` is better for core filter theory, phase, poles/zeros, and implementation caution.

## Final Conclusion

Keep this source, but do not mistake it for a feedback-field guide.

It can help DoneWell Audio most if we later need to:

- reason about filter classes,
- explain why narrow filters behave the way they do,
- or review implementation details for EQ-like or notch-like analysis tools.

It is not the right source for deciding what EQ to recommend in a room or how to run a ring-out workflow.
