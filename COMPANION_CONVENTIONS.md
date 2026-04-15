# Bitfocus Companion Module Development Conventions

Historical reference note: this document captures reverse-engineered patterns from the removed PA2-era module. Current DoneWell work should treat `companion-module/` as the live implementation and use this file only for legacy protocol context.

## Overview

This document captures the exact API patterns from the PA2 module (`companion-module-dbx-driverack-pa2`) that serve as the template for building new Companion modules (e.g., VENU360). All code is CommonJS (Node.js), using the `@companion-module/base` API.

---

## 1. PROJECT STRUCTURE & ENTRY POINT

### Package.json
```json
{
  "name": "companion-module-dbx-driverack-pa2",
  "version": "0.3.20260328",
  "main": "src/main.js",
  "engines": { "node": "^22.20", "yarn": "^4" },
  "dependencies": { "@companion-module/base": "~1.14.1" },
  "devDependencies": {
    "@companion-module/tools": "^2.6.1",
    "prettier": "^3.7.4"
  }
}
```

### Manifest (companion/manifest.json)
```json
{
  "$schema": "../node_modules/@companion-module/base/assets/manifest.schema.json",
  "id": "dbx-driverack-pa2",                          // Unique module ID
  "name": "dbx DriveRack PA2",                        // Human-readable name
  "shortname": "PA2",                                 // UI abbreviation
  "description": "Control dbx DriveRack PA2...",     // Brief purpose
  "version": "0.3.20260328",                         // Semantic versioning
  "license": "MIT",
  "runtime": {
    "type": "node22",
    "api": "nodejs-ipc",
    "apiVersion": "0.0.0",
    "entrypoint": "../src/main.js"                   // Entry point
  },
  "manufacturer": "dbx",
  "products": ["DriveRack PA2"],
  "keywords": ["audio", "loudspeaker", "feedback", "eq"]
}
```

### Entry Point (src/main.js)
- Exports the instance class extending `InstanceBase` from `@companion-module/base`
- Initializes connections, state management, and loads all definitions
- Must call three setup methods during `init()`:
  1. `setActionDefinitions()` — for button actions
  2. `setFeedbackDefinitions()` — for state-based visual updates
  3. `setVariableDefinitions()` — for dynamic text/status display

---

## 2. ACTIONS PATTERN

### Structure
File: `src/actions.js` (1064 lines in PA2)

**Module export** wraps all actions in `self.setActionDefinitions({...})`

### Action Definition Schema

```javascript
module.exports = function (self) {
  self.setActionDefinitions({
    // Action ID (camelCase)
    mute_toggle: {
      name: 'Mute Toggle',           // Display name in UI
      options: [                      // User-configurable parameters
        {
          id: 'output',               // Option ID (camelCase)
          type: 'dropdown',           // Type: dropdown, number, textinput
          label: 'Output',            // UI label
          choices: MUTE_OUTPUTS,      // Array of {id, label}
          default: 'HighLeft',        // Initial value
        }
      ],
      callback: async (event) => {
        // event.options contains user selections
        const out = event.options.output
        const current = self.pa2State.mutes[out]  // Read device state
        const cmds = buildCommand('mute_set', {   // Build protocol command
          output: out,
          value: !current
        }, self.topology)
        self.sendCommands(cmds)                   // Send to device
      },
    },
    
    // Number input example
    geq_band: {
      name: 'GEQ Band Gain',
      options: [
        { id: 'band', type: 'dropdown', label: 'Band', choices: GEQ_BAND_CHOICES, default: 18 },
        { id: 'gain', type: 'number', label: 'Gain (dB)', 
          default: 0, min: -12, max: 12, step: 0.5 },
      ],
      callback: async (event) => {
        const cmds = buildCommand('geq_band', {
          band: event.options.band,
          gain: event.options.gain
        }, self.topology)
        self.sendCommands(cmds)
      },
    },
    
    // Macro with no options
    mute_all: {
      name: 'Mute All Outputs',
      options: [],
      callback: async () => {
        const cmds = buildCommand('mute_all', {}, self.topology)
        self.sendCommands(cmds)
      },
    },
  })
}
```

### Option Types

| Type | Example | Notes |
|------|---------|-------|
| `dropdown` | `{ id: 'output', type: 'dropdown', choices: OUTPUTS, default: 'High' }` | Discrete choices, `id` matches choice ID |
| `number` | `{ id: 'gain', type: 'number', default: 0, min: -12, max: 12, step: 0.5 }` | Numeric input with bounds |
| `textinput` | `{ id: 'text', type: 'textinput', default: '' }` | String input |

