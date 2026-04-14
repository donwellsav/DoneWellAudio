# Mixer Profile Specifications

Exact OSC/TCP formats for every supported mixer. These are the verified formats from the existing DWA module's mixerProfiles.ts — copy the logic, not the TypeScript.

## dbx DriveRack VENU360

**Protocol:** OSC (UDP) to the VENU360 Companion module's OSC receive port
**Default port:** 9000
**PEQ bands:** 8 per output (6 outputs)

Does NOT talk to hardware directly. Sends to the VENU360 Companion module which handles HiQnet TCP.

**PEQ set:**
```
/venu360/peqout/{prefix}/band/{band}/freq  <float: Hz>     e.g. 2500.0
/venu360/peqout/{prefix}/band/{band}/gain  <float: dB>     e.g. -6.0
/venu360/peqout/{prefix}/band/{band}/q     <float>         e.g. 8.0
```
- `prefix` = output channel number 1-6
- `band` = PEQ band 1-8
- Frequency as bare Hz float — the VENU360 module auto-formats to device string ("250Hz", "1kHz")
- Gain in dB, direct value (not normalized)
- Q direct value (0.1-128)

**PEQ clear (zero a band):**
```
/venu360/peqout/{prefix}/band/{band}/gain  <float: 0.0>
```

**GEQ set:**
```
/venu360/geq/{prefix}/band/{band}  <float: dB>    e.g. -3.0
```
- `prefix` = chain 1-3 (A/B/C)
- `band` = 1-31 (ISO frequencies)
- Gain in dB, direct value (-20 to +20)

---

## Behringer X32 / Midas M32

**Protocol:** OSC (UDP)
**Default port:** 10023
**PEQ bands:** 6

Uses **normalized 0-1 values** — all three params must be converted:

**Frequency normalization (20-20000 Hz → 0.0-1.0):**
```
norm = log(hz / 20) / log(20000 / 20)
```

**Gain normalization (-15 to +15 dB → 0.0-1.0):**
```
norm = (clamp(db, -15, 15) + 15) / 30
```
0 dB = 0.5

**Q normalization (10 narrow to 0.3 wide, log scale → 0.0-1.0):**
```
norm = 1 - log(clamp(q, 0.3, 10) / 0.3) / log(10 / 0.3)
```

**PEQ set:**
```
{prefix}/{band}/type  <float: 3.0>           3 = PEQ (parametric) filter type
{prefix}/{band}/f     <float: freq_norm>     log-normalized frequency
{prefix}/{band}/g     <float: gain_norm>     normalized gain
{prefix}/{band}/q     <float: q_norm>        normalized Q
```
- Default prefix: `/ch/01/eq`

**PEQ clear:**
```
{prefix}/{band}/g  <float: 0.5>             0.5 = 0 dB normalized
```

**GEQ set:**
```
{prefix}/{bandIndex+1}/g  <float: gain_norm>
```

---

## Yamaha TF Series

**Protocol:** OSC (UDP)
**Default port:** 49280
**PEQ bands:** 4

Uses **direct values** — no normalization needed.

**PEQ set:**
```
{prefix}/band/{band}/Freq  <float: Hz>      e.g. 2500.0
{prefix}/band/{band}/Gain  <float: dB>      e.g. -6.0
{prefix}/band/{band}/Q     <float>          e.g. 8.0
```
- Default prefix: `/ch/01/eq`

**PEQ clear:**
```
{prefix}/band/{band}/Gain  <float: 0.0>
```

---

## Yamaha CL / QL Series

**Protocol:** OSC (UDP)
**Default port:** 49280
**PEQ bands:** 4

Same format as Yamaha TF — direct values, same path structure.

---

## Allen & Heath dLive

**Protocol:** TCP
**Default port:** 51325
**PEQ bands:** 8

Sends JSON-line TCP (simplified from NRPN MIDI). Each message is a JSON object followed by `\n`.

**PEQ set:**
```json
{"command":"set_peq","channel":"{prefix}","band":{band},"frequency":{freqHz},"gain":{gainDb},"q":{q}}
```
- Default prefix: `1` (channel number as string)

**PEQ clear:**
```json
{"command":"set_peq","channel":"{prefix}","band":{band},"frequency":1000,"gain":0,"q":1}
```

---

## Allen & Heath SQ

**Protocol:** TCP
**Default port:** 51326
**PEQ bands:** 6

Same JSON-line format as dLive, different default port.

---

## dbx DriveRack PA2

**Protocol:** TCP
**Default port:** 19272
**PEQ bands:** 8

**PEQ set:**
```json
{"command":"set_peq","filter":{band},"frequency":{freqHz},"gain":{gainDb},"q":{q},"type":"Bell"}
```
Note: uses `filter` not `band`, and includes `type` field.

**PEQ clear:**
```json
{"command":"set_peq","filter":{band},"frequency":1000,"gain":0,"q":4,"type":"Bell"}
```

---

## Generic OSC

**Protocol:** OSC (UDP)
**Default port:** 10023
**PEQ bands:** 6

Falls back to X32 normalization (log freq, normalized gain/Q). Prefix is user-defined. Use this for mixers not in the list above.

Same format as Behringer X32.
