const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TabStopType, TabStopPosition,
} = require("docx");

// ─── USPTO Provisional Patent Style Constants ───
const FONT = "Times New Roman";
const SIZE = 24;        // 12pt
const SIZE_TITLE = 28;  // 14pt
const SIZE_HEADING = 26;// 13pt
const SIZE_SMALL = 20;  // 10pt
const LINE_SPACING = 480; // Double-spaced (240 = single)
const CLAIM_INDENT = 720; // 0.5 inch

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const CELL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

let paraNumber = 0;

// ─── Helper Functions ───
function numbered(runs, opts = {}) {
  paraNumber++;
  const prefix = new TextRun({ text: `[${String(paraNumber).padStart(4, "0")}] `, font: FONT, size: SIZE });
  const children = Array.isArray(runs) ? [prefix, ...runs] : [prefix, new TextRun({ text: runs, font: FONT, size: SIZE })];
  return new Paragraph({
    spacing: { after: 120, line: LINE_SPACING },
    alignment: AlignmentType.JUSTIFIED,
    ...opts,
    children,
  });
}

function plain(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [new TextRun({ text: runs, font: FONT, size: SIZE })];
  return new Paragraph({
    spacing: { after: 120, line: LINE_SPACING },
    alignment: AlignmentType.JUSTIFIED,
    ...opts,
    children,
  });
}

function t(text, extra = {}) {
  return new TextRun({ text, font: FONT, size: SIZE, ...extra });
}

function b(text, extra = {}) {
  return new TextRun({ text, font: FONT, size: SIZE, bold: true, ...extra });
}

function it(text, extra = {}) {
  return new TextRun({ text, font: FONT, size: SIZE, italics: true, ...extra });
}

function sup(text) {
  return new TextRun({ text, font: FONT, size: SIZE, superScript: true });
}

function sub(text) {
  return new TextRun({ text, font: FONT, size: SIZE, subScript: true });
}

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 360, after: 240, line: LINE_SPACING },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: SIZE, bold: true })],
  });
}

function subHeading(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120, line: LINE_SPACING },
    children: [new TextRun({ text, font: FONT, size: SIZE, bold: true, italics: true })],
  });
}

function claimPara(text, opts = {}) {
  const children = Array.isArray(text) ? text : [new TextRun({ text, font: FONT, size: SIZE })];
  return new Paragraph({
    spacing: { after: 200, line: LINE_SPACING },
    indent: { left: CLAIM_INDENT, hanging: CLAIM_INDENT },
    ...opts,
    children,
  });
}

function claimElement(text) {
  const children = Array.isArray(text) ? text : [new TextRun({ text, font: FONT, size: SIZE })];
  return new Paragraph({
    spacing: { after: 80, line: LINE_SPACING },
    indent: { left: CLAIM_INDENT * 2 },
    children,
  });
}

function makeCell(text, opts = {}) {
  const children = Array.isArray(text)
    ? [new Paragraph({ children: text, spacing: { after: 40 } })]
    : [new Paragraph({ children: [new TextRun({ text, font: FONT, size: SIZE_SMALL, ...opts })], spacing: { after: 40 } })];
  return new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children,
  });
}

function headerCell(text, width) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "D9E2F3", type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text, font: FONT, size: SIZE_SMALL, bold: true })],
    })],
  });
}

// ─── Build Document ───
const children = [];

// ═══ COVER PAGE ═══
children.push(
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  new Paragraph({
    spacing: { after: 480 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "UNITED STATES PATENT AND TRADEMARK OFFICE", font: FONT, size: 28, bold: true })],
  }),
  new Paragraph({
    spacing: { after: 480 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "PROVISIONAL PATENT APPLICATION", font: FONT, size: SIZE_TITLE, bold: true })],
  }),
  new Paragraph({
    spacing: { after: 120 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Filed Under 37 C.F.R. § 1.53(c)", font: FONT, size: SIZE, italics: true })],
  }),
  new Paragraph({ spacing: { before: 720, after: 120 }, children: [] }),
);

// Title
children.push(
  new Paragraph({
    spacing: { after: 60 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Title of Invention:", font: FONT, size: SIZE, bold: true })],
  }),
  new Paragraph({
    spacing: { after: 480 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "SYSTEM AND METHOD FOR REAL-TIME ROOM ACOUSTIC RESONANCE ANALYSIS USING MULTI-ALGORITHM ACOUSTIC FEEDBACK DETECTION WITH AMBIENT SOUND EXCITATION",
      font: FONT, size: SIZE_TITLE, bold: true,
    })],
  }),
);

// Inventor info
const coverFields = [
  ["Inventor:", "Don Wells"],
  ["Priority Date:", "March 20, 2026"],
  ["Filing Type:", "Provisional Application for Patent"],
  ["Docket No.:", "WELLS-2026-001"],
];
for (const [label, value] of coverFields) {
  children.push(new Paragraph({
    spacing: { after: 80 },
    alignment: AlignmentType.CENTER,
    children: [b(label + " "), t(value)],
  }));
}

