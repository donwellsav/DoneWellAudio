#!/usr/bin/env node
/**
 * Deploy Guard Hook — PreToolUse on Bash
 *
 * Blocks deploy and remote operations unless the user explicitly approves.
 * Only checks the actual shell command line, not heredoc/string content
 * (prevents false positives on commit messages mentioning these commands).
 */

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const fullCmd = (input.tool_input?.command || '');
    // Only check the command before any heredoc or newline — avoids matching commit message content
    const cmdLine = fullCmd.split(/<<\s*'?EOF'?|<<\s*'?HEREDOC'?|\n/)[0].toLowerCase();

    const blocked = [
      /git\s+push/,
      /gh\s+pr\s+(create|merge)/,
      /vercel\s+(deploy|--prod)/,
      /npx\s+vercel/,
      /pnpm\s+deploy/,
    ];

    const match = blocked.find(r => r.test(cmdLine));
    if (match) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `BLOCKED: This command matches a deploy pattern (${match.toString()}). Ask the user for explicit permission first.`
      }));
      process.exit(2);
    }
  } catch {
    // Parse error — allow through
  }
});
