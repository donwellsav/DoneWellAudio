# dbx DriveRack PA2 — HTTP API Reference

The PA2 Companion module exposes an HTTP API through Companion's web server, enabling external web applications to control the PA2 and read live meter data. This is the complete reference for all 16 endpoints.

## Base URL

```
http://<companion-ip>:<port>/instance/<label>/<endpoint>
```

| Component | Default | Where to Find |
|-----------|---------|---------------|
| companion-ip | localhost | Machine running Companion |
| port | 8000 | Companion Settings > Network |
| label | pa2 | Connections page, instance label column |

**Example:** `http://192.168.0.100:8000/instance/pa2/rta`

## Authentication

Optional. If an API key is set in module config, every request must include it:

```bash
# Via header (preferred)
curl -H "X-Api-Key: mykey123" http://localhost:8000/instance/pa2/rta

# Via query parameter
curl http://localhost:8000/instance/pa2/rta?key=mykey123
```

If no key is configured, all requests are accepted without authentication.

## CORS

All responses include permissive CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE
Access-Control-Allow-Headers: Content-Type, X-Api-Key
```

OPTIONS preflight requests return `204 No Content`.

---

## Core Endpoints

### GET /ping

Health check. Use this to verify the module is running and connected to the PA2.

```bash
curl http://localhost:8000/instance/pa2/ping
```

**Response:**
```json
{
  "ok": true,
  "connected": true,
  "host": "192.168.0.113"
}
```

`connected` is `false` if the TCP connection to the PA2 is not in READY state (still authenticating, disconnected, or errored).

---

### GET /state

Returns the complete PA2 state object — every parameter the module has read from the device. This is a large response (~5KB). For most use cases, prefer `/loop` or specific endpoints.

```bash
curl http://localhost:8000/instance/pa2/state
```

**Response structure:**
```json
{
  "device": { "model": "dbxDriveRackPA2", "name": "Dons Audio Stuff", "version": "1.2.0.1" },
  "topology": { "modules": [...], "stereoGeq": false, "leftGeq": true, "rightGeq": true, "hasHigh": true, "hasMid": false, "hasLow": false },
  "geq": { "enabled": true, "mode": "Manual", "bands": { "1": 0, "2": -3, ... } },
  "peq": { "High": { "enabled": true, "filters": { "1": { "Type": "Bell", "Frequency": 2500, "Gain": -6, "Q": 10 }, ... } } },
  "autoeq": { "enabled": true, "mode": "Manual", "filters": { ... } },
  "afs": { "AFS": true, "FilterMode": "Live", "ContentMode": "Speech", "MaxFixedFilters": 6, "LiftTime": 10 },
  "compressor": { "compressor": false, "threshold": -33, "gain": 3, "ratio": "3:1", "overeasy": 5 },
  "limiters": { "High": { "limiter": false, "threshold": 0, "overeasy": 0 } },
  "mutes": { "HighLeft": false, "HighRight": false, "MidLeft": true, "MidRight": true, "LowLeft": true, "LowRight": true },
  "subharmonic": { "enabled": false, "master": 50, "lows": 50, "highs": 50 },
  "generator": { "mode": "Off", "level": -60 },
  "inputDelay": { "enabled": false, "ms": 0 },
  "outputDelays": { "High": { "enabled": false, "ms": 0 } },
  "rta": { "rate": "Fast", "offset": 30.8 },
  "crossover": { "Band_1": { "hpType": "BW 24", "lpType": "BW 24", "hpFreq": 0, "lpFreq": 0, "gain": 0, "polarity": "Normal" } },
  "preset": { "current": 2, "changed": false },
  "meters": { "rta": [-55.8, -56.9, ...], "inputL": -42.3, "inputR": -43.1, "compInput": -42.3, "compGR": 0, "limInput": -48.5, "limGR": 0, "outputHL": -48.5, "outputHR": -49.2 }
}
```

---

### GET /topology

Returns the discovered module topology. Useful for knowing which output bands and GEQ configuration the PA2 has.

```bash
curl http://localhost:8000/instance/pa2/topology
```

**Response:**
```json
{
  "modules": ["RTA", "SignalGenerator", "InputMeters", "MonoMixer", "LeftGEQ", "RightGEQ", "RoomEQ", "Afs", "SubharmonicSynth", "Compressor", "Back Line Delay", "Crossover", "High Outputs PEQ", "High Outputs Limiter", "High Outputs Delay", "OutputGains", "OutputMeters"],
  "stereoGeq": false,
  "leftGeq": true,
  "rightGeq": true,
  "hasHigh": true,
  "hasMid": false,
  "hasLow": false,
  "hasAfs": true,
  "hasCompressor": true,
  "hasSubharmonic": true,
  "hasCrossover": true
}
```

**Why this matters:** When `stereoGeq` is false and `leftGeq`/`rightGeq` are true, all GEQ commands are sent to BOTH Left and Right GEQ modules (dual-mono). When `hasMid`/`hasLow` are false, PEQ and limiter actions only work for the High output.

---

### POST /command

Send any action by name — uses the same action IDs as Stream Deck buttons.

```bash
# Toggle a mute
curl -X POST http://localhost:8000/instance/pa2/command \
  -H "Content-Type: application/json" \
  -d '{"action": "mute_toggle", "params": {"output": "HighLeft"}}'

