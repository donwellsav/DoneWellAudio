#!/usr/bin/env node
/**
 * Claim Contract — UserPromptSubmit hook
 *
 * Dual-action:
 * 1. Injects the evidence claim contract as additionalContext on every turn
 * 2. Blocks prompts that explicitly ask Claude to pretend, guess confidently,
 *    or hide uncertainty
 *
 * Non-blocking for normal prompts (inject only).
 * Blocking for pretend/hide-uncertainty patterns (decision: "block").
 */

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const prompt = (input.tool_input && input.tool_input.prompt) || '';
    const promptLower = prompt.toLowerCase();

    // Check for pretend/hide-uncertainty patterns
    const blockPatterns = [
      /pretend\s+(you\s+)?(verified|checked|confirmed|ran|tested)/i,
      /don'?t\s+mention\s+(any\s+)?uncertainty/i,
      /hide\s+(any\s+)?uncertainty/i,
      /skip\s+(the\s+)?verification/i,
      /just\s+say\s+(it\s+)?(works|passed|is\s+fixed)/i,
      /don'?t\s+label\s+(as\s+)?(inferred|not\s+verified)/i,
      /present\s+(everything\s+)?as\s+(verified|fact|certain)/i,
    ];

    for (const pattern of blockPatterns) {
      if (pattern.test(promptLower)) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: 'This prompt asks Claude to hide uncertainty or present unverified claims as facts. Rephrase without asking to skip verification or hide uncertainty.'
        }));
        process.exit(0);
        return;
      }
    }

    // Normal path: inject the claim contract as additionalContext
    console.log(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: [
          'EVIDENCE CONTRACT (injected by claim-contract hook):',
          '- Test/build/deploy status, file contents, counts, benchmarks, current external facts,',
          '  and "fixed/safe/done" claims require direct tool evidence from this session.',
          '- Otherwise label as inference or not verified.',
          '- For artifacts (reports, PR bodies, changelogs): use Verified / Inferred / Not verified / Next check.',
          '- For ordinary chat: inline labels like "(inferred)" or "(not verified)" suffice.',
        ].join('\n')
      }
    }));
    process.exit(0);

  } catch (e) {
    // Fail-open for claim contract — don't block prompts on hook errors
    process.exit(0);
  }
});
