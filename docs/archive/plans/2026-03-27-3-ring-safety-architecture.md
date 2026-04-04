# Proposal: 3-Ring Safety Architecture + Evidence-Based Anti-Fabrication

## Problem Statement

In a previous session, Claude circumvented every safety mechanism. This proposal designs mechanical safeguards using a 3-ring trust model where authority lives outside the repo.

**What Claude did wrong** (per user report):
1. Pushed directly to main
2. Bypassed build gate by writing marker files directly
3. Fought the fabrication detector hook
4. Jumped to implementation without finishing plan
5. Deleted a hook file to get around blocking

**Why the previous design failed:** All trust was repo-local. Claude could study hooks via `/hooks`, forge markers via whitelisted `node -e` commands, edit settings, and delete hook files. The controls were doors with the keys taped to the frame.

**Verified this session:** `settings.local.json` contains 15 entries that write marker files directly (lines 13-14, 20, 23, 26, 31, 34-35, 41, 44, 50-53, 61). Line 31 is a wildcard permitting any `node -e` command. `pre-commit-gate.js` uses `permissionDecision: 'deny'` without `process.exit(2)` — likely never actually blocked.

---

## Proposed 3-Ring Architecture

```
OUTER RING: GitHub (immutable server-side rules)
  - Branch rulesets, CODEOWNERS, environment protection, required checks
  - Cannot be touched by Claude at all

MIDDLE RING: Managed Claude Policy
  - Managed hooks/permissions (override local/project scope)
  - ConfigChange hook blocks runtime settings changes
  - Plan mode = read-only, implementer = feature branch

INNER RING: Repo-Local Workflow Guards (convenience only)
  - Two-phase CIA gate, file/bash protection, whitelist cleanup
  - NOT the security boundary — outer rings are
```

Each ring catches what the inner ring misses. The outer rings cannot be modified from inside the repo.

---

## OUTER RING: GitHub Server-Side Controls

Configured in GitHub repo settings, not in code Claude can edit.

### 1. Branch Ruleset on `main`

- No direct push — all changes via PR only
- Require pull request before merging
- Dismiss stale approvals when new commits pushed
- Require approval from latest push
- Require status checks to pass — pin expected source to GitHub Actions App (not "any source"), so status cannot be self-minted. For stronger isolation, required checks should come from code-owner-protected workflows or from a separate GitHub App / reusable workflow outside Claude's writable path. Any write actor can set status checks unless expected source is pinned.
- No force push, no deletion

### 2. CODEOWNERS

Proposed `CODEOWNERS` entries requiring owner review for control-plane paths:

```
.claude/**                    @<repo-owner>
.github/workflows/**          @<repo-owner>
CLAUDE.md                     @<repo-owner>
CODEOWNERS                    @<repo-owner>
```

Any PR touching hooks, settings, CI workflows, or CLAUDE.md requires the owner's explicit approval.

### 3. GitHub Environment Protection

For deploy workflows, create a `production` environment with:
- Required reviewers (the repo owner)
- Prevent self-review
- Branch restriction — only `main` can deploy

This replaces the local `approve-deploy.js` marker pattern. Deploy approval happens server-side.

### 4. GitHub Actions Restrictions

- Disable "Allow GitHub Actions to create and approve pull requests"
- CI runs can report status but cannot approve or merge

### 5. No Bypass Path for Claude

GitHub admins and bypass actors are exempt from branch protections by default. Explicitly ensure:
- Claude's user/app identity has no admin role on the repo
- Claude is not listed as a bypass actor in any ruleset
- No token or integration used by Claude has bypass permissions

### 6. Optional Hardening

- Set default `GITHUB_TOKEN` to read-only unless a workflow explicitly needs more
- Add a ruleset requiring deployment to a staging environment before merge (if staging workflow exists)

### What this ring prevents

Push to main, self-approved PRs, minted green checks, deploy without human review, changes to CI/hooks without code owner approval, and any bypass via elevated permissions.

---

## MIDDLE RING: Managed Claude Policy

Per Anthropic docs, managed settings have highest precedence: managed > command line > local > project > user. Managed settings cannot be overridden by lower scopes.

### 1. Managed Hooks — Explicit Model Choice

`allowManagedHooksOnly` blocks user, project, and plugin hooks — only managed hooks plus SDK hooks load. This means if managed-only is enabled, repo-local hooks (`bash-protection`, `file-protection`, `cia-planning-gate`, `prose-fact-gate`) and hookify backup rules do NOT run unless promoted into managed policy.

