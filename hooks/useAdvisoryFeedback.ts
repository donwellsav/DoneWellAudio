'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    const liveIds = new Set(advisories.map((advisory) => advisory.id))

    setLocalFalsePositiveIds((prev) => {
      const next = new Set<string>()
      let changed = false
      prev.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })

    setConfirmedIds((prev) => {
      const next = new Set<string>()
      let changed = false
      prev.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [advisories])

  const handleFalsePositive = useCallback((advisoryId: string) => {
    const isCurrentlyFlagged =
      localFalsePositiveIds.has(advisoryId) ||
      calibration.falsePositiveIds.has(advisoryId)
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

    const advisory = advisories.find(item => item.id === advisoryId)
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

    if (calibration.calibrationEnabled) {
      calibration.onFalsePositive(advisoryId)
    }
  }, [advisories, calibration, dspWorker, localFalsePositiveIds])

  const handleConfirmFeedback = useCallback((advisoryId: string) => {
    const isConfirming = !confirmedIds.has(advisoryId)

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

    if (calibration.calibrationEnabled && calibration.falsePositiveIds.has(advisoryId)) {
      calibration.onFalsePositive(advisoryId)
    }

    const advisory = advisories.find(item => item.id === advisoryId)
    if (advisory) {
      dspWorker.sendUserFeedback(
        advisory.trueFrequencyHz,
        isConfirming ? 'confirmed_feedback' : 'correct',
      )
    }
  }, [advisories, calibration, confirmedIds, dspWorker])

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
