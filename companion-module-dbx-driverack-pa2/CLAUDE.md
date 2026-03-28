# CLAUDE.md — dbx DriveRack PA2 Companion Module

## READ FIRST — Rules That Will Break Things If Ignored
1. **CommonJS only** — Use `require()` and `module.exports`. Do NOT use ESM `import`/`export`. No `"type": "module"` in package.json.
2. **parseResponse return schema** — Search for "parseResponse Return Schema" in this file. The test suite enforces exact key names (`module`, `param`, `value`, `band`, `filter`, `field`, `output`). The Python relay uses DIFFERENT key names — do NOT copy them.
3. **Response parser regex** — Search for "RE_QUOTED" in this file. Use the two-regex approach, not a single regex.
4. **safe_unmute state check** — The generator check goes in the ACTION CALLBACK (reads `self.pa2State`), NOT in `buildCommand` (which is a pure function).
5. **Phases must be done in order** — Phase 1 before Phase 2. Phase 7 before Phase 8. Phase 1-3 can be combined into one prompt (search "Combined Prompt").
6. **yarn only** — Do NOT use npm. Use `yarn install`, `yarn add`, etc.

## Project Overview

Bitfocus Companion module for the dbx DriveRack PA2 loudspeaker management processor. Connects via TCP port 19272, exposes every PA2 parameter as actions/feedbacks/variables/presets, and includes an HTTP bridge so killthering.com can control the PA2 through Companion.

## Architecture

```
┌─────────────────┐         ┌───────────────┐         ┌─────────┐
│ killthering.com │────────▶│  Companion    │────────▶│  PA2    │
│ (browser)       │ HTTP    │  + PA2 module │   TCP   │ :19272  │
└─────────────────┘         └───────────────┘         └─────────┘
                                   ▲
┌─────────────────┐                │
│  Stream Deck    │────────────────┘
│  (buttons)      │
└─────────────────┘
```

## CRITICAL: Template Compliance

This module MUST follow the official Companion JS template patterns exactly:
- Source: https://github.com/bitfocus/companion-module-template-js
- Package: `@companion-module/base` version `~1.14.1` (NOT 1.11)
- Runtime type in manifest: `"type": "node22"`
- Package manager: `yarn@4.12.0` (NOT npm)
- Source files go in `src/` subdirectory
- Entrypoint in manifest: `"../src/main.js"` (relative to companion/ dir)
- Requires `.yarnrc.yml` with `nodeLinker: node-modules`

## CRITICAL: TCPHelper Behavior

TCPHelper from `@companion-module/base` has specific behavior that MUST be understood:

1. **Auto-connects on construction** — calling `new TCPHelper(host, port)` triggers `connect()` via `setImmediate()`. You do NOT call `connect()` manually.

2. **Events** (EventEmitter3):
   - `'connect'` — TCP socket connected (raw TCP, not authenticated yet)
   - `'data'` — receives `Buffer` objects, NOT strings. Call `.toString()`.
   - `'end'` — connection closed
   - `'error'` — connection error (auto-reconnects by default)
   - `'status_change'` — `(InstanceStatus, message)` — forward to `this.updateStatus()`

3. **Auto-reconnect** — enabled by default with 2-second interval. TCPHelper handles reconnection internally.

4. **send()** — `this.tcp.send(string)` — returns Promise. Send strings including newline terminator.

5. **Data arrives as raw Buffer chunks** — TCP does NOT guarantee line boundaries. You MUST buffer incoming data and split on `\n`:
```js
this.tcpBuffer += data.toString()
const lines = this.tcpBuffer.split('\n')
this.tcpBuffer = lines.pop() || ''  // keep incomplete last line
for (const line of lines) { this._handleLine(line.trim()) }
```

6. **Clear tcpBuffer on reconnect** — If the connection drops mid-line, the buffer has partial garbage. The `'connect'` event handler MUST clear `this.tcpBuffer = ''` before processing new data.

7. **Don't forward status_change Ok** — TCPHelper emits `InstanceStatus.Ok` when the TCP socket connects, BEFORE authentication. This would show green in Companion before auth completes. Filter `status_change`: forward errors and disconnects, but set Ok yourself only after topology discovery completes. The skeleton main.js already implements this correctly.

8. **send() returns a Promise** — `this.tcp.send()` is async. If the socket is destroyed mid-send, it throws. Always `.catch()` or use try/catch. The skeleton main.js already handles this.

## JavaScript Backslash Escaping for PA2 Paths

PA2 paths start with `\\` (UNC-style double backslash) and use `\` as separators. In JavaScript strings you need double escaping:

```js
// Protocol wire format:     \\Preset\Afs\SV\AFS
// JS string literal:        '\\\\Preset\\Afs\\SV\\AFS'
// With quotes for spaces:   '"\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Gain"'

// Examples:
this.tcp.send('get \\\\Node\\AT\\Class_Name\n')
this.tcp.send('ls "\\\\Preset"\n')
this.tcp.send('set "\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Gain" -6.0\n')
this.tcp.send('set \\\\Preset\\Afs\\SV\\AFS On\n')
```

## CRITICAL: Connection State Machine

The PA2 handshake is sequential but TCPHelper is event-driven. Use a state machine:

```
IDLE → (TCPHelper created) → WAIT_HELLO
WAIT_HELLO → (receive "HiQnet Console") → AUTHENTICATING
AUTHENTICATING → (send auth, receive "connect logged in as") → DISCOVERING
DISCOVERING → (send ls, receive modules until "endls") → READY
READY → (parse responses, send commands)
```

On disconnect/error, reset to IDLE. TCPHelper's auto-reconnect will re-trigger the 'connect' event, which should set state back to WAIT_HELLO.

## File Structure (matches template)

```
companion-module-dbx-driverack-pa2/
├── package.json              ← yarn@4.12.0, @companion-module/base ~1.14.1
├── .yarnrc.yml               ← nodeLinker: node-modules
├── .gitignore
├── src/
│   ├── main.js               ← InstanceBase subclass + runEntrypoint
│   ├── upgrades.js           ← module.exports = []
│   ├── actions.js            ← module.exports = function(self) { self.setActionDefinitions({...}) }
│   ├── feedbacks.js          ← module.exports = async function(self) { self.setFeedbackDefinitions({...}) }
│   ├── variables.js          ← module.exports = function(self) { self.setVariableDefinitions([...]) }
│   ├── presets.js            ← module.exports = function(self) { self.setPresetDefinitions({...}) }
│   ├── pa2-protocol.js       ← constants, command builders, response parsers
│   └── http-handler.js       ← HTTP bridge (optional, can stay in main.js)
├── companion/
│   ├── manifest.json         ← runtime.type: "node22", entrypoint: "../src/main.js"
│   └── HELP.md
└── docs/
    ├── PROTOCOL.md           ← full protocol reference
    └── pa2_relay_reference.py ← WORKING Python relay tested against live PA2
