#!/usr/bin/env node
/**
 * Contrast Check Hook - PostToolUse on Edit|Write
 *
 * Triggers on edits to lib/dsp/constants/uiConstants.ts. Parses the new
 * VIZ_COLORS_LIGHT severity map from the file on disk, computes WCAG 2.1
 * contrast ratios against the light-theme card background (#ffffff), and
 * warns (non-blocking) if any color falls below AA body-text 4.5:1.
 *
 * Catches the exact regression Batch 25 fixed manually.
 *
 * Warn-only. Never blocks. Authoritative gate is the vitest regression at
 * lib/canvas/__tests__/contrast.test.ts.
 */

const fs = require('fs');

const WATCHED_SUFFIX = 'lib/dsp/constants/uiConstants.ts';
const LIGHT_CARD = '#ffffff';
const AA_BODY = 4.5;

function hexToLinear(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(r), lin(g), lin(b)];
}

function luminance(hex) {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const lf = luminance(fg);
  const lb = luminance(bg);
  return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
}

function extractVizLight(src) {
  const start = src.indexOf('VIZ_COLORS_LIGHT');
  if (start < 0) return null;
  const openBrace = src.indexOf('{', start);
  if (openBrace < 0) return null;

  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;

  const body = src.slice(openBrace + 1, end);
  const entries = {};
  const re = /([A-Z_]+)\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    entries[m[1]] = m[2];
  }
  return entries;
}

const SEVERITIES = ['RUNAWAY', 'GROWING', 'RESONANCE', 'POSSIBLE_RING', 'WHISTLE', 'INSTRUMENT'];

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
    const normalized = filePath.split(String.fromCharCode(92)).join('/');

    if (!normalized.endsWith(WATCHED_SUFFIX)) {
      process.exit(0);
      return;
    }

    let src = '';
    try { src = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); return; }

    const light = extractVizLight(src);
    if (!light) { process.exit(0); return; }

    const fails = [];
    const rows = [];
    for (const sev of SEVERITIES) {
      if (!light[sev]) continue;
      const color = light[sev];
      const ratio = contrast(color, LIGHT_CARD);
      rows.push('  ' + sev.padEnd(14) + ' ' + color + '  ' + ratio.toFixed(2) + ':1' + (ratio < AA_BODY ? '  FAIL AA' : ''));
      if (ratio < AA_BODY) fails.push({ sev, color, ratio });
    }

    if (fails.length > 0) {
      const msg = [
        '',
        'WCAG CONTRAST WARN - VIZ_COLORS_LIGHT on white card (#ffffff):',
        ...rows,
        '',
        fails.length + ' color(s) below WCAG AA 4.5:1. Authoritative test:',
        '  pnpm test -- lib/canvas/__tests__/contrast.test.ts',
        '',
      ].join('\n');
      process.stdout.write(msg);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
