# Everest PDF: Room Modes, Placement, and Feedback-Relevant Implications

## Framing

This document extracts the parts of Everest that matter most for DoneWell Audio's room policy, placement guidance, feedback-related interpretation, and operator messaging. It is organized by topic rather than by chapter because the app's design questions cut across several chapters.

## Room Modes and Frequency Regions

### Evidence

- Everest divides enclosed-space behavior into four regions and marks a room-mode-dominated region in which the wavelength is comparable to room dimensions and wave acoustics, not ray acoustics, should dominate the analysis (Everest, pp. 349-351).
- Everest says that below the lowest axial mode there is still enclosed-space behavior, but there is no modal boost in the same sense as the room-mode-dominated band (Everest, pp. 349-351).
- Everest repeatedly treats small-room low-frequency behavior as a modal problem rather than a smooth broadband response problem (Everest, pp. 155-157, 429-431, 543).

### Inference

For DoneWell Audio, room reasoning should not be one monolithic feature. The literature supports at least three distinct interpretive zones:

1. Very low frequencies where energy is enclosed but not boosted in the same modal way.
2. A modal band where room geometry and source/listener position dominate.
3. Higher bands where reflection, diffraction, diffusion, and directivity become the more appropriate explanatory tools.

### Options

- Keep one room preset system, but internally separate low-frequency mode policy from mid/high reflection policy.
- Add operator-facing notes that room presets are most consequential in the low-frequency modal band and less literally predictive elsewhere.
- Consider dedicated low-frequency resonance logic instead of treating all room effects as a global sensitivity offset.

## Why Low-Frequency Behavior Below Roughly 300 Hz Is Structurally Different

### Evidence

- Everest explicitly states that the modal structure below about `300 Hz` is where problems arise in small rooms because modal spacing is large enough to remain acoustically consequential rather than harmlessly merged (Everest, pp. 343-351).
- Everest notes that below about `300 Hz`, modal colorations are especially important and that speech is often more obviously damaged by such colorations than music (Everest, p. 376).
- Everest's listening-room discussion emphasizes that the low-frequency field at the listener is the vector sum of many axial, tangential, and oblique modes, and that the resulting interaction is too complex to grasp as one simple broadband effect (Everest, p. 431).

### Inference

DoneWell Audio should be cautious about interpreting low-frequency persistent energy with the same assumptions it uses for midband speech feedback. Low-frequency content is more likely to be a room-plus-placement problem, and any operator-facing advice should acknowledge that complexity.

### Options

- Warn more aggressively that low-frequency issues may require placement or room treatment, not only EQ cuts.
- Consider lower-confidence or different messaging for low-frequency detections that coincide with likely room-mode structure.
- In room or measurement mode, surface low-frequency mode analysis distinctly from general "feedback risk" analysis.

## Listener and Loudspeaker Placement as First-Order Variables

### Evidence

- Everest shows that moving the listener can avoid particular modal null sheets and that the center of a dimension is not a neutral location because odd and even modes couple differently there (Everest, pp. 429, 555-556).
- Everest states that loudspeakers energize only those modes to which they couple at their positions; modes that are null at the loudspeaker position cannot be energized in the same way as modes that sit at maxima or partial maxima there (Everest, p. 431).
- Everest's optimizer chapter treats loudspeaker and listener placement as a legitimate optimization problem rather than an afterthought (Everest, pp. 555-568).

### Inference

For DoneWell Audio, room presets without source and receiver geometry are necessarily incomplete. The app can still provide room-level heuristics, but it should not imply that room presets alone determine the effective feedback or resonance landscape.

### Options

- Add placement guidance to measurement mode, especially for low-frequency issues.
- Let room-analysis workflows ask the operator about speaker height, wall proximity, and microphone position.
- Present room advice as "policy + geometry" rather than "policy only."

## Comb Filtering from Reflections and Microphone Placement

### Evidence

- Everest gives concrete examples in which changing microphone placement changes the reflected-path level and the delay enough to move from minor comb issues to obvious combing (Everest, pp. 401-406).
- Everest's examples emphasize that reflected-path delay determines null spacing, and that even short delays can create highly audible notches in important speech bands (Everest, pp. 403-406).
- Everest also describes flush mounting as a way to eliminate one class of path difference and reduce comb-filter effects at the microphone (Everest, p. 406).
- In later discussion of acoustic distortion, Everest treats comb filtering as a reflection problem driven by coherent interference between direct and reflected sound, not as a mysterious frequency-response defect (Everest, pp. 518-520).

