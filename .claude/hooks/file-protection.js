#!/usr/bin/env node
/**
 * File Protection Hook — PreToolUse on Edit|Write
 *
 * Blocks Claude from editing safety infrastructure files:
 * - .claude/hooks/* (all hook scripts)
 * - .claude/settings.json, .claude/settings.local.json
 * - .claude/tmp/deploy-approved
 * - Build-gate markers, evidence ledger, edit-tracker (any path)
 * - hook-secret (any path)
 *
 * Exemptions:
 * - cia-audit.md (Claude must write the CIA)
 *
 * In policy-maintenance sessions (maintenance flag exists), control-plane
 * paths switch from deny to ask.
 *
 * Uses exit 0 + JSON permissionDecision for normal blocks.
 * Uses exit 2 + stderr for internal errors (fail-closed).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

    // Exemptions — always allow
    if (normalizedPath.includes('cia-audit.md')) {
      process.exit(0);
      return;
    }

    // Check for maintenance mode flag
    // Look for maintenance-mode file in any claude-session-* directory under temp
    let maintenanceMode = false;
    try {
      const tmpDir = os.tmpdir();
      const entries = fs.readdirSync(tmpDir).filter(e => e.startsWith('claude-session-'));
      for (const entry of entries) {
        const flagPath = path.join(tmpDir, entry, 'maintenance-mode');
        if (fs.existsSync(flagPath)) {
          maintenanceMode = true;
          break;
        }
      }
    } catch {
      // Can't check — default to no maintenance mode
    }

    // Protected path patterns: [test function, deny reason, is-control-plane]
    const protectedPaths = [
      [
        p => /\.claude[\\/]hooks[\\/]/.test(p) || /\.claude\/hooks\//.test(p),
        'Hook files are protected. Ask the user to start a policy-maintenance session to modify hooks.',
        true // control-plane — switches to ask in maintenance mode
      ],
      [
        p => p.includes('.claude/settings.json') || p.includes('.claude\\settings.json'),
        'settings.json is protected. Ask the user to start a policy-maintenance session.',
        true
      ],
      [
        p => p.includes('settings.local.json'),
        'settings.local.json is protected. Ask the user to start a policy-maintenance session.',
        true
      ],
      [
        p => p.includes('deploy-approved'),
        'Deploy approval marker is protected. Deploy approval happens via GitHub environments.',
        false // absolute deny
      ],
      [
        p => p.includes('claude-build-gate') || p.includes('build-gate-passed'),
        'Build marker is protected. Run `npx tsc --noEmit && pnpm test` to generate it legitimately.',
        false
      ],
      [
        p => p.includes('evidence-ledger'),
        'Evidence ledger is read-only. Evidence is recorded automatically by PostToolUse hooks.',
        false
      ],
      [
        p => p.includes('edit-tracker'),
        'Edit tracker is managed by hooks. It cannot be written to directly.',
        false
      ],
      [
        p => p.includes('hook-secret'),
        'The hook secret file is confidential and cannot be modified.',
        false
      ],
      [
        p => p.includes('.github/workflows/') || p.includes('.github\\workflows\\'),
        'CI workflow files are protected. Ask the user to start a policy-maintenance session.',
        true
      ],
      [
        p => p.endsWith('codeowners') || p.includes('/codeowners'),
        'CODEOWNERS is protected. Ask the user to start a policy-maintenance session.',
        true
      ],
    ];

    for (const [testFn, reason, isControlPlane] of protectedPaths) {
      if (testFn(normalizedPath)) {
        // In maintenance mode, control-plane paths switch to ask
        if (isControlPlane && maintenanceMode) {
          console.log(JSON.stringify({
            hookSpecificOutput: {
              permissionDecision: 'ask',
              permissionDecisionReason: 'POLICY MAINTENANCE: Editing protected file ' + path.basename(filePath) + '. Approve?'
            }
          }));
          process.exit(0);
          return;
        }

        // Normal mode — deny with procedural next step
        console.log(JSON.stringify({
          hookSpecificOutput: {
            permissionDecision: 'deny',
            permissionDecisionReason: 'PROTECTED FILE: ' + reason
          }
        }));
        process.exit(0);
        return;
      }
    }

    // Not a protected path — allow
    process.exit(0);

  } catch (e) {
    // Fail-closed: internal error blocks as precaution
    process.stderr.write('FILE-PROTECTION HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