children.push(
  new Paragraph({ spacing: { before: 1200 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [it("This provisional application is filed to establish a priority date pursuant to 35 U.S.C. § 111(b).")],
  }),
);

// Page break
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ SPECIFICATION ═══

// Reset paragraph counter
paraNumber = 0;

children.push(sectionHeading("SYSTEM AND METHOD FOR REAL-TIME ROOM ACOUSTIC RESONANCE ANALYSIS USING MULTI-ALGORITHM ACOUSTIC FEEDBACK DETECTION WITH AMBIENT SOUND EXCITATION"));

// ─── Cross-Reference ───
children.push(sectionHeading("Cross-Reference to Related Applications"));
children.push(numbered("Not applicable. This is an original filing."));

// ─── Field of the Invention ───
children.push(sectionHeading("Field of the Invention"));
children.push(numbered("The present invention relates generally to the field of real-time audio signal processing, and more particularly to systems and methods for room acoustic resonance analysis, acoustic feedback detection, and automated equalization recommendation systems."));

// ─── Background ───
children.push(sectionHeading("Background of the Invention"));

children.push(numbered([
  t("Room acoustic analysis — the identification and characterization of resonant modes within an enclosed space — is fundamental to professional audio engineering. Room resonances, also known as standing waves or room modes, are predictable from the Rayleigh equation: "),
  it("f"),
  t("("),
  it("n"),
  sub("x"),
  t(","),
  it("n"),
  sub("y"),
  t(","),
  it("n"),
  sub("z"),
  t(") = ("),
  it("c"),
  t("/2)√(("),
  it("n"),
  sub("x"),
  t("/"),
  it("L"),
  t(")² + ("),
  it("n"),
  sub("y"),
  t("/"),
  it("W"),
  t(")² + ("),
  it("n"),
  sub("z"),
  t("/"),
  it("H"),
  t(")²), where "),
  it("c"),
  t(" is the speed of sound and "),
  it("L"),
  t(", "),
  it("W"),
  t(", "),
  it("H"),
  t(" are the room dimensions. These resonances create uneven frequency response that degrades audio reproduction quality."),
]));

children.push(numbered("Existing methods for room acoustic analysis require specialized equipment and controlled conditions. Transfer function measurement systems such as Smaart (Rational Acoustics, approximately $800 USD) and Room EQ Wizard (REW) require calibrated measurement microphones, dedicated test signals (pink noise or swept sine), and an empty venue free of audience noise. Dirac Live and Sonarworks similarly require controlled measurement conditions. These requirements limit the practicality of room analysis, particularly in live performance settings where the venue cannot be emptied and test signals would disrupt ongoing activities."));

children.push(numbered("Separately, the field of acoustic feedback detection addresses the problem of identifying \"howling\" or \"ringing\" frequencies in sound reinforcement systems. Feedback occurs when sound from a loudspeaker is captured by a microphone and re-amplified, creating a closed electroacoustic loop that sustains oscillation at one or more frequencies. Prior art in feedback detection includes the Magnitude Slope Deviation (MSD) method described by Rohdenburg et al. (DAFx-16, Aalto University, 2016), phase coherence analysis using circular statistics (Fisher, 1993), and the comprehensive survey by van Waterschoot and Moonen (Proc. IEEE, 2011)."));

children.push(numbered("However, no system in the prior art performs real-time room acoustic analysis using ambient sound as the excitation source, without requiring test signals, calibrated measurement microphones, or prior room configuration. There exists a need for a system that can identify room resonance modes in real-time using only a standard microphone and ambient sound, and that can generate parametric equalization correction recommendations automatically."));

// ─── Summary ───
children.push(sectionHeading("Summary of the Invention"));

children.push(numbered("The present invention provides a computer-implemented system and method for real-time acoustic analysis that employs a plurality of detection algorithms operating in concert to identify acoustic phenomena and generate parametric equalization recommendations. In one embodiment, the system employs six detection algorithms augmented by a neural network meta-model, with content-adaptive weighted fusion and multiplicative gate processing."));

children.push(numbered("In a first aspect, the invention provides a multi-algorithm fusion system for real-time acoustic analysis comprising: (a) audio capture and spectral analysis via Fast Fourier Transform; (b) spectral peak detection with configurable prominence thresholds; (c) scoring of each detected peak by a plurality of independent detection algorithms; (d) content-adaptive weighted fusion of algorithm scores; (e) multiplicative gate processing for false positive suppression; and (f) parametric equalization recommendation generation based on psychoacoustic scaling."));

children.push(numbered("In a second aspect, the invention provides a method for room acoustic resonance analysis comprising operating the multi-algorithm fusion system at elevated sensitivity (prominence threshold below approximately 8 dB) in the absence of an electroacoustic feedback loop, whereby the system detects room acoustic resonance modes as spectral peaks satisfying the detection criteria, and generates parametric equalization recommendations constituting a room correction equalization profile."));

children.push(numbered("The inventor has discovered that room acoustic resonances and acoustic feedback produce physically identical spectral signatures — both manifest as persistent, narrow, high-Q spectral peaks with stable magnitude and stable phase. Consequently, a system designed to detect feedback inherently detects room resonances when operated at sufficient sensitivity. This emergent behavior transforms a feedback detection system into a room acoustic analyzer requiring no test signal, no calibrated measurement microphone, and no prior room configuration."));

// ─── Brief Description of Drawings ───
children.push(sectionHeading("Brief Description of the Drawings"));

const figures = [
  "FIG. 1 is a system architecture block diagram showing the three-layer processing pipeline comprising a main processing thread, a classification worker thread, and a user interface rendering layer.",
  "FIG. 2 is a data flow diagram illustrating the six detection algorithms operating in parallel on each detected spectral peak, with their scores flowing into the content-adaptive weighted fusion module.",
  "FIG. 3 is a spectral comparison diagram showing side-by-side frequency spectra of (a) a room resonance mode at approximately 250 Hz without an electroacoustic feedback loop present and (b) acoustic feedback at approximately 250 Hz with an electroacoustic loop present, demonstrating the physical indistinguishability of the spectral signatures.",
  "FIG. 4 is a table showing the algorithm score equivalence, presenting the output scores of all six detection algorithms for room resonance input versus acoustic feedback input, demonstrating near-identical scoring across all algorithms.",
  "FIG. 5 is a gate activation matrix showing which of the five multiplicative gates activate for three input scenarios: acoustic feedback, room resonance, and musical instrument content.",
  "FIG. 6 is a flowchart illustrating the equalization advisory generation pipeline from detection probability through psychoacoustic scaling to parametric equalization recommendation output.",
  "FIG. 7 is a dual-mode operation diagram showing the system operating in feedback detection mode at normal sensitivity and in room analysis mode at elevated sensitivity, with the mode determined by the sensitivity threshold setting.",
];

for (const fig of figures) {
  children.push(numbered(fig));
}

// ─── Detailed Description ───
children.push(sectionHeading("Detailed Description of Preferred Embodiments"));

children.push(numbered("The following detailed description sets forth specific embodiments of the present invention. It should be understood that these embodiments are exemplary and that the scope of the invention is defined by the appended claims. Those skilled in the art will recognize that various modifications may be made without departing from the spirit and scope of the invention."));

// Audio Capture
children.push(subHeading("Audio Capture and Pre-Processing"));

children.push(numbered([
  t("In a preferred embodiment, the system captures audio input via a microphone connected to a computing device. The audio stream is processed through an audio processing graph comprising a gain control node and a spectral analysis node. The spectral analysis node performs a Fast Fourier Transform (FFT) with a window size of 8,192 samples at a sample rate of 48,000 Hz, yielding a frequency resolution of approximately 5.86 Hz per bin. In an alternative embodiment, a 16,384-sample FFT window provides approximately 2.93 Hz resolution. The FFT analysis is performed at a rate of 50 frames per second (20 ms intervals)."),
]));

children.push(numbered([
  t("The raw spectral data is compensated for microphone frequency response characteristics. In one embodiment, A-weighting compensation is applied according to the IEC 61672:2003 standard. In another embodiment, a specific microphone calibration curve is applied, such as the Behringer ECM8000 calibration profile stored as a frequency-gain lookup table."),
]));

children.push(numbered([
  t("Auto-gain control maintains optimal signal levels using an exponentially weighted moving average (EWMA) noise floor tracker with a decay factor of 0.98. The gain control employs asymmetric time constants: an attack time of 0.3 seconds for rapidly increasing signals and a release time of 1.0 second for decreasing signals."),
]));

// Peak Detection
children.push(subHeading("Peak Detection and Persistence Scoring"));

children.push(numbered([
  t("Spectral peaks are identified by computing the prominence of each frequency bin relative to its neighborhood. In a preferred embodiment, prominence is calculated using a prefix-sum technique that enables O(1) neighborhood averaging. A Float64Array prefix sum is maintained such that the average magnitude of any contiguous bin range can be computed by a single subtraction and division operation, avoiding per-bin iteration loops."),
]));

children.push(numbered([
  t("The prominence threshold is configurable over a range of approximately 2 dB to 42 dB. Peaks exceeding the configured threshold are tracked over time using a persistence scoring mechanism. In a preferred embodiment, persistence scoring is content-adaptive: speech content requires 7 consecutive frames (approximately 140 ms) of persistence, music content requires 13 frames (approximately 260 ms), and compressed/processed audio content requires 50 frames (approximately 1,000 ms). Content type is determined in real-time by a 4-feature scoring system using spectral centroid, spectral rolloff, spectral flatness, and crest factor with temporal envelope analysis over 2-second windows and majority-vote smoothing over 10 frames."),
]));

// Six Detection Algorithms
children.push(subHeading("Six Detection Algorithms"));

children.push(numbered("The system employs six independent detection algorithms, each analyzing different physical characteristics of detected spectral peaks. For each peak that passes the persistence threshold, all six algorithms compute independent scores. Two of these algorithms — the Inter-Harmonic Ratio (IHR) and Peak-to-Median Ratio (PTMR) — are believed to be novel contributions of the present invention."));

// MSD
children.push(subHeading("Algorithm 1: Magnitude Slope Deviation (MSD)"));

children.push(numbered([
  t("The Magnitude Slope Deviation algorithm measures the temporal stability of magnitude values at each frequency bin. In a preferred embodiment, MSD is computed using a second-derivative stencil: MSD("),
  it("k"),
  t(") = (1/"),
  it("N"),
  t(") Σ|"),
  it("G"),
  t("''("),
  it("k"),
  t(","),
  it("n"),
  t(")|² where "),
  it("G"),
  t("''("),
  it("k"),
  t(","),
  it("n"),
  t(") = "),
  it("v"),
  t("("),
  it("k"),
  t(","),
  it("n"),
  t(") - 2·"),
  it("v"),
  t("("),
  it("k"),
  t(","),
  it("n"),
  t("-1) + "),
  it("v"),
  t("("),
  it("k"),
  t(","),
  it("n"),
  t("-2), where "),
  it("v"),
  t("("),
  it("k"),
  t(","),
  it("n"),
  t(") is the magnitude value at frequency bin "),
  it("k"),
  t(" and frame "),
  it("n"),
  t(". A low MSD value (approaching zero) indicates high temporal stability, characteristic of feedback or room resonances. A high MSD value indicates fluctuating magnitude, characteristic of musical content."),
]));

children.push(numbered("The temporal history is stored in a sparse memory pool comprising 256 slots, each containing 64 frames of history, for a total memory footprint of approximately 64 KB. This sparse allocation contrasts with a dense allocation approach that would require approximately 1 MB for a full 8,192-bin history. Slots are allocated on demand and evicted using a Least Recently Used (LRU) policy when the pool is exhausted."));

// Phase Coherence
children.push(subHeading("Algorithm 2: Phase Coherence"));

children.push(numbered([
  t("The Phase Coherence algorithm measures the frame-to-frame stability of the phase component at each frequency bin using circular statistics. The coherence is computed as: "),
  it("C"),
  t(" = |(1/"),
  it("N"),
  t(") Σ "),
  it("e"),
  sup("jΔφᵢ"),
  t("| = |(1/"),
  it("N"),
  t(") Σ [cos(Δφ"),
  sub("i"),
  t(") + "),
  it("j"),
  t("·sin(Δφ"),
  sub("i"),
  t(")]|, where Δφ"),
  sub("i"),
  t(" is the inter-frame phase difference at the frequency bin of interest. A coherence value approaching 1.0 indicates highly stable phase (consistent with feedback or room resonances), while a value approaching 0.0 indicates random phase evolution (consistent with broadband noise). In a preferred embodiment, three classification thresholds are used: HIGH (0.85), MEDIUM (0.65), and LOW (0.40)."),
]));

// Spectral Flatness
children.push(subHeading("Algorithm 3: Spectral Flatness"));

children.push(numbered([
  t("The Spectral Flatness algorithm measures the tonal quality of the spectrum in the neighborhood of each detected peak. Spectral flatness is computed as the ratio of the geometric mean to the arithmetic mean of magnitude values within a neighborhood of ±5 bins: SF = (∏"),
  sub("i"),
  t(" "),
  it("x"),
  sub("i"),
  t(")"),
  sup("1/N"),
  t(" / (1/"),
  it("N"),
  t(" Σ"),
  sub("i"),
  t(" "),
  it("x"),
  sub("i"),
  t("). A value approaching 0.0 indicates a tonal (peaked) spectrum consistent with feedback or resonance, while a value approaching 1.0 indicates a flat (noise-like) spectrum. The algorithm additionally computes spectral kurtosis: κ = "),
  it("m"),
  sub("4"),
  t("/("),
  it("m"),
  sub("2"),
  t("²) - 3, where "),
  it("m"),
  sub("n"),
  t(" denotes the "),
  it("n"),
  t("-th central moment. High kurtosis indicates a sharp, narrow peak consistent with feedback or resonance."),
]));

// Comb Filter Pattern
children.push(subHeading("Algorithm 4: Comb Filter Pattern Detection"));

children.push(numbered([
  t("The Comb Filter Pattern algorithm identifies evenly-spaced harmonic peaks that may arise from acoustic path delay. In feedback systems, the acoustic path from loudspeaker to microphone creates a comb filter with spacing Δ"),
  it("f"),
  t(" = "),
  it("c"),
  t("/"),
  it("d"),
  t(", where "),
  it("c"),
  t(" is the speed of sound (approximately 343 m/s) and "),
  it("d"),
  t(" is the acoustic path length. The algorithm searches for harmonic series ("),
  it("f"),
  t(", 2"),
  it("f"),
  t(", 3"),
  it("f"),
  t(", ...) with a tolerance of ±5% and requires at least 3 matching harmonics for a positive identification. A CombStabilityTracker monitors the coefficient of variation (CV) of the fundamental spacing across 16 frames; when CV exceeds 0.05, the comb confidence is reduced by a multiplicative factor of 0.25 to suppress time-varying comb patterns from effects processors."),
]));

// IHR
children.push(subHeading("Algorithm 5: Inter-Harmonic Ratio (IHR) — Novel"));

children.push(numbered([
  t("The Inter-Harmonic Ratio (IHR) algorithm, believed to be a novel contribution of the present invention, measures the ratio of spectral energy between harmonic frequencies to the energy at harmonic frequencies themselves. IHR = "),
  it("E"),
  sub("interharmonic"),
  t(" / "),
  it("E"),
  sub("harmonic"),
  t(". Interharmonic energy is measured in sideband windows at ±5 to ±15 bins (near) and ±20 to ±40 bins (far) relative to each detected harmonic. Feedback and room resonances, being single-frequency oscillations, produce clean spectra with minimal interharmonic energy (IHR approaching 0.0). Musical instruments produce rich spectra with substantial interharmonic energy (IHR exceeding 0.35). When harmonicsFound ≥ 3 AND IHR > 0.35, the system applies a multiplicative gate reducing the detection probability by a factor of 0.65, suppressing musical instrument false positives."),
]));

// PTMR
children.push(subHeading("Algorithm 6: Peak-to-Median Ratio (PTMR) — Novel"));

children.push(numbered([
  t("The Peak-to-Median Ratio (PTMR) algorithm, believed to be a novel contribution of the present invention, quantifies the sharpness of a spectral peak relative to its surrounding spectral neighborhood. PTMR"),
  sub("dB"),
  t(" = "),
  it("S"),
  t("[peak] - median("),
  it("S"),
  t("[peak ± 20 bins]), where bins immediately adjacent to the peak (±2 bins) are excluded from the median computation to avoid biasing the result. A high PTMR value indicates a sharp, isolated peak consistent with feedback or room resonance. A low PTMR value indicates a broad spectral feature more consistent with musical content. When the PTMR feedback score falls below 0.2, a multiplicative gate reduces the detection probability by a factor of 0.80."),
]));

// Content-Adaptive Weighted Fusion
children.push(subHeading("Content-Adaptive Weighted Fusion"));

children.push(numbered([
  t("The scores from all six detection algorithms are combined via content-adaptive weighted fusion. The system maintains four weight profiles corresponding to four content types: DEFAULT, SPEECH, MUSIC, and COMPRESSED. The fused detection probability is computed as: "),
  it("P"),
  t("(feedback) = Σ"),
  sub("i"),
  t("("),
  it("s"),
  sub("i"),
  t(" · "),
  it("w"),
  sub("i"),
  t(") / Σ"),
  sub("i"),
  t("("),
  it("w"),
  sub("i"),
  t("), where "),
  it("s"),
  sub("i"),
  t(" is the score from algorithm "),
  it("i"),
  t(" and "),
  it("w"),
  sub("i"),
  t(" is the weight assigned to algorithm "),
  it("i"),
  t(" for the current content type."),
]));

// Weight Table
const weightData = [
  ["MSD",              "0.27", "0.30", "0.07", "0.11"],
  ["Phase Coherence",  "0.23", "0.22", "0.32", "0.27"],
  ["Spectral Flatness","0.11", "0.09", "0.09", "0.16"],
  ["Comb Pattern",     "0.07", "0.04", "0.07", "0.07"],
  ["IHR",              "0.12", "0.09", "0.22", "0.16"],
  ["PTMR",             "0.10", "0.16", "0.13", "0.13"],
  ["ML Meta-Model",    "0.10", "0.10", "0.10", "0.10"],
];

const colW = [2400, 1400, 1400, 1400, 1400];
children.push(
  new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [b("TABLE 1: Content-Adaptive Algorithm Weight Profiles")] }),
  new Table({
    columnWidths: colW,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Algorithm", colW[0]),
          headerCell("DEFAULT", colW[1]),
          headerCell("SPEECH", colW[2]),
          headerCell("MUSIC", colW[3]),
          headerCell("COMPRESSED", colW[4]),
        ],
      }),
      ...weightData.map(row => new TableRow({
        children: row.map((cell, i) => {
          const tc = new TableCell({
            borders: CELL_BORDERS,
            width: { size: colW[i], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
              spacing: { after: 40 },
              children: [new TextRun({ text: cell, font: FONT, size: SIZE_SMALL })],
            })],
          });
          return tc;
        }),
      })),
    ],
  }),
  new Paragraph({ spacing: { after: 240 }, children: [] }),
);

