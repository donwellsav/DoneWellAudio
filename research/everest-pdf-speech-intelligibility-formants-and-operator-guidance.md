# Everest PDF: Speech Intelligibility, Formants, and Operator Guidance

## Purpose

This note answers a narrower product question than the other Everest files in this folder:

- What in the book is genuinely useful for `speech`, `worship`, vocal-formant suppression, and speech-facing operator guidance?
- Which parts belong in the detector core?
- Which parts belong only in UI, help text, measurement views, or later validation?

This file is meant to be used later as an implementation and review checklist, not just as background reading.

## Bottom Line

Everest does support several speech-relevant product ideas:

- treating the `2-3 kHz` band as perceptually important for voice presence,
- respecting critical-band / perceptual smoothing when presenting speech-related measurement data,
- treating early reflections as especially important for speech clarity and apparent loudness,
- and recognizing that speech is a rapidly time-varying, formant-shaped signal rather than a single stationary tone.

Everest does **not** support overreaching from those principles into:

- a claim that the current `FORMANT_BANDS` are canonically correct,
- a claim that the formant gate multiplier should be exactly `0.65`,
- a claim that the speech-mode threshold should be a specific dB number,
- or a claim that A-weighting is the right detector-core weighting for feedback classification.

That boundary matters. The book helps define the shape of the problem. It does not solve the whole detector.

## Current Code Map

### Evidence

- The classifier currently defines:
  - `FORMANT_BANDS = [300-900, 800-2500, 2200-3500]` in [classifierHelpers.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifierHelpers.ts:26)
  - `FORMANT_Q_MIN = 3`, `FORMANT_Q_MAX = 20`, `FORMANT_MIN_MATCHES = 2`, and `FORMANT_GATE_MULTIPLIER = 0.65` in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:71)
  - the speech-like formant suppression path in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:344)
- Speech and worship currently suppress some weak `POSSIBLE_FEEDBACK` advisories when instrument-like posterior mass remains in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:524)
- The current speech baseline in the working tree sets `aWeightingEnabled: true` and `ignoreWhistle: true` in [modeBaselines.ts](/C:/DoneWellAV/DoneWellAudio/lib/settings/modeBaselines.ts:19)
- Layered settings feed `aWeightingEnabled` and gate overrides into runtime settings in [deriveSettings.ts](/C:/DoneWellAV/DoneWellAudio/lib/settings/deriveSettings.ts:125)
- The current help UI already frames the `300-3000 Hz` band as the main speech/fundamental/harmonic band in [ReferenceTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/ReferenceTab.tsx:66)

### Inference

The app already contains speech-specific detector policy. That means the literature does not need to justify whether speech needs special handling at all. It only needs to help answer whether the current handling is well-shaped, overstated, or underexplained.

## 1. Presence Region and Speech-Relevant Perception

### Evidence

- Everest says the outer ear increases effective level in the important speech range around `2-3 kHz` (Everest, p. 68).
- Everest also says human hearing is especially sensitive around `3 kHz` (Everest, p. 79).
- He further notes that sound arriving from directly in front produces a `2-3 kHz` peak at the eardrum, which old mixers used as a voice "presence" region (Everest, p. 92).
- The summary chapter repeats that the auditory canal and head diffraction together produce added emphasis in the speech-important region near `3 kHz` (Everest, p. 104).

### Inference

For the app, this is useful mainly in the `operator-facing` layer:

- how severe a speech-like tone feels,
- why some narrow peaks in that band seem immediately intrusive,
- and why voice intelligibility and vocal harshness can change quickly around that region.

It is **not** enough evidence to let the detector automatically treat every `2-3 kHz` narrowband event as higher feedback probability.

### Options

- Use this literature to improve help text, severity explanations, and measurement annotations in speech workflows.
- Do not convert the presence-region idea into a blind feedback-probability boost without separate empirical validation.

## 2. Formants and the Shape of Speech

### Evidence

- Everest describes speech as rapidly changing patterns of frequency and intensity shaped by moving formant resonances in the vocal tract (Everest, p. 121).
- He explicitly notes that there is little speech energy above roughly `4 kHz` and little below roughly `100 Hz` in the example discussed there (Everest, p. 121).
- He also describes speech directionality and the variability of speech radiation, which reinforces that vocal content is not a static stationary emitter (Everest, p. 123).

