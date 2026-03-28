# dbx DriveRack PA2 — DSP Meter Interface (Port 19274)

**First public documentation. Discovered 2026-03-26.**

The PA2 exposes a second TCP interface on port 19274 — a DSP debug console called `dspcmd` built on the Stockbridge framework. This provides access to real-time meter data including the 31-band RTA spectrum, input/output levels, and compressor/limiter gain reduction — data that is NOT available through the standard control protocol on port 19272.

## Discovery

Port 19274 was found via TCP port scan of the PA2. The device has 5 open TCP ports:

| Port | Service |
|------|---------|
| 21 | FTP (firmware/presets) |
| 22 | SSH |
| 23 | Telnet |
| 19272 | HiQnet text control (documented) |
| 19274 | DSP command interface (undocumented) |
| 19276 | Display stream (opens on demand, likely LCD bitmap) |

## Connection

Connect via raw TCP. No authentication required — the port is open.

```
TCP connect to <PA2_IP>:19274
RECEIVE: "Started Dspcmd processor\r\n"
```

The connection is now ready for commands.

## Command Syntax

```
dspcmd [context] [command] [options]
```

### Context (sets the target)
- `module "path/to/module"` — target a DSP module
- `param "path/to/param"` — target a parameter
- `meter "path/to/meter"` — target a meter
- `meterid <hex_id>` — target a meter by numeric ID (fastest)
- `paramid <hex_id>` — target a parameter by numeric ID
- `at <row> <col>` — for matrix params/meters, select a cell

### Commands
- `modules` — list submodules
- `params` — list parameters
- `meters` — list meters
- `meterids` — get hex IDs for all meters in a module
- `paramids` — get hex IDs for all params in a module
- `get` — read current value (requires param/meter context)
- `set <value>` — write a value (requires param context)
- `info` — get metadata (name, min, max, units, dimensions)
- `--info` (or `ls`) — get full module info dump

### Response Format
```
Success: 00: <payload>\n\x04
Failure: <hex_code>: <error message>\n\x04
```
Note: The EOT byte (\x04) terminates responses. For meter reads, the response is just the float value on a line.

## Module Tree

The PA2's DSP has one top-level module `"OA"` containing all audio processing:

```
OA/
  da_RTA01000064              — RTA analyzer
  da_SignalGen01000065        — Signal generator
  da_InputMeterL01000066      — Input level meter (Left)
  da_InputMeterR01000066      — Input level meter (Right)
  da_InputMeterClipL01000066  — Input clip indicator (Left)
  da_InputMeterClipR01000066  — Input clip indicator (Right)
  da_Mixer010000C9            — Mono mixer
  da_GraphicEQ0100012D        — Graphic EQ (Left or Stereo)
  da_GraphicEQ0100012E        — Graphic EQ (Right, dual-mono only)
  da_ParametricEq01000191     — Room EQ / AutoEQ
  da_AFS010001F5              — Advanced Feedback Suppression
  da_SubSynth01000259         — Subharmonic Synthesizer
  da_Compressor010002BD       — Compressor
  da_Delay01000321            — Input delay (Back Line)
  Band_1_da_LowPass_L01000385  — Crossover Band 1 LP Left
  Band_1_da_HighPass_L01000385 — Crossover Band 1 HP Left
  Band_1_da_Gain_L01000385    — Crossover Band 1 Gain Left
  Band_1_da_LowPass_R01000385 — Crossover Band 1 LP Right
  Band_1_da_HighPass_R01000385 — Crossover Band 1 HP Right
  Band_1_da_Gain_R01000385    — Crossover Band 1 Gain Right
  da_ParametricEq010003E9     — Output PEQ (High)
  da_Limiter0100044D          — Output Limiter (High)
  da_Delay010004B1            — Output delay (High)
  da_OutputGains01000515      — Output gains + mutes
  da_HighLeftMeter01000579    — Output meter High Left
  da_HighRightMeter01000579   — Output meter High Right
  da_MidLeftMeter01000579     — Output meter Mid Left
  da_MidRightMeter01000579    — Output meter Mid Right
  da_LowLeftMeter01000579     — Output meter Low Left
  da_LowRightMeter01000579    — Output meter Low Right
```

## Meter Map

### RTA Spectrum (the key discovery)

| Module | Meter | ID | Range | Dimensions | Description |
|--------|-------|----|-------|------------|-------------|
| da_RTA01000064 | Level | `00002d0e1f` | -90 to +10 dB | 1x31 | 31-band RTA spectrum |

**Reading all 31 RTA bands:**
```
meterid 00002d0e1f at 0 0 get    → band 1 (20 Hz)
meterid 00002d0e1f at 0 1 get    → band 2 (25 Hz)
...
meterid 00002d0e1f at 0 30 get   → band 31 (20 kHz)
```