# Set compressor threshold
curl -X POST http://localhost:8000/instance/pa2/command \
  -H "Content-Type: application/json" \
  -d '{"action": "comp_threshold", "params": {"value": -20}}'

# Trigger a smart macro
curl -X POST http://localhost:8000/instance/pa2/command \
  -H "Content-Type: application/json" \
  -d '{"action": "macro_speech", "params": {}}'

# Send a raw PA2 command
curl -X POST http://localhost:8000/instance/pa2/command \
  -H "Content-Type: application/json" \
  -d '{"raw": "get \\\\Node\\AT\\Class_Name"}'
```

**Response:**
```json
{ "ok": true, "commands": 1 }
```

**All 61 action IDs are valid here.** See the Action Reference section below.

---

## GEQ Control Endpoints

These are optimized for the donewellaudio.com closed-loop control flow. All GEQ writes use burst mode (<1ms for all 31 bands).

### GET /geq

Current GEQ state including all band gains.

```bash
curl http://localhost:8000/instance/pa2/geq
```

**Response:**
```json
{
  "enabled": true,
  "mode": "Manual",
  "bands": {
    "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0,
    "9": 0, "10": 0, "11": 0, "12": -4, "13": -3, "14": -2, "15": 0,
    "16": 0, "17": 0, "18": -2, "19": 0, "20": 0, "21": 0, "22": 3,
    "23": 2, "24": 0, "25": 0, "26": -2, "27": -3, "28": -4, "29": -6,
    "30": -8, "31": -10
  },
  "topology": "dual-mono"
}
```

Band numbers 1-31 map to: 20Hz, 25Hz, 31.5Hz, 40Hz, 50Hz, 63Hz, 80Hz, 100Hz, 125Hz, 160Hz, 200Hz, 250Hz, 315Hz, 400Hz, 500Hz, 630Hz, 800Hz, 1kHz, 1.25kHz, 1.6kHz, 2kHz, 2.5kHz, 3.15kHz, 4kHz, 5kHz, 6.3kHz, 8kHz, 10kHz, 12.5kHz, 16kHz, 20kHz.

---

### POST /geq

Set GEQ bands. Three input formats accepted. All use burst mode.

**Format 1: Specific bands (object with band numbers as keys)**
```bash
curl -X POST http://localhost:8000/instance/pa2/geq \
  -H "Content-Type: application/json" \
  -d '{"bands": {"12": -4, "18": -2, "22": 3}}'
```

Only the specified bands are changed. Others are untouched.

**Format 2: All 31 bands (array)**
```bash
curl -X POST http://localhost:8000/instance/pa2/geq \
  -H "Content-Type: application/json" \
  -d '{"bands": [0,0,0,-3,-6,-6,-3,0,0,0,0,-4,-3,-2,0,0,0,-2,0,0,0,3,2,0,0,-2,-3,-4,-6,-8,-10]}'
```

Sets all 31 bands at once. Array index 0 = band 1 (20Hz).

**Format 3: Flatten**
```bash
curl -X POST http://localhost:8000/instance/pa2/geq \
  -H "Content-Type: application/json" \
  -d '{"flat": true}'
