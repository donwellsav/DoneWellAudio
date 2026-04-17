# Implementation Checklist From Literature and Audits

## Purpose

This note turns the research set into an implementation-oriented checklist for DoneWell Audio.

It is not another summary of the PDFs. It is the bridge between:

- the acoustics literature,
- the practical feedback-suppression guidance,
- the filter-theory background,
- and the current repo behavior.

Use this document when deciding what to implement, what to test, and what to leave alone.

## Source Set

### Acoustics and measurement

- [everest-pdf-executive-synthesis.md](/C:/DoneWellAV/DoneWellAudio/research/everest-pdf-executive-synthesis.md)
- [everest-pdf-room-modes-placement-and-feedback.md](/C:/DoneWellAV/DoneWellAudio/research/everest-pdf-room-modes-placement-and-feedback.md)
- [everest-pdf-measurement-and-ui-implications.md](/C:/DoneWellAV/DoneWellAudio/research/everest-pdf-measurement-and-ui-implications.md)
- [everest-pdf-third-pass-targeted-reading-list.md](/C:/DoneWellAV/DoneWellAudio/research/everest-pdf-third-pass-targeted-reading-list.md)
- [everest-pdf-speech-intelligibility-formants-and-operator-guidance.md](/C:/DoneWellAV/DoneWellAudio/research/everest-pdf-speech-intelligibility-formants-and-operator-guidance.md)

### Practical feedback workflow

- [feedback-prevention-and-suppression-pdf-assessment.md](/C:/DoneWellAV/DoneWellAudio/research/feedback-prevention-and-suppression-pdf-assessment.md)

### Filter theory

- [filtutv1-ppt-assessment.md](/C:/DoneWellAV/DoneWellAudio/research/filtutv1-ppt-assessment.md)

### Repo history and current state

- [threshold-defaults-room-policy-audit.md](/C:/DoneWellAV/DoneWellAudio/research/threshold-defaults-room-policy-audit.md)
- [current-claude-patch-review.md](/C:/DoneWellAV/DoneWellAudio/research/current-claude-patch-review.md)

## Governing Rules

These rules come out of the whole research set and should constrain future implementation work.

### 1. Do not let literature set exact runtime constants by itself

Everest supports acoustic principles, not final values for:

- `feedbackThresholdDb`
- fusion weights
- gate multipliers
- exact formant bands
- exact notch depths

The dbx paper is practical but vendor-biased. The filter-theory deck is foundational but too abstract for venue policy.

### 2. Keep three problem classes separate

Do not collapse these into one concept:

- true narrowband feedback / ring behavior
- broader EQ or room-response problems
- speech clarity / reflection / intelligibility problems

They overlap, but they are not the same thing.

### 3. Preserve the product boundary

DoneWell Audio is analysis-only.

Everything below should be implemented as:

- detection,
- advice,
- workflow guidance,
- and measurement interpretation,

not automatic audio modification.

## Source Contribution by Domain

| Domain | Best source | What it contributes |
|---|---|---|
| Room physics | Everest | Modal regions, placement, low-frequency caution |
| Measurement UI | Everest | Gating, time windows, perceptual smoothing |
| Speech and reflections | Everest | Voice presence band, early-reflection relevance, formant caution |
| Gain-before-feedback workflow | dbx paper | Passive reduction -> EQ -> ring-out -> live backup |
| Notch-width tradeoffs | dbx paper | Narrow vs. broad unstable regions, clustered recurrence interpretation |
| Filter implementation caution | filtutv1 | FIR/IIR tradeoffs, phase, poles/zeros, IIR numerical caution |
| What shipped and what drifted | Repo audit | Real defaults, real retunes, real architectural risks |

## Current Code Seams

These are the most important current code touchpoints for any implementation work.

### Detector and classification

- [lib/dsp/classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:71)
- [lib/dsp/classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:344)
- [lib/dsp/classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:524)
- [lib/dsp/classifierHelpers.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifierHelpers.ts:26)
- [lib/dsp/fusionEngine.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/fusionEngine.ts:194)
- [lib/dsp/constants/acousticConstants.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/constants/acousticConstants.ts:28)

### Recommendation logic

- [lib/dsp/eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:30)
- [lib/dsp/eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:246)
- [lib/dsp/eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:355)
- [types/advisory.ts](/C:/DoneWellAV/DoneWellAudio/types/advisory.ts:186)

### Ring-out and room workflows

- [hooks/useRingOutWizardState.ts](/C:/DoneWellAV/DoneWellAudio/hooks/useRingOutWizardState.ts:19)
- [hooks/useRoomMeasurement.ts](/C:/DoneWellAV/DoneWellAudio/hooks/useRoomMeasurement.ts:7)
- [components/analyzer/settings/room/AutoDetectRoomSection.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/settings/room/AutoDetectRoomSection.tsx:43)
- [components/analyzer/settings/SetupTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/settings/SetupTab.tsx:33)

### Operator help and mode framing

