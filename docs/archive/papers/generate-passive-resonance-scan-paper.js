const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const FONT_BODY = "Calibri";
const FONT_HEADING = "Calibri";
const FONT_MONO = "Consolas";

const SIZE_TITLE = 42;
const SIZE_SUBTITLE = 26;
const SIZE_H1 = 30;
const SIZE_H2 = 24;
const SIZE_H3 = 22;
const SIZE_BODY = 22;
const SIZE_SMALL = 18;
const SIZE_CAPTION = 16;

const BRAND_BLUE = "123B5D";
const BRAND_LIGHT = "EAF2F8";
const ACCENT = "B04A1F";
const TEXT_GRAY = "5D6D7E";

const THIN = { style: BorderStyle.SINGLE, size: 1, color: "D5D8DC" };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

function run(text, extra = {}) {
  return new TextRun({ text, font: FONT_BODY, size: SIZE_BODY, ...extra });
}

function mono(text, extra = {}) {
  return new TextRun({ text, font: FONT_MONO, size: SIZE_SMALL, color: BRAND_BLUE, ...extra });
}

function bold(text, extra = {}) {
  return new TextRun({ text, font: FONT_BODY, size: SIZE_BODY, bold: true, ...extra });
}

function body(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [run(runs)];
  return new Paragraph({
    spacing: { after: 150, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
    ...opts,
    children,
  });
}

function bullet(text) {
  return body(`- ${text}`, { indent: { left: 360 } });
}

function h1(text) {
  return new Paragraph({
    spacing: { before: 420, after: 180 },
    children: [new TextRun({ text, font: FONT_HEADING, size: SIZE_H1, bold: true, color: BRAND_BLUE })],
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { before: 300, after: 140 },
    children: [new TextRun({ text, font: FONT_HEADING, size: SIZE_H2, bold: true, color: BRAND_BLUE })],
  });
}

function equation(label, text) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    alignment: AlignmentType.CENTER,
    indent: { left: 720, right: 720 },
    children: [
      new TextRun({ text: `(${label})  `, font: FONT_BODY, size: SIZE_SMALL, bold: true, color: TEXT_GRAY }),
      new TextRun({ text, font: FONT_MONO, size: SIZE_BODY, italics: true }),
    ],
  });
}

function provTag(label) {
  return new Paragraph({
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text: `[${label}]`, font: FONT_BODY, size: SIZE_SMALL, bold: true, color: '666666', italics: true })],
  });
}

function noteBox(title, text) {
  return new Table({
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9360, type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 5, color: ACCENT },
              bottom: THIN,
              left: THIN,
              right: THIN,
            },
            shading: { fill: "FEF5E7", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                spacing: { after: 50 },
                children: [new TextRun({ text: title, font: FONT_HEADING, size: SIZE_H3, bold: true, color: ACCENT })],
              }),
              new Paragraph({
                spacing: { after: 70 },
                children: [new TextRun({ text, font: FONT_BODY, size: SIZE_BODY })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    shading: { fill: BRAND_LIGHT, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text, font: FONT_BODY, size: SIZE_SMALL, bold: true, color: BRAND_BLUE })],
      }),
    ],
  });
}

function dataCell(text, width, options = {}) {
  const children = Array.isArray(text)
    ? text
    : [new TextRun({ text, font: FONT_BODY, size: SIZE_SMALL, ...options })];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ spacing: { after: 40 }, children })],
  });
}

const sections = [];

