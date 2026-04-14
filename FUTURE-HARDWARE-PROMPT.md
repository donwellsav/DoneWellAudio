# Template: Adding a New Hardware Target to DWA

Use this template when you need to add support for a new mixer, processor, or EQ to the DWA Companion module.

---

## Prompt Template

Fill in the blanks and give this to Claude in the DWA repo:

```
Add a [HARDWARE NAME] mixer profile to companion-module/src/mixerProfiles.ts.

Device: [HARDWARE NAME]
Protocol: [osc | tcp]
Control port: [DEFAULT PORT]
PEQ bands available: [NUMBER]
Default channel prefix: [e.g. /ch/01/eq or 1]

The device accepts EQ commands in this format:
[DESCRIBE THE EXACT FORMAT — OSC paths + value types, or TCP payload format]

PEQ set command:
[EXACT FORMAT for setting frequency, gain, Q on one band]

PEQ clear command:
[EXACT FORMAT for zeroing one band]

GEQ set command (optional):
[EXACT FORMAT for setting one GEQ band, or "not supported"]

Value ranges:
- Frequency: [range and format — Hz float? normalized? string?]
- Gain: [range — dB direct? normalized 0-1?]
- Q: [range — direct? normalized?]
```

---

## Pattern to Follow

Every profile in `mixerProfiles.ts` follows the same structure:

### 1. Add to the type union

```typescript
export type MixerModelId =
  | 'x32'
  | ... existing ...
  | 'your_new_id'    // ← add here
```

### 2. Write builder functions

```typescript
function buildYourEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'osc',  // or 'tcp'
    oscMessages: [     // for OSC protocol
      { address: `${prefix}/band/${band}/freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `${prefix}/band/${band}/gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `${prefix}/band/${band}/q`, args: [{ type: 'f', value: q }] },
    ],
    // OR for TCP protocol:
    // tcpPayload: JSON.stringify({ command: 'set_peq', band, frequency: freqHz, gain: gainDb, q }) + '\n',
  }
}

function clearYourEq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/gain`, args: [{ type: 'f', value: 0 }] },
    ],
  }
}
```

### 3. Add to MIXER_PROFILES record

```typescript
your_new_id: {
  id: 'your_new_id',
  label: 'Your Hardware Name',
  protocol: 'osc',       // or 'tcp'
  defaultPort: 10023,     // device's standard control port
  peqBands: 6,            // how many PEQ bands are available
  defaultOscPrefix: '/ch/01/eq',  // default channel path
  buildEqMessage: (p) => buildYourEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
  buildClearMessage: (p) => clearYourEq(p.prefix, p.band),
  // Optional:
  buildGeqMessage: (p) => buildYourGeq(p.prefix, p.bandIndex, p.gainDb),
},
```

### That's it

The dropdown auto-populates. The `MixerOutput` class handles OSC/TCP transport. The slot manager handles band allocation. You only write the message format.

---

## Existing Profiles as Examples

| Profile | Protocol | Key trick |
|---------|----------|-----------|
| `x32` | OSC | Log-normalized values (freq, gain, Q all 0-1) |
| `yamaha_tf` | OSC | Direct Hz/dB/Q values (no normalization) |
| `ah_dlive` | TCP | JSON-line payloads |
| `pa2` | TCP | JSON-line with `filter` instead of `band` |
| `venu360` | OSC | Sends to Companion module, not hardware directly |
| `generic_osc` | OSC | Falls back to X32 normalization |

See `MIXER-PROFILES-REFERENCE.md` for the exact format of each.

---

## Hardware Protocol Research Tips

Before adding a profile, you need the exact command format. Sources:

- **Official docs:** Many pro audio manufacturers publish OSC/MIDI specs
- **Wireshark:** Capture traffic between the official app and the hardware
- **GitHub:** Search for `companion-module-{manufacturer}` — existing Companion modules often document the protocol
- **Forums:** The Behringer/Midas community wiki has exhaustive X32 OSC docs
- **The unit itself:** Send test commands and observe responses
