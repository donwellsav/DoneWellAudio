# Prompt: Add VENU360 Mixer Profile to DWA Companion Module

Copy this prompt into Claude when working in the DWA repo.

---

## Prompt

Add a `venu360` mixer profile to `companion-module/src/mixerProfiles.ts` so DWA can send EQ corrections to a dbx DriveRack VENU360 loudspeaker processor.

### How it works

The VENU360 has its own Companion module (`companion-module-dbx-driverack-venu360`) that handles the HiQnet TCP connection to the hardware. That module has an OSC receive port. DWA sends OSC to that port, and the VENU360 module translates to HiQnet and sends to the hardware.

```
DWA Module  ──OSC (UDP)──►  VENU360 Module  ──HiQnet TCP──►  VENU360 Hardware
 (slot mgmt)     localhost      (protocol)        LAN           (DSP changes)
```

This means no HiQnet code in DWA. Just OSC to localhost.

### Changes to `companion-module/src/mixerProfiles.ts`

**1. Add to the `MixerModelId` union:**
```typescript
export type MixerModelId =
  | 'x32'
  | 'midas_m32'
  | 'yamaha_tf'
  | 'yamaha_cl'
  | 'ah_dlive'
  | 'ah_sq'
  | 'pa2'
  | 'generic_osc'
  | 'venu360'        // ← add this
```

**2. Add helper functions** (before the Profile Registry section):

```typescript
// ═══ VENU360 (OSC via VENU360 Companion module) ═══
// Sends to the VENU360 Companion module's OSC receive port.
// Frequency as float Hz — the VENU360 module auto-formats to
// device strings ("250Hz", "1kHz", "12.5kHz").

function buildVenu360PeqEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  const inst = prefix || '1'
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `/venu360/peqout/${inst}/band/${band}/freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `/venu360/peqout/${inst}/band/${band}/gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `/venu360/peqout/${inst}/band/${band}/q`, args: [{ type: 'f', value: q }] },
    ],
  }
}

function clearVenu360PeqEq(prefix: string, band: number): EqMessage {
  const inst = prefix || '1'
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `/venu360/peqout/${inst}/band/${band}/gain`, args: [{ type: 'f', value: 0 }] },
    ],
  }
}

function buildVenu360Geq(prefix: string, bandIndex: number, gainDb: number): EqMessage {
  const inst = prefix || '1'
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `/venu360/geq/${inst}/band/${bandIndex + 1}`, args: [{ type: 'f', value: gainDb }] },
    ],
  }
}
```

**3. Add to `MIXER_PROFILES` record:**

```typescript
venu360: {
  id: 'venu360',
  label: 'dbx DriveRack VENU360',
  protocol: 'osc',
  defaultPort: 9000,
  peqBands: 8,
  defaultOscPrefix: '1',
  buildEqMessage: (p) => buildVenu360PeqEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
  buildClearMessage: (p) => clearVenu360PeqEq(p.prefix, p.band),
  buildGeqMessage: (p) => buildVenu360Geq(p.prefix, p.bandIndex, p.gainDb),
},
```

### That's the entire change

One file. Three additions (type union, helper functions, profile entry). No new dependencies. The existing `MixerOutput.sendOscMessages()` handles the UDP send. The dropdown auto-populates.

### VENU360-specific details

- **PEQ:** 8 bands per output × 6 outputs. The `prefix` field is the output number (1-6).
- **GEQ:** 31 bands per chain × 3 chains. The `prefix` field is the chain number (1=A, 2=B, 3=C).
- **Frequency:** Send as float Hz (e.g. 2500.0). The VENU360 module converts `2500` → `"2.5kHz"` automatically.
- **Gain:** Direct dB value. PEQ range: -20 to +20. GEQ range: -20 to +20.
- **Q:** Direct value. Range: 0.1 to 128.
- **Rate limiting:** The VENU360 module throttles to 20 updates/sec per path. DWA doesn't need to throttle.
- **Port 9000:** This is the VENU360 module's OSC receive port (user-configured). Not the HiQnet port (19272).

### User setup in Companion

1. Add both modules: **DoneWell Audio** and **dbx DriveRack VENU360**
2. VENU360 module: set hardware IP, set OSC Receive Port to 9000
3. DWA module: Mixer Model → "dbx DriveRack VENU360", Mixer IP → `127.0.0.1`, Port → `9000`
4. Prefix: output channel `1` through `6` (for PEQ) or chain `1`-`3` (for GEQ)

### Build and test

```bash
cd companion-module && npm run build
```