sections.push(
  new Paragraph({ spacing: { before: 3000 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "ACADEMIC TECHNICAL PAPER", font: FONT_HEADING, size: SIZE_SMALL, bold: true, color: ACCENT, allCaps: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({
      text: "Passive Resonance Scan Mode for DoneWell Audio",
      font: FONT_HEADING,
      size: SIZE_TITLE,
      bold: true,
      color: BRAND_BLUE,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({
      text: "Repository-specific implementation specification, measurement-theoretic boundary, and attached prompt library",
      font: FONT_HEADING,
      size: SIZE_SUBTITLE,
      italics: true,
      color: TEXT_GRAY,
    })],
  }),
  new Paragraph({ spacing: { before: 540 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: "DoneWell Audio v0.8.0", font: FONT_BODY, size: SIZE_BODY, bold: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: "March 23, 2026", font: FONT_BODY, size: SIZE_BODY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: "Prepared for repository design and implementation review", font: FONT_BODY, size: SIZE_SMALL, color: TEXT_GRAY })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

sections.push(h1("Abstract"));
sections.push(body("This paper specifies a new Passive Resonance Scan mode for DoneWell Audio (DWA). The proposed mode is not a rebranding of the existing feedback detector. It is a distinct measurement product surface that reuses the repository's strongest front-end signal-processing components while explicitly disabling mathematically invalid room-analysis claims. The core thesis is simple: a passive microphone-only pipeline cannot identify a room transfer function, but it can validly catalog persistent narrowband resonances and derive low-frequency modal hypotheses."));
sections.push(body("The specification is repository-specific. It maps the proposal onto the existing codebase: peak extraction in lib/dsp/feedbackDetector.ts, room-mode and inverse-dimension utilities in lib/dsp/acousticUtils.ts, worker orchestration in lib/dsp/dspWorker.ts, transport behavior in hooks/useDSPWorker.ts, and export scaffolding in types/calibration.ts. The design preserves what is already physically meaningful, disables feedback-only priors and gates, and adds a new measurement intent boundary so the product stops conflating safety-oriented feedback alerts with passive acoustic observation."));
sections.push(body("The result is a coherent implementation target: a passive resonance scout that reports stable peaks, modal-series candidates, and dimension hypotheses with explicit confidence and limitations. The paper also attaches a prompt library intended for AI-assisted implementation in this repository."));

sections.push(h1("Table of Contents"));
[
  "1. Introduction and design objective",
  "2. Measurement-theoretic boundary",
  "3. Repository audit: what to keep, disable, and add",
  "4. Formal definition of Passive Resonance Scan mode",
  "5. Proposed repository architecture",
  "6. Proposed signal model and scoring",
  "7. File-by-file implementation crosswalk",
  "8. Validation protocol and acceptance criteria",
  "9. Risks, limitations, and non-goals",
  "10. Attached prompt library",
  "References",
].forEach((entry) => {
  sections.push(body(entry, { spacing: { after: 80 }, indent: { left: 360 } }));
});
sections.push(new Paragraph({ children: [new PageBreak()] }));

sections.push(h1("1. Introduction and Design Objective"));
sections.push(body("DoneWell Audio is currently a browser-based real-time feedback detector. Its active pipeline is optimized for a safety-oriented question: is this stable narrowband event likely to be acoustic feedback right now? The user request that motivated this paper is different. The desired workflow is a passive room-facing mode used with increased sensitivity, room measurements set to none, and no microphone-to-loudspeaker feedback loop in the room."));
sections.push(body("That operating condition exposes an architectural mismatch. When no electroacoustic loop is present, the current system still produces high-confidence outputs because the existing mathematics is tuned to stable spectral events, not to room-only identifiability. The repository therefore needs a separate product mode whose claims, outputs, and data path match what the observable signal can support."));
sections.push(noteBox(
  "Design objective",
  "Create a first-class Passive Resonance Scan mode that reuses the repository's peak extraction and room-mode utilities, disables feedback semantics, and reports only what a passive microphone can support: stable resonance observations, modal-series candidates, and dimension hypotheses."
));

sections.push(h1("2. Measurement-Theoretic Boundary"));
sections.push(body("The central measurement problem is observability. In a passive capture, the microphone receives only the aggregate room signal. The source excitation is unknown. Therefore the room transfer function is not separately identifiable."));
sections.push(equation("1", "y(t) = x(t) * h_speaker(t) * h_room(t) * h_mic(t) + n(t)"));
sections.push(body("In the frequency domain, the same statement becomes"));
sections.push(equation("2", "Y(f) = X(f) S(f) R(f) M(f) + N(f)"));
sections.push(body("Without a known or recorded reference X(f), one cannot uniquely recover R(f). Any estimate of the room transfer function is confounded by source spectrum, loudspeaker response, and microphone response. This is why a passive-microphone workflow must not claim transfer-function measurement, RT60, EDT, T20, T30, C50, or C80. Those require controlled excitation or a reference channel."));
sections.push(body("What is observable is a weaker, but still useful, object: the set of persistent narrowband resonances present in the captured field. If a low-frequency peak is sharp, persistent, repeatable, and compatible with a harmonic spacing model, it is a valid passive resonance observation even if the room contribution cannot be separated from the source chain."));
sections.push(equation("3", "P = { (f_i, A_i, Q_i, T_i, D_i, R_i) }"));
sections.push(body("Here P is a catalog of passive observations. Each tuple contains frequency, amplitude, Q estimate, persistence, drift, and repeatability. This paper argues that P is the correct primary output of Passive Resonance Scan mode."));

sections.push(h1("3. Repository Audit: What to Keep, Disable, and Add"));
sections.push(h2("3.1 Keep"));
sections.push(body([bold("Peak extraction front end. "), run("The main-thread scan in "), mono("lib/dsp/feedbackDetector.ts"), run(" (_scanAndProcessPeaks around lines 1190-1308 and _registerPeak around lines 1317-1458) already provides local maxima, prominence, quadratic interpolation, Q estimation, PHPR, and persistence. This is the right front end for resonance observation even when classifier logic is disabled.")]));
sections.push(provTag("Verified from code — feedbackDetector.ts:1190-1308"));
sections.push(body([bold("Stable-peak tracking. "), run("The persistence counter in "), mono("feedbackDetector.ts:1770"), run(" and track history in "), mono("lib/dsp/trackManager.ts"), run(" provide the temporal skeleton required for passive observation windows.")]));
sections.push(provTag("Verified from code — feedbackDetector.ts:1770"));
sections.push(provTag("Verified from code — trackManager.ts"));
sections.push(body([bold("Room-physics utilities. "), run("The repository already includes "), mono("calculateSchroederFrequency()"), run(" at "), mono("acousticUtils.ts:38"), run(", "), mono("getFrequencyBand()"), run(" at "), mono("acousticUtils.ts:59"), run(", "), mono("calculateRoomModes()"), run(" at "), mono("acousticUtils.ts:587"), run(", and "), mono("estimateRoomDimensions()"), run(" at "), mono("acousticUtils.ts:1018"), run(". These are the core mathematical assets for a passive scout.")]));
sections.push(provTag("Verified from code — acousticUtils.ts:587, 1018"));
sections.push(body([bold("Existing room-measurement scaffold. "), run("The worker already owns "), mono("startRoomMeasurement"), run(", "), mono("stopRoomMeasurement"), run(", "), mono("roomMeasurementProgress"), run(", and "), mono("roomEstimate"), run(" message variants in "), mono("lib/dsp/dspWorker.ts"), run(". That scaffold should be elevated into a dedicated mode rather than left as a hidden branch.")]));
sections.push(provTag("Verified from code — dspWorker.ts:323-341"));
sections.push(body([bold("Export types. "), run("The calibration types in "), mono("types/calibration.ts"), run(" already model room profiles, ambient capture, spectrum snapshots, and room-dimension estimates. Passive Resonance Scan should extend this family rather than invent a new export subsystem.")]));
sections.push(provTag("Verified from code — types/calibration.ts"));

sections.push(h2("3.2 Disable"));
sections.push(body([bold("Feedback priors and severity labels. "), run("The priors at "), mono("lib/dsp/classifier.ts:38-40"), run(" and the feedback/whistle/instrument label logic beginning at "), mono("classifier.ts:214"), run(" are invalid for a passive room-facing mode.")]));
sections.push(body([bold("Fusion verdicting and confidence. "), run("The fusion posterior in "), mono("lib/dsp/algorithmFusion.ts:481-685"), run(" answers a different question: how likely is feedback? It must not be reused as a room metric.")]));
sections.push(body([bold("Feedback-specific suppressive gates. "), run("IHR and PTMR post-fusion gates in "), mono("algorithmFusion.ts:658-665"), run(", plus formant, chromatic, and mains-hum logic in "), mono("classifier.ts:165"), run(" and downstream classifier helpers, are anti-false-positive controls for feedback detection, not passive measurement math.")]));
sections.push(body([bold("Content-type weighting. "), run("The content-dependent selection path in "), mono("algorithmFusion.ts:190-234"), run(" and "), mono("detectContentType()"), run(" at "), mono("algorithmFusion.ts:822"), run(" should not change the meaning of passive measurement output.")]));
sections.push(body([bold("Frame dropping. "), run("Backpressure in "), mono("hooks/useDSPWorker.ts:278-317"), run(" intentionally drops frames. That is acceptable for real-time feedback advisories and inappropriate for scan completeness. Passive mode needs an observation-complete policy." )]));

sections.push(h2("3.3 Add"));
sections.push(body([bold("A new intent boundary. "), run("The repository currently overloads "), mono("DetectorSettings.mode"), run(" for live-sound scenarios such as speech, worship, liveMusic, and ringOut. Passive Resonance Scan should not be added to that enum. Instead, add "), mono("analysisIntent"), run(" so measurement intent is separated from operating preset.")]));
sections.push(body([bold("Passive-specific types. "), run("Add observation, series, result, progress, and export interfaces so the worker can return resonance products without going through Advisory objects.")]));
sections.push(body([bold("A passive worker path. "), run("The worker should branch early by intent. In passive mode it should aggregate observations, compute modal hypotheses, and return scan artifacts without constructing feedback classifications or EQ advisories.")]));

sections.push(h1("4. Formal Definition of Passive Resonance Scan Mode"));
sections.push(body("Passive Resonance Scan mode is defined as a microphone-only, non-reference, non-invasive observation mode whose outputs are limited to persistent resonance hypotheses. It is not an active room-measurement mode and must not claim speaker-independent room response."));
sections.push(equation("4", "analysisIntent in { feedback, passiveResonanceScan, activeRoomMeasurement }"));
sections.push(body("In repository terms, this means the existing live-sound mode enum remains intact, while measurement intent becomes an orthogonal dimension in DetectorSettings."));
sections.push(body([bold("Primary outputs"), run(": stable-peak catalog, modal-series candidates, optional dimension hypothesis, exportable evidence window, and explicit limitation notes.")]));
sections.push(body([bold("Secondary outputs"), run(": low-frequency resonance map, candidate EQ exploration targets, and scan-completeness metadata.")]));
sections.push(body([bold("Non-goals"), run(": feedback verdicts, whistle/instrument labels, RT60 metrics, transfer functions, speaker-neutral room-response plots, and definitive dimension claims without cross-validation.")]));

sections.push(h1("5. Proposed Repository Architecture"));
sections.push(h2("5.1 Top-level setting and message split"));
sections.push(body([bold("Settings. "), run("Add "), mono("analysisIntent"), run(" to "), mono("DetectorSettings"), run(" in "), mono("types/advisory.ts"), run(" with default "), mono("'feedback'"), run(". This cleanly separates the new passive mode from the existing live-sound presets.")]));
sections.push(body([bold("Worker messages. "), run("Add "), mono("startPassiveScan"), run(", "), mono("stopPassiveScan"), run(", "), mono("passiveScanProgress"), run(", and "), mono("passiveScanResult"), run(" beside the current room-measurement messages in "), mono("lib/dsp/dspWorker.ts"), run(". The existing room-measurement code can be aliased or retired after the dedicated path is complete.")]));

sections.push(h2("5.2 Passive worker branch"));
sections.push(body("The worker should branch before fusion and classification. A defensible order is:"));
sections.push(bullet("Track peaks exactly as today so the front end and track manager remain shared."));
sections.push(bullet("If analysisIntent === passiveResonanceScan, bypass fuseAlgorithmResults(), classifyTrack(), classifyTrackWithAlgorithms(), shouldReportIssue(), and generateEQAdvisory()."));
sections.push(bullet("Accumulate observations into a passive scan state object keyed by quantized frequency and track id."));
sections.push(bullet("Run series extraction and optional inverse-dimension estimation on stable low-frequency observations only."));
sections.push(bullet("Emit passiveScanProgress and passiveScanResult messages instead of Advisory payloads."));

sections.push(h2("5.3 No-drop transport policy"));
sections.push(body("Passive mode must not inherit the current drop-on-busy behavior. The easiest repository-compatible strategy is a bounded queue or decimated observation window in hooks/useDSPWorker.ts. The queue need not preserve every full-resolution FFT forever, but it must preserve the observation window semantics needed to compute scan completeness."));
sections.push(body([bold("Recommended rule. "), run("In passive mode, process every stabilized peak event and every Nth spectral snapshot even when the worker is busy. This is far cheaper than trying to preserve every 50 fps frame, while still eliminating the current completeness failure mode.")]));

sections.push(h2("5.4 Passive result model"));
const resultCols = [2200, 7160];
sections.push(new Table({
  columnWidths: resultCols,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("Type", resultCols[0]),
        headerCell("Proposed fields and role", resultCols[1]),
      ],
    }),
    new TableRow({
      children: [
        dataCell("PassiveResonanceObservation", resultCols[0]),
        dataCell("frequencyHz, qEstimate, prominenceDb, firstSeenAt, lastSeenAt, persistenceMs, driftCentsStd, occurrenceCount, repeatability, observationConfidence", resultCols[1]),
      ],
    }),
    new TableRow({
      children: [
        dataCell("PassiveResonanceSeries", resultCols[0]),
        dataCell("fundamentalHz, dimensionM, harmonicsMatched, peakFrequencies, residualErrorHz, seriesConfidence", resultCols[1]),
      ],
    }),
    new TableRow({
      children: [
        dataCell("PassiveScanResult", resultCols[0]),
        dataCell("observations, candidateSeries, dimensionEstimate, scanCompleteness, lowFrequencyCoverageHz, limitations, startedAt, endedAt", resultCols[1]),
      ],
    }),
    new TableRow({
      children: [
        dataCell("PassiveScanExport", resultCols[0]),
        dataCell("room profile metadata, ambient snapshot, result payload, evidence windows, settings, and app version for reproducibility", resultCols[1]),
      ],
    }),
  ],
}));

