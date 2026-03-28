#!/usr/bin/env node
/**
 * Prose Fact Gate — PreToolUse on Edit|Write (prose paths only)
 *
 * Catches unsupported factual claims before they're written to prose surfaces.
 * Only runs on prose file types — code files are not gated.
 *
 * Checks the evidence ledger for matching tool evidence before allowing
 * execution/status/completion claims.
 *
 * Uses deny + procedural next step so Claude can self-repair.
 * Fail-closed for prose surfaces.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEDGER = path.join(os.tmpdir(), 'claude-evidence-ledger.jsonl');

// Prose file patterns — only these are gated
function isProseFile(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.md')) return true;
  if (lower.endsWith('.txt')) return true;
  if (lower.includes('changelog')) return true;
  return false;
}

// Code file patterns — never gated
function isCodeFile(filePath) {
  const lower = filePath.toLowerCase();
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.yml', '.yaml', '.py', '.sh'];
  return codeExts.some(ext => lower.endsWith(ext));
}

// Red-flag phrases that require ledger evidence
const RED_FLAGS = [
  { pattern: /\bi\s+ran\b/i, label: '"I ran..."', evidence: 'command' },
  { pattern: /\bi\s+checked\b/i, label: '"I checked..."', evidence: 'command' },
  { pattern: /\bi\s+verified\b/i, label: '"I verified..."', evidence: 'command' },
  { pattern: /\btests?\s+passed\b/i, label: '"tests passed"', evidence: 'testsPassed' },
  { pattern: /\bbuild\s+succeeded\b/i, label: '"build succeeded"', evidence: 'tscClean' },
  { pattern: /\bdeployment\s+completed\b/i, label: '"deployment completed"', evidence: 'deploy' },
  { pattern: /\bno\s+issues?\s+found\b/i, label: '"no issues found"', evidence: 'command' },
];

// Completion/safety claims
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
  if (type === 'testsPassed') {
    return entries.some(e => e.summary && e.summary.testsPassed > 0);
  }
  if (type === 'tscClean') {
    return entries.some(e => e.summary && e.summary.tscClean === true);
  }
  if (type === 'deploy') {
    return entries.some(e => e.summary && e.summary.tool && /deploy|vercel/i.test(e.summary.tool));
  }
  if (type === 'command') {
    // Require a Bash command was actually run (not just a Read or Grep)
    return entries.some(e => e.summary && e.summary.command);
  }
  return false;
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason: 'UNSUPPORTED CLAIMS: ' + reason
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

    // Only gate prose files
    if (!isProseFile(filePath) || isCodeFile(filePath)) {
      process.exit(0);
      return;
    }

    // Get the content being written
    const content = (input.tool_input && (input.tool_input.content || input.tool_input.new_string)) || '';
    if (!content) {
      process.exit(0);
      return;
    }

    // Read evidence ledger
    const ledger = readLedger();

    // Check for red-flag phrases
    const unsupported = [];

    for (const flag of RED_FLAGS) {
      if (flag.pattern.test(content)) {
        if (!hasEvidence(ledger, flag.evidence)) {
          unsupported.push(flag.label);
        }
      }
    }

    for (const flag of COMPLETION_FLAGS) {
      if (flag.pattern.test(content)) {
        // Completion claims need specific evidence — general tool use is not enough
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
        'Found claims without evidence in ledger: ' + unsupported.join(', ') +
        '. Downgrade to "(inferred)" or "(not verified)", or run the relevant tool first to generate evidence. Then retry the write.'
      );
      return;
    }

    // All claims supported or no red flags — allow
    process.exit(0);

  } catch (e) {
    // Fail-closed for prose surfaces
    process.stderr.write('PROSE-FACT-GATE HOOK ERROR — blocking as precaution: ' + (e.message || String(e)));
    process.exit(2);
  }
});