Each response is a single float: `-65.6889`

Band mapping (column index → frequency):
```
0:20Hz  1:25Hz  2:31.5Hz  3:40Hz  4:50Hz  5:63Hz  6:80Hz  7:100Hz
8:125Hz  9:160Hz  10:200Hz  11:250Hz  12:315Hz  13:400Hz  14:500Hz  15:630Hz
16:800Hz  17:1kHz  18:1.25kHz  19:1.6kHz  20:2kHz  21:2.5kHz  22:3.15kHz  23:4kHz
24:5kHz  25:6.3kHz  26:8kHz  27:10kHz  28:12.5kHz  29:16kHz  30:20kHz
```

**RTA parameters:**
```
module "OA/da_RTA01000064" params → "Averaging Time"
Current value: 25 ms
```

### Input Meters

| Module | Meter | ID | Range | Description |
|--------|-------|----|-------|-------------|
| da_InputMeterL01000066 | Level | `00002d1b3c` | -120 to 0 dB | Input Left |
| da_InputMeterR01000066 | Level | `00002d1d06` | -120 to 0 dB | Input Right |

### Compressor Meters

| Module | Meter | ID | Range | Dims | Description |
|--------|-------|----|-------|------|-------------|
| da_Compressor010002BD | Input Level | `00002d5f52` | -120 to +20 dB | 1x2 | Comp input (L/R) |
| da_Compressor010002BD | Gain Reduction | `00002d5f5a` | 0 to 96 dB | 1x2 | Comp GR (L/R) |
| da_Compressor010002BD | Threshold Meter | `00002d5f62` | 0 to 2 | 1x2 | Threshold indicator |

**Compressor also exposes DSP-level parameters** (not available on port 19272):
- Attack, Hold, Release, Auto (these exist in the DSP but not the text protocol)

### Limiter Meters

| Module | Meter | ID | Range | Dims | Description |
|--------|-------|----|-------|------|-------------|
| da_Limiter0100044D | Input Level | `00002d7938` | -120 to +20 dB | 1x2 | Lim input (L/R) |
| da_Limiter0100044D | Gain Reduction | `00002d7940` | 0 to 96 dB | 1x2 | Lim GR (L/R) |
| da_Limiter0100044D | Threshold Meter | `00002d7948` | 0 to 2 | 1x2 | Threshold indicator |
| da_Limiter0100044D | PeakStop+ Meter | `00002d7950` | 0 to 2 | 1x2 | PeakStop indicator |

### Output Meters

| Module | Meter | ID | Range | Description |
|--------|-------|----|-------|-------------|
| da_HighLeftMeter01000579 | Level | `00002e0460` | -120 to 0 dB | Output High Left |
| da_HighRightMeter01000579 | Level | `00002e062a` | -120 to 0 dB | Output High Right |

Mid/Low output meters exist in the module tree but are only active when the PA2 is configured for multi-way output.

## Performance

Tested against live PA2 (firmware 1.2.0.1):

- Single meter read: <5ms round trip
- All 31 RTA bands: ~50ms at 0ms command spacing
- Full meter poll (31 RTA + 8 level meters): ~80ms
- Sustainable poll rate: 5 Hz (200ms interval) with no issues
- Commands can be sent as a burst (all in one TCP write)

## Limitations

- Meter IDs appear to be firmware-specific. Other PA2 firmware versions may use different IDs.
- The DSP command interface requires no authentication — anyone on the network can read meters.
- Matrix meters (1x2 for compressor/limiter) return the first channel value with a plain `get`. Use `at 0 0` and `at 0 1` for L/R separately.
- Port 19274 does not support the HiQnet `sub` subscription model. Polling is required.
- Port 19276 opens on demand (likely when the PA2 app requests the display stream) and streams raw binary data — possibly the LCD bitmap. Not yet decoded.

## Code Example (Node.js)

```javascript
const net = require('net')
const sock = net.connect(19274, '192.168.0.113')

let buf = ''
sock.on('data', (d) => {
  buf += d.toString()
  const lines = buf.split('\n')
  buf = lines.pop()
  for (const l of lines) {
    const t = l.replace(/\r/g, '').trim()
    if (t && !t.startsWith('Started')) console.log(t)
  }
})

sock.on('connect', () => {
  // Wait for welcome message, then read all 31 RTA bands
  setTimeout(() => {
    for (let col = 0; col < 31; col++) {
      sock.write(`meterid 00002d0e1f at 0 ${col} get\n`)
    }
    setTimeout(() => sock.destroy(), 2000)
  }, 500)
})
```
