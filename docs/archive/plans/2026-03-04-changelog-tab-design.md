# Changelog Tab Design

**Date:** 2026-03-04
**Status:** Approved

## Summary

Add a "Changes" tab (7th tab) to the HelpMenu dialog showing a hand-curated, version-grouped changelog derived from git history.

## Data Structure

New file `lib/changelog.ts` exports a `CHANGELOG` array:

```ts
interface ChangelogEntry {
  version: string        // "1.0.5"
  date: string           // "2026-03-04"
  highlights?: string    // One-line summary
  changes: {
    type: 'feat' | 'fix' | 'perf' | 'refactor' | 'ui'
    description: string
  }[]
}
```

## Rendering

In `HelpMenu.tsx`:
- Tab grid: `grid-cols-6` → `grid-cols-7`
- New `TabsTrigger value="changes"` + `TabsContent`
- Each version renders as a `Section` (reusing existing pattern) with colored type badges
- Most recent version at top

## Retroactive Content

Curated from git history covering versions 1.0.0 through 1.0.5, filtering out merge commits, build noise, and tsbuildinfo updates.

## Scope

- 1 new file: `lib/changelog.ts`
- 1 modified file: `HelpMenu.tsx`
- No build-time generation, no external CHANGELOG.md, no pagination

## Decisions

- **Organization:** By version (industry standard, scannable)
- **Content source:** Hand-curated from git (polished, noise-free)
- **Tab layout:** 7-column grid (compact, no scrolling)