### Choice Format
```javascript
const MUTE_OUTPUTS = [
  { id: 'HighLeft', label: 'High Left' },
  { id: 'HighRight', label: 'High Right' },
  // ...
]
```

### Topology-Aware Choices
Actions often pass `self.topology` to `buildCommand()` because device topology varies:

```javascript
const XOVER_BANDS = [
  { id: 'Band_1', label: 'Band 1 (High)' },
  { id: 'Band_2', label: 'Band 2 (Mid)' },
  { id: 'Band_3', label: 'Band 3 (Low)' },
  { id: 'MonoSub', label: 'Mono Sub' },
]
```

The protocol builder (`buildCommand`) uses topology to generate correct low-level commands.

### Callback Pattern

All callbacks are `async (event) => { ... }` and follow this sequence:

1. **Extract options** from `event.options`
2. **Read device state** from `self.pa2State` (if needed for logic)
3. **Build commands** via `buildCommand()` helper
4. **Send commands** via `self.sendCommands(cmds)` or `self.sendCommandsBurst(cmds)`

---

## 3. FEEDBACKS PATTERN

### Structure
File: `src/feedbacks.js` (195 lines in PA2)

Module export wraps all feedbacks in `self.setFeedbackDefinitions({...})`

### Feedback Definition Schema

```javascript
module.exports = async function (self) {
  self.setFeedbackDefinitions({
    // Feedback ID (camelCase)
    connected: {
      name: 'PA2 Connected',              // Display name in UI
      type: 'boolean',                     // Only 'boolean' in PA2; Companion may support 'advanced'
      defaultStyle: {
        bgcolor: GREEN,                    // RGB color object via combineRgb()
        color: BLACK,                      // Text color
      },
      options: [],                         // Feedback-specific options (often empty)
      callback: () => self.connState === 'READY',  // Returns boolean
    },
    
    // Feedback with options
    mute_state: {
      name: 'Output Muted',
      type: 'boolean',
      defaultStyle: { bgcolor: RED, color: WHITE },
      options: [
        { id: 'output', type: 'dropdown', label: 'Output',
          choices: MUTE_OUTPUTS, default: 'HighLeft' }
      ],
      callback: (feedback) => self.pa2State.mutes[feedback.options.output] === true,
    },
    
    // Feedback with computed logic
    peq_enabled: {
      name: 'PEQ Enabled',
      type: 'boolean',
      defaultStyle: { bgcolor: GREEN, color: BLACK },
      options: [
        { id: 'output', type: 'dropdown', label: 'Output',
          choices: OUTPUT_BANDS, default: 'High' }
      ],
      callback: (feedback) => {
        const peq = self.pa2State.peq[feedback.options.output]
        return peq ? peq.enabled === true : false
      },
    },
    
    // Scene feedback
    active_scene: {
      name: 'Active Scene Matches',
      type: 'boolean',
      defaultStyle: { bgcolor: GREEN, color: BLACK },
      options: [{
        id: 'scene', type: 'dropdown', label: 'Scene',
        choices: [
          { id: 'KEYNOTE', label: 'Keynote' },
          { id: 'PANEL', label: 'Panel' },
          { id: 'Q&A', label: 'Q&A' },
          // ...
        ],
        default: 'KEYNOTE',
      }],
      callback: (feedback) => self.pa2State.activeScene === feedback.options.scene,
    },
    
    // Threshold-based feedback
    rta_peak_alert: {
      name: 'RTA Peak Alert (feedback warning)',
      type: 'boolean',
      defaultStyle: { bgcolor: RED, color: WHITE },
      options: [
        { id: 'threshold', type: 'number', label: 'Alert threshold (dB)',
          default: -25, min: -40, max: -10 }
      ],
      callback: (feedback) => {
        const rta = self.pa2State.meters?.rta
        if (!rta) return false
        const thresh = feedback.options.threshold || -25
        return rta.some(v => v > thresh)
      },
    },
  })
}
```

### Color Language Pattern

Defined at module scope with `combineRgb()` from base:

```javascript
const { combineRgb } = require('@companion-module/base')

const RED = combineRgb(204, 0, 0)
const GREEN = combineRgb(0, 204, 0)
const YELLOW = combineRgb(204, 204, 0)
const BLUE = combineRgb(0, 100, 204)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const ORANGE = combineRgb(255, 140, 0)
const DARK = combineRgb(40, 40, 40)
const CYAN = combineRgb(0, 180, 200)
const PURPLE = combineRgb(140, 0, 200)
const DKRED = combineRgb(100, 0, 0)
const DKGREEN = combineRgb(0, 80, 0)
const DKBLUE = combineRgb(0, 40, 120)
const TEAL = combineRgb(0, 160, 160)
const GOLD = combineRgb(200, 160, 0)
const LIME = combineRgb(100, 200, 0)
const PINK = combineRgb(200, 50, 100)
```

### Feedback Callback Patterns

| Pattern | Use Case |
|---------|----------|
| `callback: () => bool` | Simple state check (no feedback options) |
| `callback: (feedback) => feedback.options.x === value` | Simple comparison with user choice |
| `callback: (feedback) => { const x = self.pa2State...; return condition; }` | Complex logic with state inspection |
| `callback: (feedback) => array.some(v => v > threshold)` | Threshold-based detection |

---

## 4. VARIABLES PATTERN

### Structure
File: `src/variables.js` (full file ~400 lines)

Module export: `module.exports = function (self) { ... }`

Inside function:
1. **Define** all variables via `self.setVariableDefinitions(defs)`
2. **Initialize** defaults via `self.setVariableValues(defaults)`

### Variable Definition Schema

```javascript
module.exports = function (self) {
  const defs = []

  // Device info
  defs.push({ variableId: 'device_model', name: 'Device Model' })
  defs.push({ variableId: 'device_name', name: 'Device Name' })
  defs.push({ variableId: 'device_version', name: 'Firmware Version' })

  // Mutes (6 outputs in PA2 topology)
  for (const out of ['highleft', 'highright', 'midleft', 'midright', 'lowleft', 'lowright']) {
    defs.push({ variableId: `mute_${out}`, name: `Mute ${out}` })
  }

  // GEQ bands (31 bands, with frequency labels)
  for (let b = 1; b <= 31; b++) {
    defs.push({ variableId: `geq_band_${b}`, name: `GEQ Band ${b} (${GEQ_BANDS[b]})` })
    defs.push({ variableId: `geq_${GEQ_SHORT_LABELS[b]}_fmt`, name: `GEQ ${GEQ_SHORT_LABELS[b]} Formatted` })
  }

  // PEQ per output band (high/mid/low with 8 filters each)
  for (const out of ['high', 'mid', 'low']) {
    defs.push({ variableId: `peq_${out}_enabled`, name: `PEQ ${out} Enabled` })
    for (let f = 1; f <= 8; f++) {
      for (const field of ['type', 'frequency', 'gain', 'q', 'slope']) {
        defs.push({ variableId: `peq_${out}_${f}_${field}`, name: `PEQ ${out} Band ${f} ${field}` })
      }
    }
  }

  // Limiters
  for (const band of ['high', 'mid', 'low']) {
    defs.push({ variableId: `lim_${band}_limiter`, name: `Limiter ${band} Enabled` })
    defs.push({ variableId: `lim_${band}_threshold`, name: `Limiter ${band} Threshold` })
    defs.push({ variableId: `lim_${band}_overeasy`, name: `Limiter ${band} OverEasy` })
  }

  // Meters (DSP-sourced)
  defs.push({ variableId: 'meter_input_l', name: 'Input Level L (dB)' })
  defs.push({ variableId: 'meter_input_r', name: 'Input Level R (dB)' })
  defs.push({ variableId: 'meter_comp_input', name: 'Compressor Input Level (dB)' })
  defs.push({ variableId: 'meter_comp_gr', name: 'Compressor Gain Reduction (dB)' })
  defs.push({ variableId: 'meter_comp_gr_fmt', name: 'Compressor GR (formatted)' })

  // Visual bars (Unicode block characters for meter display)
  defs.push({ variableId: 'meter_input_l_bar', name: 'Input L Level Bar' })
  defs.push({ variableId: 'meter_input_r_bar', name: 'Input R Level Bar' })
  defs.push({ variableId: 'meter_input_fmt', name: 'Input Levels (formatted)' })

  // RTA spectrum (31 bands)
  for (let b = 1; b <= 31; b++) {
    defs.push({ variableId: `rta_band_${b}`, name: `RTA Band ${b} (${GEQ_BANDS[b]}) dB` })
  }
  defs.push({ variableId: 'rta_visual', name: 'RTA Full Spectrum (31-char bar graph)' })
  defs.push({ variableId: 'rta_peak_freq', name: 'RTA Peak Frequency' })
  defs.push({ variableId: 'rta_peak_db', name: 'RTA Peak Level (dB)' })

  // Scene tracking
  defs.push({ variableId: 'active_scene', name: 'Active Scene Name' })

  // Detection macros
  defs.push({ variableId: 'detect_last_freq', name: 'Last Detected Frequency' })
  defs.push({ variableId: 'detect_last_action', name: 'Last Detection Action' })
  defs.push({ variableId: 'detect_active', name: 'Detection Active' })

  self.setVariableDefinitions(defs)

  // Initialize defaults BEFORE state loads
  const defaults = {
    device_model: '', device_name: '', device_version: '',
    geq_enabled: 'Off', geq_mode: '',
    comp_compressor: '', comp_threshold: '', comp_gain: '', comp_ratio: '', comp_overeasy: '',
    sub_enabled: '', sub_master: '', sub_lows: '', sub_highs: '',
    gen_mode: 'Off', gen_level: '-60',
    input_delay_enabled: '', input_delay_ms: '0',
    conn_status_fmt: 'DISCONNECTED', preset_fmt: '',
    rta_flat_score: '--',
    active_scene: '--',
    detect_last_freq: '', detect_last_action: 'IDLE', detect_slots_used: '0/8', detect_active: 'OFF',
  }

  // Set mute defaults
  for (const out of ['highleft', 'highright', 'midleft', 'midright', 'lowleft', 'lowright']) {
    defaults[`mute_${out}`] = 'LIVE'
  }

  // Set GEQ band defaults
  for (let b = 1; b <= 31; b++) {
    defaults[`geq_band_${b}`] = 0
    defaults[`geq_${GEQ_SHORT_LABELS[b]}_fmt`] = '0dB'
  }

  self.setVariableValues(defaults)
}
```

