#!/usr/bin/env node
/**
 * Prose Fact Gate (Bash) — PreToolUse on Bash
 *
 * Catches unsupported factual claims in prose emitted through shell commands:
 * - git commit -m / --message (commit message text)
 * - git tag -a -m (tag annotation)
 * - gh pr create --body / --title (PR body and title)
 * - cat/echo/printf redirecting to *.md, *.txt, CHANGELOG*
 * - Heredoc bodies writing to prose paths
 *
 * Closes the gap where prose bypasses the Write/Edit prose-fact-gate
 * by going through Bash.
 *
 * Checks the evidence ledger for matching tool evidence.
 * Uses deny + procedural next step so Claude can self-repair.
 * Fail-closed for prose surfaces.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEDGER = path.join(os.tmpdir(), 'claude-evidence-ledger.jsonl');

// Patterns that identify prose-emitting Bash commands
const PROSE_COMMAND_PATTERNS = [
  /git\s+commit\s+.*-m\s/i,
  /git\s+commit\s+.*--message/i,
  /git\s+commit\s+.*(-F|--file)\s/i,
  /git\s+tag\s+.*-m\s/i,
  /gh\s+pr\s+create\s+.*--body/i,
  /gh\s+pr\s+create\s+.*--title/i,
  /gh\s+pr\s+edit\s+.*--body/i,
  /(cat|echo|printf)\s.*>\s*\S*\.(md|txt)/i,
  /(cat|echo|printf)\s.*>\s*\S*changelog/i,
];

// Red-flag phrases (same as prose-fact-gate.js)
const RED_FLAGS = [
  { pattern: /\bi\s+ran\b/i, label: '"I ran..."', evidence: 'command' },
  { pattern: /\bi\s+checked\b/i, label: '"I checked..."', evidence: 'command' },
  { pattern: /\bi\s+verified\b/i, label: '"I verified..."', evidence: 'command' },
  { pattern: /\btests?\s+passed\b/i, label: '"tests passed"', evidence: 'testsPassed' },
  { pattern: /\bbuild\s+succeeded\b/i, label: '"build succeeded"', evidence: 'tscClean' },
  { pattern: /\bdeployment\s+completed\b/i, label: '"deployment completed"', evidence: 'deploy' },
  { pattern: /\bno\s+issues?\s+found\b/i, label: '"no issues found"', evidence: 'command' },
];

const COMPLETION_FLAGS = [
  { pattern: /\b(?:is|are|was)\s+fixed\b/i, label: '"is fixed"' },
  { pattern: /\b(?:it|this)\s+works\b/i, label: '"it works"' },
  { pattern: /\b(?:is|are)\s+safe\b/i, label: '"is safe"' },
  { pattern: /\ball\s+done\b/i, label: '"all done"' },
];

function readLedger() {
  try {
    const content = fs.readFileSync(LEDGER, 'utf8');
    return content.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function hasEvidence(entries, type) {
  if (type === 'testsPassed') return entries.some(e => e.summary && e.summary.testsPassed > 0);
  if (type === 'tscClean') return entries.some(e => e.summary && e.summary.tscClean === true);
  if (type === 'deploy') return entries.some(e => e.summary && e.summary.tool && /deploy|vercel/i.test(e.summary.tool));
  if (type === 'command') return entries.some(e => e.summary && e.summary.command);
  return false;
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason: 'UNSUPPORTED CLAIMS IN COMMAND: ' + reason
    }
  }));
  process.exit(0);
}

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const command = (input.tool_input && input.tool_input.command) || '';

    // Only check commands that emit prose
    const isProseCommand = PROSE_COMMAND_PATTERNS.some(p => p.test(command));
    if (!isProseCommand) {
      process.exit(0);
      return;
    }

    // Extract the prose content from the command
    // For commit messages, PR bodies, heredocs — check the full command text
    const ledger = readLedger();
    const unsupported = [];

    for (const flag of RED_FLAGS) {
      if (flag.pattern.test(command)) {
        if (!hasEvidence(ledger, flag.evidence)) {
          unsupported.push(flag.label);
        }
      }
    }

    for (const flag of COMPLETION_FLAGS) {
      if (flag.pattern.test(command)) {
        const hasVerification = ledger.some(e =>
          e.summary && (e.summary.testsPassed > 0 || e.summary.tscClean || e.summary.exitCode === 0)
        );
        if (!hasVerification) {
          unsupported.push(flag.label);
        }
      }
    }

    if (unsupported.length > 0) {
      deny(
        'Found claims without evidence: ' + unsupported.join(', ') +
        '. Downgrade to "(inferred)" or "(not verified)" in the commit message/PR body, ' +
        'or run the relevant tool first. Then retry.'
      );
      return;
    }

    // All claims supported or no red flags — allow
    process.exit(0);

  } catch (e) {
    // Fail-closed for prose surfaces
    process.stderr.write('PROSE-FACT-GATE-BASH HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
