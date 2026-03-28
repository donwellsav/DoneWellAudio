#!/usr/bin/env node
/**
 * Evidence Ledger — PostToolUse on all matchers
 *
 * Appends session-scoped facts to a JSONL ledger file after every tool use.
 * Each entry has two layers:
 * - Normalized summary (for fast lookup by red-flag gate and verifier)
 * - Raw tool metadata (for verifier fallback to first-order evidence)
 *
 * Ledger is append-only. Uses O_APPEND flag for atomic writes since
 * matching hooks run in parallel.
 *
 * Fail-open: ledger failure should never block work.
 *
 * Also handles PostToolUseFailure events to record failures as negative evidence.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Ledger path — legacy (per-session directories are a future upgrade)
const LEDGER = path.join(os.tmpdir(), 'claude-evidence-ledger.jsonl');

// Max raw response size per entry (10KB)
const MAX_RAW_SIZE = 10 * 1024;

// Max total ledger size (5MB)
const MAX_LEDGER_SIZE = 5 * 1024 * 1024;

// Sensitive patterns to redact
const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|apikey|secret|token|password|passwd|credential)[=:\s]["']?[a-zA-Z0-9_\-./+=]{8,}/gi,
  /(?:Bearer|Basic)\s+[a-zA-Z0-9_\-./+=]{20,}/gi,
  /ghp_[a-zA-Z0-9]{36}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
];

function redact(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function truncate(text, max) {
  if (typeof text !== 'string') return text;
  if (text.length <= max) return text;
  return text.substring(0, max) + '...[truncated at ' + max + ' chars]';
}

function extractSummary(toolName, toolInput, toolResponse, isFailure) {
  const summary = {
    tool: toolName || 'unknown',
    status: isFailure ? 'failure' : 'success',
  };

  // Extract key input info
  if (toolInput) {
    if (toolInput.command) summary.command = toolInput.command.substring(0, 200);
    if (toolInput.file_path) summary.file = toolInput.file_path;
    if (toolInput.pattern) summary.pattern = toolInput.pattern;
    if (toolInput.path) summary.path = toolInput.path;
  }

  // Extract key output facts from response
  const respStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');

  // Test results
  const passMatch = respStr.match(/(\d+)\s+passed/);
  const failMatch = respStr.match(/(\d+)\s+fail/i);
  if (passMatch) summary.testsPassed = parseInt(passMatch[1], 10);
  if (failMatch) summary.testsFailed = parseInt(failMatch[1], 10);

  // TypeScript errors
  if (/error TS\d+/.test(respStr)) summary.tscErrors = true;
  if (/Found 0 errors/.test(respStr)) summary.tscClean = true;

  // Exit codes
  const exitMatch = respStr.match(/exit code (\d+)/i);
  if (exitMatch) summary.exitCode = parseInt(exitMatch[1], 10);

  // Git state
  if (/nothing to commit/.test(respStr)) summary.gitClean = true;
  if (/Your branch is ahead/.test(respStr)) summary.gitAhead = true;

  // Grep match counts
  const grepMatch = respStr.match(/(\d+)\s+match/i);
  if (grepMatch) summary.matchCount = parseInt(grepMatch[1], 10);

  return summary;
}

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());

    const toolName = input.tool_name || '';
    const toolInput = input.tool_input || {};
    const toolResponse = input.tool_response || {};
    const isFailure = input.hook_event_name === 'PostToolUseFailure';

    // Build normalized summary
    const summary = extractSummary(toolName, toolInput, toolResponse, isFailure);

    // Build raw metadata (truncated + redacted)
    const rawInput = redact(JSON.stringify(toolInput));
    const rawResponse = redact(truncate(JSON.stringify(toolResponse), MAX_RAW_SIZE));

    const entry = {
      ts: Date.now(),
      summary: summary,
      raw: {
        tool_input: rawInput,
        tool_response: rawResponse,
      },
    };

    // Check ledger size before writing
    try {
      const stats = fs.statSync(LEDGER);
      if (stats.size > MAX_LEDGER_SIZE) {
        // Ledger too large — skip this entry rather than growing unbounded
        process.exit(0);
        return;
      }
    } catch {
      // File doesn't exist yet — fine, will be created
    }

    // Atomic append using O_APPEND flag
    const line = JSON.stringify(entry) + '\n';
    const fd = fs.openSync(LEDGER, 'a');
    try {
      fs.writeSync(fd, line);
    } finally {
      fs.closeSync(fd);
    }

  } catch (e) {
    // Fail-open: ledger failure should not block work
  }
  process.exit(0);
});
