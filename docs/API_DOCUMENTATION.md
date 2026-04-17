# DoneWell Audio API Documentation

This is the current HTTP surface in the repo.

There is no general-purpose public WebSocket API in the current application code.

## Route Inventory

| Route | Methods | Purpose |
|---|---|---|
| `/api/v1/ingest` | `POST` | Accept anonymous spectral snapshot batches |
| `/api/geo` | `GET` | Return EU/EEA/UK jurisdiction hint for consent flow |
| `/api/health` | `GET` | Return health, version, and timestamp |
| `/api/companion/proxy` | `POST` | Same-origin HTTP proxy for public Companion targets |
| `/api/companion/relay/[code]` | `GET`, `POST`, `DELETE` | Ephemeral relay queue between app and Companion module |
| `/api/sentry-example-api` | `GET` | Example error route for Sentry verification |

## `/api/v1/ingest`

Purpose:

- accepts labeled spectral snapshot batches from opted-in collection flows
- validates payload shape
- rate limits requests
- forwards accepted data into the ingest path

Use this when working on:

- snapshot collection
- replay fixture generation
- ML labeling

## `/api/geo`

Purpose:

- returns whether the request appears to come from an EU, EEA, or UK jurisdiction
- supports the consent flow's GDPR branching

## `/api/health`

Purpose:

- simple deployment health check
- exposes app version and server timestamp

Good for:

- deploy verification
- confirming which build is serving

## `/api/companion/proxy`

Purpose:

- same-origin browser-side HTTP proxy for public Companion targets
- includes SSRF defenses, rate limiting, and response-size caps

Important boundary:

- this is not a LAN tunnel to arbitrary local or private hosts
- Companion LAN workflows should use the relay path instead

## `/api/companion/relay/[code]`

Purpose:

- short-code relay between the browser app and the DoneWell Audio Companion module
- supports bidirectional queue flow
- intended for advisory payloads and apply-result messages, not raw audio

Important boundary:

- relay payloads are text and state, not media streams
- the relay is ephemeral and pairing-code scoped

## `/api/sentry-example-api`

Purpose:

- example route for error-reporting checks
- not part of the operational product surface

## Implementation Notes

Current route handlers live under:

- `app/api/v1/ingest/route.ts`
- `app/api/geo/route.ts`
- `app/api/health/route.ts`
- `app/api/companion/proxy/route.ts`
- `app/api/companion/relay/[code]/route.ts`
- `app/api/sentry-example-api/route.ts`

When updating API docs, prefer the route handlers and their tests over older external notes.