sections.push(h1("6. Proposed Signal Model and Scoring"));
sections.push(body("A passive mode still needs ranking. The mistake would be to reuse feedbackProbability. Instead, define a new observation-confidence score tied to resonance-like behavior, not to feedback semantics."));
sections.push(body("This paper proposes a simple weighted observation score for each stable peak. The score is explicitly a proposed addition, not a description of the current code."));
sections.push(equation("5", "C_obs = clamp(0.25 Pn + 0.25 Qn + 0.20 Tn + 0.15 (1 - Dn) + 0.15 Rn, 0, 1)"));
sections.push(provTag("ANALYTICAL ESTIMATE — weights not empirically validated"));
sections.push(body("The observation-confidence weights (0.25, 0.25, 0.20, 0.15, 0.15) are proposed starting values. These weights have not been validated against labeled passive-scan sessions. Actual weight optimization requires ground-truth data from rooms with known resonance characteristics."));
sections.push(body("Where Pn is normalized prominence, Qn is normalized Q above a minimum acceptable bound, Tn is normalized persistence, Dn is normalized drift, and Rn is repeatability across the scan window. A peak may only be elevated to observation status if it passes hard admissibility criteria."));
sections.push(equation("6", "f <= 500 Hz,  Q >= 10,  persistence >= 500 ms"));
sections.push(body("The low-frequency cap follows the existing ROOM_ESTIMATION constant set in lib/dsp/constants.ts. Above the Schroeder region, passive modal interpretation becomes weaker and should not drive dimension hypotheses."));
sections.push(body("Series confidence should then be computed from harmonic support and forward validation."));
sections.push(equation("7", "C_series = clamp(0.45 H + 0.35 (1 - E_res) + 0.20 C_cov, 0, 1)"));
sections.push(provTag("ANALYTICAL ESTIMATE — weights not empirically validated"));
sections.push(body("The series-confidence weights (0.45, 0.35, 0.20) are proposed starting values. Optimal weights require ground-truth modal data from rooms with known dimensions."));
sections.push(body("Here H denotes harmonic support, E_res is normalized residual error against forward-predicted modes, and C_cov is low-frequency coverage. The existing estimateRoomDimensions() utility is suitable as a hypothesis engine so long as the output is labeled estimated or hypothesized rather than measured."));
sections.push(noteBox(
  "Important naming rule",
  "Passive Resonance Scan should report observed, estimated, or hypothesized quantities. It must never label passive outputs as measured room response unless a future active-measurement workflow adds controlled excitation and a reference channel."
));

