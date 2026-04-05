'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { Advisory } from '@/types/advisory'
import type { UseCalibrationSessionReturn } from '@/hooks/useCalibrationSession'
import type { DSPWorkerHandle } from '@/hooks/useDSPWorker'

interface AdvisoryFeedbackCalibration {
  calibrationEnabled: UseCalibrationSessionReturn['calibrationEnabled']
  falsePositiveIds: UseCalibrationSessionReturn['falsePositiveIds']
  onFalsePositive: UseCalibrationSessionReturn['onFalsePositive']
}

interface UseAdvisoryFeedbackParams {
  advisories: Advisory[]
  dspWorker: Pick<DSPWorkerHandle, 'sendUserFeedback'>
  calibration: AdvisoryFeedbackCalibration
}

export interface AdvisoryFeedbackState {
  falsePositiveIds: ReadonlySet<string>
  confirmedIds: ReadonlySet<string>
  handleFalsePositive: (advisoryId: string) => void
  handleConfirmFeedback: (advisoryId: string) => void
}

export function useAdvisoryFeedback({
  advisories,
  dspWorker,
  calibration,
}: UseAdvisoryFeedbackParams): AdvisoryFeedbackState {
  const [localFalsePositiveIds, setLocalFalsePositiveIds] = useState<Set<string>>(new Set())
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())

  const localFalsePositiveIdsRef = useRef(localFalsePositiveIds)
  localFalsePositiveIdsRef.current = localFalsePositiveIds

  const confirmedIdsRef = useRef(confirmedIds)
  confirmedIdsRef.current = confirmedIds

  const advisoriesRef = useRef(advisories)
  advisoriesRef.current = advisories

  const calibrationRef = useRef(calibration)
  calibrationRef.current = calibration

  const handleFalsePositive = useCallback((advisoryId: string) => {
    const calibrationState = calibrationRef.current
    const isCurrentlyFlagged =
      localFalsePositiveIdsRef.current.has(advisoryId) ||
      calibrationState.falsePositiveIds.has(advisoryId)
    const isFlagging = !isCurrentlyFlagged

    setLocalFalsePositiveIds(prev => {
      const next = new Set(prev)
      if (isFlagging) {
        next.add(advisoryId)
      } else {
        next.delete(advisoryId)
      }
      return next
    })

    const advisory = advisoriesRef.current.find(item => item.id === advisoryId)
    if (advisory) {
      dspWorker.sendUserFeedback(
        advisory.trueFrequencyHz,
        isFlagging ? 'false_positive' : 'correct',
      )
    }

    setConfirmedIds(prev => {
      if (!prev.has(advisoryId)) return prev
      const next = new Set(prev)
      next.delete(advisoryId)
      return next
    })

    if (calibrationState.calibrationEnabled) {
      calibrationState.onFalsePositive(advisoryId)
    }
  }, [dspWorker])

  const handleConfirmFeedback = useCallback((advisoryId: string) => {
    const isConfirming = !confirmedIdsRef.current.has(advisoryId)

    setConfirmedIds(prev => {
      const next = new Set(prev)
      if (isConfirming) {
        next.add(advisoryId)
      } else {
        next.delete(advisoryId)
      }
      return next
    })

    setLocalFalsePositiveIds(prev => {
      if (!prev.has(advisoryId)) return prev
      const next = new Set(prev)
      next.delete(advisoryId)
      return next
    })

    const calibrationState = calibrationRef.current
    if (calibrationState.calibrationEnabled && calibrationState.falsePositiveIds.has(advisoryId)) {
      calibrationState.onFalsePositive(advisoryId)
    }

    const advisory = advisoriesRef.current.find(item => item.id === advisoryId)
    if (advisory) {
      dspWorker.sendUserFeedback(
        advisory.trueFrequencyHz,
        isConfirming ? 'confirmed_feedback' : 'correct',
      )
    }
  }, [dspWorker])

  const falsePositiveIds = useMemo<ReadonlySet<string>>(() => {
    if (!calibration.calibrationEnabled) return localFalsePositiveIds

    const merged = new Set(localFalsePositiveIds)
    calibration.falsePositiveIds.forEach(id => merged.add(id))
    return merged
  }, [localFalsePositiveIds, calibration.calibrationEnabled, calibration.falsePositiveIds])

  return {
    falsePositiveIds,
    confirmedIds,
    handleFalsePositive,
    handleConfirmFeedback,
  }
}
