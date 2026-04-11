/**
 * useSessionHistory — Archives session summaries on stop / tab close.
 *
 * Uses the latest-ref pattern so the endSession callback always captures
 * current mode and metadata without stale closures. The idempotent guard
 * (flushedRef) prevents double-archiving on rapid stop/start or
 * beforeunload + explicit stop races.
 *
 * P4: Desktop-only V1 — no mobile session history UI initially.
 */

import { useRef, useCallback, useEffect } from 'react'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { archiveSession } from '@/lib/storage/sessionHistoryStorage'
import type { ArchivedSession, ArchivedHotspot, ExportMetadata } from '@/types/export'

interface SessionContext {
  mode: string
  metadata?: ExportMetadata
}

interface UseSessionHistoryOptions {
  isRunning: boolean
}

export function useSessionHistory({ isRunning }: UseSessionHistoryOptions) {
  const contextRef = useRef<SessionContext>({ mode: 'speech' })
  const flushedRef = useRef(false)

  /** Update the latest context snapshot — call on every render or when mode/metadata changes. */
  const updateContext = useCallback((ctx: SessionContext) => {
    contextRef.current = ctx
  }, [])

  /**
   * Archive the current session. Synchronous (safe for beforeunload).
   * Idempotent — only the first call per session actually writes.
   */
  const endSession = useCallback(() => {
    if (flushedRef.current) return
    flushedRef.current = true

    const history = getFeedbackHistory()
    // Sync flush to localStorage — safe for beforeunload where async IDB
    // transactions may be killed. Next load will merge into IndexedDB.
    history.flushSync()

    const summary = history.getSessionSummary()
    const hotspots = history.getHotspots()

    // Skip archiving empty sessions (start → immediate stop)
    if (summary.totalEvents === 0) return

    const topHotspots: ArchivedHotspot[] = hotspots.slice(0, 10).map(h => ({
      centerFrequencyHz: h.centerFrequencyHz,
      occurrences: h.occurrences,
      maxAmplitudeDb: h.maxAmplitudeDb,
      avgAmplitudeDb: h.avgAmplitudeDb,
      avgConfidence: h.avgConfidence,
      suggestedCutDb: h.suggestedCutDb,
      isRepeatOffender: h.isRepeatOffender,
    }))

    const archived: ArchivedSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      startTime: summary.startTime,
      endTime: Date.now(),
      durationMs: Date.now() - summary.startTime,
      mode: contextRef.current.mode,
      totalEvents: summary.totalEvents,
      totalHotspots: hotspots.length,
      repeatOffenderCount: summary.repeatOffenders.length,
      frequencyBandBreakdown: summary.frequencyBandBreakdown,
      topHotspots,
      metadata: contextRef.current.metadata,
    }

    archiveSession(archived)
  }, [])

  /** Reset the idempotent guard — call when starting a new analysis session. */
  const resetGuard = useCallback(() => {
    flushedRef.current = false
  }, [])

  // Safety net: flush on tab close / navigation while running
  useEffect(() => {
    if (!isRunning) return
    const handler = () => endSession()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isRunning, endSession])

  return { endSession, resetGuard, updateContext }
}
