# DoneWell Audio API Documentation

> Deep-audit edition. Audited 2026-03-31 against live route handlers and `repomix-output.xml`.
> Version **0.50.0** | **5** route files | **7** HTTP methods | **0** WebSocket endpoints

---

## Overview

DoneWell Audio exposes a small HTTP API surface via Next.js App Router route handlers under `app/api/`. All endpoints are JSON-based. There is no authentication layer — protection is endpoint-specific (schema validation, rate limiting, SSRF guards, pairing codes).

### Base URLs

| Environment | URL |
|---|---|
| Local development | `http://localhost:3000` |
| Production | `https://donewellaudio.com` |

### Global Security (middleware.ts)

Every non-API, non-static request passes through `middleware.ts`, which sets:

| Header | Dev | Production |
|---|---|---|
| `Content-Security-Policy` | `script-src 'self' 'unsafe-eval' 'unsafe-inline'` | `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'` |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline'` |
| `worker-src` | `'self' blob:` | `'self' blob:` |
| `connect-src` | `'self' ws: http: https://*.ingest.us.sentry.io` | `'self' http: https://*.ingest.us.sentry.io` |
| `frame-ancestors` | `'none'` | `'none'` |

Additional static headers set in `next.config.mjs`:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `microphone=(self), camera=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

The middleware matcher skips API routes, static assets, service worker files, and `next-router-prefetch` requests.

---

## Endpoint Inventory

| Endpoint | Methods | Purpose | Rate Limited | Primary Consumer |
|---|---|---|---|---|
| `/api/v1/ingest` | POST | Accept anonymous spectral snapshot batches | Yes (IP + session) | DoneWell app data collection |
| `/api/geo` | GET | Return EU/EEA/UK jurisdiction flag for GDPR | No | DoneWell consent flow |
| `/api/companion/proxy` | POST | Server-side HTTP proxy (CORS bypass) | No | Companion integration (no live callers) |
| `/api/companion/relay/{code}` | GET, POST, DELETE | Ephemeral cloud relay for Companion pairing | Yes (IP, GET+POST only) | DoneWell app + Companion module |
| `/api/sentry-example-api` | GET | Intentionally throw error for Sentry testing | No | Sentry example page |

---

## 1. POST /api/v1/ingest

**File:** `app/api/v1/ingest/route.ts` (249 lines)

### Purpose

Accepts anonymous spectral snapshot batches from consenting users. Validates the payload, enforces dual rate limits (IP + session), strips IP addresses, and optionally forwards to a Supabase Edge Function for storage.

### Request

**Content-Type:** `application/json` (required — returns 415 if missing)

#### Top-level schema

| Field | Type | Required | Validation |
|---|---|---|---|
| `version` | `string` | Yes | Must be `"1.0"`, `"1.1"`, or `"1.2"` |
| `sessionId` | `string` | Yes | 10-64 chars, regex `[A-Za-z0-9_-]+` |
| `capturedAt` | `string` | Present in app | ISO 8601, not route-validated |
| `fftSize` | `number` | Yes | Must be `4096`, `8192`, or `16384` |
| `sampleRate` | `number` | Yes | Must be `8000-96000` |
| `binsPerSnapshot` | `number` | Yes | Must be exactly `512` |
| `event` | `object` | Yes | See event schema below |
| `snapshots` | `array` | Yes | 1-240 items |

#### Event schema

| Field | Type | Required | Validation |
|---|---|---|---|
| `frequencyHz` | `number` | Yes | Must be number |
| `amplitudeDb` | `number` | Yes | Must be number |
| `relativeMs` | `number` | App sends | Not route-validated |
| `severity` | `string` | App sends | Not route-validated |
| `confidence` | `number` | App sends | Not route-validated |
| `contentType` | `string` | App sends | Not route-validated |
| `algorithmScores` | `object` | Optional (v1.1+) | If present, must have `fusedProbability` and `fusedConfidence` as numbers |
| `userFeedback` | `string` | Optional (v1.1+) | Must be `"correct"`, `"false_positive"`, or `"confirmed_feedback"` |

#### Algorithm scores sub-schema (optional)

| Field | Type | Validated |
|---|---|---|
| `fusedProbability` | `number` | Yes — required if `algorithmScores` present |
| `fusedConfidence` | `number` | Yes — required if `algorithmScores` present |
| `msd`, `phase`, `spectral`, `comb`, `ihr`, `ptmr`, `ml` | `number` | Accepted but not individually validated |
| `modelVersion` | `string` | Accepted but not validated |

#### Snapshot schema

Each snapshot in the `snapshots` array:

| Field | Type | Validation |
|---|---|---|
| `t` | `number` | Must be number (relative time in ms) |
| `s` | `string` | Base64-encoded quantized spectrum, 100-800 chars |

**Note:** All snapshots are validated (type and length checks on every entry). Previously spot-checked 3; changed to full validation in v0.92.0.

### Example request

```bash
curl -X POST "http://localhost:3000/api/v1/ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2",
    "sessionId": "test-session-uuid-1234567890",
    "capturedAt": "2026-03-31T03:00:00.000Z",
    "fftSize": 8192,
    "sampleRate": 48000,
    "binsPerSnapshot": 512,
    "event": {
      "frequencyHz": 1000,
      "amplitudeDb": -20,
      "severity": "RESONANCE",
      "confidence": 0.8,
      "contentType": "unknown",
      "algorithmScores": {
        "fusedProbability": 0.85,
        "fusedConfidence": 0.9,
        "msd": 0.7
      },
      "userFeedback": "confirmed_feedback"
    },
    "snapshots": [
      { "t": 0, "s": "AAAA...base64...AAAA" },
      { "t": 100, "s": "BBBB...base64...BBBB" }
    ]
  }'