```

Sets QuickCurve to Flat, zeroing all bands.

**Response (all formats):**
```json
{ "ok": true, "commands": 62, "timestamp": 1711468800000 }
```

`commands: 62` means 31 bands x 2 channels (dual-mono). For stereo-linked GEQ it would be 31.

**Why burst mode:** All commands are sent in a single TCP write. The PA2 processes them in ~1ms. This means donewellaudio.com can reshape the entire GEQ curve 5+ times per second without any commands being dropped.

---

### POST /eq/auto

Auto-EQ from current RTA. Reads the live 31-band spectrum and computes inverse GEQ corrections to flatten the room response toward a target level.

```bash
curl -X POST http://localhost:8000/instance/pa2/eq/auto \
  -H "Content-Type: application/json" \
  -d '{"target": -50, "maxCut": -12, "maxBoost": 6}'
```

| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| target | -50 | -80 to -20 | Target level in dB. Bands above this get cut, below get boosted |
| maxCut | -12 | -12 to 0 | Maximum cut per band (GEQ range is -12 to +12) |
| maxBoost | 6 | 0 to 12 | Maximum boost per band |

**Response:**
```json
{
  "ok": true,
  "corrections": {
    "1": 6, "2": 6, "3": 3.5, "4": -6,
    "5": -8, "6": -12, "7": -6, "8": -3,
    "9": -3, "10": -6, "11": -2, "12": -9
  },
  "commands": 62,
  "timestamp": 1711468800000
}
```

**How it works:** For each of the 31 bands, the algorithm computes `target - rta_level`. If the RTA shows -45dB at 250Hz and the target is -50dB, it applies a -5dB cut. Corrections are clamped to maxCut/maxBoost and rounded to 0.5dB steps. Bands with no signal (below -89dB) are skipped.

**When to use this:** Run pink noise through the PA at a moderate level, ensure the RTA mic is capturing the room, then call this endpoint. The GEQ will be shaped to compensate for room resonances and speaker response. Call it multiple times to iteratively refine — each call reads the UPDATED RTA (which now includes the GEQ corrections from the last call).

---

### POST /eq/curve

Apply a complete target GEQ curve. Unlike /eq/auto, this sets exact gain values — no RTA computation involved.

```bash
curl -X POST http://localhost:8000/instance/pa2/eq/curve \
  -H "Content-Type: application/json" \
  -d '{"curve": {"1": -2, "2": -1, "3": 0, "12": -4, "18": -3, "22": 2, "31": -6}}'