sections.push(h1("7. File-by-File Implementation Crosswalk"));
const fileCols = [2600, 2200, 4560];
sections.push(new Table({
  columnWidths: fileCols,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("File", fileCols[0]),
        headerCell("Change class", fileCols[1]),
        headerCell("Repository-specific implementation action", fileCols[2]),
      ],
    }),
    ...[
      ["types/advisory.ts", "Type additions", "Add analysisIntent and passive worker message/result types or move them to a dedicated passive-scan type module."],
      ["types/calibration.ts", "Export model", "Add PassiveScanExport, PassiveResonanceObservation, and PassiveScanResult so passive mode uses the repository's existing export conventions."],
      ["hooks/useDSPWorker.ts", "Transport", "Replace drop-on-busy with a passive-mode queue or decimated snapshot policy, and surface passive progress/result messages to React state."],
      ["lib/dsp/dspWorker.ts", "Core branch", "Branch by analysisIntent before fusion/classification; maintain passive scan state; emit passiveScanProgress and passiveScanResult."],
      ["lib/dsp/feedbackDetector.ts", "Shared front end", "Keep the existing scan, registration, Q, PHPR, and persistence logic; optionally expose a passive-scan-friendly callback path if current DetectedPeak payloads are insufficient."],
      ["lib/dsp/trackManager.ts", "Temporal state", "Retain track history, but expose drift and repeatability features for passive observation confidence instead of severity labels."],
      ["lib/dsp/acousticUtils.ts", "Physics reuse", "Reuse calculateRoomModes() and estimateRoomDimensions(); add helper functions for passive residual error and coverage metrics if needed."],
      ["components/analyzer/*", "UI", "Create a passive-scan view that shows stable peaks, series candidates, dimension hypotheses, and limitations instead of advisory cards."],
      ["tests/dsp/* and lib/dsp/__tests__/*", "Verification", "Add synthetic axial-mode fixtures, no-feedback passive runs, completeness tests, and naming-accuracy assertions."],
    ].map((row) => new TableRow({
      children: [
        dataCell([mono(row[0])], fileCols[0]),
        dataCell(row[1], fileCols[1]),
        dataCell(row[2], fileCols[2]),
      ],
    })),
  ],
}));

