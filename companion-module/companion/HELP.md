# DoneWell Audio — Companion Module

This module receives real-time feedback detection and EQ recommendations from the [DoneWell Audio](https://donewellaudio.com) PWA.

## How It Works

1. DoneWell Audio runs in your browser and detects acoustic feedback
2. When feedback is detected, DoneWell sends the EQ recommendation to this module
3. The module exposes the recommendation as Companion **variables**
4. You wire those variables to your mixer module (X32, Yamaha, etc.) using Companion triggers

## Variables

| Variable | Description |
|----------|-------------|
| `peq_frequency` | PEQ center frequency in Hz |
| `peq_q` | PEQ quality factor |
| `peq_gain` | PEQ gain in dB (negative = cut) |
| `peq_type` | Filter type (bell, notch, HPF, LPF, highShelf, lowShelf) |
| `geq_band` | Nearest GEQ band center in Hz |
| `geq_band_index` | GEQ fader index (0-30) |
| `geq_gain` | Suggested GEQ fader position in dB |
| `note` | Musical pitch (e.g., D#5 +12c) |
| `severity` | Detection severity (RUNAWAY, GROWING, RESONANCE, POSSIBLE_RING) |
| `confidence` | Detection confidence (0-1) |
| `pending_count` | Number of unacknowledged advisories |

## Setup

1. Add the DoneWell Audio module in Companion
2. In the DoneWell Audio PWA, enable Companion integration in Advanced settings
3. Set the Companion URL (default: `http://localhost:8000`)
4. Create triggers in Companion to wire DoneWell variables to your mixer module

## Example Trigger

"When a new advisory arrives from DoneWell, set PEQ band 1 on X32 channel 1 to `$(donewell:peq_frequency)` Hz, Q `$(donewell:peq_q)`, gain `$(donewell:peq_gain)` dB."
