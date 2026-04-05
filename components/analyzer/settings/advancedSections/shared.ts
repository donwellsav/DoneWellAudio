'use client'

import type { UseAdvancedTabStateReturn } from '@/hooks/useAdvancedTabState'
import type { Algorithm, DetectorSettings } from '@/types/advisory'
import type { ConsentStatus } from '@/types/data'
import type { DiagnosticsProfile } from '@/types/settings'

export const AVAILABLE_ALGORITHMS: ReadonlyArray<readonly [Algorithm, string]> = [
  ['msd', 'MSD'],
  ['phase', 'Phase'],
  ['spectral', 'Spectral'],
  ['comb', 'Comb'],
  ['ihr', 'IHR'],
  ['ptmr', 'PTMR'],
  ['ml', 'ML'],
]

export const PRIVACY_SUMMARY = [
  'Magnitude spectrum only - no audio',
  'No device IDs or IP addresses',
  'Random session IDs, never linked to accounts',
]

export type AdvancedActions = Pick<
  UseAdvancedTabStateReturn,
  'updateDisplayField' | 'updateDiagnosticField' | 'toggleAlgorithmMode' | 'toggleAlgorithm' | 'handleCollectionToggle'
>

export interface AdvancedSectionProps {
  settings: DetectorSettings
  actions: AdvancedActions
}

export interface AdvancedDataCollectionSectionProps {
  consentStatus: ConsentStatus
  isCollecting?: boolean
  showTooltips: boolean
  handleCollectionToggle: (checked: boolean) => void
}

export function parseFftSize(value: string): 4096 | 8192 | 16384 {
  return parseInt(value, 10) as 4096 | 8192 | 16384
}

export type { DiagnosticsProfile }
