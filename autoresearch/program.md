# KTR DSP Autoresearch Program

Autonomous optimization of Kill The Ring's feedback detection fusion weights.

## Goal

Minimize the composite loss metric by tuning fusion weights and thresholds in `lib/dsp/algorithmFusion.ts`. Lower is better. Current baseline: **2.047** (10/36 scenarios correct).

## Setup

To set up a new experiment run:

1. **Agree on a run tag** with the user (e.g., `mar15`). The branch `autoresearch/<tag>` must not exist.
2. **Create the branch**: `git checkout -b autoresearch/<tag>`
3. **Read the in-scope files**:
   - `autoresearch/program.md` — this file (you are here)
   - `autoresearch/scenarios.ts` — 36 labeled ground-truth scenarios
   - `autoresearch/evaluate.ts` — evaluation script
   - `lib/dsp/algorithmFusion.ts` — the file you modify
4. **Run baseline**: `npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts`
5. **Initialize results.tsv**: First entry is the baseline.
6. **Confirm and go.**

## Files You May Modify

- **`lib/dsp/algorithmFusion.ts`** — this is the ONLY file you edit:
  - `FUSION_WEIGHTS` — 24 values (6 weights × 4 profiles: DEFAULT, SPEECH, MUSIC, COMPRESSED)
  - `DEFAULT_FUSION_CONFIG.feedbackThreshold` — verdict gate (currently 0.60)
  - IHR gate multiplier (line ~500, currently 0.65)
  - PTMR breadth gate multiplier (line ~510, currently 0.80)
  - Low-frequency phase suppression factor (currently 0.5) and threshold (currently 200 Hz)
  - Total: ~32 tunable values

## Files You Must NOT Modify

- `autoresearch/evaluate.ts` — the evaluation harness
- `autoresearch/scenarios.ts` — the ground-truth dataset
- Any test files in `tests/` or `lib/dsp/__tests__/`
- `tests/helpers/mockAlgorithmScores.ts`
- `lib/dsp/constants.ts` (Phase 1)

## Evaluation

```bash
# Quick metric:
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts

# Detailed per-scenario breakdown:
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts --verbose

# Compatibility gate (must pass):
pnpm test
```

## Constraints

- Each weight profile's 6 weights **must sum to 1.0**
- All weights must be in **[0.01, 0.50]** — no algorithm should dominate or vanish
- `feedbackThreshold` must be in **[0.40, 0.80]**
- Gate multipliers must be in **[0.3, 1.0]**

## The Experiment Loop

**LOOP FOREVER:**

1. Run `npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts --verbose` to identify the worst scenarios
2. Analyze which scenarios fail and WHY (look at prob vs expected verdict)
3. Make **ONE focused change** to `lib/dsp/algorithmFusion.ts`
4. Run `npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts` — record the new loss
5. Run `pnpm test` — all 333+ tests must pass
6. **If loss improved AND tests pass**: `git add lib/dsp/algorithmFusion.ts && git commit -m "autoresearch: loss X.XXX -> Y.YYY (description)"`
7. **If loss worsened OR tests fail**: `git checkout -- lib/dsp/algorithmFusion.ts`
8. Append to `autoresearch/results.tsv`
9. Repeat

## Strategy

### Quick Wins (try first)
- **IHR weight increase** — IHR distinguishes feedback (low harmonics) from music (rich harmonics). Currently only 0.08-0.24 across profiles. The 11 FP scenarios all have low IHR scores (0.1-0.5) while TP scenarios have high IHR (0.6-0.9).
- **PTMR weight increase** — Similar pattern. FPs tend to have low-moderate PTMR.
- **Reduce MSD in DEFAULT** — MSD is 30% (effective 32.6%) and drives several FPs.

### Weight Adjustment Protocol
When adjusting weights:
1. Pick the target weight to change (e.g., increase `ihr` by 0.03)
2. Decrease another weight by the same amount (e.g., decrease `msd` by 0.03)
3. Verify sum still equals 1.0
4. Only change ONE profile per experiment

### Profile-Specific Strategy
- **DEFAULT**: Balance MSD/Phase with IHR/PTMR to reduce synth-note FPs
- **SPEECH**: Reduce MSD to stop sustained-vowel FPs; increase PTMR for limiter-clamped FNs
- **MUSIC**: Reduce Phase dominance; increase IHR to distinguish instruments from feedback
- **COMPRESSED**: Reduce Phase to fix Auto-Tune FPs; increase IHR/MSD for compressed-feedback FNs

### Multiplicative Gates (high leverage)
- **IHR gate** (line ~500): When `ihrFeedbackScore < 0.3` (rich harmonics), probability is multiplied by 0.65. Adjusting this threshold or multiplier can veto FPs without affecting TPs.
- **PTMR gate** (line ~510): When PTMR score is 0, probability is multiplied by 0.80. Adjusting this can reduce confidence when peak shape is absent.

### What NOT to Try
- Don't set any single weight above 0.50 (creates single-point-of-failure)
- Don't set any weight below 0.01 (algorithm becomes meaningless)
- Don't change multiple profiles simultaneously (can't isolate effects)

## Output Format

Results go in `autoresearch/results.tsv` (tab-separated):

```
timestamp	commit	loss	verdict_loss	margin_loss	fp_penalty	constraint	status	description
```

Status values: `keep`, `discard`, `crash`

## Understanding the Loss Metric

```
loss = (1.0 × verdict_loss) + (0.3 × margin_loss) + (2.0 × fp_penalty) + (10.0 × constraint_penalty)
```

| Component | What it measures | How to improve |
|-----------|-----------------|----------------|
| **verdict_loss** | How many verdicts match ground truth | Get more scenarios to produce the expected verdict |
| **margin_loss** | How far from the decision boundary | Push TP probabilities above 0.75, TN below 0.20 |
| **fp_penalty** | False positives (2× weight) | FPs are the #1 priority — fix these first |
| **constraint** | Weight validity | Keep all weights in [0.01, 0.50], sum to 1.0 |

## NEVER STOP

Once the loop begins, do NOT pause to ask. The human might be sleeping. You run indefinitely until manually stopped. If you run out of ideas:
- Re-read the `--verbose` output for patterns
- Try combining near-misses from previous experiments
- Try the multiplicative gates
- Try more radical redistributions
- Try the feedbackThreshold knob
