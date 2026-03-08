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
    version: '1.0.82',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Wider gain fader strip (48px → 64px) with proportionally larger thumb and input' },
    ],
  },
  {
    version: '1.0.81',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Standardized font sizes — collapsed 6 arbitrary sizes to 3 semantic tiers (micro/caption/label)' },
      { type: 'fix', description: 'Changelog cleanup — sorted versions, removed dev checklists, fixed entry types' },
    ],
  },
  {
    version: '1.0.80',
    date: '2026-03-08',
    highlights: 'UI polish & blue theme unification',
    changes: [
      { type: 'ui', description: 'Vertical gain fader with venue quick-cal pills (Quiet / Med / Loud)' },
      { type: 'ui', description: 'Blue theme unification — RTA spectrum, input meters, and issue badges now use site primary blue' },
      { type: 'ui', description: 'Canvas-drawn RTA placeholder replaces static JPEG — stays in sync with theme colors' },
      { type: 'fix', description: 'Auto-gain now off by default — user clicks a venue pill to start calibration' },
      { type: 'fix', description: 'Default input gain lowered from +15 dB to +6 dB' },
      { type: 'ui', description: 'Default layout opens all three sidecars (Controls, Issues, Graphs)' },
      { type: 'fix', description: 'Canvas axis labels no longer clip at edges — proper padding and textBaseline alignment' },
    ],
  },
  {
    version: '1.0.79',
    date: '2026-03-08',
    highlights: 'Audio source selection',
    changes: [
      { type: 'feat', description: 'Audio input device selector — switch microphones without restarting' },
      { type: 'ui', description: 'Dark title bar for native app feel' },
    ],
  },
  {
    version: '1.0.78',
    date: '2026-03-07',
    changes: [
      { type: 'perf', description: 'Canvas FPS throttle reduces frame stuttering on lower-end hardware' },
    ],
  },
  {
    version: '1.0.77',
    date: '2026-03-07',
    highlights: 'Component architecture split',
    changes: [
      { type: 'refactor', description: 'Split KillTheRing into HeaderBar, MobileLayout, and DesktopLayout components' },
      { type: 'feat', description: 'Remapped keyboard shortcuts for new layout' },
    ],
  },
  {
    version: '1.0.76',
    date: '2026-03-07',
    changes: [
      { type: 'feat', description: 'RTA freeze — pause the spectrum display for closer inspection' },
    ],
  },
  {
    version: '1.0.75',
    date: '2026-03-07',
    changes: [
      { type: 'fix', description: 'Fixed all 15 ESLint issues across kill-the-ring components' },
      { type: 'ui', description: 'Pro audio dark theme refresh, removed EQNotepad, layout tuning' },
    ],
  },
  {
    version: '1.0.74',
    date: '2026-03-07',
    changes: [
      { type: 'fix', description: 'Worker stability — DSP worker message handler wrapped in try/catch so soft errors no longer crash the worker' },
      { type: 'fix', description: 'Crash recovery — worker auto-recreated on next Start press after a hard crash' },
    ],
  },
  {
    version: '1.0.73',
    date: '2026-03-07',
    changes: [
      { type: 'refactor', description: 'Removed unused `applyFrequencyDependentThreshold` function' },
    ],
  },
  {
    version: '1.0.72',
    date: '2026-03-07',
    changes: [
      { type: 'refactor', description: 'Removed unused `analyzeFormantStructure` function and constants' },
    ],
  },
  {
    version: '1.0.71',
    date: '2026-03-07',
    changes: [
      { type: 'feat', description: 'Widened harmonic tolerance range from 25–100 to 25–400 cents (default 200) for better reverberant room support' },
    ],
  },
  {
    version: '1.0.70',
    date: '2026-03-06',
    highlights: 'RTA threshold overlay',
    changes: [
      { type: 'feat', description: 'RTA threshold line overlay — dashed blue line shows effective detection threshold on the spectrum graph' },
      { type: 'ui', description: 'Show on RTA toggle under Threshold slider to show/hide threshold line' },
    ],
  },
  {
    version: '1.0.69',
    date: '2026-03-05',
    highlights: 'Low-frequency detection restored',
    changes: [
      { type: 'fix', description: 'Removed erroneous 400 Hz hard floor — low-frequency feedback is now detectable again' },
      { type: 'fix', description: 'Reduced LOW band multipliers (prominence 1.4×→1.15×, sustain 1.5×→1.2×) to prevent triple-stacking penalties' },
      { type: 'fix', description: 'Advisory card dedup — frequency-proximity matching (200 cents) replaces same-frequency cards instead of accumulating duplicates' },
    ],
  },
  {
    version: '1.0.68',
    date: '2026-03-05',
    changes: [
      { type: 'fix', description: 'Reduced Schroeder room-mode penalty from -0.25 to -0.12 — old value blocked sub-300 Hz detection' },
      { type: 'fix', description: 'Prominence floor now synced with `settings.prominenceDb` instead of hardcoded 10 dB' },
      { type: 'fix', description: 'Duplicate advisories — cleared advisories now properly removed by ID before re-detection' },
    ],
  },
  {
    version: '1.0.67',
    date: '2026-03-05',
    highlights: 'Pro convention EQ recommendations',
    changes: [
      { type: 'feat', description: 'Raised PEQ Q values to pro convention (surgical Q60, heavy Q30) matching dbx AFS standards' },
      { type: 'feat', description: 'ERB-scaled cut depth — shallower cuts below 500 Hz to protect warmth, deeper above 2 kHz' },
      { type: 'feat', description: 'PHPR (Peak-to-Harmonic Power Ratio) detection for feedback vs. music discrimination' },
      { type: 'fix', description: 'Improved early/quiet feedback detection with MSD-lowered threshold gate' },
    ],
  },
  {
    version: '1.0.66',
    date: '2026-03-05',
    highlights: 'Speech preset retune',
    changes: [
      { type: 'fix', description: 'Retuned Speech (Corporate & Conference) preset for balanced soundcheck + live use' },
      { type: 'fix', description: 'Extended frequency range to 10 kHz to catch condenser sibilance feedback' },
      { type: 'fix', description: 'Raised confidence threshold, prominence, and sustain to reduce false positives' },
    ],
  },
  {
    version: '1.0.65',
    date: '2026-03-05',
    highlights: 'Measure-then-lock auto-gain',
    changes: [
      { type: 'feat', description: 'Auto-gain calibrates for 3 seconds on start, then freezes at the computed gain value' },
      { type: 'feat', description: 'Eliminates gain pumping that caused noise floor tracking instability' },
      { type: 'ui', description: 'UI toggle shows Cal (pulsing amber) during calibration and Lock (green) when frozen' },
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
    ],
  },
  {
    version: '1.0.6',
    date: '2026-03-04',
    highlights: 'Codebase hardening & cleanup',
    changes: [
      { type: 'refactor', description: 'Removed Neon PostgreSQL database layer and session persistence' },
      { type: 'refactor', description: 'Removed in-memory EventLogger and log export UI' },
      { type: 'fix', description: 'Capped hotspot events to 50 to prevent unbounded localStorage growth' },
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
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-03',
    highlights: 'Initial release',
    changes: [
      { type: 'feat', description: 'Replaced Electron with PWA via Serwist' },
      { type: 'ui', description: 'Resizable layout with research-driven operation mode presets' },
      { type: 'feat', description: '7-algorithm fusion: MSD, Phase, Spectral, Comb, IHR, PTMR, Compression' },
      { type: 'feat', description: 'Acoustic classifier with RT60-aware Q adjustments' },
      { type: 'feat', description: 'Feedback history with repeat offender tracking' },
      { type: 'feat', description: 'Real-time spectrum, GEQ, and amplitude visualization' },
    ],
  },
]
