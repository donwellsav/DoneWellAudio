import type { SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
  /** Minimum confidence to accept an advisory (0-1) */
  minConfidence: number
  /** Minimum severity to accept */
  minSeverity: 'RUNAWAY' | 'GROWING' | 'RESONANCE' | 'POSSIBLE_RING'
  /** Maximum cut depth in dB (safety clamp) */
  maxCutDb: number
  /** Auto-acknowledge advisories after this many seconds (0 = manual only) */
  autoAckSeconds: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
  return [
    {
      type: 'number',
      id: 'minConfidence',
      label: 'Minimum Confidence (0-1)',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      width: 6,
    },
    {
      type: 'dropdown',
      id: 'minSeverity',
      label: 'Minimum Severity',
      default: 'POSSIBLE_RING',
      choices: [
        { id: 'RUNAWAY', label: 'Runaway only' },
        { id: 'GROWING', label: 'Growing and above' },
        { id: 'RESONANCE', label: 'Resonance and above' },
        { id: 'POSSIBLE_RING', label: 'All detections' },
      ],
      width: 6,
    },
    {
      type: 'number',
      id: 'maxCutDb',
      label: 'Max Cut Depth (dB)',
      default: -12,
      min: -24,
      max: -3,
      step: 1,
      width: 6,
    },
    {
      type: 'number',
      id: 'autoAckSeconds',
      label: 'Auto-Acknowledge (seconds, 0=manual)',
      default: 0,
      min: 0,
      max: 60,
      step: 1,
      width: 6,
    },
  ]
}
