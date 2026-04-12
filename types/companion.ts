/**
 * Bitfocus Companion integration settings.
 *
 * Uses a cloud relay with pairing code — no URLs or IP addresses needed.
 * DoneWell posts to its own server, Companion polls from the user's network.
 */
export interface CompanionSettings {
  /** Whether the Companion bridge is enabled */
  enabled: boolean
  /** Pairing code shared between DoneWell and the Companion module */
  pairingCode: string
  /** Auto-send every advisory above threshold (vs. manual "Send to Mixer" button) */
  autoSend: boolean
  /** Minimum confidence to send (0-1) */
  minConfidence: number
  /** Auto-send during ring-out wizard steps */
  ringOutAutoSend: boolean
}

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  enabled: false,
  pairingCode: '',
  autoSend: false,
  minConfidence: 0.7,
  ringOutAutoSend: false,
}

// ═══════════════════════════════════════════════════════════════════════════
// Bidirectional relay protocol — DWA ↔ Companion module
// ═══════════════════════════════════════════════════════════════════════════
//
// Relay endpoint: /api/companion/relay/[code]
//   - DWA → module: POST to default queue, module polls GET (default)
//   - Module → DWA: POST with ?direction=app, DWA polls GET with ?direction=app
//
// Backward compatible: old module v0.3.0 ignores the new direction and keeps
// working with the default (DWA → module) flow.

/** Messages sent from DWA to the Companion module. */
export type DwaToModuleMessage =
  /** Full advisory push (existing — see companionBridge.toPayload). */
  | {
      type?: undefined
      id: string
      trueFrequencyHz: number
      severity: string
      confidence: number
      peq: { type: string; hz: number; q: number; gainDb: number }
      geq: { bandHz: number; bandIndex: number; suggestedDb: number }
      pitch: { note: string; octave: number; cents: number; midi: number }
    }
  /** Explicit auto-apply directive — module applies regardless of autoApply config. */
  | {
      type: 'auto_apply'
      id: string
      trueFrequencyHz: number
      severity: string
      confidence: number
      peq: { type: string; hz: number; q: number; gainDb: number }
      geq: { bandHz: number; bandIndex: number; suggestedDb: number }
      pitch: { note: string; octave: number; cents: number; midi: number }
    }
  /** Lifecycle: advisory resolved (no longer detected). */
  | { type: 'resolve'; advisoryId: string }
  /** Lifecycle: user dismissed the advisory. */
  | { type: 'dismiss'; advisoryId: string }
  /** Mode change — module can reconfigure mixer per mode if supported. */
  | { type: 'mode_change'; mode: string }
  /** Diagnostic: ask module for status. */
  | { type: 'ping'; requestId: string }

/** Messages sent from the Companion module back to DWA. */
export type ModuleToAppMessage =
  /** Module received the advisory. */
  | { type: 'ack'; advisoryId: string; timestamp: number }
  /** EQ cut successfully sent to mixer. */
  | {
      type: 'applied'
      advisoryId: string
      bandIndex: number
      appliedGainDb: number
      frequencyHz: number
      slotIndex: number
      timestamp: number
    }
  /** Apply failed — mixer error, slots full, etc. */
  | { type: 'apply_failed'; advisoryId: string; reason: string; timestamp: number }
  /** Partial apply — one of PEQ/GEQ succeeded but the other failed (both mode). */
  | {
      type: 'partial_apply'
      advisoryId: string
      peqApplied: boolean
      geqApplied: boolean
      failReason: string
      timestamp: number
    }
  /** Slot cleared (resolve/dismiss echo). */
  | { type: 'cleared'; advisoryId: string; slotIndex: number; timestamp: number }
  /** Stream Deck button pressed — DWA should take an action. */
  | {
      type: 'command'
      action:
        | 'start'
        | 'stop'
        | 'clear_all'
        | 'freeze'
        | 'unfreeze'
        | 'ringout_start'
        | 'ringout_stop'
        | `mode:${string}`
      timestamp: number
    }
  /** Response to ping — module state snapshot. */
  | {
      type: 'pong'
      requestId: string
      slotsUsed: number
      slotsTotal: number
      timestamp: number
    }