sections.push(h1("8. Validation Protocol and Acceptance Criteria"));
sections.push(h2("8.1 Unit and integration tests"));
sections.push(bullet("Synthetic axial-mode fixtures should validate that passive mode recovers stable series and dimension hypotheses from controlled low-frequency harmonic data."));
sections.push(bullet("Passive mode must emit zero Advisory objects and zero feedback severity labels during a scan session."));
sections.push(bullet("Completeness tests must prove that passive-mode observation windows do not silently drop stabilized peak events in the way the current busy worker path does."));
sections.push(bullet("Mixed-content tests must show that passive mode reports observations and limitations rather than overclaiming room transfer or RT60 metrics."));
sections.push(bullet("Forward validation should compare estimateRoomDimensions() outputs against calculateRoomModes() residual error on synthetic rooms already covered by lib/dsp/__tests__/roomEstimation.test.ts."));

sections.push(h2("8.2 Acceptance criteria"));
sections.push(body([bold("AC-1. "), run("A passive scan session produces only passive scan artifacts, never feedback advisories.")]));
sections.push(body([bold("AC-2. "), run("The UI presents stable-peak and modal-series outputs with explicit labels such as observed, estimated, and hypothesized.")]));
sections.push(body([bold("AC-3. "), run("The transport path records all stabilized observation events during the scan window.")]));
sections.push(body([bold("AC-4. "), run("Dimension output is gated by confidence and forward residual error; low-confidence runs are reported as inconclusive rather than speculative measurements.")]));
sections.push(body([bold("AC-5. "), run("Repository tests cover the passive path with deterministic synthetic fixtures and maintain the existing build gate." )]));

