---
name: update-usuals
description: Automate the version release checklist — changelog, help menu, package.json, CLAUDE.md
---

# Update the Usuals

Automate the standard version release checklist from CLAUDE.md.

## Arguments

The user provides a version: `/update-usuals 0.53.0`
If no version given, compute next PR number:
```bash
gh pr list --state all --limit 1 --json number
```
Take the returned number and add 1. Use `0.<result>.0` as the version.

## Steps

1. **Changelog** (`lib/changelog.ts`) — Add entry for the new version with all features/fixes since last entry. Read `git log` since last version tag to identify changes.

2. **Help menu** (`components/analyzer/help/GuideTab.tsx`) — Check for any stale references and update if needed.

3. **Version** (`package.json`) — Update the `version` field.

4. **CLAUDE.md** — Update the header line:
   - Version number
   - File count: `find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v .next | grep -v .claude | wc -l`
   - Test count: run `pnpm test` and extract the counts
   - Suite count: from the same test output
   - Update summary line if new major features were added

5. **Verify** — Run `npx tsc --noEmit && pnpm test` to confirm nothing broke.

6. **Stop** — Do NOT commit, push, or create PR. Report what was updated and wait for user direction.
