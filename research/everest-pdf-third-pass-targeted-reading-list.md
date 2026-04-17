# Everest PDF Third Pass: Targeted Reading List for DoneWell Audio

## Purpose

This note is the third-pass product reading of the Everest book. It is narrower than the other Everest files in this folder. The goal is not to restate room-acoustics theory in full. The goal is to answer four product questions directly:

1. Which pages are most useful for room-presets policy?
2. Which pages are most useful for measurement mode and room-analysis UI?
3. Which pages are most useful for speaker and microphone placement advice?
4. Which pages help decide what should and should not drive feedback sensitivity?

This file therefore acts as a reading map for product decisions, not as a general book summary.

## Bottom Line

Everest is useful when the product question is about:

- coarse room policy,
- low-frequency modal reasoning,
- reflection and comb-filter interpretation,
- placement guidance,
- and measurement presentation.

Everest is not the book that decides:

- the exact value of `feedbackThresholdDb`,
- a modern content-adaptive fusion weight table,
- or gate multipliers such as `0.65`, `0.80`, or `0.40`.

That line needs to stay hard, or the literature will be made to say more than it actually says.

## 1. Room Presets

### Best pages

- `Everest, pp. 349-351`
- `Everest, pp. 429-431`
- `Everest, pp. 515-518`
- `Everest, pp. 555-558`

### Why these pages matter

#### `Everest, pp. 349-351`

### Evidence

- Everest divides enclosed-space behavior into four regions.
- Region `B` is the modal region where wavelengths are comparable to room dimensions.
- Region `C` is transitional and is dominated by diffraction and diffusion.
- Region `D` is where geometric or ray acoustics becomes more valid.

### Inference

A room preset should not behave as though the same acoustic logic applies equally at `80 Hz`, `250 Hz`, and `3 kHz`. These pages support a model in which low-frequency room behavior is structurally different from higher-frequency reflection behavior.

### Options

- Keep room presets coarse, but acknowledge that they are frequency-structured rather than globally uniform.
- Separate low-frequency room effects from mid/high reflection effects in future preset design.

#### `Everest, pp. 429-431`

### Evidence

- Everest shows that the low-frequency response at the listening position is dominated by the local vector sum of modal pressure.
- He also states that loudspeaker and listener positions determine which modes are energized and heard.
- The discussion explicitly frames the sub-`300 Hz` region as especially complex and position-dependent.

### Inference

A room preset without any placement context is incomplete in the modal band. This does not make presets useless. It means presets should be framed as coarse priors rather than exact acoustic truth.

### Options

- Keep preset labels such as `small`, `medium`, `large`, and `worship`, but do not imply that the preset alone can determine modal burden.
- Add copy that placement can dominate low-frequency outcome inside the same named room.

#### `Everest, pp. 515-518`

### Evidence

- Everest treats room modes and speaker-boundary interference response as distinct sources of acoustic distortion.
- He emphasizes that poor placement can create deep notches that are not sensibly repaired by equalization.

### Inference

Room presets should not collapse modal effects and nearby-boundary effects into one undifferentiated number. A room may be "small" in one sense and still behave very differently depending on boundary proximity.

### Options

- Keep room policy and placement policy conceptually distinct.
- If the product later expands room analysis, add separate cues for modal burden and boundary/reflection burden.

#### `Everest, pp. 555-558`

### Evidence

- Everest's room optimizer material says both room modes and speaker-boundary interference depend on loudspeaker and listener coupling.
- He treats placement optimization as a core part of reducing coloration, not a minor afterthought.

### Inference

If DoneWell Audio uses room presets, they should be presented as the first layer of context, not the final answer.

### Product reading

For room-presets policy, these pages support:

- coarse environment classes,
- warnings about low-frequency uncertainty,
- and some form of placement guidance.

They do not support:

- deriving all room thresholds from a single speech baseline,
- or acting as though one room preset can stand in for measured geometry.

## 2. Measurement Mode and Room-Analysis UI

### Best pages

- `Everest, pp. 528-533`
- `Everest, pp. 541-545`
- `Everest, p. 549`
- `Everest, pp. 495-496`

### Why these pages matter

#### `Everest, pp. 528-533`

### Evidence

