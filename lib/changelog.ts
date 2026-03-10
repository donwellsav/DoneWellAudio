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
    version: '0.76.10',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: backend hardening — CSP header, custom SW cache, update notifications, manifest polish' },
    ],
  },
  {
    version: '0.76.9',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: branded start button in issues box — large CTA with speaker icon, wordmark, and breathing glow' },
    ],
  },
  {
    version: '0.76.8',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: single-row mobile header — icons scaled to 36px next to 3-line wordmark' },
    ],
  },
  {
    version: '0.76.7',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: two-row instrument panel — 3-line wordmark + full-width 56px icon bar' },
    ],
  },
  {
    version: '0.76.6',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: two-row mobile header with bigger buttons and branding row' },
    ],
  },
  {
    version: '0.76.5',
    date: '2026-03-10',
    changes: [
      { type: 'fix', description: 'fix: compact mobile header — normalize buttons to 44px, hide version' },
    ],
  },
  {
    version: '0.76.4',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: font size bump (12→14px), wider panels, unified responsive logo' },
    ],
  },
  {
    version: '0.76.2',
    date: '2026-03-10',
    changes: [
      { type: 'feat', description: 'feat: UI polish — canvas glow, panel depth, badge vibrancy, micro-interactions, background texture' },
    ],
  },
  {
    version: '0.76.1',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'docs: update CLAUDE.md with v1.0.118 conventions' },
    ],
  },
  {
    version: '0.76.0',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Add TXT export: fixed-width plain text report with session info, frequency band breakdown, repeat offenders, hotspot tables, EQ recommendations, and recent events' },
      { type: 'feat', description: 'Add PDF export: professional multi-page report with dark header, metric boxes, vector bar charts, styled tables (amber/blue/green), event timeline scatter plot, and page footers — uses jsPDF + jspdf-autotable, dynamically imported to keep initial bundle clean' },
      { type: 'feat', description: 'Consolidate all 4 export formats (TXT, CSV, JSON, PDF) into a single Export dropdown menu' },
      { type: 'feat', description: 'Extract shared `downloadFile()` helper, tighten SheetHeader spacing' },
      { type: 'feat', description: '[ ] Open Feedback History panel — Export dropdown and Clear button visible' },
      { type: 'feat', description: '[ ] Both buttons disabled when no data' },
      { type: 'feat', description: '[ ] Dropdown shows 4 items: TXT, CSV, JSON, PDF' },
      { type: 'feat', description: '[ ] TXT export downloads readable `.txt` file' },
      { type: 'feat', description: '[ ] PDF export shows loading spinner, then downloads multi-page PDF with charts' },
      { type: 'feat', description: '[ ] CSV/JSON exports still work' },
      { type: 'feat', description: '[ ] Clear button works with confirmation dialog' },
      { type: 'feat', description: '[ ] Mobile layout (375x812) renders correctly' },
      { type: 'feat', description: '[ ] Zero console errors' },
      { type: 'feat', description: '[ ] `pnpm build` passes' },
    ],
  },
  {
    version: '0.75.0',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Moved export/clear actions from bottom to top of panel' },
      { type: 'feat', description: 'Replaced fixed-height `ScrollArea h-[250px]` with natural `overflow-y-auto` panel scrolling' },
      { type: 'feat', description: 'Added `SheetDescription` and `text-lg` title to match SettingsPanel/HelpMenu patterns' },
      { type: 'feat', description: 'Replaced magic width classes with standard `sm:max-w-md`' },
      { type: 'feat', description: 'Made Clear button visible with text label and destructive hover styling' },
      { type: 'feat', description: '[ ] Open Feedback History panel — action buttons visible at top' },
      { type: 'feat', description: '[ ] Panel scrolls naturally when content overflows' },
      { type: 'feat', description: '[ ] Empty state shows no wasted space' },
      { type: 'feat', description: '[ ] Clear button shows destructive hover styling' },
      { type: 'feat', description: '[ ] AlertDialog confirmation still works on Clear' },
      { type: 'feat', description: '[ ] Mobile viewport renders cleanly' },
    ],
  },
  {
    version: '0.74.1',
    date: '2026-03-09',
    highlights: 'Codebase audit — 27 bug fixes',
    changes: [
      { type: 'fix', description: 'GEQ band index formula corrected (inline log2 → findNearestGEQBand lookup)' },
      { type: 'fix', description: 'Prominence gate bypass when neighborhood bins = 2 (minimum raised to 4)' },
      { type: 'fix', description: 'Web Worker buffer transfer now includes typed arrays in message payload' },
      { type: 'fix', description: 'Sample standard deviation uses Bessel\'s correction (n−1)' },
      { type: 'fix', description: 'Room mode proximity tracks best match across all modes instead of first' },
      { type: 'fix', description: 'Hotspot map key collision resolved with unique string IDs' },
      { type: 'fix', description: 'Stale closure fixes in useAudioAnalyzer (dspWorkerRef, switchDevice)' },
      { type: 'fix', description: 'ERB depth scale interpolation discontinuity at 2kHz boundary' },
      { type: 'fix', description: 'Sideband dB averaging converted to linear power domain' },
      { type: 'fix', description: 'Object URL leak in CSV/JSON export downloads' },
      { type: 'feat', description: 'HTTP security headers: X-Content-Type-Options, X-Frame-Options, Permissions-Policy' },
      { type: 'feat', description: 'ARIA dialog attributes on onboarding overlay' },
      { type: 'refactor', description: 'Controlled service worker activation (message-based skipWaiting)' },
      { type: 'refactor', description: 'Removed dead styles/globals.css, dead getBinHistory methods, duplicate F-key handler' },
    ],
  },
  {
    version: '1.0.117',
    date: '2026-03-09',
    highlights: 'Quick controls, custom presets, mobile polish',
    changes: [
      { type: 'feat', description: 'Quick/Full controls toggle — pill buttons switch between essential and full detection controls' },
      { type: 'feat', description: 'Custom detection presets — save up to 5 named presets, load from mode selector dropdown' },
      { type: 'feat', description: 'Early warning elapsed timer with color-coded urgency and persistence progress bar' },
      { type: 'feat', description: 'Active algorithm indicators in Auto mode — ring highlights show which algorithms are running' },
      { type: 'feat', description: 'Frame-drop indicator with live FPS counter in algorithm status bar' },
      { type: 'feat', description: 'EQ copy-to-clipboard button on issue cards (frequency, GEQ band, PEQ cut in one string)' },
      { type: 'feat', description: 'Mobile swipe navigation between Issues, Graph, and Settings tabs' },
      { type: 'feat', description: 'Onboarding step 5: keyboard shortcuts summary (Space, F, P, 1/2/3)' },
      { type: 'ui', description: 'Mobile tab labels enlarged from 9px to 11px for stage-light readability' },
      { type: 'ui', description: 'GEQ band labels: raised minimum font to 9px with text shadow for contrast' },
      { type: 'fix', description: 'Quick/Full controls toggle enlarged with full labels after usability feedback' },
    ],
  },
  {
    version: '1.0.116',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'EQ recommendations (GEQ band/cut, PEQ Q/gain) now included in CSV and JSON exports' },
    ],
  },
  {
    version: '1.0.115',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Noise floor line more visible with 5% fill below for region clarity' },
      { type: 'ui', description: 'Axis labels brighter (zinc-300) with dark text shadow for outdoor readability' },
    ],
  },
  {
    version: '1.0.114',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Velocity shown on all active issue cards — "↑ building" for slow growth, amber/red for warnings' },
      { type: 'feat', description: 'Issue age indicator shows how long each issue has been active (just now, Xs, Xm)' },
    ],
  },
  {
    version: '1.0.113',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Keyboard shortcut labels added to header tooltips (L, F, P)' },
      { type: 'feat', description: 'Hover tooltip on spectrum canvas shows frequency + dB at cursor position' },
      { type: 'ui', description: 'Subtle crosshair lines follow cursor over spectrum display' },
    ],
  },
  {
    version: '1.0.112',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'Header icons now actually render at 24px (shadcn Button was overriding w/h classes)' },
    ],
  },
  {
    version: '1.0.111',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Header buttons enlarged to 40px with 24px icons to fill dead space' },
    ],
  },
  {
    version: '1.0.110',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Header icons enlarged from 16px to 20px for better visibility' },
    ],
  },
  {
    version: '1.0.109',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: dismiss ✕ separated into its own column away from badges' },
    ],
  },
  {
    version: '1.0.108',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: badge rows flush-right aligned to same edge' },
    ],
  },
  {
    version: '1.0.107',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'Minor stability improvements' },
    ],
  },
  {
    version: '1.0.106',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: larger frequency text (18px) with Hz/kHz suffix' },
    ],
  },
  {
    version: '1.0.105',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: badges split into 2 rows — status/action top, classification bottom' },
    ],
  },
  {
    version: '1.0.104',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: EQ recommendation moved to left column under pitch (flex-wraps when narrow)' },
    ],
  },
  {
    version: '1.0.103',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Issue cards: 2-column layout — frequency anchors left, badges and EQ right' },
    ],
  },
  {
    version: '1.0.102',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Larger frequency readout on issue cards (14px → 16px)' },
      { type: 'fix', description: 'Normalize badge heights in issue cards for uniform appearance' },
    ],
  },
  {
    version: '1.0.101',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Enforce 12px minimum text across all sidebar components (39 elements upgraded)' },
    ],
  },
  {
    version: '1.0.100',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Larger noise floor text on gain fader for at-a-glance readability' },
    ],
  },
  {
    version: '1.0.99',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Noise floor overlay — higher contrast white text with drop shadow' },
    ],
  },
  {
    version: '1.0.98',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Move noise floor readout from header to gain fader strip' },
    ],
  },
  {
    version: '1.0.97',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Sheet padding fix, revert tab labels to full words' },
    ],
  },
  {
    version: '1.0.96',
    date: '2026-03-09',
    changes: [
      { type: 'ui', description: 'Header button cleanup, tab label shortening, help icons' },
    ],
  },
  {
    version: '1.0.95',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'ESLint strictness, early warning panel, tsconfig cleanup' },
    ],
  },
  {
    version: '1.0.94',
    date: '2026-03-09',
    changes: [
      { type: 'feat', description: 'Canvas keyboard accessibility, peak hold indicator, backpressure metrics' },
    ],
  },
  {
    version: '1.0.93',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'Enlarge touch targets and improve mobile graph readability' },
    ],
  },
  {
    version: '1.0.92',
    date: '2026-03-09',
    changes: [
      { type: 'fix', description: 'WCAG AA contrast, badge overflow, resizable handle affordance' },
    ],
  },
  {
    version: '1.0.91',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Graceful mic error handling — rich error banner with contextual guidance, retry button, and dismiss; error-aware canvas placeholder' },
    ],
  },
  {
    version: '1.0.90',
    date: '2026-03-08',
    changes: [
      { type: 'refactor', description: 'Decompose SettingsPanel (1,226 lines) into modular tab components — Detection, Algorithms, Display, Advanced, Room' },
    ],
  },
  {
    version: '1.0.89',
    date: '2026-03-08',
    changes: [
      { type: 'fix', description: 'Fix portals (Settings, Help, dropdowns, tooltips) not rendering in fullscreen mode' },
    ],
  },
  {
    version: '1.0.88',
    date: '2026-03-08',
    changes: [
      { type: 'fix', description: 'Fix mobile header logo alignment — shrink button/text to match desktop proportions' },
    ],
  },
  {
    version: '1.0.87',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Replay Onboarding button added to Settings → Display tab' },
    ],
  },
  {
    version: '1.0.86',
    date: '2026-03-08',
    changes: [
      { type: 'feat', description: 'Interactive first-run onboarding walkthrough (4 steps) for new users' },
    ],
  },
  {
    version: '1.0.85',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Settings panel converted from blocking modal to slide-in sheet for consistency' },
    ],
  },
  {
    version: '1.0.84',
    date: '2026-03-08',
    changes: [
      { type: 'ui', description: 'Help menu converted from blocking modal to slide-in sheet panel' },
    ],
  },
  {
    version: '1.0.83',
    date: '2026-03-08',
    highlights: 'Issue card redesign',
    changes: [
      { type: 'ui', description: 'Redesigned issue cards — frequency hero row, badges on dedicated row, niche metadata in tooltip' },
      { type: 'ui', description: 'Cleaner EQ recommendation row with proper column layout' },
    ],
  },
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