```

### Responses

#### Success — Supabase not configured (typical in local dev)

```json
{
  "ok": true,
  "stored": false,
  "reason": "Supabase not configured — data accepted but not stored"
}
```
**Status:** 200

#### Success — forwarded to Supabase

```json
{
  "ok": true,
  "stored": true
}
```
**Status:** 200

#### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error":"Invalid JSON"}` | Body not parseable as JSON |
| 400 | `{"error":"Unsupported version"}` | Version not `1.0`, `1.1`, or `1.2` |
| 400 | `{"error":"Invalid sessionId"}` | Failed length/regex validation |
| 400 | `{"error":"Invalid fftSize"}` | Not 4096, 8192, or 16384 |
| 400 | `{"error":"Invalid sampleRate"}` | Outside 8000-96000 range |
| 400 | `{"error":"binsPerSnapshot must be 512"}` | Not exactly 512 |
| 400 | `{"error":"Missing event"}` | Event object absent or not an object |
| 400 | `{"error":"Invalid event.frequencyHz"}` | Not a number |
| 400 | `{"error":"Invalid event.amplitudeDb"}` | Not a number |
| 400 | `{"error":"Invalid event.algorithmScores.fusedProbability"}` | Present but not a number |
| 400 | `{"error":"Invalid event.userFeedback"}` | Present but not a valid enum value |
| 400 | `{"error":"snapshots must be array"}` | Not an array |
| 400 | `{"error":"Empty snapshots"}` | Zero-length array |
| 400 | `{"error":"Too many snapshots (max 240)"}` | Over 240 entries |
| 400 | `{"error":"Invalid snapshot[N].t"}` | Snapshot at index N missing numeric `t` |
| 400 | `{"error":"Invalid snapshot[N].s length"}` | Base64 string outside 100-800 chars |
| 413 | `{"error":"Payload too large"}` | Exceeds 512 KB (checked via header AND body) |
| 415 | `{"error":"Content-Type must be application/json"}` | Wrong content type |
| 429 | `{"error":"Rate limited"}` | IP or session limit exceeded; includes `Retry-After: 60` header |
| 500 | `{"error":"Internal error"}` | Unexpected server error |
| 502 | `{"error":"Storage temporarily unavailable"}` | Supabase forwarding failed |