- Everest explains why useful room-acoustics measurement needs both time and frequency information.
- TDS is presented as a way to isolate desired reflections and reject unwanted reflections and reverberation by time offset.
- MLS is presented as valuable because one measurement can later be reprocessed with different windows.

### Inference

Measurement mode should not treat one undifferentiated trace as the final truth. The question being asked matters:

- source behavior,
- early reflections,
- room contribution,
- or modal decay.

### Options

- Add time-windowed or gated interpretation to room-analysis workflows.
- Expose the idea that one recording can answer multiple questions if processed differently.

#### `Everest, pp. 541-545`

### Evidence

- Everest says raw far-field in-room response in reflective rooms can be of little practical value if read naively.
- He argues that fractional-octave views, especially `1/3 octave`, track perceived tonal balance better than raw, reflection-rich detail.
- He also shows time-slice views for low-frequency room response.

### Inference

A measurement UI that only shows a fine-grained FFT-like trace will look precise while often being less decision-useful than a gated or smoothed view.

### Options

- Pair raw spectrum views with perceptual or fractional-octave views.
- Add a low-frequency time-slice or decay-oriented view for room work.
- Label views by use-case rather than by processing jargon only.

#### `Everest, p. 549`

### Evidence

- Everest links the energy-time curve and reverberation-time calculation to a broader understanding of room ambience and reflection behavior.
- The page also reinforces the value of separating direct sound, early reflections, and later room contribution.

### Inference

Measurement mode should not flatten early reflections and later ambience into one generic metric. The operator needs the layer distinction.

### Options

- Add an early/late-energy companion display.
- Present room analysis as layered evidence instead of a single score.

#### `Everest, pp. 495-496`

### Evidence

- Everest's voice-space example uses ETC and waterfall views to show a short early time gap followed by a dense but smooth decay field.
- He uses those views to explain why the room sounds clean and repeatable, not just to display data.

### Inference

Measurement views are most useful when they explain audible consequences, not just when they are technically dense.

### Product reading

For measurement mode, the book supports:

- gating,
- multiple view types,
- perceptual smoothing,
- early-versus-late energy interpretation,
- and frequency-dependent decay reasoning.

The book does not support:

- treating the raw in-room jagged trace as the most trustworthy default view,
- or using one scalar measurement as a complete description of room quality.

## 3. Speaker and Microphone Placement Advice

### Best pages

- `Everest, pp. 401-406`
- `Everest, pp. 429-431`
- `Everest, pp. 517-518`
- `Everest, pp. 555-558`
- `Everest, p. 291`

### Why these pages matter

#### `Everest, pp. 401-406`

### Evidence

- Everest gives concrete microphone-placement examples showing when floor reflections create minimal combing, expected combing, or certain combing.
- He gives the practical `3:1` distance rule for adjacent pickup in group singing.
- He also notes that flush-mounted microphones can reduce one important comb-filter mechanism while changing boundary level.

### Inference

These pages are directly useful for operator guidance. They do not just say "reflections matter." They show how geometry changes whether the reflection becomes negligible or destructive.

### Options

- Add mic-placement tips when comb suspicion is high.
- Treat comb detection as a trigger for placement advice, not only for confidence suppression.

#### `Everest, pp. 429-431`

### Evidence

- Listener and loudspeaker positions alter which modal peaks and nulls dominate.
- The same room can produce very different low-frequency results at different positions.

### Inference

Placement guidance should be part of any room-resonance workflow. Without it, the operator may misattribute a position-specific modal problem to the whole room or the whole system.

#### `Everest, pp. 517-518`

### Evidence

- Everest shows that speaker-boundary interference can create deep low-frequency notches and boosts.
- He explicitly says such notches are not sensibly repaired by EQ and that speaker distance from boundaries is decisive.
- He gives the practical conclusion that the loudspeaker should either be moved very close to the corner or meaningfully away from it, not casually equidistant from nearby boundaries.

### Inference

Placement advice belongs in the product whenever the observed condition could be SBIR rather than true narrow-band feedback behavior.

#### `Everest, pp. 555-558`

### Evidence

- The optimizer chapter again treats loudspeaker/listener placement as a central control variable for modal coloration and SBIR.

### Inference

