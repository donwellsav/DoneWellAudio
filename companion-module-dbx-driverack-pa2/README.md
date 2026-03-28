# companion-module-dbx-driverack-pa2

Bitfocus Companion module for the **dbx DriveRack PA2** loudspeaker management system. Full Ethernet control with live DSP metering — including the first public access to the PA2's 31-band RTA spectrum data.

## Highlights

- **Complete parameter control** — every PA2 setting available as Companion actions, feedbacks, and variables
- **Live RTA spectrum** — 31-band frequency analysis from the PA2's measurement mic, updating at 5Hz
- **Live meters** — input/output levels, compressor gain reduction, limiter gain reduction
- **200+ Stream Deck presets** — organized for sound engineers: show control, macros, GEQ faders, RTA visualization, panic buttons
- **Smart macros** — Speech Mode, Music Mode, DJ Handoff, Band Changeover, Auto-EQ from RTA, and more
- **HTTP API** — full control from web apps (donewellaudio.com integration)
- **Burst mode** — GEQ changes apply in under 1ms
- **Real-time subscriptions** — PA2 pushes state changes, no polling needed

## Quick Start

1. Connect PA2 to your network via Ethernet
2. In Companion, add the **dbx DriveRack PA2** module
3. Enter IP address (find it at PA2 front panel: Utility > System Info)
4. Module auto-connects and discovers your PA2's configuration

For development: set `C:\projects` as your Developer modules path in the Companion launcher settings.

## Requirements

- Bitfocus Companion 4.2+
- dbx DriveRack PA2 with firmware 1.2.0.1
- Ethernet connection (not USB)
- Node.js 22 (bundled with Companion)
- Yarn 4 (for development)

## Documentation

| Document | Description |
|----------|-------------|
| [companion/HELP.md](companion/HELP.md) | User guide (shown in Companion UI) |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | PA2 Ethernet protocol reference |
| [docs/DSP-METERS.md](docs/DSP-METERS.md) | DSP meter interface discovery (port 19274) |
| [docs/HTTP-API.md](docs/HTTP-API.md) | HTTP API reference for web app integration |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module internals for contributors |
| [docs/PA2-Auto-Notch-Audit-Summary.md](docs/PA2-Auto-Notch-Audit-Summary.md) | Concise implementation-facing summary of the auto-notch audit |
| [docs/PA2-Auto-Notch-Code-Audit.md](docs/PA2-Auto-Notch-Code-Audit.md) | Code-derived audit of the current auto-notch detection-to-cut path |
| [output/pdf/PA2-Auto-Notch-Code-Audit.pdf](output/pdf/PA2-Auto-Notch-Code-Audit.pdf) | PDF export of the current auto-notch audit |

## The DSP Discovery

On 2026-03-26, we discovered that the PA2 exposes a second TCP interface on **port 19274** — a DSP debug console built on the Stockbridge framework. This provides real-time access to:

- 31-band RTA spectrum (the data shown on the PA2's display)
- Input and output level meters
- Compressor and limiter gain reduction meters

This data was previously believed to be inaccessible via Ethernet. No other PA2 tool, library, or community project has documented this interface.

See [docs/DSP-METERS.md](docs/DSP-METERS.md) for the full technical reference.

## License

MIT