```

## Module Pattern (MUST follow exactly)

### main.js pattern:
```js
const { InstanceBase, Regex, runEntrypoint, InstanceStatus, TCPHelper } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class PA2Instance extends InstanceBase {
    constructor(internal) { super(internal) }
    async init(config) { ... }
    async destroy() { ... }
    async configUpdated(config) { ... }
    getConfigFields() { return [...] }
    updateActions() { UpdateActions(this) }       // <-- this pattern
    updateFeedbacks() { UpdateFeedbacks(this) }   // <-- this pattern
    updateVariableDefinitions() { UpdateVariableDefinitions(this) }
}
runEntrypoint(PA2Instance, UpgradeScripts)
```

### actions.js pattern:
```js
module.exports = function (self) {
    self.setActionDefinitions({
        action_id: {
            name: 'Human Name',
            options: [ { id: 'param', type: 'dropdown', label: 'Label', choices: [...], default: '...' } ],
            callback: async (event) => {
                self.sendCommand('set ...')
            },
        },
    })
}
```

### feedbacks.js pattern:
```js
const { combineRgb } = require('@companion-module/base')
module.exports = async function (self) {
    self.setFeedbackDefinitions({
        feedback_id: {
            name: 'Human Name',
            type: 'boolean',
            defaultStyle: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 255) },
            options: [ { id: 'output', type: 'dropdown', ... } ],
            callback: (feedback) => {
                return self.pa2State.mutes[feedback.options.output] === true
            },
        },
    })
}
```

### variables.js pattern:
```js
module.exports = function (self) {
    self.setVariableDefinitions([
        { variableId: 'var_name', name: 'Human Name' },
    ])
    // Later, update values with:
    // self.setVariableValues({ var_name: 'value' })
}
```

## What To Build (Claude Code should implement these)

The skeleton `src/main.js` already has: config fields, state object, TCP connection with state machine, line buffering, topology discovery, HTTP bridge structure, and the correct template patterns. It works but everything is stubbed with TODO comments.

**Phase 1 is COMPLETE:** `src/pa2-protocol.js` (539 lines) is included and tested — 89 test cases pass. It implements all response parsers, value strippers, and command builders including compound actions. Run `node test/test-protocol.js` to verify.

**Phase 3 is COMPLETE:** `src/main.js` (684 lines) has `_readAllState()` (generates ~176 get commands based on topology) and `_updateStateFromParsed()` (maps all 14 module types to pa2State + pushes variable updates to Companion). The pa2-protocol.js require is wired in. After topology discovery, the module automatically reads all parameters and populates state. Verified: 21 responses parsed from mock PA2, 19 state checks pass.

Claude Code needs to fill in Phases 2, 4-8:

### 1. `src/pa2-protocol.js` — COMPLETE
Already built and tested. 89 test cases pass. Do not recreate — modify if needed.

### 2. `src/actions.js` — Replace placeholder
All PA2 actions. See Action List below.

### 3. `src/feedbacks.js` — Replace placeholder
Boolean feedbacks for button states. See Feedback List below.

### 4. `src/variables.js` — Replace placeholder
Every readable PA2 parameter as a Companion variable. See Variable List below.

### 5. `src/presets.js` — Replace placeholder
Pre-built Stream Deck button templates for common operations.

### 6. Wire response parsing into main.js — COMPLETE
Already implemented in main.js _handleLine READY case + _updateStateFromParsed().

### 7. Wire readAllState into main.js — COMPLETE
Already implemented in main.js _readAllState(). Called after topology discovery.

## Action List

### Mutes
- `mute_toggle` — output dropdown (HighLeft/HighRight/MidLeft/MidRight/LowLeft/LowRight), toggles
- `mute_set` — output + on/off
- `mute_all` — mute all
- `unmute_all` — unmute all

### GEQ
- `geq_enable` — on/off
- `geq_flat` — set QuickCurve to Flat
- `geq_quick_curve` — dropdown: Flat, MyBand, Speech, PerformanceVenue, DJ
- `geq_band` — band(1-31) + gain(-12 to +12)

### PEQ (per output)
- `peq_enable` — output(High/Mid/Low) + on/off
- `peq_flatten` — output
- `peq_restore` — output
- `peq_filter` — output + filter(1-8) + type + freq + gain + Q + slope

### Room EQ
- `autoeq_enable` — on/off
- `autoeq_mode` — Flat/Manual/AutoEQ
- `autoeq_filter` — filter(1-8) + type + freq + gain + Q + slope

### AFS
- `afs_enable` — on/off
- `afs_mode` — Live/Fixed
- `afs_content` — Speech/Music/Speech Music
- `afs_fixed_filters` — 0-12
- `afs_lift_time` — 5-3600
- `afs_clear_live` — trigger
- `afs_clear_all` — trigger

### Compressor
- `comp_enable` — on/off
- `comp_threshold` — -60 to 0
- `comp_gain` — -20 to +20
- `comp_ratio` — dropdown: 1.0:1 through 40.0:1 and Inf:1
- `comp_overeasy` — 0-10

### Limiters (per band)
- `lim_enable` — band(High/Mid/Low) + on/off
- `lim_threshold` — band + dB
- `lim_overeasy` — band + 0-10

### Crossover
- `xover_hp_type` — band + filter type dropdown
- `xover_lp_type` — band + filter type dropdown
- `xover_hp_freq` — band + Hz
- `xover_lp_freq` — band + Hz
- `xover_gain` — band + dB
- `xover_polarity` — band + Normal/Inverted

### Delays
- `input_delay_enable` — on/off
- `input_delay_time` — 0-100 ms
- `output_delay_enable` — band + on/off
- `output_delay_time` — band + 0-10 ms

### Subharmonic
- `sub_enable`, `sub_master`, `sub_lows`, `sub_highs`

### Generator
- `gen_mode` — Off/Pink/White
- `gen_level` — -60 to 0

### RTA
- `rta_rate` — Slow/Fast
- `rta_offset` — 0-40

### Raw
- `raw_command` — free text

### Compound Actions (BETTER THAN STOCK — press one button, change many parameters)
- `show_open` — unmute all outputs, set generator off, enable AFS in Live mode, enable compressor. The "doors are open, go live" button.
- `show_close` — mute all outputs, set generator off, clear AFS live filters. The "show is over" button.
- `soundcheck_start` — unmute all, enable AFS, enable compressor, set GEQ flat. Clean slate for soundcheck.
- `ring_out` — enable AFS in Fixed mode, set content to Speech Music, set max fixed filters to 12, clear all. The "walk the mics" button for ringing out monitors.
- `panic_mute` — mute all outputs AND set generator off. Emergency silence. Should work even if other commands are queued.
- `safe_unmute` — unmute all outputs but verify generator is off first. Won't unmute if generator is active (prevents pink noise through PA). NOTE: The generator check MUST be in the action callback (reads self.pa2State.generator.mode), NOT in buildCommand (which is a pure function and cannot read state). If generator is not 'Off', log a warning and return without sending commands.

## Feedback List
- `mute_state` — true when muted (red). Option: output dropdown.
- `geq_enabled` — true when GEQ on (green)
- `peq_enabled` — true when PEQ band on. Option: output.
- `autoeq_enabled` — true when Room EQ on
- `afs_enabled` — true when AFS on
- `afs_mode_live` — true when AFS mode is Live
- `comp_enabled` — true when compressor on
- `lim_enabled` — true when limiter band on. Option: band.
- `sub_enabled` — true when subharmonic on
- `gen_active` — true when generator not Off
- `connected` — true when TCP connected and authenticated

## Variable List
- `device_model`, `device_name`, `device_version`
- `preset_current`, `preset_changed`
- `geq_enabled`, `geq_band_1` through `geq_band_31`
- `peq_high_enabled`, `peq_high_1_type`, `peq_high_1_freq`, `peq_high_1_gain`, `peq_high_1_q` (×8 filters × 3 outputs)
- `autoeq_enabled`, `autoeq_mode`
- `afs_enabled`, `afs_mode`, `afs_content`, `afs_fixed_filters`, `afs_lift_time`
- `comp_enabled`, `comp_threshold`, `comp_gain`, `comp_ratio`, `comp_overeasy`
- `lim_high_enabled`, `lim_high_threshold`, `lim_high_overeasy` (×3 bands)
- `mute_high_left`, `mute_high_right`, `mute_mid_left`, `mute_mid_right`, `mute_low_left`, `mute_low_right`
- `sub_enabled`, `sub_master`, `sub_lows`, `sub_highs`
- `gen_mode`, `gen_level`
- `input_delay_enabled`, `input_delay_ms`
- `rta_rate`, `rta_offset`
- `topology_geq_mode` (stereo/dual-mono), `topology_outputs` (High/High+Mid+Low)

## GEQ Band Labels (exact protocol strings, indexed 1-31)
```
1:"20 Hz", 2:"25 Hz", 3:"31.5 Hz", 4:"40 Hz", 5:"50 Hz", 6:"63 Hz",
7:"80 Hz", 8:"100 Hz", 9:"125 Hz", 10:"160 Hz", 11:"200 Hz", 12:"250 Hz",
13:"315 Hz", 14:"400 Hz", 15:"500 Hz", 16:"630 Hz", 17:"800 Hz", 18:"1.0 kHz",
19:"1.25 kHz", 20:"1.6 kHz", 21:"2.0 kHz", 22:"2.5 kHz", 23:"3.15 kHz",
24:"4.0 kHz", 25:"5.0 kHz", 26:"6.3 kHz", 27:"8.0 kHz", 28:"10.0 kHz",
29:"12.5 kHz", 30:"16.0 kHz", 31:"20.0 kHz"
```

## Wire Value Formats (encoding for set commands)
| Parameter | Format | Example |
|-----------|--------|---------|
| GEQ gain | raw float | `-6.0` |
| PEQ frequency | `%.2f` | `2500.00` |
| PEQ gain | `%.1f` | `-12.0` |
| PEQ Q | `%.1f` | `10.0` |
| PEQ slope | `%.1f` | `6.0` |
| Compressor thresh/gain | raw float | `-20.0` |
| Compressor ratio | `%.1f:1` or `Inf:1` | `4.0:1` |
| Limiter thresh/overeasy | `%.2f` | `-6.00` |
| Delay time | seconds `%.4f` | `0.0250` (=25ms) |
| Crossover freq | `%.2f` or `Out` | `1200.00` |
| AFS lift/filters | integer | `300` |
| Enable/disable | string | `On` / `Off` |
| Mute | string | `On`=muted / `Off`=unmuted |

## Topology-Aware Commands
When topology shows dual-mono GEQ (`leftGeq: true, rightGeq: true, stereoGeq: false`), GEQ commands must be sent to BOTH `\\Preset\LeftGEQ` and `\\Preset\RightGEQ`. When topology shows only High outputs, skip all Mid/Low paths.

## Mute Output Naming (EXACT STRINGS)
The protocol uses PascalCase output names. These must be used exactly in paths and state keys:
- `HighLeft`, `HighRight`, `MidLeft`, `MidRight`, `LowLeft`, `LowRight`
- Protocol path: `\\Preset\OutputGains\SV\HighLeftOutputMute`
- State key: `pa2State.mutes.HighLeft`
- Action dropdown values: `HighLeft`, `HighRight`, etc.
Do NOT use snake_case, lowercase, or any other format.

## Crossover — VERIFIED (Round 15, from dbxdriverack library crossover.py)

### Band Naming (DIFFERENT from generic Band_1/2/3)
- `Band_1` = **HIGH** output band
- `Band_2` = **MID** output band
- `Band_3` = **LOW** output band (stereo sub)
- `MonoSub` = **LOW** output band (when topology.lowMono = true)

### Filter Type Strings (exact values the PA2 accepts)
Linkwitz-Riley: `LR 12`, `LR 24`, `LR 36`, `LR 48`
Butterworth: `BW 6`, `BW 12`, `BW 18`, `BW 24`, `BW 30`, `BW 36`, `BW 42`, `BW 48`

### 'Out' Frequency — SOLVED
When a crossover filter frequency is "Out" (no filtering):
- Append `\%` suffix to the path
- HPF Out: send `0` to `\\Preset\Crossover\SV\{band}_HPFrequency\%`
- LPF Out: send `100` to `\\Preset\Crossover\SV\{band}_LPFrequency\%`
- Normal frequency: send Hz as `%.2f` to the path WITHOUT `\%` suffix

### Setting Crossover Safely (from the library's applyCrossover method)
The library sets crossover in a specific order to avoid range clipping:
1. Set HPF to Out (0%) and LPF to Out (100%) — widest possible
2. Set polarity, HPF type, LPF type, gain
3. Set actual HPF and LPF frequencies last
This prevents the PA2's current state from limiting the new frequency range.

### Gain Range: -60 to +20 dB
### Frequency Range: 16 Hz to 20000 Hz (or "Out")

## Additional Protocol Commands (from dbxdriverack library)
- `asyncget` — non-blocking get command (use for high-frequency polling)
- `unsub "\\path\*"` — unsubscribe from a previously subscribed parameter
- These are defined in the library but not used in the relay reference

## GAPS IN REFERENCE IMPLEMENTATION (UPDATED Round 15)

The Python relay does NOT cover everything. These gaps remain:
- The HTML UI handled crossover via raw commands: `xoSend(band, param, value)` sent `set "\\Preset\Crossover\SV\Band_1_HPType" BW 24`
- Claude Code must build crossover commands from PROTOCOL.md alone
- Path pattern: `\\Preset\Crossover\SV\<band>_<param>` where band is Band_1, Band_2, Band_3, or MonoSub
- Params: HPType, LPType, HPFrequency, LPFrequency, Gain, Polarity
- Read format: `get "\\Preset\Crossover\SV\Band_1_HPType"` etc.

### Output delay SET — via raw only
- Relay has response parsing for output delay (can read values)
- Relay has NO command builder for setting output delay (only input delay)
- Claude Code must build these from PROTOCOL.md. Same pattern as input delay but different base path.

### RTA SET — via raw only  
- Relay has response parsing for RTA (rate, offset)
- Relay has NO command builder for setting RTA values
- These are simple set commands following the standard pattern.

## State Object
The _defaultState() in main.js defines the complete state. Here is the structure including ALL modules (crossover was missing until round 5 audit):
```js
{
  device: { model, name, version },
  topology: { modules, stereoGeq, leftGeq, rightGeq, hasHigh, hasMid, hasLow, ... },
  geq: { enabled, bands: { 1: gain, 2: gain, ..., 31: gain } },
  peq: { High/Mid/Low: { enabled, filters: { 1: { type, freq, gain, q, slope }, ... 8 } } },
  autoeq: { enabled, mode, filters: { 1-8 same as peq } },
  afs: { enabled, mode, content, fixedFilters, liftTime },
  compressor: { enabled, threshold, gain, ratio, overeasy },
  limiters: { High/Mid/Low: { enabled, threshold, overeasy } },
  mutes: { HighLeft, HighRight, MidLeft, MidRight, LowLeft, LowRight },
  subharmonic: { enabled, master, lows, highs },
  generator: { mode, level },
  inputDelay: { enabled, ms },
  outputDelays: { High/Mid/Low: { enabled, ms } },
  rta: { rate, offset },
  crossover: { Band_1/Band_2/Band_3/MonoSub: { hpType, lpType, hpFreq, lpFreq, gain, polarity } },
  preset: { current, changed },
}
```

## Variable List — Crossover (add to existing variable list)
- `xover_band1_hp_type`, `xover_band1_lp_type`, `xover_band1_hp_freq`, `xover_band1_lp_freq`, `xover_band1_gain`, `xover_band1_polarity`
- Same pattern for band2, band3, monosub

## Smart Variables (BETTER THAN STOCK)

In addition to raw value variables, create FORMATTED variables for button display. These use short labels and include units:

```
geq_1k_fmt         → "-3dB"     (from geq_band_18, formatted)
comp_thr_fmt        → "-20dB"    (from comp_threshold)
comp_ratio_fmt      → "4:1"      (from comp_ratio, strip ".0")
afs_status_fmt      → "LIVE"     (from afs_enabled + afs_mode)
afs_filters_fmt     → "6F/12"    (fixed filters used / max)
gen_status_fmt      → "OFF"      (from gen_mode, uppercase)
input_delay_fmt     → "25ms"     (from input_delay_ms)
mute_high_l_fmt     → "LIVE"     (from mutes.HighLeft, inverted: false=LIVE, true=MUTED)
mute_high_r_fmt     → "MUTED"
conn_status_fmt     → "OK"       (from connState, READY=OK, else state name)
preset_fmt          → "P1"       (from preset.current)
```

These formatted variables are designed for Stream Deck button text. A button using `$(pa2:mute_high_l_fmt)` shows "LIVE" or "MUTED" — immediately readable.

For GEQ bands, create ONE formatted variable per band with short frequency label:
```
geq_20_fmt    → "0dB"     (band 1: 20 Hz)
geq_1k_fmt    → "-3dB"    (band 18: 1.0 kHz)
geq_10k_fmt   → "+2dB"    (band 28: 10.0 kHz)
```
Use short frequency labels: 20, 25, 31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1k, 1.2k, 1.6k, 2k, 2.5k, 3.1k, 4k, 5k, 6.3k, 8k, 10k, 12k, 16k, 20k

## Color Language (consistent across all presets)

All presets should use a consistent color scheme that makes sense to a sound engineer:
```
RED:    combineRgb(204, 0, 0)      — MUTED, DANGER, OFF (destructive)
GREEN:  combineRgb(0, 204, 0)      — LIVE, ENABLED, ACTIVE (safe)
YELLOW: combineRgb(204, 204, 0)    — WARNING, CAUTION, TRANSITIONAL
BLUE:   combineRgb(0, 100, 204)    — INFO, SELECTED, NAVIGATION
WHITE:  combineRgb(255, 255, 255)  — NEUTRAL text
BLACK:  combineRgb(0, 0, 0)        — background or text on bright buttons
ORANGE: combineRgb(255, 140, 0)    — ACTIVE PROCESSING (compressor, limiter working)
DARK:   combineRgb(40, 40, 40)     — DISABLED, INACTIVE
```

## Professional Preset Pages (BETTER THAN STOCK)

Presets should be organized into categories that match real sound engineering workflows:

### Category: Show Control
- **MUTE HIGH L** — mute_toggle HighLeft, feedback mute_state, red when muted, green when live. Button text: `HIGH L\n$(pa2:mute_high_l_fmt)`
- **MUTE HIGH R** — same for HighRight
- **MUTE ALL** — mute_all action, red background, white text "MUTE\nALL", 18pt
- **UNMUTE ALL** — safe_unmute action (checks gen is off), green background
- **GEN OFF** — gen_mode Off, red background. Safety button.

### Category: Show Macros
- **SHOW OPEN** — show_open compound action. Green bg. "SHOW\nOPEN"
- **SHOW CLOSE** — show_close compound action. Red bg. "SHOW\nCLOSE"
- **SOUNDCHECK** — soundcheck_start compound action. Blue bg. "SOUND\nCHECK"
- **RING OUT** — ring_out compound action. Yellow bg. "RING\nOUT"

### Category: Processing
- **AFS** — afs_enable toggle, feedback afs_enabled. Text: `AFS\n$(pa2:afs_status_fmt)`
- **AFS CLR LIVE** — afs_clear_live. Yellow bg. "CLR\nLIVE"
- **COMP** — comp_enable toggle, feedback comp_enabled. Text: `COMP\n$(pa2:comp_thr_fmt)`
- **LIMITER** — lim_enable toggle for High, feedback. Text: `LIM\n$(pa2:lim_high_enabled)`

### Category: GEQ Page 1 (20Hz-100Hz)
- 8 buttons, each showing band frequency and current gain
- Press to cycle: 0dB → -3dB → -6dB → -12dB → +3dB → +6dB → 0dB
- Text: `$(pa2:geq_20_fmt)\n20Hz` etc.

### Category: GEQ Page 2-4
- Same pattern for bands 9-16, 17-24, 25-31

### Category: Panic
- **PANIC MUTE** — panic_mute, BIG RED, 24pt text "PANIC\nMUTE"
- **GEN OFF** — duplicate gen_mode Off here too
- **AFS CLEAR ALL** — afs_clear_all, red bg
- **GEQ FLAT** — geq_flat, yellow bg

## donewellaudio.com Integration Design (BETTER THAN STOCK)

The integration between donewellaudio.com and the PA2 module should be intelligent, not just a dumb command pipe.

### Endpoint: POST /detect
Accepts feedback detection results from donewellaudio.com:
```json
{
  "frequencies": [
    {"hz": 2500, "magnitude": -3.2, "confidence": 0.92, "type": "feedback"},
    {"hz": 800, "magnitude": -1.5, "confidence": 0.65, "type": "resonance"}
  ],
  "source": "donewellaudio",
  "session": "soundcheck-2025-03-25"
}
```

The module should:
1. Filter by confidence threshold (configurable, default 0.8)
2. Filter by type (only act on "feedback", log "resonance")
3. Check if AFS already has a filter near that frequency (within 1/3 octave) — skip if so
4. Find available PEQ slot (or least-important existing notch)
5. Write a notch filter: Bell, freq, -6dB (configurable max depth), Q=10
6. Track which slots the auto-notch system owns vs user-set
7. Return what was done:
```json
{
  "actions": [
    {"type": "notch_placed", "freq": 2500, "output": "High", "filter": 3, "gain": -6, "q": 10},
    {"type": "skipped_low_confidence", "freq": 800, "confidence": 0.65}
  ],
  "slots_used": 2,
  "slots_available": 6
}
```

### Endpoint: GET /recommendations
Returns detection results WITHOUT acting. donewellaudio.com can show these to the operator for manual approval:
```json
{
  "pending": [
    {"freq": 2500, "suggested_gain": -6, "suggested_q": 10, "reason": "feedback detected at 0.92 confidence"}
  ],
  "active_notches": [
    {"freq": 1200, "gain": -4, "filter": 2, "placed_at": "2025-03-25T14:30:00Z"}
  ]
}
```

### Endpoint: POST /approve
Operator reviews recommendations in donewellaudio.com, clicks approve:
```json
{"approve": [2500], "reject": [800]}
```
Module writes approved notches, discards rejected.

### Endpoint: DELETE /notches
Clears all auto-placed notch filters. Does NOT touch user-set PEQ filters.

### Config Fields for donewellaudio Integration
Add these to getConfigFields():
```js
{
  type: 'number', id: 'notchConfidenceThreshold',
  label: 'Auto-notch confidence threshold (0.0-1.0)',
  default: 0.80, min: 0, max: 1, step: 0.05
},
{
  type: 'number', id: 'notchMaxDepth',
  label: 'Maximum auto-notch depth (dB, negative)',
  default: -6, min: -20, max: 0
},
{
  type: 'dropdown', id: 'notchMode',
  label: 'Auto-notch mode',
  default: 'suggest',
  choices: [
    {id: 'suggest', label: 'Suggest only (show on Stream Deck, don\'t write)'},
    {id: 'auto', label: 'Auto-apply (write to PA2 immediately)'},
    {id: 'approve', label: 'Require approval (via /approve endpoint)'},
  ]
},
```

### Stream Deck Variables for donewellaudio
```
detect_last_freq    → "2.5kHz"    (last detected feedback frequency)
detect_last_action  → "NOTCHED"   (what happened: NOTCHED, SKIPPED, PENDING)
detect_slots_used   → "2/8"       (auto-notch slots used / total PEQ slots)
detect_active       → "ON"        (whether detection endpoint is receiving data)
```

These variables let a Stream Deck button show: `DETECT\n$(pa2:detect_last_freq)\n$(pa2:detect_last_action)`

## Response Parsing (CRITICAL — Claude Code must implement this correctly)

### Response Line Format
PA2 responses look like this on the wire:
```
get "\\Preset\Afs\SV\AFS" "On"
get "\\Preset\Compressor\SV\Threshold" "-20.0 dB"
get "\\Preset\High Outputs PEQ\SV\Band_1_Frequency" "2.50 kHz"
get "\\Preset\SubharmonicSynth\SV\Synthesis Level 24-36Hz" "50 %"
```

The format is: `get "quoted_path" "quoted_value"`

Both path and value are surrounded by double quotes. Values may contain spaces (e.g. `-20.0 dB`, `Speech Music`, `2.50 kHz`).

### JavaScript Response Parser
Use two regexes — try quoted format first (most PA2 responses), fall back to unquoted:
```js
const RE_QUOTED = /^(get|subr)\s+"([^"]+)"\s+"([^"]*)"/
const RE_UNQUOTED = /^(get|subr)\s+(\S+)\s+(\S+)/

function splitResponseLine(line) {
  let m = line.match(RE_QUOTED)
  if (m) return { cmd: m[1], path: m[2], value: m[3] }
  m = line.match(RE_UNQUOTED)
  if (m) return { cmd: m[1], path: m[2], value: m[3] }
  return null
}
```
WARNING: A single-regex approach like `/^(get|subr)\s+"?([^"]+?)"?\s+"?([^"]*?)"?\s*$/` works for standard `get` responses but FAILS on `subr` lines with extra fields (e.g. `subr "path" "Off" "0" "0%" "0"`) because the `\s*$` anchor can't match the trailing quoted values. Also, removing the `\s*$` anchor breaks value capture entirely (lazy `[^"]*?` matches empty). Use the two-regex approach above instead — it handles both cases correctly.

The quoted regex also correctly handles subr lines with extra fields (e.g. `subr "path" "Off" "0" "0%" "0"`) because it stops after the first two quoted groups.

### Value Unit Stripping
After extracting the value string, strip units:
```js
function parseDb(s) { return parseFloat(s) }           // "-20.0 dB" → -20.0
function parseFreq(s) {                                  // "2.50 kHz" → 2500, "250 Hz" → 250
  const m = s.match(/([\d.]+)\s*(k?Hz)/i)
  if (!m) return parseFloat(s)
  return m[2].startsWith('k') ? parseFloat(m[1]) * 1000 : parseFloat(m[1])
}
function parsePercent(s) { return parseFloat(s) }        // "50 %" → 50
function parseTime(s) {                                  // "25.0 ms" → 25, "0.025 s" → 25
  const m = s.match(/([\d.]+)\s*(m?s)/i)
  if (!m) return parseFloat(s)
  return m[2] === 'ms' ? parseFloat(m[1]) : parseFloat(m[1]) * 1000
}
// OverEasy returns "Off" for 0 — check string before parsing
function parseOverEasy(s) { return s === 'Off' ? 0 : parseFloat(s) }
```

### IMPORTANT: SET vs RESPONSE Format Asymmetry
The PA2 uses DIFFERENT formats for setting and reading values:
- **Delay**: SET in seconds (`0.0250`), RESPONSE in ms (`25.0 ms`)
- **Gains/thresholds**: SET as raw float (`-20.0`), RESPONSE with unit (`-20.0 dB`)
- **Frequencies**: SET as raw Hz (`2500.00`), RESPONSE with unit (`2.50 kHz` or `250 Hz`)
- **Percentages**: SET as raw int (`50`), RESPONSE with unit (`50 %`)
- **On/Off, Ratio**: Same format in both directions

### GEQ Band Reverse Mapping
When parsing GEQ responses, the path contains the band LABEL (like "1.0 kHz") and you need to map it back to a band NUMBER (like 18). Build a reverse lookup:
```js
const GEQ_LABELS_TO_NUM = {}
for (const [num, label] of Object.entries(GEQ_BANDS)) {
  GEQ_LABELS_TO_NUM[label] = parseInt(num)
}
// Then: GEQ_LABELS_TO_NUM["1.0 kHz"] → 18
```

### Path Matching
After extracting the path, use string matching or regex to identify the module:
```js
if (path.includes('\\Node\\AT\\Class_Name')) → device model
if (path.includes('GEQ\\SV\\')) → GEQ parameter
if (path.includes('Outputs PEQ\\SV\\')) → output PEQ parameter
if (path.includes('\\Afs\\SV\\')) → AFS parameter
// etc. — see docs/pa2_relay_reference.py parse_pa2_response() for complete list
```

### parseResponse Return Schema (AUTHORITATIVE — tests enforce this)

Every parseResponse return MUST include `module` and `value`. Additional keys depend on module:

```js
// Device
{module: 'device', param: 'model', value: 'dbxDriveRackPA2'}
{module: 'device', param: 'name', value: 'driverack'}
{module: 'device', param: 'version', value: '1.2.0.1'}

// Preset
{module: 'preset', param: 'current', value: 1}
{module: 'preset', param: 'changed', value: 'Unchanged'}

// GEQ (note: 'channel' optional, 'band' is the key for band number)
{module: 'geq', param: 'enabled', value: true}
{module: 'geq', param: 'mode', value: 'Manual'}
{module: 'geq', param: 'band', band: 18, value: -3.0}

// PEQ (note: 'filter' is the key for filter number, 'field' for sub-parameter)
{module: 'peq', output: 'High', param: 'enabled', value: true}
{module: 'peq', output: 'High', param: 'filter', filter: 1, field: 'Type', value: 'Bell'}
{module: 'peq', output: 'High', param: 'filter', filter: 1, field: 'Frequency', value: 2500}
{module: 'peq', output: 'High', param: 'filter', filter: 1, field: 'Gain', value: -6.0}
{module: 'peq', output: 'High', param: 'filter', filter: 1, field: 'Q', value: 4.0}

// AutoEQ (same structure as PEQ but module='autoeq')
{module: 'autoeq', param: 'enabled', value: true}
{module: 'autoeq', param: 'mode', value: 'AutoEQ'}
{module: 'autoeq', param: 'filter', filter: 1, field: 'Frequency', value: 800}

// AFS
{module: 'afs', param: 'AFS', value: true}
{module: 'afs', param: 'FilterMode', value: 'Live'}
{module: 'afs', param: 'ContentMode', value: 'Speech Music'}
{module: 'afs', param: 'MaxFixedFilters', value: 6}
{module: 'afs', param: 'LiftTime', value: 300}

// Compressor
{module: 'compressor', param: 'Compressor', value: true}
{module: 'compressor', param: 'Threshold', value: -20.0}
{module: 'compressor', param: 'Gain', value: 5.0}
{module: 'compressor', param: 'Ratio', value: '4.0:1'}
{module: 'compressor', param: 'OverEasy', value: 3}   // 0 when PA2 returns "Off"

// Limiter
{module: 'limiter', output: 'High', param: 'Limiter', value: true}
{module: 'limiter', output: 'High', param: 'Threshold', value: -6.0}
{module: 'limiter', output: 'High', param: 'OverEasy', value: 0}

// Mute (no 'param' — just output and value)
{module: 'mute', output: 'HighLeft', value: false}   // false=unmuted, true=muted

// Subharmonic
{module: 'subharmonic', param: 'enabled', value: true}
{module: 'subharmonic', param: 'master', value: 50}
{module: 'subharmonic', param: 'lows', value: 75}
{module: 'subharmonic', param: 'highs', value: 60}

// Generator
{module: 'generator', param: 'mode', value: 'Off'}
{module: 'generator', param: 'level', value: -60.0}

// Input delay
{module: 'input_delay', param: 'enabled', value: true}
{module: 'input_delay', param: 'ms', value: 25.0}

// Output delay
{module: 'output_delay', output: 'High', param: 'enabled', value: false}
{module: 'output_delay', output: 'High', param: 'ms', value: 0.0}

// RTA
{module: 'rta', param: 'rate', value: 'Slow'}
{module: 'rta', param: 'offset', value: 0}

// Non-parseable lines → return null
null
```

NOTE: The Python relay uses different key names (`band_number`, `filter_number`, `channel`, `type`). Use the names above, not the Python names. The test suite (`test/test-protocol.js` + `test/sample-responses.js`) enforces this exact schema.

## Security Notes for HTTP Bridge

The HTTP bridge accepts commands from any origin (CORS: *). On an open network, anyone who can reach Companion's port 8000 can control the PA2 — including muting all outputs or enabling the signal generator during a live show. Mitigations:
- Keep Companion on a private/isolated network
- Consider adding an optional API key config field that must be sent as a header
- Document this risk in HELP.md

## CRITICAL: HTTPS Mixed Content Problem

Both donewellaudio.com and killthering.com are served over HTTPS (Vercel hosting). Companion runs HTTP on port 8000. Browsers block fetch requests from HTTPS pages to HTTP endpoints (mixed content).

### What works:
- Chrome/Firefox: HTTPS page → `http://localhost:8000` works (localhost is exempt)
- Chrome 142+: HTTPS page → `http://192.168.x.x:8000` works WITH `{targetAddressSpace: 'local'}` fetch option and user permission prompt

### What does NOT work:
- Any browser: HTTPS page → `http://192.168.x.x:8000` (remote Companion/Pi) = BLOCKED
- Safari: ALL mixed content blocked, no localhost exception
- WebSocket (ws://) from HTTPS: same mixed content rules apply

### Impact:
- donewellaudio.com can reach Companion ON THE SAME MACHINE (localhost) in Chrome/Firefox
- donewellaudio.com CANNOT reach Companion on a Pi or different machine from an HTTPS page
- The Pi deployment scenario for the web app is broken

### Solutions (in order of pragmatism):
1. **Companion HTTPS mode** — Recent Companion versions support HTTPS with certificate files. Configure HTTPS in Companion settings, and donewellaudio.com can fetch from it without mixed content restrictions. This is the cleanest solution. Requires: SSL certificate (self-signed or Let's Encrypt), configured in Companion Settings > Network > HTTPS.
2. **Serve control UI from Companion** — Module's HTTP handler serves a full HTML app at `/instance/pa2/app`. Same-origin, no mixed content. User navigates to `http://companion:8000/instance/pa2/app` directly. donewellaudio.com provides a link/redirect.
3. **Local standalone HTML** — pa2_control.html opened from file:// or local server. Already built and working.
4. **Chrome targetAddressSpace** — `fetch(url, {targetAddressSpace: 'local'})` triggers permission prompt. Chrome-only. Requires Chrome 142+.
5. **Reverse proxy with HTTPS** — nginx in front of Companion with SSL cert. Alternative if Companion's native HTTPS doesn't work.
6. **Electron/Tauri wrapper** — Desktop app for donewellaudio with no browser restrictions. Most robust for distribution.

### Recommendation for Claude Code:
Add a `/app` endpoint to handleHttpRequest that serves a self-contained HTML control page. This page runs from Companion's HTTP server (same-origin) and makes API calls to the sibling endpoints (`/state`, `/command`, `/topology`). This bypasses mixed content entirely and works on any browser.

## HTTP Bridge
Uses Companion's built-in `handleHttpRequest()`. Requests arrive at `/instance/<label>/<path>`. The method receives a CompanionHTTPRequest with: path, method, body (string), headers, query. Return CompanionHTTPResponse: { status, headers, body }.

### CRITICAL: Companion Configuration Required
1. **HTTP API must be enabled** — In Companion v4+, the HTTP API is opt-in. Go to Companion Settings > Network > enable "HTTP API". Without this, handleHttpRequest is never called and the entire HTTP bridge is dead.
2. **Port is configurable** — Default is 8000 but the user may have changed it. All guide URLs assume 8000.
3. **Instance label is user-set** — The URL path uses `/instance/<label>/` where label defaults to the module shortname but the user can rename it. The guide examples use 'pa2' but it could be anything.
4. **Companion supports HTTPS** — Recent Companion versions can serve the web UI over HTTPS with certificate files. This SOLVES the mixed content problem for donewellaudio.com. If the user configures HTTPS on Companion, browser fetch from HTTPS donewellaudio.com to HTTPS Companion works without mixed content restrictions.

All responses MUST include CORS headers for browser access:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Handle OPTIONS preflight requests with status 204.

Note: Companion's HTTP handler does NOT support WebSockets. HTTP polling only.

## Reference Implementation
`docs/pa2_relay_reference.py` is a WORKING Python WebSocket relay tested against a live PA2 (firmware 1.2.0.1, dual-mono GEQ, High-only outputs). It contains proven implementations of: handshake, topology discovery, response parsing for all 13 modules, command building with topology awareness, and read-all-state sequencing. When in doubt, read this file.

## Known Issues to Address

### Handshake timeout
There is currently no timeout on the handshake. If the PA2 stops responding after TCP connects (stuck in WAIT_HELLO or AUTHENTICATING), the module hangs forever. Add a setTimeout in the 'connect' handler that fires after 10 seconds and calls destroy() + sets an error status if connState hasn't reached READY.

### Variable initialization
variables.js defines variable names but never sets initial values. Before readAllState completes, variables show as undefined/empty in Companion. After calling setVariableDefinitions(), immediately call setVariableValues() with defaults like empty strings for text and 0 for numbers.

### Mute toggle race condition
The mute toggle action reads pa2State.mutes to determine current state and sends the opposite. Before readAllState completes, all mutes default to false (unmuted). If a user presses toggle before state loads, it would send "mute" when the PA2 is already muted. Consider tracking whether initial state has been loaded and logging a warning if toggle is pressed before that.

### HTTP /command shares action names with Stream Deck
The POST /command HTTP endpoint should use the SAME action names as the Stream Deck actions. If Claude Code uses different naming in buildCommand for HTTP vs for action callbacks, one path breaks while the other works. The recommendation is: action callbacks call buildCommand() with the same action/params format that POST /command accepts. One function, two callers.

### HTTP /command has no command spacing
Individual POST /command requests call sendCommand() directly — no 20ms spacing. If killthering.com sends 10 rapid requests, all 10 commands hit the PA2 back-to-back. The PA2 might drop some. For batch operations, killthering.com should send a single POST with multiple commands, or the module should queue HTTP-originated commands with spacing.

### PA2 set responses update state asynchronously
When you send a set command, the PA2 echoes back a get response with the new value. This means state updates happen AFTER the action callback returns. If an action callback reads pa2State right after calling sendCommand, it reads the OLD value. This affects mute_toggle: it reads current mute state, sends the opposite, but the state doesn't update until the echo arrives. This is correct behavior — don't try to update state locally in the callback. Let the response parser handle it.

### Build phase ordering
Phases 1 and 3 are already complete. Remaining phases should be done in order: Phase 2 (actions) before Phase 4-6 (feedbacks/variables/presets use action IDs). Phase 7 (HTTP bridge) before Phase 8 (donewellaudio endpoints build on the bridge).

### /detect endpoint must check connection state
The POST /detect endpoint writes PEQ notch filters to the PA2. If connState is not READY, sendCommand silently drops the commands, but /detect would still return success with "notch_placed" actions. Claude Code must check `self.connState === 'READY'` at the top of the /detect handler and return `{error: 'PA2 not connected'}` if not.

### Auto-notch slot tracking is not persistent
`pa2State.autoNotch.slotsUsed` resets on reconnect or Companion restart. After restart, the module loses track of which PEQ slots were auto-placed vs user-set. For v1 this is acceptable — the operator clears and re-runs detection. For v2, consider saving slot ownership to Companion's persistent data store.

## Full Protocol Reference
See `docs/PROTOCOL.md` for every path, value range, and format.

## NEW FINDINGS (Round 14 research — not yet tested against live PA2)

### Subscription System (sub/subr)
The official PA2 app does NOT use repeated get commands for state updates. It uses the `sub` command to subscribe to parameter changes. The PA2 pushes `subr` notifications whenever a subscribed value changes.

Format: `sub "\\path\\*"` → PA2 responds with `subr "path\*" "value" "raw" "pct" "raw2"` whenever the value changes.

The official app subscribes to these on connect:
```
sub "\\Node\Wizard\SV\LoadedConfigString\*"
sub "\\Node\Wizard\SV\WizardState\*"
sub "\\Node\Wizard\SV\WizardExit\*"
sub "\\Node\Wizard\SV\WizardEvent\*"
sub "\\Storage\Presets\SV\CurrentPreset\*"
sub "\\Storage\Presets\SV\Changed\*"
sub "\\Preset\OutputGains\SV\HighLeftOutputMute\*"
sub "\\Preset\OutputGains\SV\HighRightOutputMute\*"
sub "\\Preset\OutputGains\SV\MidLeftOutputMute\*"
sub "\\Preset\OutputGains\SV\MidRightOutputMute\*"
sub "\\Preset\OutputGains\SV\LowLeftOutputMute\*"
sub "\\Preset\OutputGains\SV\LowRightOutputMute\*"
```

IMPACT: Subscribe to ALL parameters after topology discovery. PA2 pushes changes in real-time — no polling needed. This is the correct way to keep state in sync. Our current readAllState + get approach works but is not how the official app operates.

NOTE: subr lines have 5 quoted fields (value, raw_numeric, percent, raw_value2). Our RE_QUOTED regex captures only the first value — this is correct since the additional fields are not needed for state management.

### LoadedConfigString — Rich Topology
Subscribing to `\\Node\Wizard\SV\LoadedConfigString\*` returns a comma-separated string containing the COMPLETE topology: module class names, instance names, parameter counts (NumBands, NumChans, MaxDelay), routing info (MonoSub, NumSlots, PEQType), the signal chain order, AND initial state values (which modules are enabled, GEQ mode, etc.). This is richer than our `ls \\Preset` approach.

### StereoMixer Input Mutes — UNDOCUMENTED
The LoadedConfigString reveals mixer input routing mutes:
- `\\Preset\StereoMixer\SV\Output_1_Input_1_Mute` (0=unmuted, 1=muted)
- Pattern: `Output_<out>_Input_<in>_Mute` where out=1-2, in=1-3
- These control which inputs feed which outputs at the mixer stage
- NOT the same as output mutes (\\Preset\OutputGains\SV\*OutputMute)
- Probe with: `ls "\\Preset\StereoMixer\SV"` to discover all mixer params

### UDP Discovery
Port 19272 is used for BOTH TCP control AND UDP discovery. The official app broadcasts get commands on UDP to find PA2 units on the network without knowing their IP. Response contains device class, name, and firmware version. Could implement auto-discovery in the Companion module config (Companion supports UDP via UDPHelper).

### FTP on Port 21
The PA2 manual confirms an FTP server on port 21. Likely used for: firmware updates, preset file transfer, speaker tuning database downloads. Unexplored.

### Preset System Details
- User presets: locations 1-75 (writable)
- Factory presets: locations 76-100 (read-only templates)
- Current preset: `\\Storage\Presets\SV\CurrentPreset` (returns number like "3")
- Changed flag: `\\Storage\Presets\SV\Changed` (returns "Changed" or "Unchanged")
- Recall via: `set "\\Storage\Presets\SV\CurrentPreset" <number>` — UNTESTED but likely works

### Wizard State Monitoring
The app subscribes to wizard events. If someone runs AutoEQ from the PA2 front panel:
- `\\Node\Wizard\SV\WizardState` changes from "Inactive" to "Active"
- `\\Node\Wizard\SV\WizardEvent` changes from "Idle" to event-specific values
- Our module could monitor this and warn the operator that a wizard is modifying parameters

### InputMeters / OutputMeters — Confirmed as Modules
The LoadedConfigString confirms these are actual module classes:
- `CLASS,dbxDriveRackPA2InputMeters,InputMeters`
- `CLASS,dbxDriveRackPA2OutputMeters,OutputMeters`
They appear in the audio signal path. Probe with `ls "\\Preset\InputMeters\SV"` and `ls "\\Preset\OutputMeters\SV"` to discover if level data is exposed as readable parameters. However, based on the HiQnet protocol documentation, meter data ("sensor parameters") is typically sent via the binary HiQnet protocol on port 3804 or custom UDP streams — NOT the text console protocol on port 19272.

### RTA Spectral Data — NOT AVAILABLE via Text Protocol (Round 15 conclusion)
After reading the entire dbxdriverack library (~2000 lines), the ForsakenHarmony gist, and HiQnet Third Party Programmer Documentation:

**RTA spectral band data (31-band frequency analysis) is NOT exposed via the text protocol on port 19272.**

Evidence:
1. The library's rta.py module only exposes Rate and Offset — no spectral band parameters
2. The ~2000 line Python library has zero code for spectral band reading
3. HiQnet docs classify meters as "sensor parameters" sent via binary protocol (port 3804) or custom UDP streams
4. Wireshark wiki: "VU-meters stream uses another protocol (UDP on port 3333)" on Soundcraft — precedent for non-standard transport
5. No one in the community (ForsakenHarmony, mkupferman, bithavoc, marvinto23) has documented spectral data over the text protocol

**To get RTA spectral data, you would need:**
1. Wireshark capture while the official PA2 app shows the RTA display
2. Look for traffic on ports OTHER than 19272 (try 3804, 3333, or unknown)
3. The data is likely binary HiQnet or a custom meter protocol, not text
4. **Alternative: donewellaudio.com should do its own spectral analysis** using the browser's Web Audio API or a dedicated mic input, rather than trying to extract it from the PA2. This is architecturally cleaner anyway — the PA2's RTA mic input connects to the PA2's front XLR, not to the controlling device.

## Testing Infrastructure

### test/sample-responses.js
Contains real PA2 response lines organized by module (device, geq, peq, afs, compressor, limiters, mutes, etc.) plus edge cases (OverEasy=Off, Inf:1, error lines, empty lines). Includes expected parse results for key responses. Use to validate parseResponse() without a live PA2.

### test/test-protocol.js
Run: `node test/test-protocol.js`
Validates pa2-protocol.js exports, GEQ band table, response parsing for all sample categories, edge case handling, and basic command building. Run after Phase 1 to verify the protocol layer before wiring it into main.js. Exit code 0 = all pass.

### test/mock-pa2.js
Run: `node test/mock-pa2.js [port]`
Simulates a PA2 on port 19272 (or custom port). Implements: handshake, auth, ls \\Preset (returns dual-mono/high-only topology), get/set for ~40 state entries with echo-back. Point the Companion module at localhost to test the full connection flow without real hardware. Logs all commands received and responses sent.
