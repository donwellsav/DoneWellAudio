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
      { type: 'feat', description: 'Session history with Neon PostgreSQL' },
      { type: 'feat', description: 'Real-time spectrum, GEQ, and amplitude visualization' },
    ],
  },
]
