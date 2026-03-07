export type ChangeType = 'feat' | 'fix' | 'perf' | 'refactor' | 'ui'

export interface Change {
  type: ChangeType
  description: string
}

export interface ChangelogEntry {
  version: string
  date: string
  highlights?: string
  changes: Change[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.72',
    date: '2026-03-07',
    changes: [
      { type: 'feat', description: '🧹 Remove unused `analyzeFormantStructure` function and dependencies' },
    ],
  },
  {
    version: '1.0.105',
    date: '2026-03-07',
    changes: [
      { type: 'feat', description: '**Widened harmonic tolerance**: Range expanded from 25-100 to 25-400 cents, default raised to 200 cents for better reverberant room support' },
    ],
  },
  {
    version: '1.0.104',
    date: '2026-03-06',
    changes: [
      { type: 'feat', description: '**RTA threshold line overlay**: Display effective detection threshold as dashed blue line on RTA graph with right-aligned label' },
      { type: 'ui', description: '**Show on RTA toggle**: New switch under Threshold slider to show/hide threshold line' },
    ],
  },
  {
    version: '1.0.70',
    date: '2026-03-05',
    changes: [
      { type: 'feat', description: '**Low-frequency detection restored**: Removed erroneous 400 Hz hard floor, use actual peak frequency in prominence gate instead of worst-case 150 Hz proxy, reduced LOW band multipliers (prominence 1.4x→1.15x, sustain 1.5x→1.2x) to prevent triple-stacking penalties' },
      { type: 'feat', description: '**Advisory card dedup**: Frequency-proximity matching (200 cents) in React handler replaces same-frequency cards instead of accumulating duplicates; cards persist on clear as requested' },
      { type: 'feat', description: '[ ] Start analysis with a mic near a monitor speaker — verify feedback below 400 Hz is detected and shown' },
      { type: 'feat', description: '[ ] Verify no duplicate advisory cards appear for the same frequency' },
      { type: 'feat', description: '[ ] Verify advisory cards persist (don\'t disappear) when feedback stops momentarily' },
    ],
  },
  {
    version: '1.0.69',
    date: '2026-03-05',
    changes: [
      { type: 'feat', description: '**Low-frequency detection**: Reduced Schroeder room-mode penalty from -0.25 to -0.12 — the old value consumed 76% of starting feedback probability, making sub-300 Hz detection nearly impossible even with strong positive signals (high MSD, sustained growth, high Q). The prominence floor scaling (up to 1.5× via modal density) and LOW band multipliers (1.4× prominence, 1.5× sustain) already provide robust room-mode filtering.' },
      { type: 'feat', description: '**Prominence floor sync**: Changed hardcoded 10 dB base in `shouldReportIssue()` to use `settings.prominenceDb` so the reporting gate stays in sync with the detection gate (Speech preset uses 8 dB).' },
      { type: 'feat', description: '**Duplicate advisories**: `onAdvisoryCleared` was a no-op in React state — when the worker cleared and re-detected the same frequency, both advisory cards accumulated. Now properly removes cleared advisories by ID.' },
      { type: 'feat', description: '[ ] Verify low-frequency feedback (<300 Hz) is detected in Speech mode at a live venue' },
      { type: 'feat', description: '[ ] Confirm no duplicate advisory cards appear for the same frequency' },
      { type: 'feat', description: '[ ] Verify room modes are still filtered (not every low-freq peak should trigger)' },
      { type: 'feat', description: '[ ] Run `npx tsc --noEmit && pnpm build` — both pass' },
    ],
  },
  {
    version: '1.0.68',
    date: '2026-03-05',
    changes: [
      { type: 'feat', description: 'Raised PEQ Q values to match dbx AFS conventions (surgical Q60, heavy Q30)' },
      { type: 'feat', description: 'Added ERB-scaled cut depth — shallower below 500 Hz to protect warmth, deeper above 2 kHz where notches are psychoacoustically transparent' },
      { type: 'feat', description: 'Implemented PHPR (Peak-to-Harmonic Power Ratio) detection — feedback is sinusoidal (no harmonics), music has rich harmonics; used as soft confidence boost in classifier' },
      { type: 'feat', description: 'Added bandwidth data to PEQ recommendation data model for future detail views' },
      { type: 'feat', description: '[ ] Verify feedback detection still works in Speech mode with new Q values' },
      { type: 'feat', description: '[ ] Check that low-frequency feedback recommendations are shallower than before' },
      { type: 'feat', description: '[ ] Check that high-frequency feedback recommendations are deeper than before' },
      { type: 'feat', description: '[ ] Verify PHPR appears in advisory `why` reasons when detecting feedback vs. music' },
      { type: 'feat', description: '[ ] Confirm HelpMenu shows updated Q values (30/60 surgical, 16/30 heavy)' },
      { type: 'feat', description: '[ ] Test that pure tones (feedback) get "Pure tone (PHPR X dB)" in reasons' },
      { type: 'feat', description: '[ ] Test that music/speech gets "Harmonics present (PHPR X dB)" in reasons' },
    ],
  },
  {
    version: '1.0.67',
    date: '2026-03-05',
    highlights: 'Pro convention EQ recommendations',
    changes: [
      { type: 'feat', description: 'Raised PEQ Q values to pro convention (surgical Q60, heavy Q30) matching dbx AFS standards' },
      { type: 'feat', description: 'Added ERB-scaled cut depth — shallower cuts below 500 Hz to protect warmth, deeper above 2 kHz' },
      { type: 'feat', description: 'Added PHPR (Peak-to-Harmonic Power Ratio) detection for feedback vs. music discrimination' },
      { type: 'fix', description: 'Added bandwidth data to PEQ recommendations for future detail views' },
      { type: 'fix', description: 'Improved early/quiet feedback detection with MSD-lowered threshold gate' },
      { type: 'fix', description: 'Dialed back overly-conservative speech preset values (prominenceDb, confidenceThreshold, growthRateThreshold)' },
    ],
  },
  {
    version: '1.0.66',
    date: '2026-03-05',
    highlights: 'Speech preset retune',
    changes: [
      { type: 'fix', description: 'Retuned Speech (Corporate & Conference) preset for balanced soundcheck + live use' },
      { type: 'fix', description: 'Extended frequency range to 10 kHz to catch condenser sibilance feedback' },
      { type: 'fix', description: 'Raised confidence threshold (→0.40), prominence (→10 dB), and sustain (→350 ms) to reduce false positives' },
      { type: 'fix', description: 'Increased feedback/ring thresholds and growth rate to filter room resonances and speech plosives' },
    ],
  },
  {
    version: '1.0.65',
    date: '2026-03-05',
    highlights: 'Measure-then-lock auto-gain',
    changes: [
      { type: 'feat', description: 'Auto-gain now calibrates for 3 seconds on start, then **freezes** at the computed gain value' },
      { type: 'feat', description: 'Eliminates gain pumping that caused noise floor tracking instability and false positive detections' },
      { type: 'feat', description: 'Calibration requires minimum 30 signal frames (~0.6s of actual audio) to prevent locking on transient blips' },
      { type: 'feat', description: 'UI toggle shows **Cal** (pulsing amber) during calibration and **Lock** (green) when frozen' },
      { type: 'feat', description: 'Re-enabling auto-gain or restarting the analyzer resets calibration fresh' },
    ],
  },
  {
    version: '1.0.7',
    date: '2026-03-04',
    highlights: 'UI overhaul & auto-versioning',
    changes: [
      { type: 'ui', description: 'HelpMenu consolidated from 7 tabs to 5 with accordion-based algorithms' },
      { type: 'ui', description: 'SettingsPanel reorganized into 5 tabs with collapsible sections and Room Acoustics tab' },
      { type: 'feat', description: 'Auto-versioning GitHub Action bumps version on PR merge' },
      { type: 'ui', description: 'Issue cards now show captured frequency as primary display' },
      { type: 'feat', description: 'Added comprehensive beginner developer guide' },
    ],
  },
  {
    version: '1.0.6',
    date: '2026-03-04',
    highlights: 'Codebase hardening & cleanup',
    changes: [
      { type: 'refactor', description: 'Removed Neon PostgreSQL database layer and session persistence' },
      { type: 'refactor', description: 'Removed in-memory EventLogger and log export UI' },
      { type: 'refactor', description: 'Extracted getSeverityUrgency to shared DSP module' },
      { type: 'fix', description: 'Capped hotspot events to 50 to prevent unbounded localStorage growth' },
      { type: 'refactor', description: 'Added ErrorBoundary, memo(), useCallback across components' },
      { type: 'refactor', description: 'Removed 8 unused dependencies, migrated to ESLint flat config' },
    ],
  },
  {
    version: '1.0.5',
    date: '2026-03-04',
    highlights: 'Acoustic physics engine',
    changes: [
      { type: 'feat', description: 'Eyring RT60 reverberation time estimation' },
      { type: 'feat', description: 'Air absorption modeling for high-frequency Q adjustment' },
      { type: 'feat', description: 'Room mode filtering and mode clustering' },
      { type: 'feat', description: 'Frequency-dependent prominence thresholds' },
      { type: 'feat', description: 'Decay rate analysis passed to classifier' },
    ],
  },
  {
    version: '1.0.4',
    date: '2026-03-04',
    highlights: 'False positive elimination',
    changes: [
      { type: 'fix', description: 'Raised signal gate and prominence floor to 10 dB' },
      { type: 'fix', description: 'Unified merge windows and increased cooldowns' },
      { type: 'feat', description: 'Global advisory rate limiter (max 1 new/sec)' },
    ],
  },
  {
    version: '1.0.3',
    date: '2026-03-04',
    highlights: 'Duplicate detection fixes',
    changes: [
      { type: 'fix', description: 'Reduced false positive and duplicate feedback detections' },
      { type: 'fix', description: 'Fixed 42 audit findings: DSP correctness, component bugs, API hardening' },
      { type: 'fix', description: 'Widened merge tolerance with band cooldown and bidirectional harmonic check' },
      { type: 'perf', description: 'Optimized DSP presets for load-in, tightened fusion threshold' },
      { type: 'fix', description: 'Fixed Vercel deploy: lazy DB connection, lockfile cleanup' },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-03-04',
    highlights: 'Auto-gain, mobile layout, PWA',
    changes: [
      { type: 'feat', description: 'Auto-gain control with settings UI' },
      { type: 'feat', description: 'GEQ-band advisory deduplication (one per 1/3 octave)' },
      { type: 'ui', description: 'Mobile layout: replaced hamburger with bottom tab bar' },
      { type: 'feat', description: 'About tab with dynamic version display' },
      { type: 'feat', description: 'GEQ band frequency shown in issue cards' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-03',
    highlights: 'Initial release',
    changes: [
      { type: 'feat', description: 'Replaced Electron with PWA via Serwist' },
      { type: 'ui', description: 'Resizable layout with research-driven operation mode presets' },
      { type: 'ui', description: 'Help menu redesign with 6-tab Operator\'s Manual' },
      { type: 'ui', description: 'Settings panel redesign with GEQ band labels' },
      { type: 'feat', description: '7-algorithm fusion: MSD, Phase, Spectral, Comb, IHR, PTMR, Compression' },
      { type: 'feat', description: 'Acoustic classifier with RT60-aware Q adjustments' },
      { type: 'feat', description: 'Feedback history with repeat offender tracking' },
      { type: 'feat', description: 'Real-time spectrum, GEQ, and amplitude visualization' },
    ],
  },
]