children.push(numbered([
  t("A confidence measure is derived from inter-algorithm agreement: "),
  it("C"),
  t(" = "),
  it("P"),
  t(" · (0.5 + 0.5 · (1 - √Var(scores))), where Var(scores) is the variance of the individual algorithm scores. High inter-algorithm agreement (low variance) yields high confidence."),
]));

// Post-Fusion Gates
children.push(subHeading("Post-Fusion Multiplicative Gates"));

children.push(numbered("After weighted fusion, the detection probability is further refined by a series of multiplicative gates that suppress specific classes of false positives. Each gate operates independently and reduces the detection probability by a fixed multiplicative factor when its activation condition is satisfied."));

// Gate Table
const gateData = [
  ["IHR Gate",        "harmonics ≥ 3 AND IHR > 0.35", "× 0.65", "Musical instruments"],
  ["PTMR Gate",       "PTMR score < 0.2",             "× 0.80", "Broad spectral features"],
  ["Comb Stability",  "Spacing CV > 0.05 (16 frames)", "× 0.25", "Flangers/phasers"],
  ["Formant Gate",    "2+ peaks in F1/F2/F3, Q ∈ [3,20]", "× 0.65", "Sustained vowels"],
  ["Chromatic Gate",  "±5 cents from 12-TET, coh > 0.80", "× 0.60", "Auto-Tuned vocals"],
];

