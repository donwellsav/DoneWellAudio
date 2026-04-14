# VENU360 OSC Specification

Complete OSC path reference for the dbx DriveRack VENU360 Companion module. The bridge module (or any OSC sender) can use these paths to control the VENU360 through its Companion module.

## Connection

The VENU360 Companion module listens on a configurable UDP port (set in its config as "OSC Receive Port"). Default is 0 (disabled) — the operator must enable it and pick a port (e.g. 9000).

Send standard OSC 1.0 messages (or bundles) to that port. The module handles HiQnet TCP translation to the hardware.

## Rate Limiting

Incoming OSC is throttled to **20 updates/sec per path** (50ms). Fast faders coalesce — only the latest value within each 50ms window is sent to the hardware. This is automatic; senders don't need to throttle.

## Frequency Values

PEQ/crossover frequency paths accept:
- **String format:** `"250Hz"`, `"1kHz"`, `"12.5kHz"` — device native format
- **Float Hz:** `250.0`, `1000.0`, `12500.0` — auto-formatted by the module

The bridge should send float Hz values. The module converts them.

## Complete Path Reference

### PEQ Output (PEQOut1-6, 8 bands each)
```
/venu360/peqout/{1-6}/band/{1-8}/freq    <float: Hz or string>
/venu360/peqout/{1-6}/band/{1-8}/gain    <float: dB, -20 to +20>
/venu360/peqout/{1-6}/band/{1-8}/q       <float: 0.1 to 128>
/venu360/peqout/{1-6}/band/{1-8}/type    <string: "Bell", "Low Shelf", "High Shelf">
/venu360/peqout/{1-6}/flatten            <string: "Flat" or "Restore">
/venu360/peqout/{1-6}/enable             <int: 0 or 1>
```

### PEQ Input (PEQ2=Input B, PEQ3=Input C, 12 bands each)
```
/venu360/peqin/{2-3}/band/{1-12}/freq    <float: Hz or string>
/venu360/peqin/{2-3}/band/{1-12}/gain    <float: dB>
/venu360/peqin/{2-3}/band/{1-12}/q       <float: 0.1 to 128>
/venu360/peqin/{2-3}/band/{1-12}/type    <string>
/venu360/peqin/{2-3}/flatten             <string: "Flat" or "Restore">
```

### GEQ (GEQ1-3, 31 ISO bands)
```
/venu360/geq/{1-3}/band/{1-31}           <float: dB, -20 to +20>
/venu360/geq/{1-3}/enable                <int: 0 or 1>
/venu360/geq/{1-3}/quickcurve            <string: "Flat", "Speech", "Manual">
```

### Outputs (ZoneGains, 6 channels)
```
/venu360/output/{1-6}/gain               <float: dB, -120 to +20>
/venu360/output/{1-6}/mute               <int: 0=unmute, 1=mute>
```

### Inputs (InMixer1-3, 7 inputs each)
```
/venu360/input/{1-3}/master/gain         <float: dB>
/venu360/input/{1-3}/master/mute         <int: 0 or 1>
/venu360/input/{1-3}/{1-7}/gain          <float: dB>
/venu360/input/{1-3}/{1-7}/mute          <int: 0 or 1>
```

### Compressor (CompressorMid1-6)
```
/venu360/comp/{1-6}/threshold            <float: dB, -60 to 0>
/venu360/comp/{1-6}/ratio                <string: "2:1", "4:1", "Inf:1", etc.>
/venu360/comp/{1-6}/gain                 <float: dB, -20 to +20>
/venu360/comp/{1-6}/enable               <int: 0 or 1>
/venu360/comp/{1-6}/type                 <string: e.g. "dbx 1066">
```

### Limiter (Limiter1-6)
```
/venu360/lim/{1-6}/threshold             <float: dB, -60 to 0>
/venu360/lim/{1-6}/enable                <int: 0 or 1>
/venu360/lim/{1-6}/attack                <string: e.g. "100 ms">
/venu360/lim/{1-6}/hold                  <string: e.g. "250 ms">
/venu360/lim/{1-6}/release               <string: e.g. "15dB/s">
```

### AFS (Afs1-3)
```
/venu360/afs/{1-3}/sensitivity           <float: dB, -6 to +6>
/venu360/afs/{1-3}/enable                <int: 0 or 1>
/venu360/afs/{1-3}/mode                  <string: "Live" or "Fixed">
/venu360/afs/{1-3}/content               <string: "Speech", "Music", "Speech Music">
```

### Crossover (CrossoverIIR1-6)
```
/venu360/xover/{1-6}/hp_freq             <string: e.g. "80Hz", "Out">
/venu360/xover/{1-6}/hp_type             <string: e.g. "BW 18", "LR 24">
/venu360/xover/{1-6}/lp_freq             <string: e.g. "1kHz", "Out">
/venu360/xover/{1-6}/lp_type             <string>
/venu360/xover/{1-6}/gain                <float: dB, -20 to +20>
/venu360/xover/{1-6}/polarity            <string: "Normal" or "Inverted">
/venu360/xover/{1-6}/phase               <string: e.g. "0 deg">
```

### Delay (DelayOut1-6)
```
/venu360/delay/{1-6}/enable              <int: 0 or 1>
/venu360/delay/{1-6}/amount              <string: e.g. "5ms">
```

### Other
```
/venu360/sub/level                       <float: 0-100>
/venu360/sub/enable                      <int: 0 or 1>
/venu360/midrouter/gain                  <float: dB>
/venu360/midrouter/mute                  <int: 0 or 1>
/venu360/gen/enable                      <int: 0 or 1>
/venu360/gen/type                        <string: "Pink", "White", "Sine">
/venu360/gen/amplitude                   <string: e.g. "-60dB">
/venu360/preset/recall                   <int: 1-25>
```

## Bundle Support

The VENU360 module unpacks `#bundle` OSC packets. If the bridge sends multiple messages per advisory (freq + gain + Q), bundling them is fine but not required.

## Type Tags

Supported: `i` (int32), `f` (float32), `s` (string), `T` (true → int 1), `F` (false → int 0).