### Variable Naming Convention

- **Raw values**: `meter_input_l` (numeric dB or integer)
- **Formatted display**: `meter_input_l_bar` (visual bar) or `meter_input_l_fmt` (text like "-20 dB")
- **Topology-aware**: `peq_high_enabled`, `peq_mid_enabled`, `peq_low_enabled` (per output band)
- **Indexed iteration**: `geq_band_1`, `geq_band_2`, ..., `geq_band_31` (1-based)

---

## 5. PRESETS PATTERN

### Structure
File: `src/presets.js` (843 lines in PA2)

Module export: `module.exports = function (self) { ... }`

Returns object where keys are preset IDs, values are preset objects.

### Preset Definition Schema

```javascript
const { combineRgb } = require('@companion-module/base')

module.exports = function (self) {
  const presets = {}

  // ─── Helper functions ───
  function btn(category, name, text, size, color, bgcolor, actionId, options, feedbacks) {
    return {
      type: 'button',
      category,
      name,
      style: { text, size: String(size), color, bgcolor },
      steps: [{ down: [{ actionId, options: options || {} }], up: [] }],
      feedbacks: feedbacks || [],
    }
  }

  function btnMulti(category, name, text, size, color, bgcolor, actions, feedbacks) {
    return {
      type: 'button',
      category,
      name,
      style: { text, size: String(size), color, bgcolor },
      steps: [{ down: actions.map(a => ({ actionId: a[0], options: a[1] || {} })), up: [] }],
      feedbacks: feedbacks || [],
    }
  }

  // ─── Example: Simple mute button ───
  presets['mute_high_left'] = {
    type: 'button',
    category: 'Show Control',
    name: 'Mute High Left',
    style: {
      text: 'HIGH L\\n$(pa2:mute_high_l_fmt)',  // Variable interpolation with $(module:var)
      size: '14',
      color: WHITE,
      bgcolor: DKGREEN,
    },
    steps: [
      {
        down: [{ actionId: 'mute_toggle', options: { output: 'HighLeft' } }],  // On button press
        up: [],  // On button release (typically empty)
      }
    ],
    feedbacks: [
      {
        feedbackId: 'mute_state',
        options: { output: 'HighLeft' },
        style: { bgcolor: RED, color: WHITE },  // Visual change when muted
      }
    ],
  }

  // ─── Example: Multi-action button ───
  presets['show_open'] = btnMulti('Show Macros', 'Show Open', 'SHOW\\nOPEN', 18, BLACK, GREEN,
    [
      ['gen_mode', { mode: 'Off' }],
      ['mute_all', {}],
      // Multiple actions execute in sequence
    ]
  )

  // ─── Example: Display-only button ───
  presets['conn_status'] = {
    type: 'button',
    category: 'Show Control',
    name: 'Connection Status',
    style: {
      text: '$(pa2:device_name)\\n$(pa2:conn_status_fmt)',
      size: '14',
      color: WHITE,
      bgcolor: DARK,
    },
    steps: [{ down: [], up: [] }],  // No actions
    feedbacks: [{ feedbackId: 'connected', style: { bgcolor: DKGREEN } }],
  }

  // ─── Example: Generator mode buttons (mutually exclusive) ───
  presets['gen_pink'] = btn('Show Macros', 'Pink Noise', 'GEN\\nPINK', 18, BLACK, ORANGE, 
    'gen_mode', { mode: 'Pink' }, [
    { feedbackId: 'gen_active', style: { bgcolor: RED, color: WHITE } },
  ])

  presets['gen_white'] = btn('Show Macros', 'White Noise', 'GEN\\nWHITE', 18, BLACK, ORANGE,
    'gen_mode', { mode: 'White' }, [
    { feedbackId: 'gen_active', style: { bgcolor: RED, color: WHITE } },
  ])

  presets['gen_off'] = btn('Show Macros', 'Generator Off', 'GEN\\nOFF', 18, WHITE, DKRED,
    'gen_mode', { mode: 'Off' }, [
    { feedbackId: 'gen_active', style: { bgcolor: YELLOW, color: BLACK } },
  ])

  self.setPresetDefinitions(presets)
}
```