const gateColW = [1600, 2800, 1000, 2600];
children.push(
  new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [b("TABLE 2: Post-Fusion Multiplicative Gates")] }),
  new Table({
    columnWidths: gateColW,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Gate", gateColW[0]),
          headerCell("Activation Condition", gateColW[1]),
          headerCell("Factor", gateColW[2]),
          headerCell("Suppressed Source", gateColW[3]),
        ],
      }),
      ...gateData.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders: CELL_BORDERS,
          width: { size: gateColW[i], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: cell, font: FONT, size: SIZE_SMALL })],
          })],
        })),
      })),
    ],
  }),
  new Paragraph({ spacing: { after: 240 }, children: [] }),
);

// Neural Network Meta-Model
children.push(subHeading("Neural Network Meta-Model"));

children.push(numbered("In a preferred embodiment, the system further comprises a neural network meta-model operating as a seventh fusion component. The meta-model is a multi-layer perceptron (MLP) with architecture 11→32→16→1, comprising 929 trainable parameters and occupying approximately 4 KB in ONNX format. The input features comprise the six algorithm scores, the previous-frame fused probability and confidence values, and a 3-dimensional one-hot encoding of the detected content type. The meta-model output is incorporated into the weighted fusion with a weight of 0.10 across all content profiles."));