Placement advice is not a secondary help feature. It is a primary acoustic lever.

#### `Everest, p. 291`

### Evidence

- Everest says environmental conditions can slightly shift the sound system's feedback point and alter standing-wave and flutter paths.

### Inference

Placement advice should not be treated as static forever. Conditions in the space can change what placement is effectively doing.

### Product reading

For speaker and microphone placement, the book supports adding:

- comb-filter troubleshooting guidance,
- SBIR warnings,
- modal-position cautions,
- and language that some "feedback-like" conditions may actually be geometry or reflection problems.

## 4. What Should and Should Not Drive Feedback Sensitivity

### Best pages

- `Everest, p. 291`
- `Everest, pp. 349-351`
- `Everest, pp. 429-431`
- `Everest, pp. 401-406`
- `Everest, pp. 541-545`

### What should drive sensitivity

#### Environmental state

### Evidence

- The feedback point can shift with air-temperature structure and refraction effects (Everest, p. 291).

### Inference

Sensitivity should be allowed to respond to environment class and possibly changing operating conditions. The literature supports the idea that gain-before-feedback is not perfectly invariant.

#### Frequency-region structure

### Evidence

- Low-frequency room behavior and higher-frequency reflection behavior follow different acoustic regimes (Everest, pp. 349-351).

### Inference

Sensitivity policy should not assume that one scalar threshold is equally trustworthy across the entire band.

#### Placement and modal coupling

### Evidence

- Listener and loudspeaker position determine which low-frequency modes are energized and heard (Everest, pp. 429-431).

### Inference

Sensitivity should be interpreted with placement awareness whenever the problem sits in the modal band.

#### Reflection and comb burden

### Evidence

- Reflection geometry determines whether combing is mild or severe (Everest, pp. 401-406).

### Inference

Sensitivity should be conservative when the evidence looks like a reflection artifact rather than true loop gain buildup.

### What should not drive sensitivity by itself

#### Raw far-field jaggedness

### Evidence

- Everest argues that reflection-rich in-room response can be of limited practical value if interpreted naively, and that `1/3-octave` or otherwise interpreted views often better track perception (Everest, pp. 541-545).

### Inference

A jagged in-room high-resolution trace should not, by itself, push the detector into a more aggressive sensitivity posture.

#### One global room label

### Evidence

- The same room can behave very differently by frequency and position (Everest, pp. 349-351, 429-431).

### Inference

One room label should not fully determine detector sensitivity. It is a prior, not an oracle.

#### One scalar decay or RT number

### Evidence

- Everest's broader room chapters and measurement chapters treat decay and response as frequency- and condition-dependent rather than fully captured by one number (Everest, pp. 155-167, 549).

### Inference

A single RT-style scalar should not be treated as the main driver of feedback sensitivity.

#### Literature alone

### Evidence

- The book gives principles, not product-validated operating thresholds.

### Inference

Final sensitivity numbers must still come from code history, tests, field behavior, and product intent.

## Recommended Reading Order for the Product Team

If the goal is to improve DoneWell Audio specifically, the shortest high-value reading order is:

1. `Everest, p. 291`
   Why even the feedback point is not perfectly fixed.
2. `Everest, pp. 349-351`
   Why low-frequency room behavior is structurally different.
3. `Everest, pp. 401-406`
   Why placement and reflections can create strong false structure.
4. `Everest, pp. 429-431`
   Why position can dominate sub-`300 Hz` outcome.
5. `Everest, pp. 528-545`
   Why measurement views need gating, slicing, and perceptual smoothing.
6. `Everest, pp. 555-558`
   Why room, loudspeaker, and listener optimization belong in the same model.

## Final Product Conclusion

If DoneWell Audio asks Everest the right question, the book is helpful.

The right questions are:

- Should room policy be coarse and frequency-aware?
- Should placement guidance be first-class?
- Should measurement mode separate direct sound, reflections, and room contribution?
- Should low-frequency behavior be treated differently from higher-frequency reflection clutter?

The wrong questions are:

- What exact `feedbackThresholdDb` should ship?
- What exact fusion weight should MSD receive?
- What exact penalty multiplier should the comb gate use?

Those exact runtime numbers have to be justified somewhere else.
