#!/usr/bin/env node
/**
 * Deploy Guard Hook — PreToolUse on Bash
 *
 * Routes deploy and remote operations through the user via "ask".
 * Direct push to main is denied with a procedural next step.
 *
 * Uses exit 0 + JSON permissionDecision for all decisions.
 * Uses exit 2 + stderr for internal errors (fail-closed).
 *
 * Scans the FULL command text (not just first line) to prevent
 * multi-line bypass where push/PR appears on a later line.
 */

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const fullCmd = (input.tool_input && input.tool_input.command) || '';

    // Scan full command text, not just first line
    const cmdLower = fullCmd.toLowerCase();

    // Hard deny: direct push to main (anti-tamper, bash-protection also catches this)
    if (/git\s+push\b.*\bmain\b/.test(cmdLower)) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          permissionDecisionReason: 'DEPLOY BLOCKED: Direct push to main is not allowed. Push your feature branch and open a PR instead.'
        }
      }));
      process.exit(0);
      return;
    }

    // Ask-routed: all other deploy/remote operations
    const askPatterns = [
      [/git\s+push/, 'Push to remote'],
      [/gh\s+pr\s+create/, 'Create pull request'],
      [/gh\s+pr\s+merge/, 'Merge pull request'],
      [/vercel\s+(deploy|--prod)/, 'Vercel deploy'],
      [/npx\s+vercel/, 'Vercel deploy via npx'],
      [/pnpm\s+deploy/, 'Deploy via pnpm'],
    ];

    for (const [pattern, label] of askPatterns) {
      if (pattern.test(cmdLower)) {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            permissionDecision: 'ask',
            permissionDecisionReason: label + ': ' + fullCmd.substring(0, 120) + (fullCmd.length > 120 ? '...' : '') + ' — Approve?'
          }
        }));
        process.exit(0);
        return;
      }
    }

    // Not a deploy command — allow
    process.exit(0);

  } catch (e) {
    // Fail-closed
    process.stderr.write('DEPLOY-GUARD HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