```

**Response:**
```json
{ "ok": true, "commands": 14, "timestamp": 1711468800000 }
```

**When to use this:** Recall saved EQ curves from donewellaudio.com. Store curves as JSON objects, POST them to apply. Useful for A/B testing different EQ profiles during soundcheck.

---

## RTA & Meter Endpoints

### GET /rta

Live 31-band RTA spectrum from the PA2's measurement microphone. Updated at 5Hz (every 200ms).

```bash
curl http://localhost:8000/instance/pa2/rta
```

**Response:**
```json
{
  "bands": {
    "20": -55.83, "25": -56.91, "31.5": -53.48, "40": -65.19,
    "50": -68.52, "63": -74.44, "80": -67.56, "100": -60.75,
    "125": -61.26, "160": -65.89, "200": -59.39, "250": -69.61,
    "315": -65.0, "400": -64.73, "500": -67.77, "630": -69.71,
    "800": -67.93, "1000": -67.91, "1250": -67.64, "1600": -67.8,
    "2000": -73.2, "2500": -74.33, "3150": -76.48, "4000": -79.79,
    "5000": -82.17, "6300": -84.38, "8000": -86.69, "10000": -87.79,
    "12500": -89.36, "16000": -90, "20000": -90
  },
  "peak": { "freq": 31.5, "db": -53.48 },
  "timestamp": 1711468800000
}
```

**Keys are frequency in Hz** (as numbers). Values are dB, range -90 to +10. A value of -90 means no signal in that band.

**The `peak` object** identifies the loudest band — useful for feedback detection (the hottest frequency is often the one feeding back).

**Important:** This data comes from the PA2's own calibrated measurement microphone connected to the front-panel XLR input. It is NOT computed from audio passing through the PA2's signal chain. The RTA mic must be physically connected and positioned in the room.

---

### GET /meters

All live level meters in one call.

```bash
curl http://localhost:8000/instance/pa2/meters
```

**Response:**
```json
{
  "input": { "l": -42.3, "r": -43.1 },
  "output": { "hl": -48.5, "hr": -49.2 },
  "compressor": { "input": -42.3, "gr": 3.2 },
  "limiter": { "input": -48.5, "gr": 0 },
  "timestamp": 1711468800000
}
```

| Field | Range | Unit | Meaning |
|-------|-------|------|---------|
| input.l / input.r | -120 to 0 | dB | Signal level entering the PA2 |
| output.hl / output.hr | -120 to 0 | dB | Signal level leaving to amplifiers |
| compressor.input | -120 to +20 | dB | Signal level at compressor input |
| compressor.gr | 0 to 96 | dB | Gain reduction (0 = no compression) |
| limiter.input | -120 to +20 | dB | Signal level at limiter input |
| limiter.gr | 0 to 96 | dB | Gain reduction (0 = no limiting) |

**When `compressor.gr > 0`**, the compressor is actively reducing gain. Values of 3-6dB are normal during loud passages. Values above 10dB indicate heavy compression.

---

### GET /loop

**The primary polling endpoint.** Returns everything donewellaudio.com needs for closed-loop control in a single HTTP request.

```bash
curl http://localhost:8000/instance/pa2/loop
```

**Response:**
```json
{
  "connected": true,
  "rta": {
    "20": -55.83, "25": -56.91, "31.5": -53.48,
    "40": -65.19, "50": -68.52, "63": -74.44, "80": -67.56,
    "100": -60.75, "125": -61.26, "160": -65.89, "200": -59.39,
    "250": -69.61, "315": -65.0, "400": -64.73, "500": -67.77,
    "630": -69.71, "800": -67.93, "1000": -67.91, "1250": -67.64,
    "1600": -67.8, "2000": -73.2, "2500": -74.33, "3150": -76.48,
    "4000": -79.79, "5000": -82.17, "6300": -84.38, "8000": -86.69,
    "10000": -87.79, "12500": -89.36, "16000": -90, "20000": -90
  },
  "geq": {
    "enabled": true,
    "mode": "Manual",
    "bands": { "1": 0, "2": 0, ... }
  },
  "meters": {
    "input": { "l": -42.3, "r": -43.1 },
    "output": { "hl": -48.5, "hr": -49.2 },
    "comp_gr": 3.2,
    "lim_gr": 0
  },
  "afs": { "enabled": true, "mode": "Live" },
  "mutes": {
    "HighLeft": false, "HighRight": false,
    "MidLeft": true, "MidRight": true,
    "LowLeft": true, "LowRight": true
  },
  "timestamp": 1711468800000
}
```

**Recommended polling rate:** 200ms (5Hz). This matches the DSP meter update rate. Polling faster than 200ms returns the same data.

**Why this endpoint exists:** Without `/loop`, donewellaudio.com would need separate calls to `/rta`, `/geq`, `/meters`, etc. Each call is a separate HTTP request with its own round-trip latency. `/loop` combines everything into one request, reducing total latency from ~200ms (4 calls x 50ms) to ~50ms (1 call).

---

## DoneWellAudio Integration Endpoints

These endpoints support the feedback detection and auto-notching workflow between donewellaudio.com and the PA2.

### POST /detect

Submit feedback detection results. The module filters by confidence threshold, applies notch filters to PEQ (or queues them for approval), and tracks which PEQ slots are managed by the auto-notch system.

```bash
curl -X POST http://localhost:8000/instance/pa2/detect \
  -H "Content-Type: application/json" \
  -d '{
    "frequencies": [
      {"hz": 2500, "magnitude": -3.2, "confidence": 0.92, "type": "feedback"},
      {"hz": 800, "magnitude": -1.5, "confidence": 0.65, "type": "resonance"},
      {"hz": 4000, "magnitude": -2.0, "confidence": 0.88, "type": "feedback"}
    ],
    "source": "donewellaudio",
    "session": "soundcheck-2026-03-26"
  }'