sections.push(h1("9. Risks, Limitations, and Non-Goals"));
sections.push(body("Passive Resonance Scan remains a passive mode. It cannot separate room response from source coloration. It cannot derive a full transfer function. It cannot estimate broadband decay parameters without a valid excitation model. Its strongest use case is low-frequency resonance scouting under real program conditions, not standards-grade room measurement."));
sections.push(body("The current repository already contains an experimental inverse solver and a hidden room-measurement scaffold. This is an advantage, but it also creates a product risk: if the new mode is framed carelessly, users will infer stronger claims than the mathematics permits. The implementation spec therefore treats labeling accuracy as a first-class requirement, not as a documentation afterthought."));
sections.push(body("A future activeRoomMeasurement intent can reuse the same export surface while adding the missing observables: controlled excitation, reference capture, transfer-function estimation, and impulse-response metrics. That future work should be described as additive, not as something the passive mode already approximates."));

sections.push(h1("10. Attached Prompt Library"));
sections.push(body("The attached implementation prompt library is provided as a repository artifact at docs/papers/2026-03-23-passive-resonance-scan-prompt-library.md. It contains phased prompts for introducing the intent boundary, building the passive worker path, adding types and exports, updating the UI, and validating the mode under deterministic tests."));
const promptCols = [1300, 3000, 5060];
sections.push(new Table({
  columnWidths: promptCols,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("ID", promptCols[0]),
        headerCell("Prompt topic", promptCols[1]),
        headerCell("Primary repository target", promptCols[2]),
      ],
    }),
    ...[
      ["PRS-1", "Introduce analysisIntent", "types/advisory.ts, default settings, controls"],
      ["PRS-2", "Branch the worker into passive mode", "lib/dsp/dspWorker.ts, worker message types"],
      ["PRS-3", "Define passive observation and export types", "types/calibration.ts and related exports"],
      ["PRS-4", "Install no-drop passive transport", "hooks/useDSPWorker.ts"],
      ["PRS-5", "Add passive observation scoring", "lib/dsp/trackManager.ts, lib/dsp/acousticUtils.ts"],
      ["PRS-6", "Build passive results UI", "components/analyzer/* and contexts"],
      ["PRS-7", "Add synthetic tests and completeness checks", "tests/dsp/* and lib/dsp/__tests__/*"],
      ["PRS-8", "Document limitations and naming rules", "docs plus in-app labels"],
    ].map(([id, topic, target]) => new TableRow({
      children: [
        dataCell([mono(id)], promptCols[0]),
        dataCell(topic, promptCols[1]),
        dataCell(target, promptCols[2]),
      ],
    })),
  ],
}));