children.push(numbered("The meta-model is initialized with a bootstrap model that encodes existing gate logic as learned weights, ensuring consistent behavior prior to the availability of labeled training data. The model evolves via user feedback labeling: confirmed feedback events and flagged false positive events are collected as labeled training data for periodic model retraining."));

// EQ Advisory Generation
children.push(subHeading("Equalization Advisory Generation"));

children.push(numbered([
  t("When the fused detection probability exceeds a mode-specific threshold, the system generates a parametric equalization recommendation. The recommendation comprises three parameters: center frequency (Hz), gain (dB, negative for cut), and quality factor (Q). The recommended cut depth is computed using the MINDS algorithm (MSD-Inspired Notch Depth Setting), which bases the notch depth on the temporal growth rate of the detected peak."),
]));

children.push(numbered([
  t("The cut depth is further scaled using the Equivalent Rectangular Bandwidth (ERB) psychoacoustic model: ERB("),
  it("f"),
  t(") = 24.7 · (4.37"),
  it("f"),
  t("/1000 + 1), as described by Glasberg and Moore (1990). The ERB scaling reduces cut depth below 500 Hz (factor 0.7) and increases cut depth above 2,000 Hz (factor up to 1.2), reflecting the frequency-dependent sensitivity of human hearing."),
]));

// Room Resonance Analysis — the key section
children.push(subHeading("Room Resonance Analysis Mode — Emergent Behavior"));

children.push(numbered("The inventor has discovered that when the system described in the preceding paragraphs is operated at elevated sensitivity (prominence threshold set below approximately 8 dB) in the absence of an electroacoustic feedback loop (i.e., the microphone is not routed through an amplifier to a loudspeaker in the same acoustic space), the system detects room acoustic resonance modes and generates parametric equalization recommendations that constitute a room correction equalization profile."));