```

| Field | Required | Description |
|-------|----------|-------------|
| frequencies | Yes | Array of detected frequency events |
| frequencies[].hz | Yes | Frequency in Hz |
| frequencies[].magnitude | No | Detection magnitude in dB |
| frequencies[].confidence | Yes | Confidence score 0.0-1.0 |
| frequencies[].type | Yes | `"feedback"` or `"resonance"` (only feedback triggers notching) |
| source | No | Identifier for the detection source |
| session | No | Session name for grouping |

**Response:**
```json
{
  "actions": [
    {"type": "notch_placed", "freq": 2500, "output": "High", "filter": 1, "gain": -6, "q": 10},
    {"type": "skipped_low_confidence", "freq": 800, "confidence": 0.65},
    {"type": "notch_placed", "freq": 4000, "output": "High", "filter": 2, "gain": -6, "q": 10}
  ],
  "slots_used": 2,
  "slots_available": 6
}
```

**Behavior depends on Auto-notch mode** (module config):

| Mode | Behavior |
|------|----------|
| `suggest` | Adds to pending list. No PA2 changes. Stream Deck shows suggestions. |
| `auto` | Writes Bell filter immediately: freq, -6dB (configurable), Q=10 |
| `approve` | Adds to pending. Waits for POST /approve before writing. |

**Confidence threshold** (module config, default 0.80): Frequencies below this threshold are skipped with `"skipped_low_confidence"`.

**Slot management:** The module tracks which PEQ filters (1-8 on High output) were placed by auto-notch vs. set by the user. Auto-notch only uses unoccupied slots. When all 8 are used, new detections return `"skipped_no_slots"`.

---

### GET /recommendations

Returns pending detections (not yet applied) and currently active auto-notch filters.

```bash
curl http://localhost:8000/instance/pa2/recommendations
```

**Response:**
```json
{
  "pending": [
    {"freq": 2500, "suggestedGain": -6, "suggestedQ": 10, "confidence": 0.92}
  ],
  "active_notches": [
    {"output": "High", "filter": 2, "freq": 1200, "gain": -6, "q": 10, "placedAt": "2026-03-26T14:30:00.000Z"}
  ]
}
```

---

### POST /approve

Approve or reject pending recommendations. Only needed when Auto-notch mode is `approve`.

```bash
curl -X POST http://localhost:8000/instance/pa2/approve \
  -H "Content-Type: application/json" \
  -d '{"approve": [2500, 4000], "reject": [800]}'
```

**Response:**
```json
{
  "actions": [
    {"type": "notch_placed", "freq": 2500, "output": "High", "filter": 3},
    {"type": "notch_placed", "freq": 4000, "output": "High", "filter": 4},
    {"type": "rejected", "freq": 800}
  ],
  "remaining_pending": 0
}
```

---

### DELETE /notches

Clear all auto-placed notch filters. Resets the PEQ bands that the auto-notch system owns back to 0dB gain. Does NOT touch PEQ filters that were set manually by the user or from the PA2 front panel.

```bash
curl -X DELETE http://localhost:8000/instance/pa2/notches
```

**Response:**
```json
{ "ok": true, "cleared": 3 }
```

---

## Self-Hosted Control Page

### GET /app

Returns a self-contained HTML control page that runs from Companion's HTTP server. Open in any browser:

```
http://192.168.0.100:8000/instance/pa2/app
```

**Why this exists:** donewellaudio.com runs on HTTPS (Vercel). Companion runs HTTP. Browsers block `fetch()` from HTTPS to HTTP (mixed content). The `/app` page is served from Companion's own HTTP server, so it's same-origin — no mixed content restrictions. It includes live mute controls, show macros, processing toggles, and generator controls, polling state every 2 seconds.

---

## Closed-Loop Control Flow

```
donewellaudio.com                    Companion Module                PA2
      |                                    |                          |
      |  GET /loop (every 200ms)           |                          |
      |<---- RTA + GEQ + meters -----------|<-- DSP meters (19274) ---|
      |                                    |                          |
      |  [analyze spectrum]                |                          |
      |  [compute corrections]             |                          |
      |                                    |                          |
      |  POST /geq {bands: {...}}          |                          |
      |--------- burst write ------------->|--- TCP burst (19272) --->|
      |      (~50ms network)               |      (<1ms burst)       |
      |                                    |                          |
      |  GET /loop (next poll)             |                          |
      |<---- updated RTA ------------------|<-- updated meters -------|
      |                                    |                          |
      |  [verify correction applied]       |                          |
      |  [iterate if needed]               |                          |
