#!/usr/bin/env node
/**
 * Pre-Commit Gate — PreToolUse on Bash (git commit)
 *
 * Phase 2 of the two-phase CIA gate. Blocks git commit unless:
 * 1. Build gate passed (tsc + test succeeded) — marker not stale (>5min)
 * 2. Staged tree fingerprint matches marker (no edits after test)
 * 3. CIA Phase 2 content exists (CHANGE, CLASSIFICATION, impact table, Verdict)
 * 4. CIA covers all systems touched by the edit tracker
 *
 * Uses exit 0 + JSON permissionDecision for normal blocks/asks.
 * Uses exit 2 + stderr for internal errors (fail-closed).
 *
 * After all checks pass, uses "ask" to route commit approval through the user.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BUILD_MARKER = path.join(os.tmpdir(), 'claude-build-gate-passed');
const LEGACY_CIA = path.join(os.tmpdir(), 'claude-cia-audit.md');
const LEGACY_TRACKER = path.join(os.tmpdir(), 'claude-edit-tracker.json');
const MAX_MARKER_AGE_MS = 5 * 60 * 1000; // 5 minutes

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason: 'PRE-COMMIT BLOCKED: ' + reason
    }
  }));
  process.exit(0);
}

function ask(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'ask',
      permissionDecisionReason: reason
    }
  }));
  process.exit(0);
}

function findSessionFile(filename) {
  try {
    const entries = fs.readdirSync(os.tmpdir()).filter(e => e.startsWith('claude-session-'));
    for (const entry of entries) {
      const p = path.join(os.tmpdir(), entry, filename);
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const cmd = (input.tool_input && input.tool_input.command) || '';

    // Only gate on git commit commands
    if (!/git\s+commit/i.test(cmd)) {
      process.exit(0);
      return;
    }

    const missing = [];

    // --- Check 1: Build gate marker exists and is fresh ---
    let markerPath = findSessionFile('build-gate-passed') || BUILD_MARKER;
    let markerData = null;

    try {
      const raw = fs.readFileSync(markerPath, 'utf8');
      markerData = JSON.parse(raw);
    } catch {
      try {
        const raw = fs.readFileSync(BUILD_MARKER, 'utf8').trim();
        const ts = parseInt(raw, 10);
        if (!isNaN(ts)) markerData = { timestamp: ts };
      } catch {}
    }

    if (!markerData) {
      missing.push('Build gate not passed. Run: npx tsc --noEmit && pnpm test');
    } else {
      const age = Date.now() - (markerData.timestamp || 0);
      if (age > MAX_MARKER_AGE_MS) {
        missing.push('Build marker is stale (' + Math.round(age / 1000) + 's old, max 300s). Re-run: npx tsc --noEmit && pnpm test');
      }

      // --- Check 2: Staged tree fingerprint ---
      if (markerData.treeHash) {
        try {
          // execFileSync avoids shell injection — git write-tree takes no arguments
          const currentTree = execFileSync('git', ['write-tree'], { encoding: 'utf8' }).trim();
          if (currentTree !== markerData.treeHash) {
            missing.push('Staged tree changed after tests (was ' + markerData.treeHash.substring(0, 8) + ', now ' + currentTree.substring(0, 8) + '). Re-run: npx tsc --noEmit && pnpm test');
          }
        } catch {
          // Can't compute tree hash — skip this check
        }
      }
    }

    // --- Check 3: CIA Phase 2 content ---
    let ciaContent = '';
    const sessionCIA = findSessionFile('cia-audit.md');
    try {
      ciaContent = fs.readFileSync(sessionCIA || LEGACY_CIA, 'utf8');
    } catch {}

    if (!ciaContent) {
      missing.push('CIA audit not found. Write the Change Impact Audit before committing.');
    } else {
      const ciaLower = ciaContent.toLowerCase();
      const phase2Required = [
        ['**change:**', 'CHANGE (one-line description)'],
        ['**classification:**', 'CLASSIFICATION (positive/negative/neutral)'],
        ['| system |', 'Impact table'],
        ['**verdict:**', 'Verdict (summary)'],
      ];

      const missingPhase2 = phase2Required
        .filter(([pattern]) => !ciaLower.includes(pattern))
        .map(([, label]) => label);

      if (missingPhase2.length > 0) {
        missing.push('CIA Phase 2 incomplete. Missing: ' + missingPhase2.join(', ') + '. Add the final impact assessment.');
      }

      // --- Check 4: CIA covers all touched systems ---
      let tracker = [];
      try { tracker = JSON.parse(fs.readFileSync(findSessionFile('edit-tracker.json') || LEGACY_TRACKER, 'utf8')); } catch {}

      if (tracker.length > 0) {
        const touchedSystems = [...new Set(tracker.flatMap(e => e.systems || []))];
        const uncoveredSystems = touchedSystems.filter(sys => {
          return !ciaLower.includes('## ' + sys.toLowerCase());
        });

        if (uncoveredSystems.length > 0) {
          missing.push('CIA missing sections for touched systems: ' + uncoveredSystems.join(', ') + '. Add CIA sections for each.');
        }
      }
    }

    // --- Decision ---
    if (missing.length > 0) {
      deny(missing.join(' | '));
      return;
    }

    // All checks passed — ask user for commit approval
    const trackerSummary = (() => {
      try {
        const t = JSON.parse(fs.readFileSync(findSessionFile('edit-tracker.json') || LEGACY_TRACKER, 'utf8'));
        const systems = [...new Set(t.flatMap(e => e.systems || []))];
        return t.length + ' files across ' + systems.join(', ');
      } catch {
        return 'changes';
      }
    })();

    ask('Ready to commit: ' + trackerSummary + '. CIA audit and build gate verified. Approve?');

  } catch (e) {
    // Fail-closed: internal error blocks as precaution
    process.stderr.write('PRE-COMMIT-GATE HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