### Preset Organization By Category

The PA2 module defines presets in logical categories:

1. **Show Control** — Main mixer controls (mutes, status, presets)
2. **Show Macros** — One-press workflows (show open/close, soundcheck, ring out, panic)
3. **Scene Macros** — Live sound venue setups (outdoor, feedback emergency, prayer, worship)
4. **GEQ Pages** — Per-band faders and increment/decrement buttons
5. **Combo Meters** — Multi-variable display buttons (stereo input, processing GR, signal chain)
6. **Corporate AV** — Complete event control (scene selectors, safety, meters, quick tools)

Categories appear as tabs in Companion's UI. Use meaningful names that group related presets.

### Variable Interpolation

Variables are interpolated in preset text using `$(module:variableId)` syntax:

```javascript
text: 'HIGH L\\n$(pa2:mute_high_l_fmt)',
text: 'PRESET\\n$(pa2:preset_fmt)',
text: 'IN L$(pa2:meter_input_l_bar)\\nIN R$(pa2:meter_input_r_bar)',
```

This renders live values directly on Stream Deck buttons.

### Preset Style Structure

```javascript
style: {
  text: 'button text',    // Display text (use \\n for newlines)
  size: '14',             // Font size as string
  color: WHITE,           // Text color (combineRgb)
  bgcolor: DARK,          // Background color
}
```

### Feedback Integration

Feedbacks modify button style conditionally:

```javascript
feedbacks: [
  {
    feedbackId: 'mute_state',
    options: { output: 'HighLeft' },        // Pass options to feedback callback
    style: { bgcolor: RED, color: WHITE },  // Style change when feedback is true
  },
  {
    feedbackId: 'gen_active',
    style: { bgcolor: RED, color: WHITE },
  },
]
```

---

## 6. STATE MANAGEMENT PATTERN

### Device State Object (`self.pa2State`)

The module maintains a single state object that mirrors device configuration:

```javascript
self.pa2State = {
  // Mutes (per output)
  mutes: {
    HighLeft: false,
    HighRight: false,
    MidLeft: false,
    MidRight: false,
    LowLeft: false,
    LowRight: false,
  },

  // GEQ
  geq: {
    enabled: false,
    mode: 'Flat',
    bands: [0, 0, 0, ...], // 31 bands, 1-indexed
  },

  // PEQ (per output band)
  peq: {
    High: { enabled: false, filters: [{ type: 'Bell', freq: 1000, gain: 0, q: 4 }, ...] },
    Mid: { enabled: false, filters: [...] },
    Low: { enabled: false, filters: [...] },
  },

  // Room EQ
  autoeq: {
    enabled: false,
    mode: 'Flat',
    filters: [...],
  },

  // AFS (Automatic Feedback Suppressors)
  afs: {
    AFS: false,           // Enabled/disabled
    FilterMode: 'Live',   // 'Live' or 'Fixed'
    ContentMode: 'Speech Music',
    MaxFixedFilters: 6,
    LiftTime: 300,
  },

  // Compressor
  compressor: {
    compressor: false,
    threshold: -20,
    gain: 0,
    ratio: '4.0:1',
    overeasy: 0,
  },

  // Limiters (per band)
  limiters: {
    High: { limiter: false, threshold: -6, overeasy: 0 },
    Mid: { limiter: false, threshold: -6, overeasy: 0 },
    Low: { limiter: false, threshold: -6, overeasy: 0 },
  },

  // Crossover
  crossover: {
    Band_1: { hp_type: 'BW 24', hp_freq: 1000, lp_type: 'BW 24', lp_freq: 5000, gain: 0, polarity: 'Normal' },
    Band_2: { ... },
    Band_3: { ... },
    MonoSub: { ... },
  },

  // Subharmonic
  subharmonic: {
    enabled: false,
    master: 0,
    lows: 0,
    highs: 0,
  },

  // Generator (test tone)
  generator: {
    mode: 'Off',  // 'Off', 'Pink', 'White'
    level: -60,
  },

  // Delays
  inputDelay: { enabled: false, ms: 0 },
  outputDelays: {
    High: { enabled: false, ms: 0 },
    Mid: { enabled: false, ms: 0 },
    Low: { enabled: false, ms: 0 },
  },

  // Topology (device configuration)
  // Varies by device model; used to determine available outputs
  topology: 'standard', // 'stereo', 'dualMono', etc.

  // Meters (DSP-sourced, updated frequently)
  meters: {
    inputL: -60,
    inputR: -60,
    compInput: -60,
    compGR: 0,
    limInput: -60,
    limGR: 0,
    outputHL: -60,
    outputHR: -60,
    outputML: -60,
    outputMR: -60,
    outputLL: -60,
    outputLR: -60,
    rta: [0, 0, 0, ...], // 31-band RTA spectrum
  },

  // Active scene (for preset tracking)
  activeScene: 'KEYNOTE',

  // RTA snapshot (for A/B comparison)
  rtaSnapshot: [0, 0, 0, ...],

  // Detection state
  detection: {
    active: false,
    lastFreq: 0,
    lastAction: 'IDLE',
    slotsUsed: '0/8',
  },

  // Current preset
  preset: {
    current: 'Default',
    changed: false,
  },
}
```

### State Update Pattern

When device state changes (received from device via network protocol):

```javascript
// In protocol parser
self.pa2State.mutes.HighLeft = true
self.setVariableValues({ mute_highleft: 'MUTE', mute_high_l_fmt: 'MUTE' })
self.checkFeedbacks('mute_state')  // Trigger visual updates
```

For scene changes:

```javascript
self.pa2State.activeScene = 'KEYNOTE'
self.setVariableValues({ active_scene: 'KEYNOTE' })
self.checkFeedbacks('active_scene')  // Update buttons that use active_scene feedback
```

---

## 7. COMMAND BUILDING & PROTOCOL

### buildCommand() Helper

The PA2 module abstracts low-level protocol details through `buildCommand()`:

```javascript
const { buildCommand } = require('./pa2-protocol')

// In action callback:
const cmds = buildCommand('mute_set', { output: 'HighLeft', value: true }, self.topology)
self.sendCommands(cmds)
```

**buildCommand signature:**
```javascript
buildCommand(actionName, options, topology) → Array<command>
```

Returns an array of low-level commands (UDP packets, Telnet lines, etc.) that the protocol understands.

### Sending Commands

```javascript
// Single command
self.sendCommands(cmds)

// Burst (rapid fire for macro operations)
self.sendCommandsBurst(cmds)
```

---

## 8. CONNECTION & INITIALIZATION

### Connection State

```javascript
self.connState = 'DISCONNECTED'  // | 'READY'
```

Updated when network connection establishes/closes. Feedbacks check this:

```javascript
connected: {
  name: 'PA2 Connected',
  type: 'boolean',
  defaultStyle: { bgcolor: GREEN, color: BLACK },
  options: [],
  callback: () => self.connState === 'READY',
}
```

### Module Initialization

In `main.js`:

```javascript
class PA2Instance extends InstanceBase {
  async init(config) {
    // 1. Parse config (host, port, etc.)
    this.config = config

    // 2. Initialize state
    this.pa2State = { ... }
    this.connState = 'DISCONNECTED'

    // 3. Load all definitions
    await require('./actions')(this)
    await require('./feedbacks')(this)
    await require('./variables')(this)
    await require('./presets')(this)

    // 4. Establish network connection
    this.connect()
  }

  async connect() {
    // UDP/Telnet connection logic
    this.connState = 'READY'
    this.checkFeedbacks('connected')
  }
}
```

---

## 9. LOGGING & DEBUGGING

### Log Levels

```javascript
self.log('info', 'Normal operation message')
self.log('warn', 'Warning condition')
self.log('error', 'Error condition')
self.log('debug', 'Detailed debug info')
```

### Common Log Patterns

```javascript
// Action triggered
self.log('info', `Toggling mute on ${out}`)

// State change
self.log('info', `GEQ enabled`)

// Warning for macro
self.log('warn', 'FEEDBACK EMERGENCY — cutting 800Hz-4kHz by -6dB')

// Status update
self.log('info', `Auto-EQ: Target ${target}dB, max cut ${maxCut}dB, max boost +${maxBoost}dB`)

// Macro result
self.log('info', 'RTA snapshot saved')
```

---

## 10. TOPOLOGY-AWARE DESIGN

The PA2 supports multiple configurations (stereo, dual-mono, etc.). Actions and variables must handle this gracefully:

### Example: Output Bands

```javascript
const OUTPUT_BANDS = [
  { id: 'High', label: 'High' },
  { id: 'Mid', label: 'Mid' },
  { id: 'Low', label: 'Low' },
]
```

Actions pass `self.topology` to `buildCommand()` so the protocol layer can generate correct commands for the device's configuration.

### Variables Define All Possible Bands

Even if a device doesn't use all bands (e.g., stereo doesn't use both left/right per band), define variables for all possible combinations. The protocol fills in only what exists.

---

## 11. KEY ARCHITECTURAL DECISIONS FOR VENU360

When adapting this for VENU360:

1. **Identify output topology** — Does it use stereo, dual-mono, individual channels? Define `MUTE_OUTPUTS` accordingly.

2. **Determine DSP features** — Which EQ types (GEQ/PEQ), dynamics (comp/lim), specialties (AFS, room correction)? Define actions for each.

3. **Protocol layer** — Create equivalent of `pa2-protocol.js` with `buildCommand()` that generates VENU360-specific commands.

4. **State structure** — Mirror device config in `self.venu360State` object matching VENU360's parameter hierarchy.

5. **Variables** — Define variables for every user-controllable parameter and every meter/status.

6. **Presets** — Create categories matching typical VENU360 workflows (e.g., "Speaker Optimization", "Input Makeup", "Frequency Shift", etc.).

7. **Feedbacks** — Use boolean type matching VENU360's binary states (on/off, active/inactive).

---

## File Organization Template

```
companion-module-venu360/
├── companion/
│   └── manifest.json
├── src/
│   ├── main.js                 # Entry point, InstanceBase
│   ├── actions.js              # self.setActionDefinitions()
│   ├── feedbacks.js            # self.setFeedbackDefinitions()
│   ├── variables.js            # self.setVariableDefinitions()
│   ├── presets.js              # self.setPresetDefinitions()
│   ├── venu360-protocol.js     # buildCommand() & low-level protocol
│   └── config.js               # Configuration UI
├── package.json
├── .prettierrc                 # Prettier config (from @companion-module/tools)
└── docs/
    └── CLAUDE.md               # Developer notes
```

---

## Summary Table

| Component | File | Purpose | Key Export |
|-----------|------|---------|------------|
| **Actions** | `src/actions.js` | Button press handlers | `setActionDefinitions({...})` |
| **Feedbacks** | `src/feedbacks.js` | State-driven visuals | `setFeedbackDefinitions({...})` |
| **Variables** | `src/variables.js` | Dynamic text/status | `setVariableDefinitions([], defaults)` |
| **Presets** | `src/presets.js` | Pre-configured buttons | `setPresetDefinitions({...})` |
| **Protocol** | `src/venu360-protocol.js` | Device communication | `buildCommand(action, opts, topo)` |
| **Manifest** | `companion/manifest.json` | Module metadata | Module ID, name, version |
| **Package** | `package.json` | Dependencies | `@companion-module/base ~1.14.1` |
