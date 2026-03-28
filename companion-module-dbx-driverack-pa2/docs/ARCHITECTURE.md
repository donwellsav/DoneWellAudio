# PA2 Companion Module — Architecture

## System Overview

```
                          ┌─────────────────────────┐
  donewellaudio.com ─────>│                         │
  (HTTPS browser)   HTTP  │   Bitfocus Companion    │
                          │   + PA2 Module          │
  Stream Deck XL ────────>│                         │
  (buttons/presets)       │   src/main.js           │
                          │   ├─ TCP :19272 control │──── PA2 Control Port
                          │   ├─ TCP :19274 meters  │──── PA2 DSP Port
                          │   └─ HTTP bridge        │
                          └─────────────────────────┘
```

The module maintains two simultaneous TCP connections to the PA2:
- **Port 19272** — HiQnet text protocol for reading/writing all parameters
- **Port 19274** — DSP command interface for real-time meter data (RTA, levels, GR)

## File Map

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.js` | ~1200 | InstanceBase subclass: TCP connections, state machine, HTTP bridge, DSP meters |
| `src/pa2-protocol.js` | ~620 | Protocol layer: response parser, command builder, GEQ band constants |
| `src/actions.js` | ~850 | All action definitions: mutes, GEQ, PEQ, AFS, compressor, macros, RTA-driven |
| `src/feedbacks.js` | ~150 | Boolean feedbacks: mute state, enabled states, meter thresholds |
| `src/variables.js` | ~200 | Variable definitions + initial defaults: 200+ variables including meters |
| `src/presets.js` | ~500 | Stream Deck button templates: 200+ presets in 24 categories |
| `src/upgrades.js` | 3 | Version migration scripts (empty) |

## Connection Lifecycle

### Control Port (19272)

```
init() → _initTcp()
    │
    ├─ TCPHelper auto-connects
    ├─ 'connect' → clear buffer, start handshake timeout (10s)
    │
    ├─ WAIT_HELLO ← "HiQnet Console"
    │   └─ send: connect administrator <password>
    │
    ├─ AUTHENTICATING ← "connect logged in as administrator"
    │   └─ send: ls "\\Preset"
    │
    ├─ DISCOVERING ← module names until "endls"
    │   └─ _finalizeTopology() → set topology variables
    │   └─ updateActions/Feedbacks/Variables (topology-aware)
    │   └─ _readAllState() → ~176 get commands at 5ms spacing
    │   └─ _initDspMeters() → start port 19274 connection
    │
    └─ READY ← parse responses, update state, push variables
        └─ _subscribeAll() → sub commands for real-time push
        └─ _startKeepalive() → get Class_Name every 30s
```

### DSP Meter Port (19274)

```
_initDspMeters()
    │
    ├─ Raw TCP socket (not TCPHelper — no auto-reconnect needed)
    ├─ "Started Dspcmd processor" → ready
    │
    ├─ _discoverMeterIds()
    │   └─ sends: module "OA/<module>" meterids (7 modules)
    │   └─ collects hex IDs for RTA, input, output, comp, limiter meters
    │
    └─ _startMeterPoll() → setInterval at 200ms
        └─ _pollMeters()
            ├─ sends: 31 RTA reads + 8 level reads = 39 commands per cycle
            ├─ _meterReadCallback maps responses to pa2State.meters
            └─ _computeMeterVisuals() → unicode bars, peak tracker, formatted values