### Inference

This supports the basic idea behind a `speech-like false-positive guard`:

- multiple peaks across formant regions,
- moderate rather than extreme `Q`,
- and a time-varying voiced pattern

can be evidence that the signal is vocal content rather than self-reinforcing acoustic loop buildup.

But the support is `qualitative`, not `numerical`.

The book does not validate the exact current implementation:

- `300-900`, `800-2500`, `2200-3500`,
- `Q = 3-20`,
- `2+ bands`,
- `0.65` multiplier.

Those are still repo choices.

### Options

- Keep the formant gate as a speech-specific false-positive defense.
- Treat the current bands and multipliers as tunable heuristics, not literature-set truths.
- Add tests later that validate intended behavior on speech-like multi-peak voiced material rather than citing the book as proof.

## 3. Critical Bands and Perceptual Smoothing

### Evidence

- Everest explains that the ear behaves as though it contains frequency-selective filters and that masking happens within critical bands rather than uniformly across the spectrum (Everest, p. 97).
- He later argues that `1/3-octave` views approximate perceived frequency balance well because they are closer to auditory bandwidth than raw fine-grained traces (Everest, p. 545).

### Inference

This is strong support for `measurement and UI policy`, especially in speech-heavy use cases:

- raw high-resolution spectral detail is not the only or best way to present speech-relevant conditions,
- and a perceptual or smoothed view may better reflect what the operator actually hears as clarity or coloration.

This does **not** prove that the detector core itself should internally collapse to `1/3 octave`. That would be an implementation decision with major side effects.

### Options

- Add a perceptual speech / intelligibility-oriented measurement view later.
- Keep the detector fine-grained, but offer a human-facing view that is closer to auditory filtering.

## 4. Early Reflections, Definition, and Speech Clarity

### Evidence

- Everest says one useful route toward an objective measure of `definition` is comparing early energy in roughly the first `50-80 ms` against the total sound field (Everest, p. 98).
- He describes the precedence effect: reflections arriving within the first `20-30 ms` are strongly integrated with the direct sound, while beyond roughly `50-80 ms` they begin to separate into discrete echoes (Everest, pp. 98-100).
- He summarizes this again by noting that reflected sound arriving within the first `50 ms` is integrated and appears louder, while later arrivals are more echo-like (Everest, p. 105).
- In the small-studio discussion, Everest says overly long decay degrades speech intelligibility by slurring syllables and phrases (Everest, p. 447).

### Inference

This is highly useful for the app, but mostly in the `measurement` and `guidance` layers:

- why a room can sound unclear without any true feedback event,
- why early reflections can make speech seem louder or broader,
- and why a speech-oriented room-analysis flow should care about early-arrival structure, not just steady-state magnitude.

This also gives a clean caution against overinterpreting speech-like energy as feedback when early-reflection conditions are poor.

### Options

- Add an early-reflection or early/late-energy view for speech rooms.
- Add guidance that "speech smear" or "clarity loss" may be reflection-driven rather than loop-gain-driven.
- Do not claim that a single speech intelligibility score can be inferred from the current detector output alone.

## 5. A-Weighting and Speech

### Evidence

- Everest discusses A/B/C weighting as sound-level-meter conventions that better track perceived loudness at different level ranges, not as universal detector laws (Everest, p. 64).
- The speech and hearing pages reinforce that perception and audibility are frequency-dependent and especially sensitive near the speech-presence band (Everest, pp. 68, 79, 104).

### Inference

The literature supports A-weighting as a `perceptual presentation tool` much more strongly than as a detector-ground-truth transform.

That means the app's current default of enabling A-weighting in speech mode may be reasonable as a usability and perception choice, but it should not be treated as acoustical proof that A-weighted peaks are the right basis for feedback truth.

### Options

- Keep A-weighting available, especially in speech-facing views.
- Be careful about using A-weighting as a silent detector-core assumption without explicit validation.
- Prefer explaining A-weighting as "closer to perceived prominence" rather than "more correct feedback physics."

## 6. Speech Intelligibility vs. Feedback Detection

### Evidence

