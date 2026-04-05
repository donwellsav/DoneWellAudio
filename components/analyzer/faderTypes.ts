'use client'

export type FaderMode = 'gain' | 'sensitivity'

export interface FaderGuidance {
  direction: 'up' | 'down' | 'none'
  urgency: 'warning' | 'hint' | 'none'
}