### Rate Limiting

| Scope | Limit | Window | Key |
|---|---|---|---|
| IP (primary) | 30 requests | 60 seconds | `request.ip` or `x-forwarded-for` first entry |
| Session (secondary) | 6 requests | 60 seconds | `batch.sessionId` |

Rate limit state is in-memory — resets on cold start/redeploy. Both maps are capped at 10,000 entries with amortized pruning every 100 calls.

### Security

- **SSRF defense:** `SUPABASE_INGEST_URL` is validated at module load against an allowlist (`.supabase.co`, `.supabase.com`, `.functions.supabase.co`). Invalid domains crash the module.
- **IP stripping:** `x-forwarded-for` is NOT forwarded to Supabase. IP is used only for rate limiting and discarded.
- **Size enforcement:** Checked twice — once via `Content-Length` header (fast reject), once via actual body length (prevents header spoofing).

---

## 2. GET /api/geo

**File:** `app/api/geo/route.ts` (24 lines)

### Purpose

Returns whether the request originates from an EU, EEA, or UK jurisdiction. Used by the consent flow to determine whether to show GDPR-enhanced disclosures.

### Request

No body. No parameters. No authentication.

### How it works

Reads the `x-vercel-ip-country` header (ISO 3166-1 alpha-2 country code, set by Vercel on every edge request) and checks it against a hardcoded set of 31 countries:

- **EU 27:** AT, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK
- **EEA:** IS, LI, NO
- **UK GDPR:** GB

### Example request

```bash
curl "http://localhost:3000/api/geo"
```

### Response

```json
{
  "isEU": false
}
```
**Status:** 200 (always)

### Limitations

- In local development, the `x-vercel-ip-country` header is absent, so the response is always `{"isEU": false}`
- Depends entirely on Vercel's IP geolocation — no fallback
- No rate limiting (lightweight, no external calls)
- No caching headers set

---

## 3. POST /api/companion/proxy

**File:** `app/api/companion/proxy/route.ts` (107 lines)

### Purpose

Server-side HTTP proxy to bypass browser CORS restrictions for Companion-related requests. The DoneWell PWA runs in a browser which enforces CORS, but Companion's HTTP server doesn't return CORS headers.

### Request

**Content-Type:** `application/json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | `string` | Yes | Must parse as URL and pass SSRF guard |
| `method` | `string` | No | Defaults to `"GET"` |
| `body` | `any` | No | Only forwarded when `method === "POST"` exactly |

### Example requests

```bash
# GET request
curl -X POST "http://localhost:3000/api/companion/proxy" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/get","method":"GET"}'

# POST request with body
curl -X POST "http://localhost:3000/api/companion/proxy" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/api","method":"POST","body":{"key":"value"}}'
```

### Success response

The proxy preserves the upstream HTTP status code. If the upstream returns JSON, it is forwarded directly. Otherwise:

```json
{
  "raw": "<upstream text body>"
}
```

### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error":"Missing url"}` | `url` field absent from request body |
| 403 | `{"error":"Forbidden target"}` | URL blocked by SSRF guard |
| 502 | `{"error":"<message>"}` | Upstream request failed (timeout, DNS, etc.) |

### SSRF Guard (`isBlockedHost`)

The following targets are blocked:

| Category | Blocked ranges |
|---|---|
| IPv4 private | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` |
| IPv4 loopback | `127.0.0.0/8` |
| IPv4 link-local | `169.254.0.0/16` (cloud metadata) |
| IPv4 unspecified | `0.0.0.0/8` |
| Hostnames | `localhost`, `*.localhost` |
| IPv6 loopback | `::1` |
| IPv6 unspecified | `::` |
| IPv6 mapped | `::ffff:*` |
| IPv6 link-local | `fe80::/10` |
| IPv6 private | `fc00::/7` (unique local) |
| IPv6 multicast | `ff00::/8` |
| Non-HTTP schemes | Anything not `http:` or `https:` |

### Limitations

- **3-second timeout** on upstream requests (`AbortSignal.timeout(3000)`)
- **Body only forwarded for POST** — `PUT`, `PATCH`, `DELETE` bodies are silently dropped
- **Case-sensitive method check** — `"post"` (lowercase) will not forward the body
- **No custom headers** — cannot forward auth tokens or custom headers to upstream
- **No rate limiting** on this endpoint
- **SSRF blocks LAN targets** — the documented Companion use case (`192.168.x.x`) is currently blocked by the SSRF guard
- **No live callers** in the current app codebase

---

## 4. /api/companion/relay/{code}

**File:** `app/api/companion/relay/[code]/route.ts` (213 lines)

### Purpose

Ephemeral same-origin relay for pairing the DoneWell web app with the Bitfocus Companion module. DoneWell posts advisories to the relay; the Companion module polls and drains them.

### Path parameter

| Name | Format | Example |
|---|---|---|
| `code` | `DWA-[A-Z0-9]{6}` | `DWA-A1B2C3`, `DWA-7XZ9QK` |

Codes are generated client-side using `crypto.getRandomValues()` (not `Math.random()`).

### Shared constraints

| Constraint | Value |
|---|---|
| Queue capacity | 20 items per pairing code (FIFO, oldest dropped) |
| Relay expiry | 30 minutes of inactivity |
| Max relay codes | 500 concurrent (returns 503 when full) |
| Rate limit | 30 requests per 60 seconds per IP (GET + POST only) |
| Storage | In-memory — lost on cold start/redeploy |
| Rate limit map cap | 10,000 entries with amortized pruning |

---

### 4.1 GET /api/companion/relay/{code}

**Purpose:** Poll and drain all pending payloads for a pairing code. Items returned are immediately removed from the relay.

#### Example request

```bash
curl "http://localhost:3000/api/companion/relay/DWA-A1B2C3"
```

#### Response — empty or missing relay

```json
{
  "ok": true,
  "advisories": [],
  "pendingCount": 0
}
```
**Status:** 200

#### Response — payloads queued

```json
{
  "ok": true,
  "advisories": [
    {
      "id": "adv_123",
      "trueFrequencyHz": 2512,
      "severity": "RUNAWAY",
      "confidence": 0.91,
      "peq": { "type": "bell", "hz": 2512, "q": 8.3, "gainDb": -4.2 },
      "geq": { "bandHz": 2500, "bandIndex": 22, "suggestedDb": -4 },
      "pitch": { "note": "D#", "octave": 5, "cents": 12, "midi": 75 }
    }
  ],
  "pendingCount": 1
}
```
**Status:** 200

#### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error":"Invalid code"}` | Code doesn't match `DWA-[A-Z0-9]{6}` |
| 429 | `{"error":"Rate limited"}` | IP exceeded 30 req/60s; includes `Retry-After: 60` |

---

### 4.2 POST /api/companion/relay/{code}

**Purpose:** Queue a new payload for a pairing code. Accepts two payload types: advisory objects and control messages.

#### Advisory payload (minimum validated fields)

```json
{
  "id": "adv_123",
  "severity": "RUNAWAY",
  "confidence": 0.91
}
```

| Field | Type | Validation |
|---|---|---|
| `id` | `string` | Required, 1-100 chars |
| `severity` | `string` | Required, 1-100 chars |
| `confidence` | `number` | Required, must be finite, 0-1 |

The app sends additional fields (`trueFrequencyHz`, `peq`, `geq`, `pitch`) via `CompanionBridge.toPayload()`, but the route does not validate them.

#### Control message payload

