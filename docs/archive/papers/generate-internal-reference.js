const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
} = require("docx");

// ─── Style Constants ───
const FONT = "Consolas";
const FONT_TEXT = "Segoe UI";
const SIZE = 20;       // 10pt
const SIZE_H1 = 28;   // 14pt
const SIZE_H2 = 24;   // 12pt
const SIZE_H3 = 22;   // 11pt
const SIZE_BODY = 20;  // 10pt
const SIZE_SM = 18;    // 9pt
const SIZE_CODE = 18;  // 9pt code

const DARK = "1A1A2E";
const BLUE = "0F3460";
const TEAL = "16A085";
const AMBER = "E67E22";
const GRAY = "7F8C8D";
const CODE_BG = "F4F6F7";
const SECTION_BG = "EBF5FB";

const THIN = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const NO_B = { style: BorderStyle.NONE, size: 0 };
const NO_BORDERS = { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B };

// ─── Helpers ───
function tx(text, extra = {}) { return new TextRun({ text, font: FONT_TEXT, size: SIZE_BODY, ...extra }); }
function bf(text, extra = {}) { return new TextRun({ text, font: FONT_TEXT, size: SIZE_BODY, bold: true, ...extra }); }
function it(text, extra = {}) { return new TextRun({ text, font: FONT_TEXT, size: SIZE_BODY, italics: true, ...extra }); }
function code(text) { return new TextRun({ text, font: FONT, size: SIZE_CODE, color: BLUE }); }
function filePath(text) { return new TextRun({ text, font: FONT, size: SIZE_CODE, color: TEAL, bold: true }); }
function configVal(text) { return new TextRun({ text, font: FONT, size: SIZE_CODE, color: AMBER }); }

function para(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [tx(runs)];
  return new Paragraph({ spacing: { after: 120, line: 264 }, ...opts, children });
}

function h1(text) {
  return new Paragraph({
    spacing: { before: 400, after: 160 },
    shading: { fill: SECTION_BG, type: ShadingType.CLEAR },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text, font: FONT_TEXT, size: SIZE_H1, bold: true, color: BLUE })],
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, font: FONT_TEXT, size: SIZE_H2, bold: true, color: BLUE })],
  });
}

function h3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: FONT_TEXT, size: SIZE_H3, bold: true, italics: true, color: DARK })],
  });
}

function codeBlock(lines) {
  return new Table({
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: BORDERS,
        shading: { fill: CODE_BG, type: ShadingType.CLEAR },
        width: { size: 9360, type: WidthType.DXA },
        children: lines.map(line => new Paragraph({
          spacing: { after: 20, line: 240 },
          children: [new TextRun({ text: line, font: FONT, size: SIZE_CODE })],
        })),
      })],
    })],
  });
}

function noteBox(title, body) {
  return new Table({
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: { style: BorderStyle.SINGLE, size: 4, color: AMBER }, bottom: THIN, left: THIN, right: THIN },
        shading: { fill: "FEF9E7", type: ShadingType.CLEAR },
        width: { size: 9360, type: WidthType.DXA },
        children: [
          new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "⚠ " + title, font: FONT_TEXT, size: SIZE_BODY, bold: true, color: AMBER })] }),
          new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: body, font: FONT_TEXT, size: SIZE_SM })] }),
        ],
      })],
    })],
  });
}

function hCell(text, width) {
  return new TableCell({
    borders: BORDERS, width: { size: width, type: WidthType.DXA },
    shading: { fill: SECTION_BG, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 },
      children: [new TextRun({ text, font: FONT_TEXT, size: SIZE_SM, bold: true, color: BLUE })] })],
  });
}

function dCell(runs, width) {
  const children = Array.isArray(runs)
    ? runs
    : [new TextRun({ text: runs, font: FONT_TEXT, size: SIZE_SM })];
  return new TableCell({
    borders: BORDERS, width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ spacing: { after: 30 }, children })],
  });
}

// ═══════════════════════════════════════════════════════════
//                    BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════
const c = []; // children

