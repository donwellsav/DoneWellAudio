# Changelog Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Changes" tab to the HelpMenu with hand-curated, version-grouped changelog entries retroactively derived from git history.

**Architecture:** Static TypeScript data array in `lib/changelog.ts`, rendered as a new 7th tab in `HelpMenu.tsx` using the existing `Section` component pattern and colored type badges.

**Tech Stack:** TypeScript, React, shadcn/ui Tabs, Tailwind CSS

---

### Task 1: Create changelog data file

**Files:**
- Create: `lib/changelog.ts`

**Step 1: Create `lib/changelog.ts` with types and curated data**

```typescript
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
```

**Step 2: Commit**

```bash
git add lib/changelog.ts
git commit -m "feat: add changelog data with retroactive entries v1.0.0-1.0.5"
```

---

### Task 2: Add Changes tab to HelpMenu

**Files:**
- Modify: `components/analyzer/HelpMenu.tsx`

**Step 1: Add import**

At line 16 (after lucide-react import), add:

```typescript
import { CHANGELOG, type ChangeType } from '@/lib/changelog'
```

**Step 2: Add type badge helper**

After the import block (before `export function HelpMenu()`), add a helper constant for badge colors:

```typescript
const TYPE_STYLES: Record<ChangeType, { label: string; className: string }> = {
  feat: { label: 'Feature', className: 'bg-emerald-500/15 text-emerald-400' },
  fix: { label: 'Fix', className: 'bg-orange-500/15 text-orange-400' },
  perf: { label: 'Perf', className: 'bg-cyan-500/15 text-cyan-400' },
  refactor: { label: 'Refactor', className: 'bg-violet-500/15 text-violet-400' },
  ui: { label: 'UI', className: 'bg-pink-500/15 text-pink-400' },
}
```

**Step 3: Expand grid from 6 to 7 columns**

Change line 35:
```diff
- <TabsList className="grid w-full grid-cols-6">
+ <TabsList className="grid w-full grid-cols-7">
```

**Step 4: Add Changes tab trigger**

After the About TabsTrigger (line 41), add:
```tsx
<TabsTrigger value="changes">Changes</TabsTrigger>
```

**Step 5: Add Changes tab content**

Before the closing `</Tabs>` tag (line 839), insert the new tab content:

```tsx
{/* ═══════════════════════════════════════════════════════════════
    TAB 7: CHANGES
    ═══════════════════════════════════════════════════════════════ */}
<TabsContent value="changes" className="mt-4 space-y-4">
  {CHANGELOG.map((entry) => (
    <Section key={entry.version} title={`v${entry.version} — ${entry.date}${entry.highlights ? ` · ${entry.highlights}` : ''}`}>
      <ul className="space-y-1.5">
        {entry.changes.map((change, i) => {
          const style = TYPE_STYLES[change.type]
          return (
            <li key={i} className="flex items-start gap-2">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none shrink-0 mt-0.5 ${style.className}`}>
                {style.label}
              </span>
              <span>{change.description}</span>
            </li>
          )
        })}
      </ul>
    </Section>
  ))}
</TabsContent>
```

**Step 6: Update file header comment**

Change line 4:
```diff
- // 5-tab layout: Guide, Modes & Tips, Algorithms, The Math, Reference
+ // 7-tab layout: Guide, Modes, Algorithms, The Math, Reference, About, Changes
```

**Step 7: Commit**

```bash
git add components/analyzer/HelpMenu.tsx
git commit -m "feat: add Changes tab to help menu with version-grouped changelog"
```

---

### Task 3: Verify build

**Step 1: Run lint**

```bash
pnpm lint
```

Expected: No errors

**Step 2: Run build**

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors

**Step 3: Commit any fixes if needed**

---

### Task 4: Visual verification

**Step 1: Start dev server and verify**

Start the dev server, open help menu, click Changes tab. Verify:
- 7 tabs display correctly in the grid
- All 5 versions render with colored badges
- Scrolling works within the dialog
- Badge colors match the type (green=feat, orange=fix, cyan=perf, violet=refactor, pink=ui)
