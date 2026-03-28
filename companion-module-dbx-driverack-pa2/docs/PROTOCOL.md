# dbx DriveRack PA2 — Protocol Reference

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 19272 | TCP text | HiQnet control (get/set/ls/sub) |
| 19274 | TCP text | DSP command interface (meters, RTA) — see [DSP-METERS.md](DSP-METERS.md) |
| 19276 | TCP binary | Display stream (opens on demand) |
| 19272 | UDP | Device discovery (broadcast) |
| 21 | TCP | FTP (firmware/presets) |

## Port 19272 — Control Protocol

## Transport
- Port: 19272 (TCP control, UDP discovery)
- Protocol: Plain text, UTF-8, newline-delimited
- Auth: `connect administrator administrator` (default)
- Handshake: Device sends `HiQnet Console` on connect

## Commands
- `get <path>` — read parameter
- `set <path> <value>` — write parameter
- `ls <path>` — list children (ends with `endls`)
- Paths with spaces MUST be quoted

## Connection Sequence
1. TCP connect to `<IP>:19272`
2. RECEIVE: `HiQnet Console`
3. SEND: `connect administrator administrator`
4. RECEIVE: `connect logged in as administrator`
5. SEND: `ls "\\Preset"` → discover topology
6. Parse module list until `endls`

## Response Format
- dB: `"-6.0 dB"` → strip " dB", parseFloat
- Frequency: `"2.50 kHz"` → kHz×1000 | `"250 Hz"` → parseFloat
- Percentage: `"50 %"` → strip " %"
- Ratio: `"4.0:1"` → string
- On/Off: `"On"` / `"Off"`
- OverEasy=0: returns `"Off"` not `"0"`

## Device Info
- `\\Node\AT\Class_Name` → `"dbxDriveRackPA2"`
- `\\Node\AT\Instance_Name` → `"driverack"`
- `\\Node\AT\Software_Version` → `"1.2.0.1"`

## GEQ (31-band)
Base: `\\Preset\StereoGEQ` OR `\\Preset\LeftGEQ`/`\\Preset\RightGEQ`
- `SV\GraphicEQ` → On/Off
- `SV\QuickCurve` → Flat/MyBand/Speech/PerformanceVenue/DJ/Manual
- `SV\<band_label>` → -12.0 to +12.0
- Bands: 20 Hz, 25 Hz, 31.5 Hz, 40 Hz, 50 Hz, 63 Hz, 80 Hz, 100 Hz, 125 Hz, 160 Hz, 200 Hz, 250 Hz, 315 Hz, 400 Hz, 500 Hz, 630 Hz, 800 Hz, 1.0 kHz, 1.25 kHz, 1.6 kHz, 2.0 kHz, 2.5 kHz, 3.15 kHz, 4.0 kHz, 5.0 kHz, 6.3 kHz, 8.0 kHz, 10.0 kHz, 12.5 kHz, 16.0 kHz, 20.0 kHz

## Output PEQ (8-band per output)
Base: `\\Preset\High Outputs PEQ` (also Mid, Low if exist)
- `SV\ParametricEQ` → On/Off
- `SV\Flatten` → Flat/Restore
- `SV\Band_<n>_Type` → Bell/Low Shelf/High Shelf
- `SV\Band_<n>_Frequency` → %.2f (20-20000)
- `SV\Band_<n>_Gain` → %.1f (-20 to +20)
- `SV\Band_<n>_Q` → %.1f (0.1-16.0, Bell only)
- `SV\Band_<n>_Slope` → %.1f (3.0-15.0, Shelf only)

## Room EQ / AutoEQ
Base: `\\Preset\RoomEQ`
- Same filter params as PEQ
- `SV\Flatten` → Flat/Manual/AutoEQ

## AFS
Base: `\\Preset\Afs`
- `SV\AFS` → On/Off
- `SV\FilterMode` → Live/Fixed
- `SV\ContentMode` → Speech/Music/Speech Music
- `SV\MaxFixedFilters` → 0-12 (integer)
- `SV\LiftTime` → 5-3600 (integer seconds)
- `SV\ClearLive` → On (trigger)
- `SV\ClearAll` → On (trigger)

## Compressor
Base: `\\Preset\Compressor`
- `SV\Compressor` → On/Off
- `SV\Threshold` → -60 to 0 (raw float)
- `SV\Gain` → -20 to +20 (raw float)
- `SV\Ratio` → %.1f:1 or Inf:1
- `SV\OverEasy` → 0-10 (raw int)

## Limiters
Base: `\\Preset\High Outputs Limiter` (also Mid, Low)
- `SV\Limiter` → On/Off
- `SV\Threshold` → %.2f (-60 to 0)
- `SV\OverEasy` → %.2f (0-10, returns "Off" for 0)
- Ratio fixed at infinity:1 (not settable)

## Crossover
Base: `\\Preset\Crossover`
Bands: Band_1=High, Band_2=Mid, Band_3=Low, MonoSub=Low(mono)
- `SV\<band>_HPType`/`LPType` → BW 6/12/18/24/30/36/42/48, LR 12/24/36/48
- `SV\<band>_HPFrequency`/`LPFrequency` → %.2f (16-20000) or Out
- `SV\<band>_Gain` → %.2f (-60 to +20)
- `SV\<band>_Polarity` → Normal/Inverted

## Output Mutes
Base: `\\Preset\OutputGains`
- `SV\HighLeftOutputMute` → On(muted)/Off(unmuted)
- Same for HighRight, MidLeft, MidRight, LowLeft, LowRight

## Subharmonic Synth
Base: `\\Preset\SubharmonicSynth`
- `SV\SubharmonicSynth` → On/Off
- `SV\Subharmonics` → 0-100
- `SV\Synthesis Level 24-36Hz` → 0-100
- `SV\Synthesis Level 36-56Hz` → 0-100

## Signal Generator
Base: `\\Preset\SignalGenerator`
- `SV\Signal Generator` → Off/Pink/White
- `SV\Signal Amplitude` → -60 to 0

## Input Delay
Base: `\\Preset\Back Line Delay`
- `SV\Delay` → On/Off
- `SV\Amount` → seconds %.4f (0-0.1000 = 0-100ms)

## Output Delays
Base: `\\Preset\High Outputs Delay` (also Mid, Low)
- `SV\Delay` → On/Off
- `SV\Amount` → seconds %.4f (0-0.010 = 0-10ms)

## RTA
Base: `\\Preset\RTA`
- `SV\Rate` → Slow/Fast
- `SV\Gain` → 0-40

## Preset
- `\\Storage\Presets\SV\CurrentPreset` → number (1-75 user, 76-100 factory)
- `\\Storage\Presets\SV\Changed` → Changed/Unchanged
- Recall: `set "\\Storage\Presets\SV\CurrentPreset" <number>`

## Subscriptions
- `sub "\\path\*"` → PA2 pushes `subr "path" "value" ...` on change
- `unsub "\\path\*"` → stop notifications
- `subr` lines have 5 quoted fields; only the first (value) is needed

## Port 19274 — DSP Meter Interface

See [DSP-METERS.md](DSP-METERS.md) for full documentation. Key facts:
- No authentication required
- Command syntax: `dspcmd [context] [command]`
- RTA meter ID: `00002d0e1f` (1x31 matrix, -90 to +10 dB)
- Read band: `meterid 00002d0e1f at 0 <col> get`
- Input/output meters, compressor/limiter GR also available
