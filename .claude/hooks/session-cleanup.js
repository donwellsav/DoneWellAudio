#!/usr/bin/env node
/**
 * Session Cleanup — SessionEnd hook
 *
 * Removes all temp marker and state files when the session ends.
 * Ensures a clean slate for the next session.
 *
 * Moved from Stop to SessionEnd to avoid racing the fabrication-verifier
 * agent hook (matching hooks run in parallel on Stop).
 *
 * Note: SessionEnd has a 1.5s default timeout and cannot block termination.
 * Keep cleanup fast — delete files, don't process them.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Legacy temp files (flat in tmpdir)
const LEGACY_FILES = [
  'claude-edit-tracker.json',
  'claude-build-gate-passed',
  'claude-cia-audit.md',
  'claude-nonui-edit',
  'claude-evidence-ledger.jsonl',
];

for (const f of LEGACY_FILES) {
  try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {}
}

// Per-session directories (future: claude-session-<id>/)
try {
  const tmpDir = os.tmpdir();
  const entries = fs.readdirSync(tmpDir).filter(e => e.startsWith('claude-session-'));
  for (const entry of entries) {
    const dirPath = path.join(tmpDir, entry);
    try {
      // Remove all files in the session directory
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        try { fs.unlinkSync(path.join(dirPath, file)); } catch {}
      }
      // Remove the directory itself
      fs.rmdirSync(dirPath);
    } catch {}
  }
} catch {}

// Clean up .claude/tmp/deploy-approved if it exists
try { fs.unlinkSync(path.join('.claude', 'tmp', 'deploy-approved')); } catch {}