### Inference

Comb filtering is operationally relevant to DoneWell Audio in at least two ways:

1. It can create structured spectral patterns that may look suspicious if the app only inspects static spectra.
2. It is deeply tied to geometry, so any "comb suspicion" should ideally be translated into placement guidance, not only a hidden penalty in a fusion engine.

### Options

- Keep comb-related penalties or suppressors as qualitative corroborators, not sole convicting evidence.
- Add a user-facing note when comb/reflection patterns are suspected: "check source/mic geometry and nearby surfaces."
- In measurement mode, show time-domain or gated evidence when comb structure is present so the operator can understand the basis of the warning.

## Environmental Conditions That Can Shift the System Feedback Point

### Evidence

- Everest explicitly states that temperature stratification in a large enclosed space can shift the sound system's feedback point and also alter standing-wave and flutter behavior (Everest, p. 291).

### Inference

The important point is not the specific HVAC example. The important point is that the literature recognizes that the feedback point is not a perfectly fixed property of the rig. It can move when the propagation environment changes. That supports environment-aware policy in DoneWell Audio and argues against treating the same system as having one universal feedback threshold independent of acoustic conditions.

### Options

- Keep room/environment inputs in the product.
- Treat them as operating conditions, not immutable physical constants.
- Avoid docs language that implies the feedback point is fixed once the system is wired.

## Practical Implications for Live Sound, Speech Rooms, Worship Spaces, Monitors, and Untreated Rooms

### Speech rooms

**Evidence**

- Everest repeatedly stresses that speech is damaged noticeably by low-frequency modal coloration and by reflection-driven response defects in the critical lower and mid bands (Everest, pp. 376, 401-406).
- Everest's small voice-booth discussion also shows that overly small spaces can produce severe low-frequency modal problems even when high frequencies are heavily absorbed (Everest, pp. 493-496).

**Inference**

Speech-oriented modes should not merely be "more sensitive." They should also be more suspicious of small-room low-frequency structure and more explicit about placement and room-treatment limits.

### Worship spaces and untreated rooms

**Evidence**

- Everest's broader room-mode and reflection material supports the idea that larger, more reverberant, or untreated spaces involve stronger combinations of modal irregularity, late energy, and surface-driven artifacts (Everest, pp. 349-351, 524).

**Inference**

Worship and untreated-space presets are defensible as distinct operating contexts, but the literature still does not provide exact numeric thresholds. The value is in directional policy: more reverb, more diffuse late energy, more complicated feedback landscape.

### Monitors

**Evidence**

- While Everest does not provide a stage-monitor preset, the placement and reflection chapters strongly support the idea that short paths, high coupling, and nearby boundary interactions create a distinct operating regime (Everest, pp. 401-406, 518-520).

**Inference**

Monitor mode should remain a separate policy regime, but its justification comes more from geometry and coupling than from room volume alone.

### Untreated or minimally treated rooms

**Evidence**

- Everest repeatedly describes bare or reflective spaces as producing more obvious modal and reflection artifacts, and measurement chapters show how untreated rooms generate cluttered in-room responses (Everest, pp. 155-157, 541-545).

**Inference**

The app should be more willing to frame detections in untreated rooms as ambiguous interactions among room modes, reflections, and feedback risk rather than pretending the acoustic cause is singular.

## Product Options for DoneWell Audio

### Option 1: Keep coarse room presets, but narrow their claims

Use room presets as operational policy, not as literal predictors of absolute thresholds. Add copy that the preset influences sensitivity and interpretation, especially at low frequencies and in reflective spaces.

### Option 2: Add geometry-aware guidance without full geometry-aware modeling

Keep current preset simplicity, but add prompts or diagnostics for speaker-wall distance, microphone placement, and surface proximity when the app suspects combing or modal coupling.

### Option 3: Split room intelligence into two layers

Use:

- a low-frequency modal/risk layer,
- and a mid/high reflection/comb layer.

This is more faithful to the literature than one scalar room offset applied uniformly.

### Option 4: Elevate placement guidance into measurement mode

The literature is strongest on the claim that placement matters. The most defensible product improvement may therefore be a better measurement/placement guidance workflow rather than further threshold numerology.