children.push(numbered("This behavior emerges because room acoustic resonance modes and acoustic feedback produce physically identical spectral signatures. Both phenomena manifest as persistent, narrow, high-Q spectral peaks with stable magnitude (low MSD) and stable phase (high phase coherence). Both produce clean spectra with minimal interharmonic energy (low IHR) and sharp peaks relative to the spectral neighborhood (high PTMR). Consequently, all six detection algorithms unanimously classify room resonances as feedback events, because the spectral signatures are indistinguishable."));

children.push(numbered("The physical basis for this equivalence is that both room resonances and acoustic feedback are self-sustaining narrowband oscillations. Room resonances are standing waves sustained by wall reflections in the acoustic domain. Acoustic feedback is oscillation sustained by the electroacoustic loop (microphone → amplifier → loudspeaker → acoustic path → microphone). From the perspective of spectral analysis at the microphone, the sustaining mechanism is invisible — only the resulting spectral peak is observed."));

children.push(numbered([
  t("This equivalence can be formalized as the Spectral Signature Equivalence Theorem. Define the feedback signature vector "),
  b("S"),
  sub("fb"),
  t(" = [MSD, φ"),
  sub("coh"),
  t(", "),
  it("F"),
  sub("flat"),
  t(", "),
  it("C"),
  sub("comb"),
  t(", IHR, PTMR] and the room mode signature vector "),
  b("S"),
  sub("rm"),
  t(" = [MSD, φ"),
  sub("coh"),
  t(", "),
  it("F"),
  sub("flat"),
  t(", "),
  it("C"),
  sub("comb"),
  t(", IHR, PTMR]. For any persistent, isolated, narrowband spectral peak: ‖"),
  b("S"),
  sub("fb"),
  t(" - "),
  b("S"),
  sub("rm"),
  t("‖"),
  sub("2"),
  t(" → 0. That is, room modes lie in the kernel of the feedback detection function."),
]));

// Algorithm Response Comparison Table
const algoCompare = [
  ["MSD (magnitude stability)", "≈ 0 (very stable)", "≈ 0 (very stable)", "Indistinguishable"],
  ["Phase Coherence", "0.85–0.95 (high)", "0.85–0.98 (high)", "Indistinguishable"],
  ["Spectral Flatness", "< 0.05 (tonal)", "< 0.05 (tonal)", "Indistinguishable"],
  ["Comb Pattern", "Matches (if axial modes)", "Matches (loop delay)", "Similar"],
  ["IHR", "≈ 0 (clean spectrum)", "≈ 0 (pure tone)", "Indistinguishable"],
  ["PTMR", "High (sharp peak)", "High (sharp peak)", "Indistinguishable"],
];

const compColW = [2200, 2200, 2200, 1600];
children.push(
  new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [b("TABLE 3: Algorithm Response Comparison — Room Resonance vs. Acoustic Feedback")] }),
  new Table({
    columnWidths: compColW,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Algorithm", compColW[0]),
          headerCell("Room Resonance", compColW[1]),
          headerCell("Acoustic Feedback", compColW[2]),
          headerCell("Distinguishable?", compColW[3]),
        ],
      }),
      ...algoCompare.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders: CELL_BORDERS,
          width: { size: compColW[i], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: cell, font: FONT, size: SIZE_SMALL })],
          })],
        })),
      })),
    ],
  }),
  new Paragraph({ spacing: { after: 240 }, children: [] }),
);

children.push(numbered("Furthermore, the system's multiplicative gates do not activate for room resonances under default operating conditions. The room mode suppression gates (roomModeProximity, modalDensityPenalty, RT60 Q-factor adjustment) require explicit room configuration and are disabled when the room configuration preset is set to its default value of 'none'. The formant gate requires multi-band vocal patterns and does not trigger for isolated room modes. The chromatic quantization gate requires pitch alignment to the 12-tone equal temperament grid, which room modes do not exhibit. The IHR gate requires multiple harmonics with interharmonic energy, which isolated room modes lack. Consequently, room resonances pass through the entire detection pipeline without suppression."));

children.push(numbered("The practical effect is that the system generates parametric equalization recommendations for each detected room resonance mode. Each recommendation specifies a center frequency corresponding to the room mode frequency, a Q factor matched to the resonance width, and a cut depth computed by the MINDS algorithm with ERB psychoacoustic scaling. This set of recommendations constitutes a room correction equalization profile equivalent in function to the output of dedicated room analysis systems."));

// Dual-Mode Operation
children.push(subHeading("Dual-Mode Operation"));

children.push(numbered("In a preferred embodiment, the system operates in a dual-mode configuration. In a first mode (feedback detection mode), the system operates at normal sensitivity (prominence threshold of 15–42 dB depending on the operational preset) and detects acoustic feedback frequencies in a sound reinforcement system. In a second mode (room analysis mode), the system operates at elevated sensitivity (prominence threshold below approximately 8 dB, and preferably at approximately 2 dB) and detects room acoustic resonance modes using ambient sound as excitation. The mode is determined by the sensitivity threshold setting, which is user-configurable. No structural modification to the detection pipeline is required to switch between modes — only the sensitivity parameter changes."));

children.push(numbered("In the room analysis mode, the system monitors room resonances continuously in real-time, tracking changes in room resonance characteristics as conditions change (e.g., audience filling, temperature changes, humidity variations). This continuous monitoring capability is not available in prior art room analysis systems, which typically perform a one-time measurement."));