- Everest repeatedly separates physical measurement from subjective perception and warns that the relationship is not one-to-one (Everest, pp. 97-98, 105).
- He says rooms that are too live reduce speech intelligibility, but also that rooms that are too dead can damage character and quality, and that there is no single exact optimum (Everest, p. 447).
- The recording-studio compromise discussion reinforces that speech and music often demand different room balances (Everest, p. 448).
- The measurement chapter says useful room analysis needs both time and frequency information with enough immunity to background noise (Everest, p. 529).

### Inference

The app should not collapse `speech intelligibility`, `speech annoyance`, and `feedback risk` into one number. They overlap, but they are not identical.

That is the main pushback point.

If DoneWell Audio later adds speech-clarity features, they should likely sit alongside feedback detection, not inside it as though they were the same problem.

### Options

- Keep the current detector goal narrow: identify feedback-like or ring-like conditions.
- If desired, add a separate speech-room-analysis layer later for clarity / reflection / intelligibility cues.

## What Belongs in the Detector

### Good candidates

- Speech-specific false-positive suppression when multiple formant-region peaks and moderate `Q` strongly suggest voiced content.
- Continued caution against promoting weak `POSSIBLE_FEEDBACK` events in `speech` and `worship` when instrument- or voice-like evidence remains high.
- Conservative use of speech heuristics as `penalties` or `confidence suppressors`, not as unilateral truth signals.

### Weak candidates

- Hard-coding new detector boosts simply because the ear is sensitive near `3 kHz`.
- Treating A-weighting as detector truth.
- Converting precedence / Haas ideas directly into the feedback classifier without actual time-domain reflection features that justify it.

## What Belongs in UI, Help, and Measurement Mode

### Strong candidates

- Explain that the `2-3 kHz` region is especially voice-critical and perceptually sensitive.
- Add a speech-oriented measurement interpretation mode that emphasizes:
  - early reflections,
  - reflection-rich vs. source-dominant conditions,
  - and perceptual smoothing.
- Explain that speech smear and harshness can come from reflections and room decay, not only from true feedback.
- Use speech-specific help text in `speech` and `worship` modes instead of presenting all alerts as if they were generic live-music problems.

## Implementation Checklist

Use this checklist later before changing code.

### Detector review checklist

- Check whether the current `FORMANT_BANDS` in [classifierHelpers.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifierHelpers.ts:26) are still the intended heuristic ranges for spoken/sung vowels.
- Check whether `Q 3-20` in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:71) is still the right "moderate-Q, speech-like" band.
- Check whether the gate multiplier `0.65` in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:74) is justified by current behavior, not just by old comments.
- Check whether the speech/worship advisory suppression gate in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:524) still matches product intent.
- Check that any new speech heuristic remains a suppressor / corroborator, not an unvalidated positive feedback signal.

### Measurement / UI checklist

- Add or prototype an early-reflection / early-late-energy speech view before changing detector thresholds.
- Add a perceptual smoothing or `1/3 octave` speech-oriented room view before claiming the app shows "clarity."
- Review `speech`-mode help copy in [ReferenceTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/ReferenceTab.tsx:35) and [AlgorithmsTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/AlgorithmsTab.tsx:293) so it explains speech-specific caveats.
- If A-weighting stays enabled by default in speech mode, document it as a perceptual/operator choice rather than a detector-physics guarantee.

### Validation checklist

- Test voiced male/female speech, speech through PA, sung vowels, and spoken word over music separately.
- Test reflection-heavy speech conditions against true narrowband acoustic feedback conditions.
- Test whether speech-focused false-positive suppression hides real feedback in `2-3 kHz`, where both voice presence and true feedback can be prominent.
- Test room-analysis messaging separately from detector accuracy, because the literature supports them differently.

## Final Conclusion

The speech-relevant value in the book is real, but it is mostly about `how to shape the system`, not `what exact number to ship`.

For DoneWell Audio, the book supports:

- speech-aware false-positive handling,
- better speech/help copy,
- speech-oriented measurement views,
- and explicit caution around reflections, clarity, and perceptual smoothing.

It does not settle:

- exact formant ranges,
- exact gate multipliers,
- exact dB thresholds,
- or whether A-weighting should sit inside the detector core by default.

Those still need repo-level validation and field testing.
