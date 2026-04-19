---
name: changelog-entry
description: Draft a new versioned entry for lib/changelog.ts from the current branch's commits, in DoneWell Audio's typed severity-tagged format. Use during /yeet Phase 4, when cutting a version manually, or when "update the usuals" needs a changelog row.
---

## What this does

Reads commits on the current branch since it diverged from `origin/main`, then drafts a new `lib/changelog.ts` entry in the project's existing typed format.

## Prerequisites

- The draft PR has been opened and the PR number is known — typically from the `/yeet` flow's `gh pr create` output.
- The current branch is checked out locally with its commits in place.

## Steps

1. **Confirm the PR number.** Either receive it from the caller (`/yeet` passes it in) or resolve it:
   ```
   gh pr view --json number --jq '.number'
   ```
2. **Collect the commits** on the branch:
   ```
   git log origin/main..HEAD --no-merges --format="%s%n%b%n---"
   ```
3. **Read `lib/changelog.ts`** to confirm the entry's TypeScript shape (field names, date format, change-type strings). Do not assume — the exact typing is the source of truth.
4. **Classify each commit subject** into one of the project's change types. Typical set:
   - `feature` — new user-facing functionality
   - `fix` — bug or regression fix
   - `a11y` — accessibility improvement
   - `perf` — performance improvement
   - `refactor` — code cleanup, no behavior change
   - `chore` — tooling, tests, docs, infra
5. **Draft the new entry** for version `0.{PR_NUMBER}.0` with today's ISO date, one bullet per commit grouped by type. Use plain descriptions — do not echo the raw subject line verbatim if it contains issue numbers or co-authored-by footers.
6. **Surface the draft** to the user. Then, on confirmation, insert it at the top of the changelog array in `lib/changelog.ts`, keeping the file's formatting (indentation, quote style) identical to existing entries.

## Format rules (reconfirm by reading the actual file)

The changelog is typed — do not invent fields. Typical entry shape:
```ts
{
  version: '0.X.0',
  date: 'YYYY-MM-DD',
  changes: [
    { type: 'feature', description: '...' },
    { type: 'fix', description: '...' },
  ],
}
```

## What NOT to do

- Do not rewrite past entries.
- Do not invent change types the file doesn't already use — ask if unsure.
- Do not include merge commits; filter them out with `--no-merges` in the git log.
- Do not echo Co-Authored-By or AI-attribution footers into the description. Describe the change, not the authorship.
- Do not guess classification — read the commit body when the subject is ambiguous.
- Do not silently drop commits. If something doesn't fit an existing type, surface it and ask.