- [components/analyzer/help/GuideTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/GuideTab.tsx:24)
- [components/analyzer/help/ModesTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/ModesTab.tsx:10)
- [components/analyzer/help/AlgorithmsTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/AlgorithmsTab.tsx:293)
- [components/analyzer/help/ReferenceTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/ReferenceTab.tsx:35)

## Workstream 1: Detector Behavior

### Goal

Improve detector behavior without turning the classifier into an overfit pile of special cases.

### Evidence

- Everest supports speech-specific false-positive caution, early-reflection caution, and frequency-region differences.
- The dbx paper supports clustered-problem reasoning, broad-vs-narrow distinction, and geometry/path-count caution.
- The repo already has speech/formant suppression, room-aware modifiers, and content-adaptive fusion.

### Recommended changes

#### 1. Keep speech heuristics as suppressors, not positive detectors

Current code already treats speech-like evidence as a penalty path in [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:344) and [classifier.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/classifier.ts:524).

Do:

- review whether the current formant and speech/worship suppression paths still match product intent
- add tests for spoken voice, sung vowels, and speech-over-music

Do not:

- turn the `2-3 kHz` voice-presence region into a direct feedback-probability boost

#### 2. Make clustered recurrence a first-class concept

Current code already has cluster-aware recommendation widening in [eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:246), but the detector and workflow still mostly read as one-peak-at-a-time.

Implement:

- clearer cluster detection / recurrence semantics at the advisory layer
- a distinction between:
  - one stable narrow offender
  - repeated nearby offenders in one band
  - a broad unstable region that keeps reappearing

#### 3. Keep low-frequency behavior conservative

Everest supports strong caution below roughly `300 Hz`, and current code already encodes a distinct low band in [acousticConstants.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/constants/acousticConstants.ts:28).

Implement:

- preserve stricter caution around low-frequency room-driven events
- avoid making low-frequency feedback detection more aggressive just because the region is audible

Do not:

- interpret every persistent low-frequency peak as a feedback candidate of the same quality as a midband narrow ring

### Acceptance checks

- spoken-word material should remain harder to false-trigger than live-music material
- reflection-heavy speech should reduce confidence before it creates decisive cuts
- repeated nearby low-frequency recurrences should be representable as a broader issue, not just as endless separate one-offs

## Workstream 2: EQ and Notch Recommendation Logic

### Goal

Improve recommendation quality so the app distinguishes narrow corrective cuts from broader tonal or room issues.

### Evidence

- The dbx paper strongly supports the distinction between broad EQ issues and narrow reactive suppression.
- The dbx paper also supports the idea that a notch can be too narrow for the unstable region.
- `eqAdvisor.ts` already contains ERB scaling, cluster-aware Q widening, and shelf detection.

### Recommended changes

#### 1. Distinguish "narrow notch candidate" from "broader corrective region"

Current code already uses:

- `ERB` depth scaling in [eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:30)
- cluster-aware `Q` widening in [eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:246)

Implement:

- an explicit advisory flag or reason string when a recommendation widened because the region appears broader than one notch
- a stronger distinction between:
  - narrow PEQ/notch action
  - broad shelf / room-EQ suggestion

#### 2. Make clustered detections visible to the operator

Implement:

- UI text that says a region looks broader than one narrow offender when cluster span is large
- warning language when repeated notches in the same band probably indicate setup / EQ / placement issues

#### 3. Keep shelf logic secondary to true feedback recommendations

Current shelf analysis in [eqAdvisor.ts](/C:/DoneWellAV/DoneWellAudio/lib/dsp/eqAdvisor.ts:355) is useful, but it should not be confused with feedback cuts.

Implement:

- UI separation between:
  - "feedback cut"
  - "broad tonal issue"

Do not:

- let broad shelves read like emergency feedback actions

### Acceptance checks

- a stable narrow runaway should still produce a notch-like or narrow bell recommendation
- a merged / broad cluster should widen `Q` and say why
- broad mud / harshness should remain clearly distinct from acute feedback events

## Workstream 3: Ring-Out Workflow

### Goal

Turn the existing ring-out path into a more explicit, field-usable workflow informed by the dbx paper and current app seams.

### Evidence

- The repo already has a ring-out mode and wizard in [useRingOutWizardState.ts](/C:/DoneWellAV/DoneWellAudio/hooks/useRingOutWizardState.ts:19).
- Help copy already recommends starting with ring-out mode in [ModesTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/ModesTab.tsx:94).
- The dbx paper gives clear workflow guidance:
  - passive reduction first
  - EQ second
  - ring out with performers present
  - live suppression as backup only

### Recommended changes

#### 1. Add pre-ring-out prompts

Implement ring-out guidance that explicitly asks or reminds the operator to:

- reduce unnecessary active mics/speakers
- check placement and reflective paths
- finish broad EQ / room correction first

#### 2. Add performer-presence and movement guidance

Implement wizard steps or prompts that say:

- ring out with performers present when possible
- have them move into realistic positions
- watch for proximity-triggered paths