sections.push(new Paragraph({ children: [new PageBreak()] }));
sections.push(h1("References"));
[
  "[1] Kuttruff, H. Room Acoustics, 6th ed. CRC Press, 2016.",
  "[2] Hopkins, C. Sound Insulation. Butterworth-Heinemann, 2007.",
  "[3] Schroeder, M.R. The Schroeder frequency revisited. JASA, 1996.",
  "[4] ISO 3382-1:2009. Acoustics - Measurement of room acoustic parameters.",
  "[5] van Waterschoot, T., Moonen, M. Fifty Years of Acoustic Feedback Control. Proceedings of the IEEE, 2011.",
  "[6] Fisher, N.I. Statistical Analysis of Circular Data. Cambridge University Press, 1993.",
  "[7] DoneWell Audio repository reference: lib/dsp/feedbackDetector.ts.",
  "[8] DoneWell Audio repository reference: lib/dsp/algorithmFusion.ts.",
  "[9] DoneWell Audio repository reference: lib/dsp/classifier.ts.",
  "[10] DoneWell Audio repository reference: lib/dsp/acousticUtils.ts.",
  "[11] DoneWell Audio repository reference: lib/dsp/dspWorker.ts.",
  "[12] DoneWell Audio repository reference: hooks/useDSPWorker.ts.",
  "[13] DoneWell Audio repository reference: types/calibration.ts.",
  "[14] DoneWell Audio repository reference: lib/dsp/__tests__/roomEstimation.test.ts.",
].forEach((ref) => {
  sections.push(new Paragraph({
    spacing: { after: 80, line: 260 },
    indent: { left: 720, hanging: 720 },
    children: [new TextRun({ text: ref, font: FONT_BODY, size: SIZE_SMALL })],
  }));
});