```

**Total round-trip latency:** 200-500ms (HTTP poll interval + network latency + Companion processing + DSP meter poll cycle).

**For faster response:** Reduce the poll interval to 100ms. The DSP meters update internally at 200ms, but you'll get fresher data on average.

---

## Mixed Content Solutions

| Solution | Works In | Setup |
|----------|----------|-------|
| **localhost** (default) | Chrome, Firefox | Companion on same machine as browser |
| **GET /app** | All browsers | Navigate to Companion's /app URL directly |
| **Companion HTTPS** | All browsers | Configure SSL cert in Companion Settings > Network |
| **Chrome targetAddressSpace** | Chrome 142+ | `fetch(url, {targetAddressSpace: 'local'})` |
| **Reverse proxy** | All browsers | nginx with SSL in front of Companion |

**Recommended for production:** Configure HTTPS on Companion. This is a one-time setup that permanently solves mixed content for all browsers.

---

## Rate Limiting Guidance

| Operation | Recommended Rate | Notes |
|-----------|-----------------|-------|
| GET /loop polling | 200ms (5Hz) | Matches DSP meter update rate |
| POST /geq | As needed | Burst mode, no internal rate limit |
| POST /eq/auto | 1-2 per second max | Each call reads RTA + writes 31 bands |
| POST /detect | As detections occur | Module queues internally |
| GET /rta | 200ms | Same data as /loop, just RTA portion |

The PA2 handles burst command writes without dropping. However, each POST /geq for dual-mono topology sends 62 TCP commands (31 bands x 2 channels). At 0ms spacing this completes in ~1ms on the wire, but the PA2's DSP needs a few milliseconds to process all changes. Sending more than ~10 full GEQ updates per second may cause the PA2 to lag.

---

## Action Reference (for POST /command)

All 61 action IDs with their parameters:

### Mutes
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `mute_toggle` | `output`: HighLeft/HighRight/MidLeft/MidRight/LowLeft/LowRight | Toggle mute state |
| `mute_set` | `output`, `value`: true/false | Set mute explicitly |
| `mute_all` | (none) | Mute all 6 outputs |
| `unmute_all` | (none) | Unmute all 6 outputs |

### GEQ
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `geq_enable` | `value`: true/false | Enable/disable GEQ |
| `geq_flat` | (none) | Set QuickCurve to Flat |
| `geq_quick_curve` | `mode`: Flat/MyBand/Speech/PerformanceVenue/DJ | Set quick curve preset |
| `geq_band` | `band`: 1-31, `gain`: -12 to +12 | Set absolute band gain |
| `geq_increment` | `band`: 1-31, `step`: 0.5-6 | Increase band gain by step |
| `geq_decrement` | `band`: 1-31, `step`: 0.5-6 | Decrease band gain by step |

### PEQ
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `peq_enable` | `output`: High/Mid/Low, `value`: true/false | Enable/disable PEQ block |
| `peq_flatten` | `output` | Flatten all 8 filters |
| `peq_restore` | `output` | Restore from flatten |
| `peq_filter` | `output`, `filter`: 1-8, `type`: Bell/Low Shelf/High Shelf, `freq`: 20-20000, `gain`: -20 to +20, `q`: 0.1-16, `slope`: 3-15 | Set individual filter |

### Room EQ
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `autoeq_enable` | `value`: true/false | Enable/disable Room EQ |
| `autoeq_mode` | `mode`: Flat/Manual/AutoEQ | Set Room EQ mode |
| `autoeq_filter` | `filter`: 1-8, `type`, `freq`, `gain`, `q`, `slope` | Set Room EQ filter |

### AFS
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `afs_enable` | `value`: true/false | Enable/disable AFS |
| `afs_mode` | `mode`: Live/Fixed | Set filter mode |
| `afs_content` | `content`: Speech/Music/Speech Music | Set content type |
| `afs_fixed_filters` | `count`: 0-12 | Max fixed filters |
| `afs_lift_time` | `seconds`: 5-3600 | Lift time in seconds |
| `afs_clear_live` | (none) | Clear live filters |
| `afs_clear_all` | (none) | Clear all filters |

### Compressor
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `comp_enable` | `value`: true/false | Enable/disable |
| `comp_threshold` | `value`: -60 to 0 | Threshold in dB |
| `comp_gain` | `value`: -20 to +20 | Makeup gain in dB |
| `comp_ratio` | `value`: 1.0:1 to Inf:1 | Compression ratio |
| `comp_overeasy` | `value`: 0-10 | OverEasy soft knee |

### Limiters
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `lim_enable` | `band`: High/Mid/Low, `value`: true/false | Enable/disable |
| `lim_threshold` | `band`, `value`: -60 to 0 | Threshold in dB |
| `lim_overeasy` | `band`, `value`: 0-10 | OverEasy |

### Crossover
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `xover_hp_type` | `band`: Band_1/Band_2/Band_3/MonoSub, `value`: BW 6-48/LR 12-48 | HP filter type |
| `xover_lp_type` | `band`, `value` | LP filter type |
| `xover_hp_freq` | `band`, `value`: Hz or -1 for Out | HP frequency |
| `xover_lp_freq` | `band`, `value`: Hz or -1 for Out | LP frequency |
| `xover_gain` | `band`, `value`: -60 to +20 | Band gain |
| `xover_polarity` | `band`, `value`: Normal/Inverted | Polarity |

### Delays
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `input_delay_enable` | `value`: true/false | Enable/disable |
| `input_delay_time` | `ms`: 0-100 | Delay in ms |
| `output_delay_enable` | `band`: High/Mid/Low, `value`: true/false | Enable/disable |
| `output_delay_time` | `band`, `ms`: 0-10 | Delay in ms |

### Subharmonic / Generator / RTA
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `sub_enable` | `value`: true/false | Subharmonic on/off |
| `sub_master` | `value`: 0-100 | Master level % |
| `sub_lows` | `value`: 0-100 | 24-36Hz level % |
| `sub_highs` | `value`: 0-100 | 36-56Hz level % |
| `gen_mode` | `mode`: Off/Pink/White | Generator mode |
| `gen_level` | `value`: -60 to 0 | Generator level dB |
| `rta_rate` | `value`: Slow/Fast | RTA update rate |
| `rta_offset` | `value`: 0-40 | RTA graph offset dB |
| `preset_recall` | `number`: 1-75 | Recall preset |
| `raw_command` | `command`: string | Raw PA2 command |
| `scan_network` | (none) | UDP broadcast scan |

### Compound Actions
| Action ID | Description |
|-----------|-------------|
| `show_open` | Unmute all, AFS Live on, comp on, gen off |
| `show_close` | Mute all, gen off, clear AFS live |
| `soundcheck_start` | Unmute, AFS on, comp on, GEQ flat |
| `ring_out` | AFS Fixed, 12 filters, clear all |
| `panic_mute` | Mute all + gen off |
| `safe_unmute` | Unmute only if gen is off |

### Smart Macros
| Action ID | Description |
|-----------|-------------|
| `macro_speech` | AFS Live/Speech, comp -24dB/3:1/+3, unmute |
| `macro_music` | AFS Live/Music, comp -18dB/2:1/0, unmute |
| `macro_changeover` | Mute, flatten GEQ+PEQ, clear AFS, comp off |
| `macro_monitor_check` | Mute, pink -20dB, limiter at -6 |
| `macro_vocal_focus` | Cut 250/400, boost 1.6k/2.5k, cut 8k |
| `macro_de_mud` | Cut 160-400Hz |
| `macro_de_ess` | Cut 4-10kHz |
| `macro_low_cut` | Roll off 20-63Hz |
| `macro_loudness` | Fletcher-Munson contour |
| `macro_intermission` | AFS Fixed/Music, heavy comp, unmute |
| `macro_dj` | DJ curve, AFS off, sub 75%, unmute |
| `macro_full_reset` | Everything to defaults |

### RTA-Driven Macros
| Action ID | Parameters | Description |
|-----------|-----------|-------------|
| `macro_auto_eq_from_rta` | `target`: -80 to -20, `maxCut`: -12 to 0, `maxBoost`: 0-12 | Auto-flatten from RTA |
| `macro_rta_snapshot` | (none) | Save current RTA |
| `macro_rta_compare` | (none) | Compare live vs snapshot |
| `macro_cut_peak` | `depth`: -12 to -1 | Cut loudest RTA band |
| `macro_boost_weak` | `amount`: 1-6 | Boost quietest band |
