/**
 * PostToolUse hook: Auto-adds .docx files to .gitignore when created via Write.
 * Prevents accidental commits of generated Word documents.
 * CommonJS — reads event payload from stdin (Claude Code hook protocol).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = (data.tool_input && data.tool_input.file_path) || '';

    if (!filePath.endsWith('.docx')) process.exit(0);

    const gitignorePath = path.resolve('.gitignore');
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');

      if (!content.includes('docs/*.docx')) {
        fs.appendFileSync(gitignorePath, '\ndocs/*.docx\n');
        process.stderr.write('[auto-gitignore] Added docs/*.docx to .gitignore\n');
      }
    } catch {
      // .gitignore doesn't exist or can't be read — skip silently
    }
  } catch {
    // Invalid JSON or missing fields — skip silently
  }
  process.exit(0);
});