// ─── COVER ───
c.push(
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: "INTERNAL REFERENCE DOCUMENT", font: FONT_TEXT, size: SIZE_SM, bold: true, color: AMBER, allCaps: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "Emergent Room Resonance Analysis", font: FONT_TEXT, size: 36, bold: true, color: BLUE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: "Code-Level Reference: What Happens, Where, and Why", font: FONT_TEXT, size: SIZE_H2, italics: true, color: GRAY })] }),
  new Paragraph({ spacing: { before: 600 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [tx("DoneWell Audio  •  v0.159.0  •  March 20, 2026")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [tx("Author: Don Wells", { color: GRAY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: "CONFIDENTIAL — NOT FOR DISTRIBUTION", font: FONT_TEXT, size: SIZE_SM, bold: true, color: "E74C3C" })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ─── TABLE OF CONTENTS (manual) ───
c.push(h1("Table of Contents"));
const toc = [
  "1. Quick Reference Card",
  "2. Discovery Summary",
  "3. Code Path: How Room Modes Become Advisories",
  "4. Algorithm Score Mapping (Source-Level)",
  "5. Gate Bypass Analysis (Source-Level)",
  "6. Configuration Values That Matter",
  "7. How to Reproduce the Behavior",
  "8. Productization Roadmap",
  "9. File Index",
  "10. Related Documents",
];
for (const entry of toc) {
  c.push(para([tx(entry)], { spacing: { after: 60 }, indent: { left: 360 } }));
}
c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 1. QUICK REFERENCE ═══
c.push(h1("1. Quick Reference Card"));

c.push(noteBox("TL;DR",
  "DWA at high sensitivity (threshold ≤ 8 dB) with no feedback loop detects room resonance modes as feedback. All 6 algorithms unanimously score room modes identically to feedback. Room mode gates are disabled by default (roomPreset = 'none'). The system generates PEQ advisories that constitute a room correction EQ profile."));
c.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

const qrData = [
  ["Discovery date", "2026-03-20"],
  ["Trigger condition", "ringOut mode (2 dB threshold), no mic→speaker loop"],
  ["Root cause", "Room resonances ≡ feedback at spectral level"],
  ["Why gates don't fire", "roomPreset = 'none' (default) disables room physics"],
  ["Output", "PEQ advisories: frequency, Q, cut depth = room correction EQ"],
  ["Key files", "feedbackDetector.ts, algorithmFusion.ts, classifier.ts, constants.ts"],
  ["Formal theorem", "‖S_fb − S_rm‖₂ → 0 for persistent narrowband peaks"],
  ["Patent status", "Provisional filed 2026-03-20 (Docket WELLS-2026-001)"],
  ["AES paper", "Drafted (2026-03-20-emergent-room-resonance-analysis.docx)"],
];

const qrColW = [2400, 6960];
c.push(new Table({
  columnWidths: qrColW,
  rows: qrData.map(([label, val]) => new TableRow({
    children: [
      new TableCell({ borders: BORDERS, width: { size: qrColW[0], type: WidthType.DXA },
        shading: { fill: SECTION_BG, type: ShadingType.CLEAR },
        children: [new Paragraph({ spacing: { after: 30 }, children: [bf(label, { size: SIZE_SM })] })] }),
      new TableCell({ borders: BORDERS, width: { size: qrColW[1], type: WidthType.DXA },
        children: [new Paragraph({ spacing: { after: 30 }, children: [tx(val, { size: SIZE_SM })] })] }),
    ],
  })),
}));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 2. DISCOVERY SUMMARY ═══
c.push(h1("2. Discovery Summary"));

c.push(para("While testing DWA in Ring Out mode (2 dB prominence threshold) with no active feedback loop — the microphone was capturing ambient room sound only, with no routing to speakers — the system generated sustained EQ advisories for persistent spectral peaks."));

c.push(para("Investigation revealed these peaks correspond to room acoustic resonance modes (standing waves between parallel room surfaces). All six detection algorithms unanimously classified the room modes as feedback because room resonances and acoustic feedback produce physically identical spectral signatures:"));

c.push(para([tx("• Both are "), bf("persistent"), tx(" (stable over many frames)")]));
c.push(para([tx("• Both are "), bf("narrowband"), tx(" (high Q factor, concentrated at one frequency)")]));
c.push(para([tx("• Both have "), bf("stable magnitude"), tx(" (low MSD ≈ 0)")]));
c.push(para([tx("• Both have "), bf("stable phase"), tx(" (high phase coherence ≈ 0.85–0.98)")]));
c.push(para([tx("• Both have "), bf("clean spectra"), tx(" (low IHR, no interharmonic energy)")]));
c.push(para([tx("• Both are "), bf("sharp peaks"), tx(" (high PTMR relative to spectral neighborhood)")]));

c.push(para("The only difference is the sustaining mechanism — electroacoustic loop (feedback) vs. wall reflections (room mode) — which is invisible to spectral analysis at the microphone."));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 3. CODE PATH ═══
c.push(h1("3. Code Path: How Room Modes Become Advisories"));

c.push(para("This section traces the exact code path a room resonance takes through the DWA pipeline, from microphone input to advisory card."));

c.push(h2("3.1 Audio Capture → Peak Detection (Main Thread)"));

c.push(para([bf("File: "), filePath("lib/dsp/feedbackDetector.ts"), tx(" (~1,823 LOC)")]));
c.push(para([bf("Function: "), code("FeedbackDetector.analyze()"), tx(" — called at 50 fps (every 20 ms)")]));

c.push(codeBlock([
  "1. getFloatFrequencyData() → raw spectrum (Float32Array, 8192 bins)",
  "2. applyCompensation() → A-weighting + mic calibration",
  "3. updateNoiseFloor() → EWMA noise floor tracking (decay 0.98)",
  "4. autoGainControl() → adjust gain (attack 0.3s, release 1.0s)",
  "5. For each bin above threshold:",
  "   prominence = bin_magnitude - prefixSumNeighborhoodAvg(bin)",
  "   if prominence > settings.feedbackThreshold → candidate peak",
  "6. persistenceScoring() → track across frames",
  "   speech: 7 frames, music: 13 frames, compressed: 50 frames",
  "7. Room mode passes: it IS persistent, it IS prominent at low threshold",
  "8. postMessage(peak, spectrum, timeDomain) → Worker [transferable]",
]));

c.push(para([bf("Key threshold: "), code("settings.feedbackThreshold"), tx(" — set by mode preset. Ring Out mode = "), configVal("2 dB"), tx(". At this level, typical room modes (6–15 dB prominence) easily exceed the threshold.")]));

c.push(h2("3.2 Algorithm Scoring (Worker Thread)"));

c.push(para([bf("File: "), filePath("lib/dsp/workerFft.ts"), tx(" (~389 LOC) — "), code("AlgorithmEngine.computeScores()")]));
c.push(para([bf("File: "), filePath("lib/dsp/algorithmFusion.ts"), tx(" (~919 LOC) — fusion + gates")]));

c.push(para("The worker receives the peak and runs all six algorithms. For a room mode:"));

c.push(codeBlock([
  "AlgorithmEngine.computeScores(peak):",
  "  msd       → ~0.02  (very stable magnitude)     ✓ feedback-like",
  "  phase     → ~0.91  (very stable phase)          ✓ feedback-like",
  "  spectral  → ~0.03  (very tonal, peaked)         ✓ feedback-like",
  "  comb      → varies (may match axial harmonics)  ✓ feedback-like",
  "  ihr       → ~0.05  (clean, no interharmonics)   ✓ feedback-like",
  "  ptmr      → ~18 dB (sharp isolated peak)        ✓ feedback-like",
  "",
  "fuseAlgorithmResults(scores, contentType):",
  "  P(feedback) = Σ(score_i × weight_i) / Σ(weight_i)",
  "  → typically 0.65–0.85 for room modes",
  "  → above reporting threshold for ringOut mode",
]));

c.push(h2("3.3 Gate Processing"));

c.push(para([bf("File: "), filePath("lib/dsp/algorithmFusion.ts"), tx(" — post-fusion gates")]));
c.push(para([bf("File: "), filePath("lib/dsp/classifier.ts"), tx(" (~850 LOC) — classifier gates")]));

c.push(codeBlock([
  "Post-fusion gates — NONE FIRE for room modes:",
  "",
  "IHR Gate (algorithmFusion.ts ~line 485):",
  "  Condition: harmonicsFound >= 3 AND ihr > 0.35",
  "  Room mode: isolated peak, harmonicsFound = 0–1, ihr ≈ 0.05",
  "  → NOT ACTIVATED",
  "",
  "PTMR Gate (algorithmFusion.ts ~line 495):",
  "  Condition: ptmr.feedbackScore < 0.2",
  "  Room mode: sharp peak → feedbackScore ≈ 0.7–0.9",
  "  → NOT ACTIVATED",
  "",
  "CombStability Gate (algorithmFusion.ts ~line 510):",
  "  Condition: spacingCV > 0.05 over 16 frames",
  "  Room mode: stationary → CV ≈ 0",
  "  → NOT ACTIVATED",
  "",
  "Formant Gate (classifier.ts ~line 380):",
  "  Condition: 2+ peaks in F1/F2/F3 bands AND Q ∈ [3,20]",
  "  Room mode: single isolated peak, not in formant pattern",
  "  → NOT ACTIVATED",
  "",
  "Chromatic Gate (classifier.ts ~line 420):",
  "  Condition: ±5 cents from 12-TET AND coherence > 0.80",
  "  Room mode: frequency = c/(2L) etc., NOT on semitone grid",
  "  → NOT ACTIVATED",
]));

c.push(h2("3.4 Room Mode Gates — DISABLED BY DEFAULT"));

c.push(para([bf("File: "), filePath("lib/dsp/classifier.ts"), tx(" — room mode suppression")]));
c.push(para([bf("File: "), filePath("lib/dsp/constants.ts"), tx(" (~1,013 LOC) — default settings")]));

c.push(noteBox("Critical Configuration",
  "Room mode gates (roomModeProximity, modalDensityPenalty, RT60 Q-factor) require roomPreset ≠ 'none'. The DEFAULT_SETTINGS in constants.ts sets roomPreset = 'none'. This means room physics computation is completely bypassed."));
c.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

c.push(codeBlock([
  "// constants.ts — DEFAULT_SETTINGS",
  "roomPreset: 'none',        // ← This disables all room mode gates",
  "roomLength: 0,",
  "roomWidth: 0,",
  "roomHeight: 0,",
  "",
  "// classifier.ts — room mode check",
  "if (settings.roomPreset !== 'none') {",
  "  // Compute expected room modes from dimensions",
  "  // Apply roomModeProximity suppression",
  "  // Apply modalDensityPenalty",
  "  // Apply RT60-based Q adjustment",
  "}",
  "// When roomPreset === 'none': ALL of this is skipped",
  "// Room modes pass through unimpeded",
]));

c.push(h2("3.5 EQ Advisory Generation"));

c.push(para([bf("File: "), filePath("lib/dsp/eqAdvisor.ts"), tx(" (~402 LOC)")]));
c.push(para([bf("File: "), filePath("lib/dsp/advisoryManager.ts"), tx(" (~292 LOC)")]));

c.push(codeBlock([
  "generateEQAdvisory(track):",
  "  frequency → room mode frequency (Hz)",
  "  Q → matched to resonance width via bandwidth analysis",
  "  depth → MINDS algorithm (growth-rate-based)",
  "         → scaled by ERB: ×0.7 (<500Hz), ×1.0 (500-2kHz), ×1.2 (>2kHz)",
  "",
  "AdvisoryManager.createOrUpdate(advisory):",
  "  3-layer dedup (band, frequency, cents-based proximity)",
  "  500ms rate limiting",
  "  100-cent proximity grouping",
  "  → postMessage(advisory) back to main thread",
  "  → useAdvisoryMap → React render → advisory card displayed",
  "",
  "// The advisory card IS a room correction filter specification:",
  "// \"Cut 4.2 dB at 247 Hz, Q = 8.3\"",
  "// This is exactly what Smaart/REW would recommend.",
]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 4. ALGORITHM SCORE MAPPING ═══
c.push(h1("4. Algorithm Score Mapping (Source-Level)"));

c.push(para("Exact source locations for each algorithm's computation:"));

const algoFiles = [
  ["MSD", "workerFft.ts", "AlgorithmEngine.computeMSD()", "msdPool.ts", "Second-derivative stencil,\nsparse 256-slot pool, LRU eviction"],
  ["Phase Coherence", "workerFft.ts", "AlgorithmEngine.computePhase()", "phaseCoherence.ts", "Circular statistics,\nmean phasor magnitude"],
  ["Spectral Flatness", "workerFft.ts", "AlgorithmEngine.computeSpectral()", "compressionDetection.ts", "Geometric/arithmetic mean\n+ kurtosis in ±5 bins"],
  ["Comb Pattern", "algorithmFusion.ts", "detectCombPattern()", "—", "Harmonic matching f,2f,3f\n±5% tolerance, ≥3 harmonics"],
  ["IHR", "algorithmFusion.ts", "computeIHR()", "—", "Sideband energy ratio\n±5-15 and ±20-40 bins"],
  ["PTMR", "algorithmFusion.ts", "computePTMR()", "—", "Peak dB − median(40-bin\nwindow excl. ±2 bins)"],
  ["ML Meta-Model", "mlInference.ts", "predictCached()", "models/manifest.json", "MLP 11→32→16→1\n929 params, 4KB ONNX"],
];

const afColW = [1100, 1600, 2200, 1800, 2200];
c.push(new Table({
  columnWidths: afColW,
  rows: [
    new TableRow({ tableHeader: true, children: [
      hCell("Algorithm", afColW[0]),
      hCell("Primary File", afColW[1]),
      hCell("Entry Function", afColW[2]),
      hCell("Support File", afColW[3]),
      hCell("Implementation", afColW[4]),
    ]}),
    ...algoFiles.map(row => new TableRow({
      children: row.map((cell, i) => {
        const lines = cell.split("\n");
        return new TableCell({
          borders: BORDERS, width: { size: afColW[i], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: lines.map(l => new Paragraph({ spacing: { after: 10 },
            children: [new TextRun({ text: l, font: i >= 1 && i <= 3 ? FONT : FONT_TEXT, size: SIZE_SM, color: i >= 1 && i <= 3 ? TEAL : undefined })] })),
        });
      }),
    })),
  ],
}));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 5. GATE BYPASS ANALYSIS ═══
c.push(h1("5. Gate Bypass Analysis (Source-Level)"));

c.push(para("For each gate, this section details exactly why room resonances bypass it, with source file references."));

const gateAnalysis = [
  ["IHR Gate", "algorithmFusion.ts\n~line 485", "harmonicsFound >= 3\nAND ihr > 0.35", "× 0.65", "Room modes are isolated\npeaks — harmonicsFound\n= 0 or 1. IHR ≈ 0.05\n(clean spectrum)."],
  ["PTMR Gate", "algorithmFusion.ts\n~line 495", "ptmr.feedbackScore\n< 0.2", "× 0.80", "Room modes are sharp\nisolated peaks — PTMR\nfeedbackScore ≈ 0.7–0.9.\nGate checks for BROAD\npeaks, not sharp ones."],
  ["Comb Stability", "algorithmFusion.ts\n~line 510", "spacingCV > 0.05\nover 16 frames", "× 0.25", "Room modes are\nstationary — spacing\nnever varies. CV ≈ 0."],
  ["Formant Gate", "classifier.ts\n~line 380", "2+ peaks in F1/F2/F3\nbands AND Q ∈ [3,20]", "× 0.65", "Room modes don't cluster\nin vocal formant bands.\nIsolated peaks fail the\n'2+ bands' requirement."],
  ["Chromatic Gate", "classifier.ts\n~line 420", "±5 cents from 12-TET\nAND coherence > 0.80", "× 0.60", "Room mode freqs are\ndetermined by room\ndimensions (c/2L), NOT\nmusical scale. Random\nrelation to semitones."],
  ["Room Mode Gates", "classifier.ts\n~line 450+", "roomPreset ≠ 'none'", "varies", "DEFAULT: roomPreset =\n'none' (constants.ts).\nENTIRE block skipped.\nNo room physics computed."],
];

const gaColW = [1200, 1400, 1800, 700, 2800];
c.push(new Table({
  columnWidths: gaColW,
  rows: [
    new TableRow({ tableHeader: true, children: [
      hCell("Gate", gaColW[0]),
      hCell("Location", gaColW[1]),
      hCell("Activation Condition", gaColW[2]),
      hCell("Factor", gaColW[3]),
      hCell("Why Room Modes Bypass", gaColW[4]),
    ]}),
    ...gateAnalysis.map(row => new TableRow({
      children: row.map((cell, i) => {
        const lines = cell.split("\n");
        return new TableCell({
          borders: BORDERS, width: { size: gaColW[i], type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          shading: i === 4 ? { fill: "FDEDEC", type: ShadingType.CLEAR } : undefined,
          children: lines.map(l => new Paragraph({ spacing: { after: 10 },
            children: [new TextRun({ text: l, font: i === 1 ? FONT : FONT_TEXT, size: SIZE_SM, color: i === 1 ? TEAL : undefined })] })),
        });
      }),
    })),
  ],
}));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 6. CONFIGURATION VALUES ═══
c.push(h1("6. Configuration Values That Matter"));

c.push(h2("6.1 Mode Presets (constants.ts)"));

c.push(para("The behavior depends entirely on which mode preset is active. Key values:"));

const modeData = [
  ["ringOut",   "2",   "-70", "0.33", "Maximum — detects everything"],
  ["monitors",  "15",  "-45", "0.33", "High — may detect strong room modes"],
  ["broadcast", "22",  "-70", "0.33", "Medium — unlikely to see room modes"],
  ["speech",    "27",  "-65", "0.33", "Low — room modes below threshold"],
  ["worship",   "35",  "-58", "0.33", "Very low — room modes invisible"],
  ["liveMusic", "42",  "-45", "0.08", "Lowest — only obvious feedback"],
];

const mColW = [1400, 1200, 1200, 1200, 3000];
c.push(new Table({
  columnWidths: mColW,
  rows: [
    new TableRow({ tableHeader: true, children: [
      hCell("Mode", mColW[0]),
      hCell("Threshold (dB)", mColW[1]),
      hCell("Silence (dBFS)", mColW[2]),
      hCell("MSD Weight", mColW[3]),
      hCell("Room Mode Detection", mColW[4]),
    ]}),
    ...modeData.map(row => new TableRow({
      children: row.map((cell, i) => new TableCell({
        borders: BORDERS, width: { size: mColW[i], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: row[0] === "ringOut" ? { fill: "D5F5E3", type: ShadingType.CLEAR } : undefined,
        children: [new Paragraph({ alignment: i >= 1 && i <= 3 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 30 }, children: [new TextRun({ text: cell, font: FONT_TEXT, size: SIZE_SM, bold: row[0] === "ringOut" })] })],
      })),
    })),
  ],
}));

c.push(h2("6.2 Critical Default Values"));

c.push(codeBlock([
  "// constants.ts — values that enable the emergent behavior",
  "",
  "// Room physics (disabled by default)",
  "roomPreset: 'none'            // Disables room mode gates",
  "roomLength: 0                 // No room dimensions",
  "roomWidth: 0",
  "roomHeight: 0",
  "",
  "// Detection thresholds (ringOut mode)",
  "feedbackThreshold: 2          // 2 dB prominence — catches everything",
  "silenceThreshold: -70         // -70 dBFS — only true silence is ignored",
  "",
  "// Persistence (content-adaptive)",
  "PERSISTENCE_SPEECH: 7         // 140ms — room modes easily persist",
  "PERSISTENCE_MUSIC: 13         // 260ms — room modes easily persist",
  "PERSISTENCE_COMPRESSED: 50    // 1000ms — room modes still persist",
  "",
  "// Gate thresholds",
  "IHR_GATE_THRESHOLD: 0.35      // Room modes: IHR ≈ 0.05 (below)",
  "PTMR_GATE_THRESHOLD: 0.2      // Room modes: PTMR score ≈ 0.8 (above)",
  "COMB_CV_THRESHOLD: 0.05       // Room modes: CV ≈ 0 (below)",
]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 7. REPRODUCTION ═══
c.push(h1("7. How to Reproduce the Behavior"));

c.push(h2("Step-by-Step Reproduction"));

c.push(para([bf("1. "), tx("Open DWA (donewellaudio.com or localhost:3000)")]));
c.push(para([bf("2. "), tx("Ensure the microphone is "), bf("NOT"), tx(" routed to any speaker in the same space")]));
c.push(para([bf("3. "), tx("Click \"Ring Out Room\" or set mode to "), code("ringOut"), tx(" (threshold = 2 dB)")]));
c.push(para([bf("4. "), tx("Wait 5–15 seconds for ambient sound to excite room modes")]));
c.push(para([bf("5. "), tx("Observe: advisory cards appear for persistent spectral peaks")]));
c.push(para([bf("6. "), tx("These are room resonance modes, not feedback")]));

c.push(h2("Verification"));

c.push(para("To verify the detected frequencies are room modes:"));

c.push(para([bf("• Calculate expected modes: "), tx("For a 10m × 6m × 3m room, the first axial modes are: 17.2 Hz (L), 28.6 Hz (W), 57.2 Hz (H), and their harmonics. Compare detected frequencies against these predictions.")]));

c.push(para([bf("• Rayleigh equation: "), code("f = (343/2) × √((n/L)² + (m/W)² + (p/H)²)")]));

c.push(para([bf("• Toggle room preset: "), tx("Set "), code("roomPreset"), tx(" to 'small' or 'medium' with correct dimensions. Room mode gates will activate and suppress some detections — confirming they were room modes.")]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 8. PRODUCTIZATION ROADMAP ═══
c.push(h1("8. Productization Roadmap"));

c.push(para("Potential path to formalizing room analysis as a product feature:"));

c.push(h3("Phase 1: Labeling (Low Effort)"));
c.push(para("• Add a 'Room Analysis' mode that sets threshold to 2–4 dB and labels advisories as 'Room Resonance' instead of 'Feedback'"));
c.push(para("• No algorithmic changes — purely UI/labeling"));
c.push(para([bf("Files to modify: "), filePath("constants.ts"), tx(" (new mode preset), "), filePath("IssuesList.tsx"), tx(" (card labeling)")]));

c.push(h3("Phase 2: Room Profile (Medium Effort)"));
c.push(para("• Auto-detect room dimensions from pattern of detected modes"));
c.push(para("• Estimate Schroeder frequency from mode density vs. frequency"));
c.push(para("• Export room correction EQ profile (JSON, CSV, or console-specific format)"));
c.push(para([bf("Files to modify: "), filePath("acousticUtils.ts"), tx(" (Schroeder estimation), "), filePath("eqAdvisor.ts"), tx(" (room correction export)")]));

c.push(h3("Phase 3: Validation (High Effort)"));
c.push(para("• Side-by-side comparison with Smaart in 5+ venue types"));
c.push(para("• Quantify accuracy: frequency match (±Hz), Q match, depth match"));
c.push(para("• Publish results as addendum to AES paper"));

c.push(h3("Phase 4: ML Discrimination (Research)"));
c.push(para("• Train neural network to distinguish room modes from feedback using contextual features (user-reported loop presence, multi-mic correlation, temporal patterns)"));
c.push(para([bf("Files to modify: "), filePath("mlInference.ts"), tx(", "), filePath("scripts/ml/train_fp_filter.py")]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 9. FILE INDEX ═══
c.push(h1("9. File Index"));

c.push(para("All source files relevant to the emergent room analysis behavior:"));

const fileIndex = [
  ["lib/dsp/feedbackDetector.ts", "~1,823", "Core detection loop, peak detection, prominence, persistence scoring, auto-gain, A-weighting"],
  ["lib/dsp/algorithmFusion.ts", "~919", "6-algorithm fusion, IHR/PTMR/Comb gates, content-adaptive weights, MINDS depth"],
  ["lib/dsp/classifier.ts", "~850", "11-feature Bayesian classifier, formant gate, chromatic gate, room mode gates"],
  ["lib/dsp/constants.ts", "~1,013", "ALL tuning constants, 8 mode presets, weight profiles, gate thresholds, DEFAULT_SETTINGS"],
  ["lib/dsp/workerFft.ts", "~389", "AlgorithmEngine — MSD/phase/spectral computation, FFT, phase extraction"],
  ["lib/dsp/dspWorker.ts", "~458", "Worker orchestrator — message handling, temporal smoothing, ML score extraction"],
  ["lib/dsp/eqAdvisor.ts", "~402", "EQ recommendation generation — GEQ/PEQ/shelf, ERB scaling, MINDS algorithm"],
  ["lib/dsp/advisoryManager.ts", "~292", "3-layer dedup, band cooldown, proximity grouping, rate limiting"],
  ["lib/dsp/msdPool.ts", "~267", "Sparse MSD pool — 256 slots × 64 frames, LRU eviction"],
  ["lib/dsp/phaseCoherence.ts", "~129", "Phase coherence via circular statistics — mean phasor computation"],
  ["lib/dsp/acousticUtils.ts", "~861", "Room mode physics — Rayleigh, Schroeder, RT60, modal density"],
  ["lib/dsp/mlInference.ts", "~180", "ONNX ML inference — lazy loading, predictCached(), 929-param MLP"],
  ["lib/dsp/trackManager.ts", "~466", "Track lifecycle — cents-based association, 100-cent tolerance"],
  ["types/advisory.ts", "~384", "All DSP interfaces — Advisory, DetectorSettings, Track, AlgorithmScores"],
];

const fiColW = [3200, 700, 5100];
c.push(new Table({
  columnWidths: fiColW,
  rows: [
    new TableRow({ tableHeader: true, children: [
      hCell("File", fiColW[0]),
      hCell("LOC", fiColW[1]),
      hCell("Role in Room Analysis Behavior", fiColW[2]),
    ]}),
    ...fileIndex.map(row => new TableRow({
      children: [
        new TableCell({ borders: BORDERS, width: { size: fiColW[0], type: WidthType.DXA },
          children: [new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: row[0], font: FONT, size: SIZE_SM, color: TEAL })] })] }),
        new TableCell({ borders: BORDERS, width: { size: fiColW[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: row[1], font: FONT_TEXT, size: SIZE_SM })] })] }),
        new TableCell({ borders: BORDERS, width: { size: fiColW[2], type: WidthType.DXA },
          children: [new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: row[2], font: FONT_TEXT, size: SIZE_SM })] })] }),
      ],
    })),
  ],
}));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 10. RELATED DOCUMENTS ═══
c.push(h1("10. Related Documents"));

const docs = [
  ["AES Convention Paper", "docs/papers/2026-03-20-emergent-room-resonance-analysis.docx", "Academic paper — formal analysis with 17 equations, 20 references, 8 sections. Targeted at AES peer review."],
  ["US Provisional Patent", "docs/papers/2026-03-20-provisional-patent-dwa-room-analysis.docx", "USPTO provisional application — 16 claims (independent: 6-algo fusion; dependent: room analysis). Establishes priority date 2026-03-20. Docket WELLS-2026-001."],
  ["Technical Whitepaper", "docs/papers/2026-03-20-dwa-room-analysis-whitepaper.docx", "Practitioner-focused document — explains the technology and discovery in accessible language with practical use cases and comparison tables."],
  ["This Document", "docs/papers/2026-03-20-dwa-internal-reference.docx", "Internal reference — code-level tracing, exact file/function/line references, reproduction steps, configuration values."],
  ["CLAUDE.md", "CLAUDE.md", "Project intelligence file — architecture overview, coding conventions, version history. Contains high-level overview of the 6-algorithm pipeline."],
];

for (const [title, path, desc] of docs) {
  c.push(para([bf(title)]));
  c.push(para([filePath(path)], { indent: { left: 360 } }));
  c.push(para([it(desc)], { indent: { left: 360 }, spacing: { after: 160 } }));
}

c.push(new Paragraph({ spacing: { before: 480 }, children: [] }));
c.push(noteBox("Document Maintenance",
  "This reference document should be updated whenever algorithm weights, gate thresholds, or the room mode gate logic changes. Key files to watch: constants.ts, algorithmFusion.ts, classifier.ts."));

// ═══════════════════════════════════════════════════════════
//                    GENERATE
// ═══════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT_TEXT, size: SIZE_BODY } } },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, // 0.75" margins for more content
        pageNumbers: { start: 1 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "DWA Internal Reference — Room Resonance Analysis", font: FONT_TEXT, size: SIZE_SM, italics: true, color: GRAY }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "CONFIDENTIAL  •  Page ", font: FONT_TEXT, size: SIZE_SM, color: GRAY }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT_TEXT, size: SIZE_SM, color: GRAY }),
            new TextRun({ text: " of ", font: FONT_TEXT, size: SIZE_SM, color: GRAY }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_TEXT, size: SIZE_SM, color: GRAY }),
          ],
        })],
      }),
    },
    children: c,
  }],
});

const outputPath = process.argv[2] || "2026-03-20-dwa-internal-reference.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Internal reference document written to ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log("10 sections, code blocks, 4 tables, file index, reproduction steps");
});
