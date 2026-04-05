'use client'

import { useCallback, useState } from 'react'
import type { OperationMode } from '@/types/advisory'

interface UseRingOutFlowParams {
  handleModeChange: (mode: OperationMode) => void
  start: () => Promise<void>
}

export interface RingOutFlowState {
  isWizardActive: boolean
  startWizard: () => void
  finishWizard: () => void
  startRingOut: () => void
}

export function useRingOutFlow({
  handleModeChange,
  start,
}: UseRingOutFlowParams): RingOutFlowState {
  const [isWizardActive, setIsWizardActive] = useState(false)

  const startWizard = useCallback(() => {
    setIsWizardActive(true)
  }, [])

  const finishWizard = useCallback(() => {
    setIsWizardActive(false)
  }, [])

  const startRingOut = useCallback(() => {
    handleModeChange('ringOut')
    void start()
    setIsWizardActive(true)
  }, [handleModeChange, start])

  return {
    isWizardActive,
    startWizard,
    finishWizard,
    startRingOut,
  }
}
