# Companion Integration Design — MVP

**Date:** 2026-03-22
**Status:** Design (not yet implemented)
**Target hardware:** Behringer Wing (compact + rack) over OSC/UDP

---

## Problem

At a live gig, feedback detection and EQ correction are separate workflows — look at the laptop, then walk to the mixer or switch apps. This costs 5-15 seconds per feedback event.

## Solution

Connect the feedback detection app to Bitfocus Companion so detections appear as actionable buttons on a Stream Deck. The engineer sees the problem and pushes the EQ cut from the same control surface.

## Scope (MVP — personal use)

- WebSocket API in the app for Companion to connect to
- Companion module that shows feedback status + allows manual EQ push
- Direct OSC to the Wing for PEQ band control
- Local network only (the app runs on the engineer's laptop)
- Manual confirm mode only (no auto-engage)

## Not in scope

- Auto-engage mode
- Cloud relay
- Licensing or tiering
- dbx DriveRack support
- Reading current Wing EQ state

---

## Architecture

```
Browser (PWA on laptop)
  | mic input, DSP worker, advisory state
  | POST /api/companion/state every 500ms
  v
App server (pnpm start, localhost:3000)
  | WebSocket at /api/companion/ws
  | pushes advisory state to connected modules
  v
Companion Module (companion-module-dwa)
  | TypeScript, extends InstanceBase<DwaConfig>
  | receives advisories, exposes actions/feedbacks/variables
  | sends OSC directly to Wing for EQ commands
  v
Behringer Wing (venue network, OSC over UDP)
  | PEQ band applied on selected channel/bus/main
```

### Why direct OSC instead of going through the Wing Companion module?

The existing Wing module (`companion-module-behringer-wing`) does NOT expose PEQ band parameter actions (frequency, gain, Q). It only has EQ on/off and model selection. So we send OSC directly from our module to the Wing. This avoids a dependency on upstream changes we don't control.

### Wing OSC subscription constraint

The Wing only supports one active OSC subscription at a time. Our module does NOT subscribe — it only sends commands (fire-and-forget). The Wing module keeps its subscription for fader/mute state. No conflict.

---

## Component 1: WebSocket API (in this repo)

### New files

```
app/api/companion/state/route.ts  — POST endpoint, browser pushes advisory state
lib/companion/bridge.ts           — in-memory state + WebSocket relay
hooks/useCompanionSync.ts         — browser hook, POSTs state on advisory change
```

### Browser → server state payload

```typescript
interface CompanionState {
  isRunning: boolean
  mode: string
  advisories: Array<{
    id: string
    frequencyHz: number
    note: string            // "C#5"
    severity: string        // "low" | "moderate" | "high" | "critical"
    cutDb: number           // recommended cut, e.g. -6
    q: number               // recommended Q, e.g. 8
    bandHz: number          // nearest GEQ band
    confidence: number      // 0-1
  }>
}
```

Browser POSTs this to `/api/companion/state` every 500ms when Companion sync is enabled (off by default). Server caches it and pushes to any connected WebSocket clients.

### WebSocket protocol

Server → module: `{ "type": "state", "data": CompanionState }`
Module → server: `{ "type": "command", "action": "start" | "stop" | "clear" | "dismiss", ... }`
Server → module: `{ "type": "result", "action": "...", "success": true }`

### Auth

Bearer token on WebSocket upgrade. Token set in `.env.local` as `COMPANION_WS_TOKEN`. Module config has a matching token field.

### Local-only guard

Route returns 404 if `req.headers.host` doesn't match localhost or private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x).

---

## Component 2: Companion Module (separate repo)

### Module config

Based on the actual Companion SDK `getConfigFields()` pattern:

```typescript
getConfigFields(): SomeCompanionInputField[] {
  return [
    { id: 'dwaHost', type: 'textinput', label: 'App Host', default: 'localhost' },
    { id: 'dwaPort', type: 'number', label: 'App Port', default: 3000, min: 1, max: 65535 },
    { id: 'dwaToken', type: 'secret-text', label: 'Auth Token' },
    { id: 'wingHost', type: 'textinput', label: 'Wing IP Address', default: '' },
    { id: 'wingPort', type: 'number', label: 'Wing OSC Port', default: 2223, min: 1, max: 65535 },
    { id: 'targetType', type: 'dropdown', label: 'EQ Target Type', default: 'ch',
      choices: [
        { id: 'ch', label: 'Channel' },
        { id: 'bus', label: 'Bus' },
        { id: 'main', label: 'Main' },
      ]
    },
    { id: 'targetNumber', type: 'number', label: 'Target Number', default: 1, min: 1, max: 40 },
    { id: 'startBand', type: 'number', label: 'First PEQ Band to Use', default: 5, min: 1, max: 6 },
  ]
}
```

The `startBand` field lets the engineer say "I use bands 1-4 manually, let the app use bands 5-6." This prevents overwriting the engineer's own EQ.

### Actions

```typescript
setActionDefinitions([
  {
    id: 'start_analysis',
    name: 'Start Analysis',
    options: [],
    callback: () => this.sendCommand('start')
  },
  {
    id: 'stop_analysis',
    name: 'Stop Analysis',
    options: [],
    callback: () => this.sendCommand('stop')
  },
  {
    id: 'apply_cut',
    name: 'Apply EQ Cut',
    options: [
      { id: 'slot', type: 'number', label: 'Advisory Slot', default: 1, min: 1, max: 8 }
    ],
    callback: (action) => this.applyCut(action.options.slot)
  },
  {
    id: 'undo_last',
    name: 'Undo Last Cut',
    options: [],
    callback: () => this.undoLastCut()
  },
  {
    id: 'clear_all',
    name: 'Clear All Advisories',
    options: [],
    callback: () => this.sendCommand('clear')
  },
  {
    id: 'set_mode',
    name: 'Set Detection Mode',
    options: [
      { id: 'mode', type: 'dropdown', label: 'Mode',
        choices: [
          { id: 'speech', label: 'Speech' },
          { id: 'worship', label: 'Worship' },
          { id: 'liveMusic', label: 'Live Music' },
          { id: 'monitors', label: 'Monitors' },
          { id: 'ringOut', label: 'Ring Out' },
        ]
      }
    ],
    callback: (action) => this.sendCommand('setMode', { mode: action.options.mode })
  },
])
```

### Feedbacks

```typescript
setFeedbackDefinitions([
  {
    id: 'status_running',
    name: 'Analysis Running',
    type: 'boolean',
    defaultStyle: { bgcolor: 0x00cc00 }  // green
  },
  {
    id: 'feedback_detected',
    name: 'Feedback Detected',
    type: 'boolean',
    defaultStyle: { bgcolor: 0xff0000 }  // red
  },
  {
    id: 'critical_feedback',
    name: 'Critical Feedback',
    type: 'boolean',
    defaultStyle: { bgcolor: 0xff0000 }  // flashing red via style
  },
  {
    id: 'connected',
    name: 'Connected to App',
    type: 'boolean',
    defaultStyle: { bgcolor: 0x0066ff }  // blue
  },
])
```

### Variables

```typescript
setVariableDefinitions([
  { id: 'status', name: 'Analysis Status' },
  { id: 'mode', name: 'Detection Mode' },
  { id: 'advisory_count', name: 'Active Advisory Count' },
  { id: 'a1_freq', name: 'Advisory 1 Frequency' },
  { id: 'a1_note', name: 'Advisory 1 Note' },
  { id: 'a1_cut', name: 'Advisory 1 Cut (dB)' },
  { id: 'a1_q', name: 'Advisory 1 Q' },
  { id: 'a1_severity', name: 'Advisory 1 Severity' },
  // ... a2 through a8
])
```

---

## Apply Cut — Two-Press Workflow

Pressing "Apply Cut #1" does NOT immediately send OSC. It enters **targeting mode**:

### Press 1: Select the cut
Engineer presses a CUT button (e.g., "CUT #1: 2.5kHz -6dB"). The Stream Deck page switches to a **channel grid** showing available targets.

### Press 2: Select the target
Engineer taps the channel/bus/main where the cut should be applied. The module sends OSC and returns to the main page.

This two-press workflow prevents accidentally cutting the wrong channel.

### OSC Command Sequence

Once the target is selected, the module sends four OSC messages:

```
// Enable EQ on the target
{ address: "/ch/{n}/eq/on", args: { type: 'i', value: 1 } }

// Set band frequency (bands 1-4)
{ address: "/ch/{n}/eq/{band}f", args: { type: 'f', value: frequencyHz } }

// Set band gain (negative = cut)
{ address: "/ch/{n}/eq/{band}g", args: { type: 'f', value: cutDb } }

// Set band Q
{ address: "/ch/{n}/eq/{band}q", args: { type: 'f', value: q } }
```

After sending:
1. Module stores the cut in undo stack: `{ targetType, targetNumber, band, prevGain: 0 }`
2. Module sends "dismiss" to the app for that advisory
3. Module increments band counter within the configured range
4. Stream Deck returns to main page

### Band allocation

Bands are allocated sequentially from `startBand` (default 5) through 6. When all assigned bands are full:
- The CUT button still shows the advisory (frequency + recommended cut)
- But pressing it shows "NO BANDS FREE" instead of the channel grid
- Engineer must press UNDO to free a band before applying new cuts

### Undo

"Undo Last Cut" pops the undo stack and sends OSC to set the band gain back to 0 dB (flat). Does not change frequency or Q — just neutralizes the cut.

---

## Safety guardrails

| Guardrail | Value | Reason |
|-----------|-------|--------|
| Max cut depth | -12 dB | Deeper cuts audibly damage the mix |
| Max active notches | 6 per channel | Wing has 6 PEQ bands max |
| Min advisory age | 3 seconds | Prevents cutting transient false positives |
| Confidence floor | 60% | Below 60%, button shows info but won't send OSC |
| Rate limit | 1 cut per 2 seconds | Prevents rapid-fire cascading cuts |
| Undo stack | 16 deep | Can restore last 16 cuts |
| Band range | Configurable (default 5-6) | Protects engineer's manual EQ in bands 1-4 |

---

## Stream Deck layout (suggested 8-button)

```
[START/STOP] [MODE] [CLEAR] [UNDO]
[CUT #1: 2.5kHz -6dB] [CUT #2: 800Hz -4dB] [CUT #3: --] [CUT #4: --]
```

- CUT buttons show `$(dwa:a1_freq) $(dwa:a1_cut)` as dynamic text
- CUT buttons are red when advisory exists, gray when empty
- START/STOP is green when running, gray when stopped

---

## Implementation phases

### Phase 1: WebSocket API (this repo, 2-3 days)
- POST state endpoint + WebSocket relay + browser sync hook
- Settings UI: enable toggle, token, connection indicator
- Tests for protocol

### Phase 2: Companion module (new repo, 1-2 weeks)
- Scaffold with Companion module SDK
- WebSocket client to app
- Actions, feedbacks, variables
- OSC sender for Wing PEQ commands
- Test with Companion + Stream Deck

### Phase 3: Real-world testing (1 week)
- Test at a gig with the Wing
- Verify OSC PEQ paths against actual Wing behavior
- Tune safety guardrails based on real feedback scenarios
- Adjust timing, confidence thresholds, band allocation

---

## Resolved decisions

1. **Band full behavior** — Stop and indicate. Button shows advisory but won't apply. Engineer undoes a previous cut to free a band.

2. **Channel targeting** — Two-press workflow. Press CUT to enter targeting mode (channel grid), press channel to apply. Prevents wrong-channel accidents.

3. **Browser → server transport** — POST polling at 500ms. Simple, adequate latency for manual confirm mode. SSE or WebSocket from browser to server adds complexity with no benefit for MVP.

4. **Module repo structure** — Standard Companion module scaffold: TypeScript, yarn, `@companion-module/base`, `manifest.json`, `HELP.md`. Separate repo from the main app.

---

## Open questions (pre-implementation)

1. **RESOLVED — Wing channel EQ OSC paths confirmed.** Format is `/ch/{n}/eq/{band}f`, `/eq/{band}g`, `/eq/{band}q` with bands 1-4 parametric + low/high shelf. Channel also has a separate pre-send EQ at `/ch/{n}/peq/` with bands 1-3. The `eq` (post) section with 4 bands is the right target for feedback notch cuts.

2. **Next.js WebSocket server** — Two options, neither verified with Next.js 16:
   - **Option A:** Separate `ws` server on port 3001 alongside Next.js on 3000. Module connects to 3001. No custom server needed. Simpler.
   - **Option B:** Custom `server.ts` wrapping Next.js with `http.createServer()` + `ws` upgrade handler. One port but more complex setup.
   Recommend Option A for MVP. Decide during Phase 1 implementation.

3. **Stream Deck channel grid layout** — How many channels to show per page in targeting mode? Wing supports up to 40 channels. A 4x4 grid shows 16 per page (2 pages for 32 channels). Or group by channel type: channels / buses / mains on separate sub-pages.