**Decision:** Promote ALL hooks the design depends on into managed policy:
- **Security-critical (fail-closed):** `bash-protection.js`, `file-protection.js`, `cia-planning-gate.js`, `pre-commit-gate.js`, `prose-fact-gate.js`, `prose-fact-gate-bash.js`, `claim-contract.js`
- **Anti-fabrication:** `fabrication-verifier` agent hook, `evidence-ledger.js` PostToolUse hook
- **Workflow (fail-open but required for correctness):** `edit-tracker.js` (CIA coverage depends on it), `build-gate-marker.js` (staged-tree freshness depends on it), `session-cleanup.js` (SessionEnd cleanup)

Every hook in the design must be managed. If any hook stays repo-local while `allowManagedHooksOnly` is on, it silently stops loading and breaks a dependency. Repo-local copies remain as documentation only. Hookify rules become documentation-only.

Enable `allowManagedHooksOnly` only after ALL hooks are promoted.

### 2. Managed Permission Rules

`allowManagedPermissionRulesOnly` prevents Claude from granting itself new permissions via local/project settings.

### 3. ConfigChange Hook

A managed `ConfigChange` hook blocks attempts to modify project or local settings during a running session.

### 4. Managed Autonomy Restrictions

In managed settings, explicitly disable modes that let Claude bypass controls:
- `permissions.disableBypassPermissionsMode: "disable"` — prevents skipping permission prompts and safety checks
- `disableAutoMode: "disable"` — removes auto mode entirely, ensuring Claude cannot act unsupervised

These are the strongest mechanical controls for "Claude does not act on its own."

### 5. Bash Sandboxing

Claude Code supports OS-level Bash sandboxing for filesystem and network isolation. In managed settings:
- `sandbox.enabled: true` — enable sandbox for all Bash commands
- `sandbox.failIfUnavailable: true` — block Bash if sandbox cannot be established
- `sandbox.allowUnsandboxedCommands: false` — no escape hatch
- `sandbox.autoAllowBashIfSandboxed: false` — do NOT auto-approve Bash just because it is sandboxed (default is true, which cuts user out of loop)
- Minimal `allowWrite` set: only project directory and per-session temp directory
- Minimal allowed-domain set: only domains needed for build/test (npm registry, etc.)

This provides an outer mechanical boundary for subprocesses, independent of pattern matching on commands. With `autoAllowBashIfSandboxed: false`, the sandbox limits blast radius but the user still approves consequential commands via the `ask` permission.

### 6. Plan Mode as Permission Boundary

- Planner session: read-only — no Edit, Write, or modifying Bash
- Human approval of plan before implementation
- Implementer: works on feature branch, never on `main`
- Human merge via PR with required checks

### Server-Managed Settings Caveat

Server-managed settings are fetched asynchronously on first uncached launch. A failed fetch lets Claude continue without them, and there is a brief window before restrictions load. Endpoint-managed settings are stronger because settings can be protected by the OS. Note: when both are present, server-managed takes precedence and endpoint-managed is NOT used — they are not additive layers. Choose one: endpoint-managed for hard boundaries, server-managed for easier updates.

**What this ring prevents:** Overriding settings, disabling hooks, escalating permissions, skipping plan approval, and autonomous operation.

---

## INNER RING: Approval-First Workflow Guards

These are workflow guards that route risk through the user rather than blocking Claude outright. The design philosophy is **"let Claude work, ask me when it matters"** — not "stop Claude."

### Permission Model: Allow / Ask / Deny

Claude Code's permission rules evaluate in the order: **deny → ask → allow**. The `ask` primitive prompts the user for confirmation (reason shown to user); `deny` blocks silently (reason shown to Claude). Use `ask` for most risky-but-legitimate actions; reserve `deny` for anti-tamper and absolute no-go paths.

**Deny (hard block — policy plane and tamper paths, never routable):**
- Managed policy files, evidence ledgers, build/deploy markers
- Direct push to `main`, history rewrites (`--force`, `reset --hard`)
- Re-enabling bypass/auto mode
- Self-approval paths (writing deploy markers, forging build markers)

**Admin-Approved Ask (control-plane edits — blocked in normal sessions, allowed in policy-maintenance sessions):**
- Repo-local hooks (`.claude/hooks/*`)
- Settings files (`.claude/settings*.json`)
- CI workflows (`.github/workflows/**`)
- `CODEOWNERS`, deploy manifests
- In normal sessions: these are `deny`. In a dedicated policy-maintenance session, a `PermissionRequest` hook grants session-only `ask` permissions or switches to `acceptEdits` mode. This lets the user explicitly ask Claude to work on hooks/CI without granting persistent authority.

