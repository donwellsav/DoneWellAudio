import { useEffect, useRef } from 'react'
import { recordFeedbackFromAdvisory } from '@/lib/dsp/feedbackHistory'
import type { Advisory } from '@/types/advisory'

/**
 * Hook to record detected advisories into feedback history
 * Prevents duplicate recording of the same advisory
 * Records to feedback history for repeat offender tracking
 */
export function useAdvisoryLogging(
  advisories: Advisory[],
  onRecorded?: () => void,
) {
  const recordedIdsRef = useRef(new Set<string>())

  useEffect(() => {
    let recorded = false
    advisories.forEach(advisory => {
      // Only dedupe once we have actually recorded this advisory.
      // Advisories can evolve in place (same ID, higher confidence / new label),
      // so an early low-confidence card must still be eligible later.
      if (!recordedIdsRef.current.has(advisory.id)) {
        // Record to feedback history for repeat offender tracking
        // Only record high-confidence feedback/ring events, not instruments or whistles
        if (
          advisory.confidence >= 0.6 &&
          (advisory.label === 'ACOUSTIC_FEEDBACK' || advisory.label === 'POSSIBLE_RING')
        ) {
          recordFeedbackFromAdvisory(advisory)
          recorded = true
          recordedIdsRef.current.add(advisory.id)
        }
      }
    })

    // Clean up IDs for advisories that are no longer in the list
    const currentIds = new Set(advisories.map(a => a.id))
    const idsToRemove: string[] = []
    recordedIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        idsToRemove.push(id)
      }
    })
    idsToRemove.forEach(id => recordedIdsRef.current.delete(id))

    if (recorded) {
      onRecorded?.()
    }
  }, [advisories, onRecorded])
}