```json
{ "type": "resolve", "advisoryId": "adv_123" }
{ "type": "dismiss", "advisoryId": "adv_123" }
{ "type": "mode_change", "mode": "ringOut" }
```

Valid `type` values: `resolve`, `dismiss`, `mode_change`. Any other type returns a 400 error.

#### Example request

```bash
curl -X POST "http://localhost:3000/api/companion/relay/DWA-A1B2C3" \
  -H "Content-Type: application/json" \
  -d '{"id":"adv_123","severity":"RUNAWAY","confidence":0.91}'
```

#### Success response

```json
{
  "accepted": true,
  "pendingCount": 1
}
```
**Status:** 200

#### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error":"Invalid code"}` | Code format invalid |
| 400 | `{"error":"Invalid JSON"}` | Body not parseable |
| 400 | `{"error":"Expected object"}` | Payload not an object |
| 400 | `{"error":"Invalid id"}` | Advisory missing/empty/too-long `id` |
| 400 | `{"error":"Invalid severity"}` | Advisory missing/empty/too-long `severity` |
| 400 | `{"error":"Invalid confidence"}` | Missing, not finite, or outside 0-1 |
| 400 | `{"error":"Unknown control type: ..."}` | Unrecognized control message type (truncated to 30 chars) |
| 429 | `{"error":"Rate limited"}` | IP exceeded 30 req/60s |

---

### 4.3 DELETE /api/companion/relay/{code}

**Purpose:** Delete the relay queue for a pairing code. Typically called on disconnect.

#### Example request

```bash
curl -X DELETE "http://localhost:3000/api/companion/relay/DWA-A1B2C3"
```

#### Response

```json
{
  "ok": true
}
```
**Status:** 200

#### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error":"Invalid code"}` | Code format invalid |

**Note:** DELETE is NOT rate-limited.

---

## 5. GET /api/sentry-example-api

**File:** `app/api/sentry-example-api/route.ts` (17 lines)

### Purpose

Test endpoint that intentionally throws a `SentryExampleAPIError` after logging through Sentry. Used only by the Sentry example page at `/sentry-example-page` to validate backend error capture.

### Request

No body. No parameters.

### Example request

```bash
curl "http://localhost:3000/api/sentry-example-api"
```

### Response

Always returns HTTP 500 with framework-managed error output. Response body shape may differ between development and production.

### Limitations

- Not a production endpoint
- Marked `force-dynamic` (never cached)
- Exists solely for Sentry integration testing

---

## Known Gaps and Audit Findings

### 1. Companion proxy blocks its intended use case

The SSRF guard in `/api/companion/proxy` blocks all RFC 1918 private addresses (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`). The endpoint's documented purpose is proxying to local-network Companion HTTP servers, which are typically on these ranges.

**Impact:** The proxy endpoint cannot currently serve its intended LAN use case.

### 2. Relay producer/consumer contract drift

The relay POST handler stores advisory objects and control messages in a single `advisories` array. The Companion module expects lifecycle events in a separate `events` array. No `events` array is currently emitted.

**Impact:** Control messages (`resolve`, `dismiss`, `mode_change`) are accepted and stored but not surfaced to the Companion module in the expected format.

### 3. WebSocket API does not exist

Older documentation references a WebSocket API at `/api/v1/ws`. No such route handler exists in the current codebase or `repomix-output.xml`. This documentation covers only what ships today.

### 4. Test coverage is uneven

| Endpoint | Has route tests? |
|---|---|
| `/api/v1/ingest` | Yes (`app/api/v1/ingest/__tests__/route.test.ts`) |
| `/api/geo` | No |
| `/api/companion/proxy` | No |
| `/api/companion/relay/{code}` | No |
| `/api/sentry-example-api` | No |

### 5. No rate limiting on proxy or geo endpoints

Both `/api/companion/proxy` and `/api/geo` lack rate limiting. The proxy is particularly exposed since it makes outbound HTTP requests on behalf of the caller.