// Advantages over Prior Art Table
const advantageData = [
  ["Test signal required",     "No (ambient sound)",     "Yes (pink noise)",  "Yes (swept sine)", "Yes (swept sine)"],
  ["Calibrated mic required",  "No (any mic)",           "Yes",               "Yes",              "Yes"],
  ["Real-time continuous",     "Yes (50 fps)",           "Yes",               "No (post-process)","No (post-process)"],
  ["Audience may be present",  "Yes",                    "Difficult",         "No",               "No"],
  ["Setup time",               "Zero",                   "15–30 minutes",     "10–20 minutes",    "15–30 minutes"],
  ["Output",                   "PEQ recommendations",    "Transfer function", "IR + EQ",          "Room correction"],
  ["Approximate cost",         "Free (browser-based)",   "$800+",             "Free",             "$400+"],
];

const advColW = [1800, 1700, 1700, 1500, 1500];
children.push(
  new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [b("TABLE 4: Comparison with Prior Art Room Analysis Systems")] }),
  new Table({
    columnWidths: advColW,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Feature", advColW[0]),
          headerCell("Present Invention", advColW[1]),
          headerCell("Smaart", advColW[2]),
          headerCell("REW", advColW[3]),
          headerCell("Dirac Live", advColW[4]),
        ],
      }),
      ...advantageData.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders: CELL_BORDERS,
          width: { size: advColW[i], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: cell, font: FONT, size: SIZE_SMALL, bold: i === 1 })],
          })],
        })),
      })),
    ],
  }),
  new Paragraph({ spacing: { after: 240 }, children: [] }),
);

// ═══ CLAIMS ═══
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionHeading("Claims"));

children.push(plain([it("What is claimed is:")], { spacing: { after: 360, line: LINE_SPACING } }));

// Claim 1 — Main Independent Claim
children.push(claimPara([b("1. "), t("A computer-implemented method for real-time acoustic analysis comprising:")]));
children.push(claimElement("(a) capturing audio input via a microphone coupled to a computing device and performing Fast Fourier Transform spectral analysis on the captured audio to produce a frequency-domain representation;"));
children.push(claimElement("(b) detecting one or more spectral peaks in the frequency-domain representation, each spectral peak exceeding a configurable prominence threshold relative to a surrounding spectral neighborhood;"));
children.push(claimElement("(c) computing, for each detected spectral peak, a plurality of detection scores from a plurality of independent detection algorithms, the plurality including at least: a magnitude stability metric quantifying temporal variation of magnitude values at the peak frequency, a phase coherence metric quantifying frame-to-frame stability of phase values at the peak frequency using circular statistics, a spectral flatness metric quantifying the ratio of geometric mean to arithmetic mean of magnitude values in a neighborhood of the peak, and a peak-to-median ratio metric quantifying the difference between the peak magnitude and the median magnitude of a surrounding spectral window;"));
children.push(claimElement("(d) combining the plurality of detection scores via content-adaptive weighted fusion, wherein weight values are selected from a plurality of content-type weight profiles based on real-time classification of the audio content, to produce a fused detection probability;"));
children.push(claimElement("(e) applying one or more multiplicative gates to the fused detection probability, each gate reducing the detection probability by a fixed multiplicative factor when a gate-specific activation condition is satisfied, the activation conditions including at least inter-harmonic energy analysis and peak sharpness analysis; and"));
children.push(claimElement("(f) generating one or more parametric equalization recommendations based on the fused detection probability and a psychoacoustic scaling model, each recommendation specifying at least a center frequency, a gain value, and a quality factor."));

// Claims 2-8 — Independent/Dependent for fusion system
children.push(claimPara([b("2. "), t("The method of claim 1, wherein the magnitude stability metric comprises computing a Magnitude Slope Deviation (MSD) using a second-derivative stencil over a temporal history of magnitude values at each frequency bin, the temporal history stored in a sparse memory pool with a fixed number of allocation slots and Least Recently Used eviction, the second-derivative stencil computed as: G''(k,n) = v(k,n) - 2·v(k,n-1) + v(k,n-2), and the MSD computed as: MSD(k) = (1/N) Σ|G''(k,n)|².")]));

children.push(claimPara([b("3. "), t("The method of claim 1, wherein the phase coherence metric comprises computing the magnitude of the mean phasor of inter-frame phase differences using circular statistics, the mean phasor computed as: C = |(1/N) Σ[cos(Δφᵢ) + j·sin(Δφᵢ)]|, where Δφᵢ is the phase difference between consecutive frames at the frequency bin of interest.")]));

children.push(claimPara([b("4. "), t("The method of claim 1, wherein the content-adaptive weighted fusion comprises: classifying the audio content in real-time using a multi-feature scoring system comprising spectral centroid, spectral rolloff, spectral flatness, and crest factor features with temporal envelope analysis; and selecting weight values from a plurality of weight profiles, the plurality including at least a default profile, a speech profile with increased weight for the magnitude stability metric, a music profile with increased weight for the phase coherence metric and the inter-harmonic ratio metric, and a compressed audio profile.")]));

children.push(claimPara([b("5. "), t("The method of claim 1, wherein the plurality of independent detection algorithms further comprises an Inter-Harmonic Ratio (IHR) algorithm that computes the ratio of spectral energy in frequency bands between detected harmonic frequencies to the spectral energy at the harmonic frequencies, and wherein one of the multiplicative gates applies a reduction factor to the fused detection probability when the IHR exceeds a threshold value and a minimum number of harmonic frequencies are detected, the reduction factor suppressing detection of musical instrument content.")]));

children.push(claimPara([b("6. "), t("The method of claim 1, wherein the peak-to-median ratio metric comprises computing the difference in decibels between the peak magnitude and the median magnitude of a surrounding spectral window, with bins immediately adjacent to the peak excluded from the median computation to avoid biasing, and wherein one of the multiplicative gates applies a reduction factor to the fused detection probability when the peak-to-median ratio feedback score falls below a threshold value.")]));