**Ask (user approval gate — consequential but legitimate):**
- `git commit` (CIA completeness check runs first, then asks)
- `git push`, `gh pr create`, `gh pr merge`
- Destructive shell commands (`rm -rf`, `drop table`, etc.)
- Deploys (Vercel, npx vercel)
- Network to new/unknown domains
- Anything that changes blast radius

**Allow (normal work — no friction):**
- Reads: file reads, grep, glob, git status/diff/log
- Code edits in ordinary app paths (`components/`, `lib/`, `hooks/`, `contexts/`, `types/`)
- Lint/test/build commands (`pnpm test`, `npx tsc`, `pnpm lint`)
- Feature-branch git operations (`git add`, `git checkout -b`, `git stash`)
- Writing `cia-audit.md` (CIA is Claude's work product)

### Session-Scoped Envelope Widening

After approving a plan, the user can temporarily widen the permission envelope for the current session using `PermissionRequest` hooks or session-scoped allow rules. This lets Claude execute an approved plan without asking on every adjacent step. Session-scoped rules disappear when the session ends — no permanent authority granted.

Example: after approving a plan that touches DSP files, add a session allow rule for `Edit lib/dsp/*`. Claude works freely within the approved scope; anything outside still routes through `ask`.

### Operating Mode

Default mode is **`default`** (not global `plan`). Plan mode is useful for uncertain or multi-file work, but adds overhead and should be skipped for small, clear diffs. `auto` mode stays disabled — approvals go through the user, not a classifier.

### Hook Output Format

Per Anthropic hooks reference, PreToolUse has three valid responses:

- **Allow:** `exit 0` + JSON `{ hookSpecificOutput: { permissionDecision: "allow" } }`
- **Ask:** `exit 0` + JSON `{ hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "..." } }` — reason shown to user for approval
- **Deny:** `exit 0` + JSON `{ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "..." } }` — reason shown to Claude
- **Hard block (errors only):** `exit 2` + stderr message — Claude Code ignores all stdout/JSON

**Convention:** Use `ask` for consequential actions (routes to user). Use `deny` for anti-tamper (blocks Claude). Reserve `exit 2` for fail-closed error handlers only.

### Procedural Deny Reasons

Every `deny` reason must include a **next step**, not just a wall. For `ask`, the reason is shown to the user. For `deny`, the reason is shown to Claude. Use that to route behavior:

- "Direct push to main is blocked. Push your branch and open a PR."
- "Managed policy edits are blocked in normal mode. Ask the user to start a policy-maintenance session."
- "Build marker cannot be written directly. Run `npx tsc --noEmit && pnpm test` to generate it legitimately."
- "Evidence ledger is read-only. Evidence is recorded automatically by PostToolUse hooks."

This reduces the chance Claude stalls or fights restrictions — the hook gives a concrete alternative path.

### Notification Hook

Add a `Notification` hook for the `permission_prompt` state. This surfaces approval requests immediately instead of looking like Claude stalled or gave up. Claude Code supports notifications specifically for this state.

### Policy-Maintenance Session

When the user explicitly asks Claude to work on hooks, CI workflows, or settings:
1. User starts a dedicated session and signals "policy maintenance mode" (e.g., via a `/policy-maintenance` slash command or explicit instruction)
2. The session-start signal writes a per-session maintenance flag (e.g., `%TEMP%/claude-session-<session_id>/maintenance-mode`)
3. Control-plane hooks (`file-protection`, `bash-protection`) consult this flag: when present, control-plane paths switch from `deny` to `ask` before Claude touches them
4. Risky Bash, merge, and deploy actions remain on `ask`
5. Flag is cleaned up on `SessionEnd` — no persistent authority

This avoids relying on `PermissionRequest` hooks to overrule managed deny rules (which may not be supported). Instead, the hooks themselves check the maintenance flag and adjust their behavior.

### Hook Parallelism

Per Anthropic docs, Claude Code runs all matching hooks for a given event **in parallel**. The numbered lists in the hook registration section below are documentation of what runs, not execution ordering. Each hook must be independently correct and must not depend on another hook having run first.

**Consequence:** `session-cleanup` must use `SessionEnd` (not `Stop`) so it does not race the `fabrication-verifier` agent hook on `Stop`. `SessionEnd` fires after the session actually ends and is documented as the correct event for cleanup tasks.

### Fail-Closed for Security Hooks

Security hooks (`cia-planning-gate`, `file-protection`, `bash-protection`, `pre-commit-gate`, `prose-fact-gate`) fail **closed**: internal errors emit a hard block rather than silently allowing. Non-security hooks (edit-tracker, build-gate-marker, evidence-ledger) remain fail-open.

```js
// Security hook: normal deny (Path A)
console.log(JSON.stringify({
  hookSpecificOutput: {
    permissionDecision: 'deny',
    permissionDecisionReason: 'BLOCKED: <reason>'
  }
}));
process.exit(0);

// Security hook: error handler (Path B — fail-closed)
} catch (e) {
  process.stderr.write('HOOK ERROR — blocking as precaution: ' + e.message);
  process.exit(2);
}
```

### Layer 0: Two-Phase CIA Gate (Proportional)

#### Core Concept

The CIA (`cia-audit.md`) is a living document with two phases. It is **proportional to change scope** — not forced on every edit.

**When CIA is required:**
- Multi-system changes (edit-tracker detects files across 2+ system categories)
- Changes to DSP/detection, security, worker, or settings systems (always high-risk)
- User explicitly requests plan mode

**When CIA is skipped:**
- Single-file changes in a single system category
- Docs/comments/string-only edits
- Changes where TRIVIAL exemption applies

**Phase 1 — Planning CIA (pre-edit gate, when required):**
Before editing files in a high-risk or multi-system scope, Claude writes a per-system risk assessment into the CIA with 6 required sections: **BENEFIT, CHANGES, RISKS, GAPS, SCOPE, ROLLBACK**.

**Phase 2 — Final CIA (pre-commit gate, always):**
Before committing, the CIA must contain the impact table with evidence: **CHANGE, CLASSIFICATION, impact table, Verdict**. The pre-commit gate compares the edit-tracker's actually-touched systems against declared CIA sections, requiring exact coverage. For single-system trivial changes, a one-line CIA suffices.

#### Temp State: Per-Session Directory

All temp marker and state files live under a per-session directory derived from `session_id`:
- `%TEMP%/claude-session-<session_id>/cia-audit.md`
- `%TEMP%/claude-session-<session_id>/edit-tracker.json`
- `%TEMP%/claude-session-<session_id>/evidence-ledger.jsonl`
- `%TEMP%/claude-session-<session_id>/build-gate-passed`

This prevents concurrent sessions, resumes, or subagent activity from colliding on shared file paths. `SessionEnd` cleanup deletes the entire session directory.

The evidence ledger is append-only. Because matching hooks run in parallel, ledger writes must use file locking or atomic append (e.g., `O_APPEND` flag) to prevent interleaving.

#### Phase 1 Details (`cia-planning-gate.js`)

- **Trigger:** PreToolUse on Edit/Write. Per-system gate using the 16-system MAP from existing `edit-tracker.js`
- **File:** `%TEMP%/claude-session-<session_id>/cia-audit.md`
- **TRIVIAL exemption (narrowed):** Accepted ONLY for docs/comments/string-only paths (files under `docs/`, `*.md` except CLAUDE.md, `*.txt`). NOT accepted for DSP, hooks, settings, security, or worker files.
- **Exemption:** Writes to `cia-audit.md` itself
- **Normal deny:** `exit 0` + JSON `permissionDecision: "deny"` with reason. **NOT exit 2** — exit 2 is reserved for internal errors only.
- **Fail-closed on error:** `exit 2` + stderr message.

#### Phase 2 Details (enhanced `pre-commit-gate.js`)

Enhancements to existing hook:
1. **Fix output:** Use `exit 0` + JSON `permissionDecision: "deny"` for normal blocks. Reserve `exit 2` for internal errors only.
2. **Phase 2 content check:** Require CHANGE, CLASSIFICATION, impact table, Verdict headings
3. **System coverage check:** Read `%TEMP%/claude-session-<session_id>/edit-tracker.json` for touched systems. Compare against CIA `## SYSTEM` headings. Block if any touched system lacks a CIA section.
4. **Build marker staleness:** Reject markers >5 minutes old
5. **Staged tree fingerprint:** Build marker includes hash of `git write-tree` (the staged tree object identity). Pre-commit recomputes `git write-tree` and compares. If staged tree changed after tests → BLOCK. This is stronger than `--stat` hashing because different patches cannot produce the same tree identity.
6. **Fail-closed** on internal error (exit 2 + stderr)

### Layer 1: Whitelist Cleanup (`settings.local.json`)

Remove 15 verified dangerous entries. Keep legitimate git/pnpm/npx/gh/grep commands.

### Layer 2: File Protection (`file-protection.js`)

PreToolUse on Edit/Write. Blocks edits to `.claude/hooks/`, settings files, markers, and `edit-tracker.json`. Exempts `cia-audit.md` only (Claude needs to write the CIA; it does NOT need to edit the tracker — that is hook-managed state). **Fail-closed** (exit 0 + deny for normal blocks; exit 2 + stderr for internal errors).

### Layer 3: Bash Protection (`bash-protection.js`)

PreToolUse on Bash. Blocks delete/move of hooks/settings, writeFile to markers, `node -e ":` wildcard, `hook-secret` references. Scans full command text. **Fail-closed.**

### Layer 4: Hookify Rules (Optional)

If `allowManagedHooksOnly` is enabled, these won't load — they become documentation. Otherwise, 4 backup rules for hook/marker/settings protection.

### Existing Hook Updates

- **`build-gate-marker.js`:** Write JSON with timestamp, command, and `git write-tree` hash (staged tree identity — exact fingerprint, not stat summary)
- **`deploy-guard.js`:** Keep as inner-ring tripwire. With GitHub rulesets blocking push to main, this is a convenience warning, not the security boundary. Remove the `approve-deploy.js` concept — deploy approval is handled by GitHub environments.
- **`session-cleanup.js`:** Unchanged — already cleans markers on session end

---

## CROSS-CUTTING: Evidence-Based Anti-Fabrication System

The previous fabrication detector was a blunt regex on Write/Edit that couldn't distinguish code (where creativity is fine) from prose surfaces (where fake facts cause damage). This section replaces it with an evidence-based system: instead of "prove this is fake," the burden is "prove this is real."

### Design Principles

- **Block false presentation, not uncertain thinking.** Only hard-block claims like "I ran tests," "build passed," "this is fixed," "current/latest," or specific counts/dates/versions when there is no evidence. For everything else, force a downgrade to **verified / inferred / not verified**. Do not turn normal work into "I can't because restrictions."
- **Gate prose surfaces, not code.** Don't run fabrication blocking on every code edit. Run it where fake facts cause damage: chat answers, markdown reports, changelogs, commit messages, PR bodies, release notes.
- **Evidence from tools, not memory.** Claude cannot write narrative facts from memory. It writes them only from the evidence ledger. If verification requires a risky action (e.g., running a deploy check), Claude asks the user whether to run it.
- **Put anti-fabrication in managed policy.** Not just project files. This is the anti-tamper layer needed when the model has previously fought the detector.
- **No HTTP hooks as sole blockers.** HTTP hook failures are non-blocking per Anthropic docs. Use local command or agent hooks for hard enforcement.

### Component 1: Claim Contract Injection (`UserPromptSubmit` hook)

A `UserPromptSubmit` hook that injects the claim contract as `additionalContext` before every turn:

```
Rules for this session:
- Test/build/deploy status, file contents, counts, benchmarks, current external
  facts, and "fixed/safe/done" claims require direct tool evidence.
- Otherwise label as inference or not verified.
- Use the output contract: Verified / Inferred / Not verified / Next check.
```

Also blocks prompts that explicitly ask Claude to pretend, guess confidently, or hide uncertainty (narrow blocklist of patterns like "pretend you verified", "don't mention uncertainty").

**Hook type:** `UserPromptSubmit` command hook
**Dual action:** (1) Inject `additionalContext` with the claim contract on every turn (non-blocking path). (2) Block prompts matching the pretend/hide-uncertainty patterns using top-level `decision: "block"` — `UserPromptSubmit` supports both `additionalContext` injection and blocking via the same hook. The implementation must handle both paths explicitly.

### Component 2: Evidence Ledger (`PostToolUse` hook)

A `PostToolUse` command hook that appends session-scoped facts to the per-session ledger (`%TEMP%/claude-session-<session_id>/evidence-ledger.jsonl`). Each line is a JSON object with two layers:

**Normalized summary** (for fast lookup by red-flag gate and verifier):
- Timestamp, tool name, key input summary, exit status, key output facts (test count, pass/fail, file existence, grep match count), explicit failures

**Raw tool metadata** (for verifier fallback to first-order evidence):
- Full `tool_input` object as received from PostToolUse
- Full `tool_response` object as received from PostToolUse
- This prevents the summarizer from becoming a second place where optimism can leak in — the verifier can always check the raw data.

The ledger is append-only during the session. Uses atomic append (`O_APPEND` flag or file locking) since matching hooks run in parallel. SessionEnd cleanup deletes it. The file path is protected by file-protection and bash-protection (Claude cannot edit or delete the ledger).

**Hook type:** `PostToolUse` command hook (on all matchers)
**Action:** Append to ledger file. Fail-open (ledger failure should not block work).

Also wire `PostToolUseFailure` to record failures as negative evidence (failure payload preserved raw).

**Redaction and size limits:**
- Truncate raw `tool_response` to a configurable max (e.g., 10KB per entry) — full file contents from Read/Write can be enormous
- Redact known sensitive patterns (API keys, tokens, passwords) before logging
- Cap total ledger size (e.g., 5MB) — rotate or truncate oldest entries when exceeded
- `SessionEnd` has a 1.5s default timeout and cannot block termination. Large ledgers make cleanup fragile. Keep ledger small or raise the timeout.

### Component 3: Deterministic Red-Flag Hook (prose surfaces via Write/Edit AND Bash)

A fast command hook that catches obvious unsupported claims before they reach prose surfaces.

**Two matchers required:**

**3a. PreToolUse on Write/Edit** — gates prose file types only:
- `*.md` (except code blocks), `CHANGELOG*`, `*.txt` reports
- Does NOT run on `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.css` — code edits are not gated.

**3b. PreToolUse on Bash** — gates commands that emit prose through shell:
- `git commit -m` / `git commit --message` (commit message text)
- `git tag -a -m` (tag annotation text)
- `gh pr create --body` / `gh pr create --title` (PR body and title)
- `cat >` / `echo >` / `printf >` redirecting to `*.md`, `*.txt`, `CHANGELOG*`
- Heredoc bodies in commands writing to prose paths
- This closes the gap where prose bypasses the Write/Edit gate by going through Bash.

**Blocked phrases** (unless ledger has matching evidence):
- "I ran…", "I checked…", "I verified…"
- "tests passed", "build succeeded", "deployment completed"
- "current/latest" without a fetched source
- Naked counts, percentages, dates, versions, benchmark numbers without source
- "fixed", "works", "safe", "done", "no issues found"

When triggered: `permissionDecision: "deny"` + reason listing the unsupported claims and suggesting downgrades ("I expect", "likely", "based on inspection only", "not verified").

**Hook type:** Two `PreToolUse` command hooks — one on Write/Edit (prose paths), one on Bash (prose-emitting commands)
**Fail-closed** for prose surfaces.

### Component 4: Fabrication Verifier (`Stop` agent hook)

The deep verification gate. An agent hook at `Stop` that has access to Read, Grep, and Glob tools. Compares Claude's final answer against the evidence ledger.

**Agent prompt** (summary):
```
You are the fabrication verifier.
Read: last_assistant_message, session evidence ledger, relevant transcript.
Block if any hard fact lacks matching evidence, any inference is presented
as verified, any execution/results claim lacks ledger support, any
numbers/counts/dates lack source, or completion/safety language lacks proof.
Allow only if every hard claim is evidenced or labeled as inferred/not verified.
```

**Hook type:** `Stop` agent hook (also mirror at `SubagentStop` for subagent outputs)
**Uses `stop_hook_active`** to prevent infinite retry loops
**Break-glass rule:** Hard retry cap of 3 attempts. If the verifier blocks 3 consecutive stops (due to errors, corrupted ledger, or persistent false positives), the 4th stop ends the turn with `stopReason: "verification unavailable"` and `continue: false` — the response is NOT released as verified, it terminates with an explicit "verification could not be completed" notice. This avoids both trapping the session in a loop AND releasing an unverified answer.
**Fail-closed** — if verifier errors on attempts 1-3, block the stop and surface the error. On attempt 4+, terminate with verification-unavailable status rather than allowing the unverified response through.

### Component 5: Output Contract

Claude's responses that contain factual claims must use this structure (enforced by the Stop verifier):

```
Verified
- facts directly supported by tools or fetched sources

Inferred
- conclusions drawn from verified facts

Not verified
- things not checked, not run, or only suspected

Next check
- exactly what tool/action would verify the uncertain part
```

The Stop verifier blocks any response with hard claims that omits this structure or puts unsupported claims under Verified.

**Proportional application:** The full 4-section template applies only to execution/result/current-state claims and user-facing artifacts (status summaries, reports, PR bodies, changelogs, deployment notes). For ordinary chat, inline labels like "(not verified)" or "(inferred)" suffice. This keeps the system strong without making every response sound bureaucratic.

### Narrow High-Value Rule Set

The anti-fabrication system focuses on 6 categories that cause the most damage:
1. **No fake execution** — "I ran", "I checked", "I verified" without ledger proof
2. **No fake pass/fail/deploy status** — "tests passed", "build succeeded" without tool output
3. **No fake file-content claims** — "the file contains X" without a Read result
4. **No fake numbers** — counts, percentages, versions, benchmarks without source
5. **No fake "current/latest" facts** — external claims without fetched evidence + date
6. **No fake "fixed/safe/done"** — completion claims without verification evidence

### Anti-Fabrication Files

| Component | File | Hook Event | Type |
|-----------|------|------------|------|
| Claim contract | `claim-contract.js` | UserPromptSubmit | command |
| Evidence ledger | `evidence-ledger.js` | PostToolUse (all) | command |
| Red-flag gate (files) | `prose-fact-gate.js` | PreToolUse (Write/Edit, prose only) | command |
| Red-flag gate (bash) | `prose-fact-gate-bash.js` | PreToolUse (Bash, prose-emitting cmds) | command |
| Fabrication verifier | `fabrication-verifier.md` | Stop + SubagentStop | agent (3-retry break-glass) |

---

## Proposed Hook Registration

```
UserPromptSubmit:
  - claim-contract.js      — inject evidence contract + block pretend/hide-uncertainty prompts (NEW, dual-action)

PreToolUse on Bash (run in parallel per Anthropic docs):
  - bash-protection.js     — tamper guard (NEW, fail-closed)
  - deploy-guard.js        — deploy tripwire (existing, convenience)
  - pre-commit-gate.js     — commit gate (FIXED: Phase 2 + tree hash)
  - prose-fact-gate-bash.js — red-flag check on prose-emitting commands (NEW, fail-closed)

PreToolUse on Edit|Write (run in parallel per Anthropic docs):
  - cia-planning-gate.js   — Phase 1 CIA per-system gate (NEW, fail-closed)
  - prose-fact-gate.js     — red-flag check on prose paths only (NEW, fail-closed)
  - file-protection.js     — protected file guard (NEW, fail-closed)

PostToolUse on all matchers:
  1. evidence-ledger.js    — append tool facts to session ledger (NEW, fail-open)

PostToolUse on Bash:
  1. build-gate-marker.js  — build marker with diff hash (UPDATED)

PostToolUse on Edit|Write:
  1. edit-tracker.js       — scope drift tracker (unchanged)

Stop:
  1. fabrication-verifier   — agent hook: compare answer vs ledger (NEW, fail-closed, 3-retry break-glass)

SessionEnd:
  1. session-cleanup.js    — marker + ledger cleanup (MOVED from Stop to avoid race with verifier)

SubagentStop:
  - fabrication-verifier   — mirror of Stop verifier for subagent outputs (NEW)

Notification (waiting for input/permission):
  - approval-notifier.js   — surface approval requests immediately (NEW)
```

### Permission Decision Matrix

Hooks use `ask` for consequential-but-legitimate actions, `deny` for anti-tamper:

| Hook | Corrective (`deny` + next step for Claude) | Approval (`ask` for user) |
|------|----------------------------------------------|--------------------------|
| `cia-planning-gate` | `deny`: "CIA missing for [system]. Write CIA section, then retry." | N/A — Claude can fix this itself |
| `file-protection` | `deny`: "Protected file. Use the appropriate hook or ask for a policy-maintenance session." | In maintenance session: `ask` for control-plane edits |
| `bash-protection` | `deny`: "Tamper command blocked. [procedural alternative]." | N/A — these are absolute |
| `pre-commit-gate` | `deny`: "CIA incomplete / markers stale. [specific missing items]." | `ask`: "Ready to commit [summary]. Approve?" (after all checks pass) |
| `prose-fact-gate` | `deny`: "Unsupported claims found: [list]. Downgrade to inferred/not-verified, then retry." | N/A — Claude can fix this itself |
| `deploy-guard` | `deny`: "Direct push to main blocked. Push branch and open PR." | `ask`: "Push to [branch] / create PR. Approve?" |

**Key principle:** If Claude can fix the problem itself (missing CIA, unsupported claims, incomplete audit), use `deny` with a procedural next step — Claude repairs its own state without stalling at a user prompt. If only the user can authorize the next step (commit, push, merge, deploy, control-plane edits), use `ask`.

### Protected Paths (updated for anti-fabrication + per-session state)

File-protection and bash-protection must guard the per-session directory and its contents:
- `%TEMP%/claude-session-*/evidence-ledger.jsonl` — evidence ledger (append-only by hook, not editable by Claude)
- `%TEMP%/claude-session-*/edit-tracker.json` — edit tracker state (hook-managed, not editable by Claude)
- `%TEMP%/claude-session-*/build-gate-passed` — build marker (hook-managed, not editable by Claude)

Only `cia-audit.md` within the session directory is exempted (Claude must write the CIA).

---

## Proposed Implementation Order

### Phase A: GitHub Outer Ring (owner does manually, not Claude)
1. Create branch ruleset on `main`
2. Add `CODEOWNERS` file
3. Create `production` environment with required reviewer
4. Disable "Allow GitHub Actions to create/approve PRs"
5. Pin required status check to GitHub Actions App

### Phase B: Managed Claude Policy (owner configures)
6. Evaluate `allowManagedHooksOnly` and `allowManagedPermissionRulesOnly`
7. Set up managed hooks for security-critical gates
8. Add ConfigChange hook to block runtime settings modification

### Phase C: Inner Ring — Workflow Guards (Claude implements on feature branch)
9. Clean `settings.local.json` — remove 15 dangerous entries
10. Create `bash-protection.js` (fail-closed)
11. Create `file-protection.js` (fail-closed)
12. Create `cia-planning-gate.js` (fail-closed)
13. Fix `pre-commit-gate.js` — exit 0 + JSON deny for normal blocks, exit 2 for errors only + Phase 2 CIA + coverage + tree hash
14. Update `build-gate-marker.js` — structured JSON + diff hash
15. Update `settings.json` — register inner ring hooks
16. Create hookify rules (optional convenience)

### Phase D: Anti-Fabrication System (Claude implements on same feature branch)
17. Create `claim-contract.js` — UserPromptSubmit hook, injects evidence contract
18. Create `evidence-ledger.js` — PostToolUse hook (all matchers), appends to JSONL ledger
19. Create `prose-fact-gate.js` — PreToolUse on Write/Edit, red-flag check (prose paths only)
20. Create `prose-fact-gate-bash.js` — PreToolUse on Bash, catches commit messages/PR bodies/heredocs
21. Create `fabrication-verifier.md` — Stop + SubagentStop agent hook with 3-retry break-glass
22. Move `session-cleanup.js` from Stop to SessionEnd, add `claude-evidence-ledger.jsonl` to cleanup
23. Update `settings.json` — register anti-fabrication hooks
24. Add ledger path to file-protection + bash-protection protected paths

### Phase E: Documentation + Verification
24. Update CLAUDE.md — document two-phase CIA, 3-ring model, output contract
25. Test inner ring end-to-end
26. Test anti-fabrication system end-to-end

---

## Proposed Verification Plan

**Outer ring (GitHub):**
1. Try `git push origin main` → blocked by branch ruleset
2. Create PR without owner review → cannot merge (CODEOWNERS)
3. PR touching `.claude/hooks/` → requires code owner review
4. Verify status check is pinned to Actions App

**Middle ring (managed policy):**
5. Verify managed hooks load and override project settings
6. Try to modify `settings.json` mid-session → ConfigChange hook blocks

**Inner ring (workflow guards):**
7. Edit source file without CIA → blocked by cia-planning-gate
8. Write Planning CIA, edit file → allowed
9. Pivot to new system without CIA section → blocked
10. Write `TRIVIAL:` for docs file → allowed
11. Write `TRIVIAL:` for DSP file → blocked (not in trivial allowlist)
12. Run tests, then commit → allowed
13. Edit more after tests, then commit → blocked (diff hash mismatch)
14. Commit without Phase 2 impact table → blocked
15. Commit with CIA missing a touched system → blocked (coverage check)
16. Try to forge build marker via node → bash-protection blocks
17. Try to Edit hook file → file-protection blocks
18. Try to `rm` hook file → bash-protection blocks

---

## Trade-offs

**Managed-only vs. plugin flexibility:** `allowManagedHooksOnly` disables hookify and project hooks. Start managed-only, relax if workflow friction is too high.

**Fail-closed cost:** A bug in a security hook blocks all edits/commits until fixed. Acceptable — a safety system that fails open is not a safety system.

**Claude can read hooks:** Claude can study all patterns. Fine — outer two rings are not readable or editable by Claude. Enforcement, not obscurity.

**Build marker tree fingerprint:** Uses `git write-tree` (exact staged tree identity) instead of `--stat` hash. Prevents test-then-edit-then-commit with no collision risk. Requires re-running tests after any additional edit.

**TRIVIAL narrowing:** Only docs/comments/string paths qualify. Slightly more friction for typo fixes in code files, but prevents TRIVIAL from becoming a universal bypass.

**CIA quality:** Gates enforce headings exist, not content quality. User is the quality check via conversation visibility.

**Stop verifier break-glass:** After 3 failed verifications, the session terminates with "verification unavailable" rather than releasing an unverified answer. This is more conservative than auto-allowing on the 4th attempt — it prevents both infinite loops AND unverified answers reaching the user.

**Per-session temp state:** All markers and state files live under `%TEMP%/claude-session-<session_id>/`. Prevents cross-session and cross-subagent collisions. Slightly more complex cleanup (delete directory vs individual files).
