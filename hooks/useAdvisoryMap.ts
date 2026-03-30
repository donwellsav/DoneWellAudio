/**
 * useAdvisoryMap — owns the advisory Map, sorting, dedup, and cache
 *
 * Extracted from useAudioAnalyzer (Batch 5A) to isolate advisory state management.
 * Provides identity-stable callbacks safe for the DSP worker stableCallbacks object.
 *
 * Data flow:
 *   Worker → onAdvisory/onAdvisoryCleared → Map update → sort → setAdvisories → React
 *
 * Key design choices:
 *   - O(1) Map lookup (vs findIndex scans) for per-advisory updates
 *   - Sorted cache with dirty flag: only full re-sort on structural changes (new/removed),
 *     in-place .map() patch for updates to existing advisories
 *   - Frequency-proximity dedup: prevents duplicate cards when a peak is cleared then
 *     re-detected with a new track ID at the same frequency (100 cents = 1 semitone)
 */

import { useState, useCallback, useRef } from 'react'
import { getSeverityUrgency } from '@/lib/dsp/classifier'
import type { Advisory, DetectorSettings } from '@/types/advisory'

// ── Public interface ─────────────────────────────────────────────────────────

export interface UseAdvisoryMapReturn {
  /** Sorted, display-limited advisory list for React consumers */
  advisories: Advisory[]
  /** Identity-stable: handle new/updated advisory from worker */
  onAdvisory: (advisory: Advisory) => void
  /** Identity-stable: handle advisory resolved from worker */
  onAdvisoryCleared: (advisoryId: string) => void
  /** Clear all map state — call when starting fresh analysis */
  clearMap: () => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAdvisoryMap(
  settingsRef: React.RefObject<DetectorSettings>,
  frozenRef?: React.RefObject<boolean>
): UseAdvisoryMapReturn {
  const [advisories, setAdvisories] = useState<Advisory[]>([])

  // O(1) advisory lookup + sorted cache
  const mapRef = useRef<Map<string, Advisory>>(new Map())
  const sortedCacheRef = useRef<Advisory[]>([])
  const dirtyRef = useRef(false)

  // Freeze buffering: queue advisory updates while UI is frozen
  const frozenBufferRef = useRef<{ updates: Advisory[]; clears: string[] }>({ updates: [], clears: [] })
  const wasFrozenRef = useRef(false)

  // Sort: active above resolved → severity urgency → amplitude (descending)
  const buildSorted = useCallback(() => {
    const maxIssues = settingsRef.current?.maxDisplayedIssues ?? 50
    const sorted = Array.from(mapRef.current.values())
      .sort((a, b) => {
        // Active cards always above resolved
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
        const urgencyA = getSeverityUrgency(a.severity)
        const urgencyB = getSeverityUrgency(b.severity)
        if (urgencyA !== urgencyB) return urgencyB - urgencyA
        return b.trueAmplitudeDb - a.trueAmplitudeDb
      })
      .slice(0, maxIssues)
    sortedCacheRef.current = sorted
    dirtyRef.current = false
    return sorted
  }, [settingsRef])

  // ── Ref indirection for onAdvisory ──────────────────────────────────────
  // Reassigned every render so the stable callback below always has fresh closures.
  // (In practice all accesses are to refs/stable-identity values, but this pattern
  // is defensive and consistent with the original code.)

  const onAdvisoryImplRef = useRef<(a: Advisory) => void>(() => {})

  onAdvisoryImplRef.current = (advisory: Advisory) => {
    const isFrozen = frozenRef?.current ?? false

    // When frozen, buffer updates — except RUNAWAY which breaks through
    if (isFrozen && advisory.severity !== 'RUNAWAY') {
      frozenBufferRef.current.updates.push(advisory)
      // Still update the backing map so state is correct on unfreeze,
      // but don't trigger React re-render (cards stay frozen)
      applyToMap(advisory)
      return
    }

    applyToMap(advisory)
    flushToReact()
  }

  /** Apply an advisory to the backing map (no React update) */
  function applyToMap(advisory: Advisory) {
    const map = mapRef.current

    if (map.has(advisory.id)) {
      map.set(advisory.id, advisory)
    } else {
      // Frequency-proximity dedup (100 cents = 1 semitone, matches worker)
      let replacedKey: string | null = null
      for (const [key, existing] of map) {
        const cents = Math.abs(1200 * Math.log2(advisory.trueFrequencyHz / existing.trueFrequencyHz))
        if (cents <= 100) {
          replacedKey = key
          break
        }
      }
      if (replacedKey) map.delete(replacedKey)
      map.set(advisory.id, advisory)
      dirtyRef.current = true
    }
  }

  /** Push current map state to React */
  function flushToReact() {
    if (dirtyRef.current) {
      const sorted = buildSorted()
      setAdvisories(sorted)
    } else {
      const sorted = sortedCacheRef.current.map(a => {
        const latest = mapRef.current.get(a.id)
        return latest ?? a
      })
      sortedCacheRef.current = sorted
      setAdvisories(sorted)
    }
  }

  // ── Identity-stable callbacks — created once, delegate through refs ─────

  const stableCallbacks = useRef({
    onAdvisory: (advisory: Advisory) => onAdvisoryImplRef.current(advisory),

    onAdvisoryCleared: (advisoryId: string) => {
      const map = mapRef.current
      const existing = map.get(advisoryId)
      if (!existing || existing.resolved) return
      const resolved = { ...existing, resolved: true, resolvedAt: Date.now() }
      map.set(advisoryId, resolved)
      dirtyRef.current = true

      const isFrozen = frozenRef?.current ?? false
      if (isFrozen) {
        frozenBufferRef.current.clears.push(advisoryId)
        return // Don't update React — cards stay frozen
      }

      const sorted = buildSorted()
      setAdvisories(sorted)
    },
  }).current

  // ── Flush buffered updates when unfreeze is detected ─────────────────
  // Check on every render: if we were frozen and now aren't, flush.
  const currentlyFrozen = frozenRef?.current ?? false
  if (wasFrozenRef.current && !currentlyFrozen) {
    // Transition from frozen → unfrozen: map already has all updates applied,
    // just need to push current state to React
    frozenBufferRef.current = { updates: [], clears: [] }
    dirtyRef.current = true
    const sorted = buildSorted()
    setAdvisories(sorted)
  }
  wasFrozenRef.current = currentlyFrozen

  // ── clearMap — reset everything for fresh analysis ─────────────────────

  const clearMap = useCallback(() => {
    mapRef.current.clear()
    sortedCacheRef.current = []
    dirtyRef.current = false
    setAdvisories([])
  }, [])

  return {
    advisories,
    onAdvisory: stableCallbacks.onAdvisory,
    onAdvisoryCleared: stableCallbacks.onAdvisoryCleared,
    clearMap,
  }
}