#### 3. Surface clustered notch warnings during ring-out

If accepted notches keep landing in one band, the wizard should say that this likely indicates:

- a broader EQ issue
- a placement problem
- or a reflection path

not just more bad luck

#### 4. Preserve the difference between setup and live backup

The wizard and help copy should distinguish:

- pre-show ring-out
- live emergency handling

and should not frame live operation as though the goal is to keep setting more and more notches.

### Acceptance checks

- the wizard can export a useful ring-out report
- clustered ring-out events are called out as a pattern
- the help flow makes performer-present ring-out explicit

## Workstream 4: Measurement and UI Guidance

### Goal

Improve operator interpretation so the app explains what kind of acoustic problem is being observed.

### Evidence

- Everest strongly supports gated views, early/late separation, and perceptual smoothing.
- The repo already has:
  - room measurement hooks in [useRoomMeasurement.ts](/C:/DoneWellAV/DoneWellAudio/hooks/useRoomMeasurement.ts:7)
  - room auto-detect UI in [AutoDetectRoomSection.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/settings/room/AutoDetectRoomSection.tsx:43)
  - technical help content in [AlgorithmsTab.tsx](/C:/DoneWellAV/DoneWellAudio/components/analyzer/help/AlgorithmsTab.tsx:338)

### Recommended changes

#### 1. Add a speech-oriented interpretation layer

Implement a measurement or help path that distinguishes:

- feedback risk
- reflection-rich speech smear
- room resonance
- perceptual tonal balance

Do not present all of these as one undifferentiated "problem score."

#### 2. Add early-reflection / early-late energy language

Even before a full new measurement view exists, update help text and guidance to explain:

- why speech can sound unclear without true feedback
- why early reflections matter for clarity and apparent loudness

#### 3. Add a perceptual-smoothed room view later

Longer-term task:

- add a `1/3 octave` or perceptual smoothing option for room/speech interpretation

This should sit beside raw engineering views, not replace them.

#### 4. Clarify room measurement limitations

Current room auto-detect estimates dimensions from resonances. That is useful, but it should be framed as:

- resonance-derived estimate
- position-sensitive
- low-frequency biased

not as full room characterization

### Acceptance checks

- the UI can explain "feedback-like but probably reflection-driven"
- speech/help copy no longer implies that all harshness or clarity loss is feedback
- room measurement messaging explains its limits

## Workstream 5: Test Cases and Validation

### Goal

Add tests that reflect the actual problem classes, not just algorithm internals.

### Recommended scenario groups

#### Detector scenarios

- voiced male speech
- voiced female speech
- sung sustained vowels
- speech over background music
- compressed program material
- real narrowband feedback in the `2-3 kHz` presence region
- low-frequency room-mode buildup without true feedback

#### Recommendation scenarios

- isolated narrow runaway
- repeated nearby offenders in one band
- broad harshness without acute feedback
- mud / rumble without feedback
- cluster span large enough to require wider `Q`

#### Workflow scenarios

- ring-out with empty stage
- ring-out with performer movement
- clustered ring-out detections in one band
- room measurement completion and partial-confidence behavior

### Likely test touchpoints

- [hooks/__tests__/useRingOutWizardState.test.ts](/C:/DoneWellAV/DoneWellAudio/hooks/__tests__/useRingOutWizardState.test.ts)
- [hooks/__tests__/useRoomMeasurement.test.ts](/C:/DoneWellAV/DoneWellAudio/hooks/__tests__/useRoomMeasurement.test.ts)
- `lib/dsp/__tests__` for classifier and recommendation coverage
- help-surface tests where text or framing changes are meaningful

## Priority Order

### Phase 1: Low-risk framing and workflow improvements

- help copy
- ring-out prompts
- clustered-issue wording
- room-measurement caveats

### Phase 2: Recommendation logic refinement

- broader-region vs. narrow-notch distinction
- better cluster messaging
- clearer shelf vs. feedback separation

### Phase 3: Validation-first detector review

- speech/formant tests
- low-frequency caution tests
- reflection-heavy false-positive review

### Phase 4: New measurement interpretation views

- perceptual smoothing
- early/late energy support
- speech clarity vs. feedback interpretation

## Explicit "Do Not Do This" List

- Do not use the PDFs to set exact detector constants by appeal to authority.
- Do not conflate speech intelligibility with feedback risk.
- Do not treat broad tonal issues as though they are emergency feedback cuts.
- Do not let ring-out become endless reactive notching instead of a setup workflow.
- Do not claim room auto-detect is full room analysis.
- Do not let A-weighting quietly become "detector truth" without validation.

## Final Conclusion

The highest-value implementation direction is not "retune everything."

It is:

1. make the workflow smarter,
2. make the advice more honest about problem class,
3. make clustered and broad issues more visible,
4. keep speech-specific suppression conservative,
5. and add better validation before touching core thresholds.

That path fits the literature, the practical feedback paper, and the repo's current architecture much better than another round of blind constant tweaking.
