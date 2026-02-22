# DoneWellAudio

**DoneWellAudio** is a Windows 11 desktop app that listens to a selected microphone input, detects likely PA acoustic feedback, and suggests analog EQ settings (low cut, low shelf, bell, high shelf).

> The app **does not** control hardware. It **only suggests** settings.

## What you get in this repo (MVP scaffold)

- **Device selection in-app**
- **Live monitor** analysis (no audio playback)
- **Freeze** results when confidence stays high enough for long enough
- **EQ suggestions** displayed like: `Band 1: 630 Hz, cut -6 dB, Q 8.0`
- Bell band count is user-selectable **1–7**

## Quickstart (Windows 11)

### Prereqs
- Windows 11
- .NET SDK (recommended: .NET 8)
- A microphone or audio interface input

### Run the WPF app
1. Open `DoneWellAudio.sln` in Visual Studio 2022 (or later) **OR** use the CLI below.
2. Set `DoneWellAudio.Gui.Wpf` as the startup project.
3. Press **Start**.

### Run the CLI (useful for quick tests)
```powershell
cd src\DoneWellAudio.Cli
dotnet run -- --list-devices
dotnet run -- --device-index 0 --bell-bands 3
```

## Configure your analog EQ (no guessing)
Edit:
- `config/eq_profile.example.json`
- `config/detector_settings.example.json`

Copy them to:
- `config/eq_profile.json`
- `config/detector_settings.json`

The app will load `.json` if present, otherwise it falls back to `*.example.json`.

## Repo workflow (recommended)
This repo is designed for a **single-writer agent** (Google Jules) + **reviewer agents** (Gemini / ChatGPT) with GitHub as the gatekeeper.

See:
- `AGENTS.md` (rules and canonical commands)
- `docs/how_to_work_with_jules.md`
- `.github/ISSUE_TEMPLATE/feature.yml`

## Safety / hearing note
Acoustic feedback can be loud. When testing, keep levels low and protect your hearing.

## License
Choose a license for your project before public release.
See `LICENSE-CHOOSE.md`.