children.push(claimPara([b("7. "), t("The method of claim 1, further comprising processing the plurality of detection scores through a neural network meta-model, the meta-model being a multi-layer perceptron receiving as input features the plurality of detection scores, a previous-frame fused detection probability, a previous-frame confidence value, and a content-type encoding, and producing an additional score that is incorporated into the weighted fusion as an additional algorithm with its own content-adaptive weight.")]));

children.push(claimPara([b("8. "), t("The method of claim 1, wherein the psychoacoustic scaling model comprises applying a frequency-dependent depth scaling based on the Equivalent Rectangular Bandwidth (ERB) computed as: ERB(f) = 24.7 · (4.37f/1000 + 1), with reduced equalization depth below 500 Hz and increased equalization depth above 2,000 Hz, reflecting the frequency-dependent sensitivity of human hearing.")]));

// Claims 9-13 — Dependent Claims for Room Resonance Analysis
children.push(claimPara([b("9. "), t("The method of claim 1, further comprising operating the system at an elevated sensitivity with the configurable prominence threshold set below approximately 8 dB, whereby the system detects room acoustic resonance modes as spectral peaks satisfying the detection criteria in the absence of an electroacoustic feedback loop, and wherein the one or more parametric equalization recommendations generated for the detected room acoustic resonance modes constitute a room correction equalization profile.")]));

children.push(claimPara([b("10. "), t("The method of claim 9, wherein the room acoustic resonance modes are detected without the presence of an electroacoustic feedback loop between the microphone and any loudspeaker in the acoustic space, without a dedicated test signal, and without a calibrated measurement microphone, using ambient sound present in the acoustic space as the sole excitation source for the room resonance modes.")]));

children.push(claimPara([b("11. "), t("The method of claim 9, wherein the system continuously monitors room resonances in real-time during a live performance event, tracking changes in room resonance mode frequencies and amplitudes as audience occupancy, temperature, or humidity conditions change in the acoustic space.")]));

children.push(claimPara([b("12. "), t("The method of claim 9, further comprising automatically estimating a Schroeder transition frequency from the spatial distribution pattern of detected room resonance modes, the Schroeder frequency representing the boundary between the modal region and the statistical region of the room's acoustic behavior.")]));

children.push(claimPara([b("13. "), t("The method of claim 9, wherein the system operates in a dual-mode configuration comprising: a feedback detection mode for identifying electroacoustic feedback frequencies during sound reinforcement, the feedback detection mode operating at a first sensitivity level; and a room analysis mode for identifying room acoustic resonance modes, the room analysis mode operating at a second sensitivity level that is higher than the first sensitivity level; wherein the mode is determined by the configurable prominence threshold setting without structural modification to the detection pipeline.")]));

// Claims 14-16 — System and Medium Claims
children.push(claimPara([b("14. "), t("A system for real-time acoustic analysis comprising: a processor; a memory coupled to the processor and storing instructions that, when executed by the processor, cause the processor to perform the method of claim 1; and a microphone input coupled to the processor for receiving audio input.")]));

children.push(claimPara([b("15. "), t("A non-transitory computer-readable medium storing instructions that, when executed by a processor of a computing device having a microphone input, cause the processor to perform the method of claim 1.")]));

children.push(claimPara([b("16. "), t("The method of claim 1, wherein the plurality of independent detection algorithms further comprises a comb filter pattern detector that identifies evenly-spaced harmonic spectral peaks and estimates an acoustic path length from the fundamental harmonic spacing as d = c/Δf, where c is the speed of sound and Δf is the fundamental spacing, and further comprising a stability tracker that monitors the coefficient of variation of the harmonic spacing over a plurality of frames and reduces the comb detection confidence by a multiplicative factor when the coefficient of variation exceeds a stability threshold.")]));

// ═══ ABSTRACT ═══
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionHeading("Abstract of the Disclosure"));

children.push(plain([
  t("A computer-implemented system and method for real-time acoustic analysis employing six fused detection algorithms — Magnitude Slope Deviation (MSD), phase coherence via circular statistics, spectral flatness, comb filter pattern detection, inter-harmonic ratio (IHR), and peak-to-median ratio (PTMR) — augmented by a neural network meta-model. The system performs content-adaptive weighted fusion of algorithm scores, selecting weight profiles based on real-time content classification, and applies multiplicative gates for false positive suppression including inter-harmonic energy gating, peak sharpness gating, comb stability tracking, formant detection, and chromatic quantization detection. When operated at elevated sensitivity in the absence of an electroacoustic feedback loop, the system detects room acoustic resonance modes using ambient sound as excitation, without test signals or calibrated microphones, generating room correction equalization profiles in real-time. The system enables dual-mode operation for acoustic feedback protection during sound reinforcement and room acoustic analysis for venue characterization, with mode selection determined solely by the sensitivity threshold parameter."),
], { alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: LINE_SPACING } }));

// ═══ Generate Document ═══
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: SIZE },
        paragraph: { spacing: { line: LINE_SPACING } },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "patent-claims",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: CLAIM_INDENT, hanging: CLAIM_INDENT } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        pageNumbers: { start: 1 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Docket No. WELLS-2026-001", font: FONT, size: SIZE_SMALL, italics: true }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", font: FONT, size: SIZE_SMALL }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_SMALL }),
            new TextRun({ text: " of ", font: FONT, size: SIZE_SMALL }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE_SMALL }),
          ],
        })],
      }),
    },
    children,
  }],
});

const outputPath = process.argv[2] || "2026-03-20-provisional-patent-ktr-room-analysis.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Provisional patent application written to ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`Paragraphs: ${paraNumber} numbered`);
  console.log(`Claims: 16 (8 independent/dependent fusion + 5 room analysis + 3 system/medium/comb)`);
});