sections.push(new Paragraph({ children: [new PageBreak()] }));
sections.push(new Paragraph({ spacing: { before: 4600 }, children: [] }));
sections.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
  children: [new TextRun({ text: "DoneWell Audio", font: FONT_HEADING, size: SIZE_TITLE, bold: true, color: BRAND_BLUE })],
}));
sections.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 180 },
  children: [new TextRun({ text: "Passive Resonance Scan Mode Paper", font: FONT_BODY, size: SIZE_SUBTITLE, italics: true, color: TEXT_GRAY })],
}));
sections.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "Repository-specific specification and implementation prompt attachment", font: FONT_BODY, size: SIZE_SMALL, color: TEXT_GRAY })],
}));

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT_BODY, size: SIZE_BODY },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          pageNumbers: { start: 1 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "DoneWell Audio - Passive Resonance Scan Paper", font: FONT_BODY, size: SIZE_SMALL, italics: true, color: "9AA1A8" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", font: FONT_BODY, size: SIZE_CAPTION, color: "9AA1A8" }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT_BODY, size: SIZE_CAPTION, color: "9AA1A8" }),
                new TextRun({ text: " of ", font: FONT_BODY, size: SIZE_CAPTION, color: "9AA1A8" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_BODY, size: SIZE_CAPTION, color: "9AA1A8" }),
              ],
            }),
          ],
        }),
      },
      children: sections,
    },
  ],
});

const outputPath = process.argv[2] || path.resolve(__dirname, "2026-03-23-passive-resonance-scan-paper.docx");

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Passive Resonance Scan paper written to ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log("10 sections, 7 equations, 3 tables, repository crosswalk, prompt-library attachment");
});
