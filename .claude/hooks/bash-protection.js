#!/usr/bin/env node
/**
 * Bash Protection Hook — PreToolUse on Bash
 *
 * Blocks shell commands that tamper with safety infrastructure:
 * - Deleting/moving hook files or settings
 * - Writing to marker files (build-gate, deploy-approved, evidence ledger)
 * - The node -e ":" wildcard trick
 * - Running the manual deploy approval script
 * - Reading the hook secret file
 *
 * Uses exit 0 + JSON permissionDecision: "deny" for normal blocks.
 * Uses exit 2 + stderr for internal errors (fail-closed).
 *
 * Every deny includes a procedural next step so Claude can self-repair.
 */

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const command = (input.tool_input && input.tool_input.command) || '';

    // Normalize: lowercase, full command text (not just first line)
    const normalized = command.toLowerCase();

    // Pattern definitions: [regex, deny reason with procedural next step]
    const patterns = [
      // Delete/move hook files
      [
        /(rm|del|unlink|rmdir|mv|move|ren)\b.*\.claude[\\/]hooks/i,
        'Hook files cannot be deleted or moved. If you need to modify hooks, ask the user to start a policy-maintenance session.'
      ],
      // Delete/move settings files
      [
        /(rm|del|unlink|mv|move|ren)\b.*(settings\.json|settings\.local\.json)/i,
        'Settings files cannot be deleted or moved. If you need to modify settings, ask the user to start a policy-maintenance session.'
      ],
      // Write to build-gate marker via node
      [
        /(writefile|appendfile)\b.*claude-build-gate/i,
        'Build marker cannot be written directly. Run `npx tsc --noEmit && pnpm test` to generate it legitimately.'
      ],
      // Write to deploy-approved marker via node
      [
        /(writefile|appendfile)\b.*deploy-approved/i,
        'Deploy marker cannot be written directly. Ask the user to approve the deploy via GitHub environment protection.'
      ],
      // Write to evidence ledger via node
      [
        /(writefile|appendfile)\b.*evidence-ledger/i,
        'Evidence ledger is read-only. Evidence is recorded automatically by PostToolUse hooks.'
      ],
      // Write to edit-tracker via node
      [
        /(writefile|appendfile)\b.*edit-tracker/i,
        'Edit tracker is managed by hooks. It cannot be written to directly.'
      ],
      // Write to hook/settings files via node
      [
        /(writefile|appendfile)\b.*\.claude[\\/]hooks/i,
        'Hook files cannot be modified via scripts. Ask the user to start a policy-maintenance session.'
      ],
      [
        /(writefile|appendfile)\b.*(settings\.json|settings\.local)/i,
        'Settings files cannot be modified via scripts. Ask the user to start a policy-maintenance session.'
      ],
      // Redirect into marker files
      [
        /(echo|printf)\b.*>.*claude-build-gate/i,
        'Build marker cannot be written via redirect. Run `npx tsc --noEmit && pnpm test` to generate it legitimately.'
      ],
      [
        /(echo|printf)\b.*>.*deploy-approved/i,
        'Deploy marker cannot be written via redirect. Ask the user to approve the deploy.'
      ],
      [
        /(echo|printf)\b.*>.*evidence-ledger/i,
        'Evidence ledger cannot be written via redirect. Evidence is recorded automatically.'
      ],
      // Redirect into hook/settings files
      [
        /(echo|printf)\b.*>.*\.claude[\\/]hooks/i,
        'Hook files cannot be modified via redirect. Ask the user to start a policy-maintenance session.'
      ],
      [
        /(echo|printf)\b.*>.*settings\.(json|local)/i,
        'Settings files cannot be modified via redirect. Ask the user to start a policy-maintenance session.'
      ],
      // Additional Node write methods targeting protected paths
      [
        /(createWriteStream|fs\.open|fs\.copyFile|fs\.rename)\b.*(claude-build-gate|deploy-approved|evidence-ledger|edit-tracker|\.claude[\\/]hooks|settings\.json|settings\.local)/i,
        'Protected path cannot be modified via Node fs methods. Use the legitimate workflow instead.'
      ],
      // Wildcard node -e ":" trick
      [
        /node\s+-e\s+["']?:/i,
        'The node -e ":" wildcard pattern is blocked. Use specific, legitimate node commands instead.'
      ],
      // Running manual deploy approval script
      [
        /node\b.*approve-deploy/i,
        'The deploy approval script can only be run by the user manually. Ask the user to run it.'
      ],
      // Reading hook secret (future-proofing)
      [
        /hook-secret/i,
        'The hook secret file is confidential and cannot be accessed.'
      ],
      // Direct push to main
      [
        /git\s+push\b.*\bmain\b/i,
        'Direct push to main is blocked. Push your branch and open a PR instead.'
      ],
      // Force push / history rewrites
      [
        /git\s+push\b.*--force/i,
        'Force push is blocked. Use normal push or ask the user for an exception.'
      ],
      [
        /git\s+reset\s+--hard/i,
        'Hard reset is blocked. Use `git stash` or `git checkout` for specific files instead.'
      ],
    ];

    for (const [regex, reason] of patterns) {
      if (regex.test(normalized) || regex.test(command)) {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            permissionDecision: 'deny',
            permissionDecisionReason: 'TAMPER BLOCKED: ' + reason
          }
        }));
        process.exit(0);
      }
    }

    // No match — allow
    process.exit(0);

  } catch (e) {
    // Fail-closed: internal error blocks as precaution
    process.stderr.write('BASH-PROTECTION HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
