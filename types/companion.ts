/**
 * Bitfocus Companion integration settings.
 *
 * Separate from DSP/display settings — Companion is an external integration,
 * not part of the audio analysis pipeline.
 */
export interface CompanionSettings {
  /** Whether the Companion bridge is enabled */
  enabled: boolean
  /** Companion instance URL (default: http://localhost:8000) */
  url: string
  /** Module instance name in Companion */
  instanceName: string
  /** Auto-send every advisory above threshold (vs. manual "Send to Mixer" button) */
  autoSend: boolean
  /** Minimum confidence to send (0-1) */
  minConfidence: number
  /** Auto-send during ring-out wizard steps */
  ringOutAutoSend: boolean
}

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  enabled: false,
  url: 'http://localhost:8000',
  instanceName: 'donewell-audio',
  autoSend: false,
  minConfidence: 0.7,
  ringOutAutoSend: false,
}
