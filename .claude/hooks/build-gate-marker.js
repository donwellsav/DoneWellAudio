#!/usr/bin/env node
/**
 * Build Gate Marker — PostToolUse on Bash
 *
 * Writes a structured marker when `npx tsc --noEmit && pnpm test` succeeds.
 * The marker includes:
 * - timestamp (for staleness check — pre-commit-gate rejects >5min)
 * - command summary (for audit trail)
 * - treeHash from `git write-tree` (staged tree fingerprint — pre-commit-gate
 *   recomputes and compares to detect edits after tests)
 *
 * Fail-open: marker failure should not block work.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MARKER = path.join(os.tmpdir(), 'claude-build-gate-passed');

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cmd = (data.tool_input && data.tool_input.command) || '';
    const resp = JSON.stringify(data.tool_response || {});

    // Only mark if the command included both tsc and test
    const hasTsc = /tsc\s+--noEmit/.test(cmd);
    const hasTest = /pnpm\s+test/.test(cmd);

    // Check for success: no error exit code AND test output shows passes
    const hasError = /error TS|ERR!|FAIL|exit code [^0]|exitCode[^0]/.test(resp);
    const hasPass = /\d+ passed/.test(resp);

    if (hasTsc && hasTest && !hasError && hasPass) {
      // Compute staged tree hash for fingerprint
      let treeHash = null;
      try {
        treeHash = execFileSync('git', ['write-tree'], { encoding: 'utf8' }).trim();
      } catch {
        // Can't compute tree hash — write marker without it
      }

      const marker = {
        timestamp: Date.now(),
        cmd: cmd.substring(0, 200),
        treeHash: treeHash,
      };

      fs.writeFileSync(MARKER, JSON.stringify(marker));

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: 'BUILD GATE PASSED. Tree fingerprint: ' + (treeHash ? treeHash.substring(0, 8) : 'unavailable') + '. You may now produce the Change Impact Audit and commit.'
        }
      }));
    }
  } catch (e) {
    // Fail-open: marker failure should not block work
    process.exit(0);
  }
});
