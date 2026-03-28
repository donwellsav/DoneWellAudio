#!/usr/bin/env node
/**
 * CIA Planning Gate — PreToolUse on Edit|Write
 *
 * Phase 1 of the two-phase CIA gate. Blocks edits to high-risk or
 * multi-system files unless a per-system CIA section exists in
 * %TEMP%/claude-session-<id>/cia-audit.md (or legacy %TEMP%/claude-cia-audit.md).
 *
 * Proportional: only requires CIA for high-risk systems or multi-system scope.
 * Single-system low-risk edits and docs/comments pass through.
 *
 * Uses exit 0 + JSON permissionDecision: "deny" for normal blocks.
 * Uses exit 2 + stderr for internal errors (fail-closed).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// System categories from CLAUDE.md Change Impact Audit table
// Matches edit-tracker.js MAP exactly
const MAP = [
  [/lib\/dsp\//, 'DSP / Detection'],
  [/dspWorker|workerFft/, 'Worker / Threading'],
  [/components\//, 'UI Components'],
  [/contexts\//, 'React State'],
  [/__tests__/, 'Testing'],              // Must come before hooks/ to catch hooks/__tests__/
  [/hooks\/(?!__)/, 'React State'],       // Exclude __tests__ subdirectory
  [/spectrumDrawing|canvas/, 'Canvas / Visualization'],
  [/dwaStorage/, 'Settings / Storage'],
  [/middleware/, 'Security / CSP'],
  [/api\//, 'API / Ingest'],
  [/\.test\.|vitest/, 'Testing'],
  [/next\.config|ci\.yml|\.github/, 'Build / CI'],
  [/sw\.ts|serwist/, 'PWA / Service Worker'],
  [/mlInference|models\/|onnx/, 'ML Pipeline'],
  [/snapshot|consent|data\.ts/, 'Data / Privacy'],
  [/calibration|useAudio|useDSP/, 'Audio Pipeline'],
];

// Systems that always require CIA (high-risk)
const HIGH_RISK_SYSTEMS = new Set([
  'DSP / Detection',
  'Worker / Threading',
  'Security / CSP',
  'Settings / Storage',
  'Audio Pipeline',
  'ML Pipeline',
]);

// Paths where TRIVIAL exemption is accepted
function isTrivialAllowed(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes('/docs/') || lower.includes('\\docs\\')) return true;
  if (lower.endsWith('.txt')) return true;
  if (lower.endsWith('.md') && !lower.endsWith('claude.md')) return true;
  return false;
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason: 'CIA PLANNING REQUIRED: ' + reason
    }
  }));
  process.exit(0);
}

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

    // Exempt: writes to CIA file itself
    if (normalizedPath.includes('cia-audit.md') || normalizedPath.includes('claude-cia-audit.md')) {
      process.exit(0);
      return;
    }

    // Exempt: writes to plan files
    if (normalizedPath.includes('.claude/plans/')) {
      process.exit(0);
      return;
    }

    // Determine which systems this file belongs to
    const systems = [];
    for (const [pat, sys] of MAP) {
      if (pat.test(normalizedPath)) systems.push(sys);
    }

    // No recognized system — allow (low-risk untracked file)
    if (systems.length === 0) {
      process.exit(0);
      return;
    }

    // Check if any system is high-risk
    const isHighRisk = systems.some(s => HIGH_RISK_SYSTEMS.has(s));

    // For non-high-risk systems, check if multi-system scope by reading edit tracker
    if (!isHighRisk) {
      try {
        // Check legacy and per-session tracker paths
        let tracker = [];
        const legacyPath = path.join(os.tmpdir(), 'claude-edit-tracker.json');
        try { tracker = JSON.parse(fs.readFileSync(legacyPath, 'utf8')); } catch {}

        // Also check per-session directories
        try {
          const entries = fs.readdirSync(os.tmpdir()).filter(e => e.startsWith('claude-session-'));
          for (const entry of entries) {
            try {
              const sessionTracker = JSON.parse(
                fs.readFileSync(path.join(os.tmpdir(), entry, 'edit-tracker.json'), 'utf8')
              );
              tracker = tracker.concat(sessionTracker);
            } catch {}
          }
        } catch {}

        const allSystems = new Set(tracker.flatMap(e => e.systems || []));
        systems.forEach(s => allSystems.add(s));

        // Single-system, non-high-risk — no CIA required for Phase 1
        if (allSystems.size <= 1) {
          process.exit(0);
          return;
        }
      } catch {
        // Can't read tracker — allow to avoid false blocking
        process.exit(0);
        return;
      }
    }

    // CIA is required for this edit. Find and read the CIA file.
    let ciaContent = '';
    const legacyCIA = path.join(os.tmpdir(), 'claude-cia-audit.md');

    // Try legacy path first
    try { ciaContent = fs.readFileSync(legacyCIA, 'utf8'); } catch {}

    // Try per-session paths
    if (!ciaContent) {
      try {
        const entries = fs.readdirSync(os.tmpdir()).filter(e => e.startsWith('claude-session-'));
        for (const entry of entries) {
          try {
            ciaContent = fs.readFileSync(path.join(os.tmpdir(), entry, 'cia-audit.md'), 'utf8');
            if (ciaContent) break;
          } catch {}
        }
      } catch {}
    }

    if (!ciaContent) {
      deny(
        'No CIA audit found. Before editing ' + path.basename(filePath) +
        ' (system: ' + systems.join(', ') + '), write a CIA with sections: ' +
        'BENEFIT, CHANGES, RISKS, GAPS, SCOPE, ROLLBACK. ' +
        'Write it to ' + path.join(os.tmpdir(), 'claude-cia-audit.md') + ', then retry the edit.'
      );
      return;
    }

    // Check each system has a CIA section
    const ciaLower = ciaContent.toLowerCase();
    const missingSystems = [];

    for (const sys of systems) {
      // Look for ## System Name heading (case-insensitive)
      const sysLower = sys.toLowerCase();
      const hasSection = ciaLower.includes('## ' + sysLower);

      if (!hasSection) {
        missingSystems.push(sys);
      }
    }

    if (missingSystems.length === 0) {
      // All systems covered — now check section content
      for (const sys of systems) {
        const sysLower = sys.toLowerCase();
        const sectionStart = ciaLower.indexOf('## ' + sysLower);
        if (sectionStart === -1) continue;

        // Find the section content (up to next ## heading or end)
        const nextSection = ciaContent.indexOf('\n## ', sectionStart + 1);
        const sectionContent = nextSection === -1
          ? ciaContent.substring(sectionStart)
          : ciaContent.substring(sectionStart, nextSection);

        const sectionLower = sectionContent.toLowerCase();

        // Check for TRIVIAL exemption
        if (sectionLower.includes('trivial:')) {
          if (isTrivialAllowed(filePath)) {
            continue; // TRIVIAL accepted for docs/comments/strings
          } else {
            deny(
              'TRIVIAL exemption is not accepted for ' + path.basename(filePath) +
              ' (system: ' + sys + '). This system requires a full CIA with: ' +
              'BENEFIT, CHANGES, RISKS, GAPS, SCOPE, ROLLBACK.'
            );
            return;
          }
        }

        // Check for 6 required headings
        const required = ['**benefit:**', '**changes:**', '**risks:**', '**gaps:**', '**scope:**', '**rollback:**'];
        const missing = required.filter(h => !sectionLower.includes(h));

        if (missing.length > 0) {
          deny(
            'CIA section for "' + sys + '" is incomplete. Missing: ' +
            missing.map(h => h.replace(/\*\*/g, '').replace(':', '')).join(', ') +
            '. Update the CIA, then retry the edit.'
          );
          return;
        }
      }

      // All checks passed — allow
      process.exit(0);
      return;
    }

    // Missing system sections
    deny(
      'CIA audit missing sections for: ' + missingSystems.join(', ') +
      '. Add these sections with BENEFIT, CHANGES, RISKS, GAPS, SCOPE, ROLLBACK headings, then retry.'
    );

  } catch (e) {
    // Fail-closed: internal error blocks as precaution
    process.stderr.write('CIA-PLANNING-GATE HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
