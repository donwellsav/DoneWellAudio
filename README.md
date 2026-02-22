# DoneWellAudio

> **Mission:** Make feedback identification and analog EQ correction fast, calm, and repeatable for live sound operators.

**DoneWellAudio** is a Windows 11 desktop application designed to assist live sound engineers by detecting acoustic feedback and suggesting precise analog EQ adjustments. It listens to a selected microphone input, analyzes the audio stream for feedback characteristics (narrow, prominent, persistent peaks), and provides actionable recommendations (Band, Frequency, Cut dB, Q) tailored to your specific analog equalizer profile.

**Key Features (MVP):**
- **Live Monitor Analysis:** Real-time spectral analysis of microphone input (no audio playback/routing).
- **Feedback Detection:** Identifies feedback candidates based on prominence, narrowness (Q), persistence, and stability.
- **Analog EQ Suggestions:** Translates detections into knob-ready moves: `Band 1: 630 Hz, cut -6 dB, Q 8.0`.
- **Configurable Workflow:** User-selectable bell band count (1-7) and adjustable detector sensitivity.
- **Freeze Mode:** Automatically freezes results when confidence thresholds are met, allowing for stable adjustment.
- **Profile-Driven:** No guessing—EQ capabilities (gain range, Q limits) are defined in JSON configuration files.

---

## Quickstart

### Prerequisites
- **OS:** Windows 11
- **Runtime:** .NET SDK (recommended: .NET 8)
- **Hardware:** A microphone or audio interface input

### Installation & Running
1. **Clone the Repository:**
   ```powershell
   git clone https://github.com/donwellsav/DoneWellAudio.git
   cd DoneWellAudio
   ```

2. **Build and Run (Visual Studio):**
   - Open `DoneWellAudio.sln` in Visual Studio 2022 (or later).
   - Set `DoneWellAudio.Gui.Wpf` as the startup project.
   - Press **Start**.

3. **Build and Run (CLI):**
   ```powershell
   # Restore and Build
   dotnet restore DoneWellAudio.sln
   dotnet build DoneWellAudio.sln -c Release

   # Run the CLI (useful for quick diagnostics)
   dotnet run --project src\DoneWellAudio.Cli -- --list-devices
   dotnet run --project src\DoneWellAudio.Cli -- --device-index 0 --bell-bands 3
   ```

---

## Usage Guide

### The Workflow
1. **Select Input:** Choose your measurement microphone from the device dropdown.
2. **Configure Bands:** Select the number of available bell bands on your analog EQ (1-7).
3. **Start Scan:** Press **Start** (Spacebar) to begin monitoring.
4. **Induce Feedback:** Carefully raise the system gain until ringing begins.
5. **Freeze:** The app will automatically **Freeze** (or press 'F') when high-confidence feedback is detected.
6. **Adjust:** Apply the suggested cuts (Frequency, Gain, Q) to your analog EQ.
7. **Rescan:** Press **Rescan** (R) to clear the state and verify the fix.

### Configuration
DoneWellAudio uses JSON files to adapt to your hardware.
- **EQ Profile (`config/eq_profile.json`):** Defines the capabilities of your analog EQ (frequency ranges, gain limits, Q constraints).
  - *Example:* `config/eq_profile.example.json`
- **Detector Settings (`config/detector_settings.json`):** Controls detection sensitivity, update rates, and freeze thresholds.
  - *Example:* `config/detector_settings.example.json`

> **Note:** The app loads `.json` configuration files if present; otherwise, it falls back to the `*.example.json` defaults.

### Tuning Tips
- **False Positives:** If normal program material triggers detection, increase `minProminenceDb` or `minPersistenceFrames` in `detector_settings.json`.
- **Missed Feedback:** If ringing is audible but not detected, lower `minProminenceDb` or reduce `confidenceThreshold`.
- **Unstable Tracking:** If candidates jump around, tighten `maxFrequencyDriftHz`.

---

## Architecture & Engineering

### High-Level Modules
- **`src/DoneWellAudio.Core`:** Pure DSP logic, detection algorithms, and recommendation engine. UI-agnostic and unit-testable.
- **`src/DoneWellAudio.Gui.Wpf`:** Windows Presentation Foundation (WPF) application. Handles device selection, visualization, and user interaction.
- **`src/DoneWellAudio.Cli`:** Command-line interface for headless testing and debugging.
- **`tests/DoneWellAudio.Tests`:** Unit tests ensuring DSP correctness and stability.

### Key Design Rules
1. **DSP Purity:** All signal processing lives in `Core`. The UI is merely a visualization adapter.
2. **Audio Thread Safety:** Audio capture (via NAudio) never blocks on UI operations.
3. **Throttled UI:** Visual updates are decoupled from the audio callback, targeting ~15-20 Hz refresh rates.
4. **Configuration First:** All magic numbers (thresholds, ranges) are extracted to JSON config files.

### Data Flow
`Mic Input` -> `Capture Buffer` -> `FFT & Windowing` -> `Peak Detection` -> `Tracking & Stability Analysis` -> `Confidence Scoring` -> `Candidate Selection` -> `EQ Recommendation Mapping` -> `UI Display`

### DSP Pipeline Details
- **Frame Processing:** Overlapping frames with Hann windowing to reduce spectral leakage.
- **Peak Detection:** Identifies local maxima above a dynamic noise floor (neighborhood baseline).
- **Q Estimation:** Bandwidth estimation using -6dB drop points.
- **Harmonic Penalty:** Reduces confidence for peaks that appear part of a harmonic series (likely music/speech).
- **Freeze Logic:** State machine triggers freeze when top candidate confidence exceeds threshold for $N$ consecutive frames.

---

## Development Workflow

This repository follows a **Single-Writer Agent** workflow:
- **Writer:** Google Jules (AI Agent) authors code via Pull Requests.
- **Reviewers:** Human engineers (and AI assistants like Gemini/ChatGPT) review PRs.
- **Gatekeeper:** GitHub Actions (CI) must pass before merging.

### Canonical Commands
Use these commands to verify the build locally:
```powershell
dotnet restore DoneWellAudio.sln
dotnet build DoneWellAudio.sln -c Release
dotnet test DoneWellAudio.sln -c Release --no-build
```

### Contribution Guidelines
1. **Open an Issue:** Define the problem and acceptance criteria.
2. **Plan:** Use AI (Gemini Deep Think) to create an implementation plan.
3. **Test Plan:** Define how changes will be verified (Unit Tests + Manual Steps).
4. **Execute:** Jules implements the changes.
5. **Review & Merge:** Merge only when CI is green.

See `docs/how_to_work_with_jules.md` and `AGENTS.md` for detailed protocols.

---

## Documentation Index
- **`docs/spec.md`:** Detailed engineering specification and data model.
- **`docs/decisions.md`:** Log of architectural and product decisions.
- **`docs/how_to_work_with_jules.md`:** Workflow guide for working with the AI agent.
- **`AGENTS.md`:** Operational rules and context for the AI agent.
- **`LICENSE-CHOOSE.md`:** License information.

---

## Safety / Hearing Note
**Warning:** Acoustic feedback can be extremely loud and damaging to hearing and equipment.
- Always start testing with low system gain.
- Use hearing protection when inducing feedback.
- Keep a hand on the master fader/mute button at all times.

## License
Please refer to `LICENSE-CHOOSE.md` to select an appropriate license before public release.
