#!/usr/bin/env node
/**
 * Hotpath Allocation Sniff Hook - PostToolUse on Edit|Write
 *
 * Triggers only on DSP hot-path files (50fps analyze path, worker code).
 * Greps the new file contents for allocation-in-hot-loop patterns and emits
 * a non-blocking warning with line numbers so the edit can be re-examined
 * before it lands.
 *
 * Catches the exact class of regression mlInference.predictCached had before
 * the Batch 25 double-buffer fix: `new Float32Array(features)` on a 50fps
 * path silently burned GC cycles.
 *
 * Warn-only. Never blocks. Heuristic, not a proof.
 */

const fs = require('fs');

// Files whose bodies should stay allocation-lean. Match on path suffix.
const WATCHED = [
  'lib/dsp/feedbackDetector.ts',
  'lib/dsp/workerFft.ts',
  'lib/dsp/mlInference.ts',
  'lib/dsp/fusionEngine.ts',
  'lib/dsp/dspWorker.ts',
  'lib/dsp/combPattern.ts',
  'lib/dsp/phaseCoherence.ts',
];

// Allocation patterns to flag.
const PATTERNS = [
  { re: /\bnew\s+(Array|Float32Array|Float64Array|Int32Array|Uint8Array|Map|Set)\s*\(/, label: 'allocation' },
  { re: /\[\s*\.\.\./, label: 'spread into new array' },
  { re: /\.(map|filter|slice|flatMap|concat)\s*\(/, label: 'array method (allocates)' },
];

// Lines to ignore (comment, blank, clearly init).
const COMMENT_RE = /^\s*(\/\/|\/\*|\*)/;

// Function names that are demonstrably on the HOT path (worth flagging).
// If we see a hit inside one of these, warn. If inside a method not in this
// list (e.g. dispose, _loadModel, constructor), skip.
const HOT_METHODS = [
  'analyze',
  'computeScores',
  'fuseAlgorithmResults',
  'classifyTrackWithAlgorithms',
  'generateEQAdvisory',
  'predictCached',
  '_runInference',
  'processFrame',
  'handleMessage',
  'onmessage',
];

function findEnclosingMethod(lines, lineIdx) {
  // Walk backwards looking for `methodName(...) {` or similar.
  for (let i = lineIdx; i >= 0; i--) {
    const line = lines[i];
    // Common method signature patterns at declaration start.
    const m = line.match(/(?:^|\s)(?:(?:public|private|protected|async|static)\s+)*([a-zA-Z_$][\w$]*)\s*\(/);
    if (m) {
      const name = m[1];
      // Skip keywords / control structures.
      if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'typeof', 'new'].includes(name)) {
        return name;
      }
    }
  }
  return null;
}

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
    const normalized = filePath.split(String.fromCharCode(92)).join('/');

    const isWatched = WATCHED.some((w) => normalized.endsWith(w));
    if (!isWatched) {
      process.exit(0);
      return;
    }

    let src = '';
    try { src = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); return; }

    const lines = src.split('\n');
    const hits = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_RE.test(line)) continue;

      for (const p of PATTERNS) {
        const m = line.match(p.re);
        if (!m) continue;

        const method = findEnclosingMethod(lines, i);
        if (!method) continue;
        if (!HOT_METHODS.includes(method)) continue;

        hits.push({
          line: i + 1,
          method,
          pattern: p.label,
          snippet: line.trim().slice(0, 100),
        });
        break;
      }
    }

    if (hits.length > 0) {
      const relPath = normalized.split('/').slice(-3).join('/');
      const msg = [
        '',
        'HOT-PATH ALLOC WARN - ' + relPath + ':',
        ...hits.map((h) => '  line ' + h.line + ' in ' + h.method + '() - ' + h.pattern + ': ' + h.snippet),
        '',
        'Review: is this on a 50fps path? If yes, consider pre-allocated buffers, .clear() on reused Sets/Maps, or a generation-counter cache. See CLAUDE.md Performance Constraints.',
        '',
      ].join('\n');
      process.stdout.write(msg);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