```

## State Management

### pa2State Object

```javascript
{
  device: { model, name, version },
  topology: { modules, stereoGeq, leftGeq, rightGeq, hasHigh, hasMid, hasLow, ... },
  geq: { enabled, mode, bands: { 1: gain, ..., 31: gain } },
  peq: { High/Mid/Low: { enabled, filters: { 1-8: { Type, Frequency, Gain, Q, Slope } } } },
  autoeq: { enabled, mode, filters },
  afs: { AFS: bool, FilterMode, ContentMode, MaxFixedFilters, LiftTime },
  compressor: { compressor: bool, threshold, gain, ratio, overeasy },
  limiters: { High/Mid/Low: { limiter: bool, threshold, overeasy } },
  mutes: { HighLeft, HighRight, MidLeft, MidRight, LowLeft, LowRight },
  subharmonic: { enabled, master, lows, highs },
  generator: { mode, level },
  inputDelay: { enabled, ms },
  outputDelays: { High/Mid/Low: { enabled, ms } },
  rta: { rate, offset },
  crossover: { Band_1/Band_2/Band_3/MonoSub: { hpType, lpType, hpFreq, lpFreq, gain, polarity } },
  preset: { current, changed },
  meters: { rta: [31 floats], inputL, inputR, compInput, compGR, limInput, limGR, outputHL, outputHR },
  autoNotch: { active, slotsUsed, pending, lastDetectFreq, lastDetectAction },
}
```

### Data Flow

```
PA2 response line
    │
    ├─ parseResponse(line) → { module, param, value, ... }
    │   (pa2-protocol.js — pure function, no side effects)
    │
    ├─ _updateStateFromParsed(result)
    │   ├─ updates pa2State
    │   ├─ computes formatted variables (*_fmt)
    │   ├─ pushes to Companion: setVariableValues(vars)
    │   └─ triggers: checkFeedbacks()
    │

## Auto-Notch Pipeline Note

The current auto-notch implementation lives directly inside `src/main.js`, not in a dedicated planning engine.

The implemented write path is:

1. `POST /detect`
2. Request filtering and confidence gating
3. Route frequency to `High` / `Mid` / `Low`
4. Dedup against `pa2State.autoNotch.slotsUsed` in `auto` mode only
5. Allocate a PEQ band
6. Emit `peq_filter` commands
7. Mutate the in-memory `autoNotch` ledger

Important current limitation:

- `READY` does not mean the initial state load is complete.
- Auto-notch ownership is tracked in memory and is not rebuilt from hardware PEQ state after reconnect.
- `auto` and `approve` do not currently share the same planner.

See [PA2-Auto-Notch-Code-Audit.md](./PA2-Auto-Notch-Code-Audit.md) for the code-derived audit and improvement plan.
    └─ Stream Deck buttons update via variable substitution
```

## Command Sending

Two modes:

### Spaced (5ms) — `sendCommands(cmds)`
For general operations where order matters. Commands sent sequentially with 5ms delay.

### Burst (0ms) — `sendCommandsBurst(cmds)`
For GEQ updates and time-critical operations. All commands joined with `\n` and sent as a single TCP write. PA2 accepts burst writes without dropping commands (tested: 62 commands in 1ms, zero drops).

Used by: `geq_increment`, `geq_decrement`, `macro_auto_eq_from_rta`, `POST /geq`, `POST /eq/auto`, `POST /eq/curve`.

## Subscription System

After initial state load, the module subscribes to critical parameters via the `sub` command. The PA2 pushes `subr` notifications when subscribed values change — no polling needed for these:

- All 6 output mutes
- Preset current/changed
- AFS enable/mode
- Compressor enable/threshold
- Generator mode/level
- GEQ enable/mode
- Room EQ enable
- Subharmonic/limiter/PEQ enable
- Input delay enable/amount
- Wizard state/event (detects front-panel AutoEQ runs)

## Wizard State Monitoring

When a PA2 wizard becomes active (front-panel AutoEQ, for example):
1. `subr` notification: WizardState changes from "Inactive" to "Active"
2. Module logs a warning
3. When wizard finishes (state returns to "Inactive"), module calls `_readAllState()` to re-sync all parameters that may have changed

## HTTP Bridge

`handleHttpRequest()` in main.js routes requests by path:

| Path | Method | Handler |
|------|--------|---------|
| /app | GET | Self-hosted HTML control page |
| /ping | GET | Connection status |
| /state | GET | Full pa2State |
| /topology | GET | Topology object |
| /rta | GET | 31-band RTA spectrum |
| /geq | GET | Current GEQ state |
| /geq | POST | Set GEQ bands (burst) |
| /meters | GET | All live meter values |
| /eq/auto | POST | Auto-EQ from RTA |
| /eq/curve | POST | Apply target curve |
| /loop | GET | Everything in one call |
| /command | POST | Generic action dispatch |
| /detect | POST | DoneWellAudio feedback detection |
| /recommendations | GET | Pending notch suggestions |
| /approve | POST | Approve/reject notches |
| /notches | DELETE | Clear auto-placed notches |

All responses include CORS headers. API key checked if configured.
