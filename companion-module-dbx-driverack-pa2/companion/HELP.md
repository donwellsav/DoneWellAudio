# dbx DriveRack PA2

Control your dbx DriveRack PA2 loudspeaker management system via Ethernet. Full control of every parameter plus live RTA spectrum, input/output meters, and compressor/limiter gain reduction — features no other PA2 controller provides.

## Setup

1. Connect PA2 to your network via Ethernet cable
2. Find the PA2's IP address: **Utility > System Info** on the front panel
3. In Companion, add the **dbx DriveRack PA2** module
4. Enter the IP address, port (default 19272), and password (default: `administrator`)
5. Module auto-connects, discovers topology, reads all parameters, and starts meter polling

## Features

### Full Parameter Control
Every PA2 parameter is available as actions, feedbacks, and variables:
- **31-Band GEQ** — individual bands, quick curves, flat, enable/disable
- **8-Band PEQ** per output — filter type, frequency, gain, Q, slope, flatten/restore
- **Room EQ / AutoEQ** — Flat, Manual, AutoEQ modes
- **AFS** — Live/Fixed mode, content type, filter count, lift time, clear
- **Compressor** — threshold, gain, ratio, OverEasy
- **Limiters** per output band
- **Crossover** — HP/LP filter types, frequencies, gain, polarity
- **Output Mutes** — all 6 channels with toggle
- **Delays** — input (0-100ms), output per band (0-10ms)
- **Subharmonic Synth** — master, lows, highs
- **Signal Generator** — Off/Pink/White, level
- **RTA** — rate, offset
- **Preset Recall** — switch between presets 1-75

### Live DSP Meters (Exclusive Feature)
Real-time metering via the PA2's DSP interface (port 19274):
- **31-Band RTA Spectrum** — live frequency analysis from the PA2's RTA mic
- **Input Levels** — Left/Right in dB
- **Output Levels** — per output channel in dB
- **Compressor Gain Reduction** — see how hard the compressor is working
- **Limiter Gain Reduction** — see limiter activity
- **Visual bar graphs** using unicode characters on Stream Deck buttons

### Smart Macros
One-press workflow buttons:
- **Show Open** — unmute all, AFS on, compressor on, generator off
- **Show Close** — mute all, generator off, clear AFS live filters
- **Soundcheck** — unmute, enable processing, flatten GEQ
- **Ring Out** — AFS Fixed mode, 12 filters, clear all
- **Panic Mute** — instant silence (mutes + generator off)
- **Safe Unmute** — unmute only if generator is off
- **Speech Mode / Music Mode / DJ Mode / Intermission** — complete scene changes
- **Band Changeover** — mute, flatten everything, reset for next act
- **Monitor Check** — safe pink noise with limiter protection
- **Vocal Focus / De-Mud / De-Ess / Low Cut / Loudness** — EQ sculpting
- **Full Reset** — nuclear option, everything to safe defaults

### RTA-Driven Actions
- **Auto-EQ from RTA** — reads live spectrum, computes inverse GEQ corrections to flatten the room
- **Cut Peak** — finds the loudest RTA band and cuts it
- **Boost Weak** — finds the quietest band and boosts it
- **RTA Snapshot** — save current spectrum for A/B comparison
- **RTA Compare** — show dB difference between live and snapshot

### GEQ Fader Mode
- **Increment/Decrement** — +dB / -dB per press with configurable step size
- **Burst mode** — changes apply in under 1ms

## Stream Deck XL Layout Suggestions

### Page 1: Show Control (4x8)
Row 1: HIGH L, HIGH R, MID L, MID R, LOW L, LOW R, MUTE ALL, SAFE UNMUTE
Row 2: SHOW OPEN, SHOW CLOSE, SOUNDCHECK, RING OUT, PANIC MUTE, GEN OFF, PRESET, STATUS
Row 3: AFS ON, AFS MODE, CLR LIVE, CLR ALL, COMP, LIMITER, PEQ, ROOM EQ
Row 4: Input meter, Output meter, Comp GR, Lim GR, Signal, RTA Peak, [blank], [blank]

### Page 2: GEQ + RTA
Row 1: RTA Lows, RTA Lo-Mid, RTA Hi-Mid, RTA Highs, PEAK, AUTO EQ, CUT PEAK, GEQ FLAT
Row 2-4: GEQ band increment/decrement buttons for key frequencies

### Page 3: Smart Macros
Speech, Music, DJ, Intermission, Changeover, Monitor Check, Full Reset, plus EQ sculpting

## HTTP Bridge

External web apps (like donewellaudio.com) can control the PA2 through Companion's HTTP API.

**Setup:**
1. Enable HTTP API in **Companion Settings > Network**
2. Note your Companion port (default 8000) and instance label
3. URL format: `http://<companion-ip>:<port>/instance/<label>/<endpoint>`

**Key Endpoints:**
- `GET /ping` — connection status
- `GET /loop` — everything: RTA + GEQ + meters + mutes (for polling)
- `GET /rta` — live 31-band spectrum
- `POST /geq` — set GEQ bands (burst mode)
- `POST /eq/auto` — auto-EQ from current RTA
- `GET /app` — self-hosted control page (no mixed content issues)

Optional: Set an API key in module config to require `X-Api-Key` header.

See `docs/HTTP-API.md` for the full reference.

## Troubleshooting

- **Can't connect**: PA2 needs an IP via DHCP or static. Check Utility > System Info.
- **Auth failed**: Default password is `administrator`. Check PA2 Utility > System Settings.
- **GEQ commands affect both channels**: Normal for dual-mono topology. Module auto-detects and sends to both Left and Right GEQ.
- **Missing Mid/Low actions**: Normal for full-range (High-only) configurations. Module adapts to your topology.
- **No RTA data**: Ensure the RTA mic is connected to the PA2's front XLR input.
- **HTTP bridge not responding**: Enable HTTP API in Companion Settings > Network.
- **Meters not updating**: The DSP meter connection (port 19274) starts automatically after the main connection authenticates. Check Companion logs for "DSP meter port connected".
- **Handshake timeout**: If the PA2 doesn't respond within 10 seconds, the module disconnects and retries. Check network connectivity.
