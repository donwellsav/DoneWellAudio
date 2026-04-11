/**
 * useDataCollection — orchestrates anonymous spectral data collection.
 *
 * Lifecycle:
 *   1. On mount: load consent state from localStorage
 *   2. When audio starts: show consent dialog if status is 'not_asked'
 *   3. On accept/decline: persist choice and enable/skip collection
 *   4. Settings toggle: user can change consent at any time
 *
 * Collection requires explicit acceptance before any data is sent.
 *
 * This hook does NOT import any data collection code at the top level.
 * The uploader is lazy-loaded via dynamic import() and must be ready
 * BEFORE the worker is told to start collecting (to prevent batch drops).
 *
 * The DSP worker handle is passed via a mutable ref to avoid circular
 * dependency with useAudioAnalyzer (which provides the handle).
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  loadConsent,
  acceptConsent,
  declineConsent,
  revokeConsent,
} from '@/lib/data/consent'
import type { ConsentStatus } from '@/types/data'
import type { SnapshotBatch } from '@/types/data'
import type { DSPWorkerHandle } from './useDSPWorker'

export interface DataCollectionState {
  /** Current consent status */
  consentStatus: ConsentStatus
  /** Whether the consent dialog should be shown */
  showConsentDialog: boolean
  /** Whether collection is actively running */
  isCollecting: boolean
}

export interface DataCollectionHandle extends DataCollectionState {
  /** Whether the user is in an EU/EEA/UK jurisdiction (drives GDPR dialog) */
  isEU: boolean
  /** User accepted data collection (kept for Settings toggle compatibility) */
  handleAccept: () => void
  /** User declined data collection (kept for Settings toggle compatibility) */
  handleDecline: () => void
  /** User revoked consent from settings */
  handleRevoke: () => void
  /** User re-enabled consent from settings */
  handleReEnable: () => void
  /** Called by useDSPWorker's onSnapshotBatch callback */
  handleSnapshotBatch: (batch: SnapshotBatch) => void
  /** Auto-enable collection when audio starts (unless opted out) */
  promptIfNeeded: (fftSize: number, sampleRate: number) => void
  /** Attach or detach the DSP worker that owns snapshot collection */
  attachWorker: (worker: DSPWorkerHandle | null) => void
}

export function useDataCollection(): DataCollectionHandle {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => loadConsent().status)
  const [isCollecting, setIsCollecting] = useState(false)
  const [showConsentDialog, setShowConsentDialog] = useState(false)
  const [isEU, setIsEU] = useState(false)

  // Fetch jurisdiction once on mount — fail open (non-EU dialog on error)
  useEffect(() => {
    fetch('/api/geo')
      .then(r => r.json())
      .then(({ isEU: eu }: { isEU: boolean }) => setIsEU(eu))
      .catch((e) => { console.warn('[DataCollection] Geo fetch failed (failing open):', e) })
  }, [])

  // DSP worker handle — set externally by the consumer after useAudioAnalyzer
  const workerRef = useRef<DSPWorkerHandle | null>(null)
  const attachWorker = useCallback((worker: DSPWorkerHandle | null) => {
    workerRef.current = worker
  }, [])

  // Audio params needed to enable collection
  const audioParamsRef = useRef<{ fftSize: number; sampleRate: number } | null>(null)

  // Lazy uploader — only instantiated when collecting
  const uploaderRef = useRef<import('@/lib/data/uploader').SnapshotUploader | null>(null)

  // Queue for batches that arrive before the uploader finishes dynamic import
  const pendingBatchesRef = useRef<SnapshotBatch[]>([])

  // Session ID — stable per page load
  const sessionIdRef = useRef<string>(crypto.randomUUID())

  // ─── Enable / disable collection ───────────────────────────────────────

  const enableCollection = useCallback(async (fftSize: number, sampleRate: number) => {
    const worker = workerRef.current
    if (!worker) {
      console.warn('[DataCollection] enableCollection called but workerRef is null')
      return
    }

    // Ensure uploader is ready BEFORE telling worker to start —
    // otherwise batches arrive at handleSnapshotBatch while uploaderRef is null
    // and get silently dropped.
    if (!uploaderRef.current) {
      try {
        const { SnapshotUploader } = await import('@/lib/data/uploader')
        uploaderRef.current = new SnapshotUploader()
        console.debug('[DataCollection] Uploader created')
        // Flush any batches that arrived during dynamic import
        if (pendingBatchesRef.current.length > 0) {
          const queued = pendingBatchesRef.current
          pendingBatchesRef.current = []
          for (const batch of queued) {
            uploaderRef.current.enqueue(batch)
          }
          console.debug(`[DataCollection] Flushed ${queued.length} queued batch(es)`)
        }
        // Retry any batches from previous sessions
        uploaderRef.current.retryQueued().catch((e) => { console.warn('[DataCollection] retryQueued failed:', e) })
      } catch (err) {
        console.error('[DataCollection] Failed to load uploader — aborting collection:', err)
        return
      }
    }

    console.debug('[DataCollection] Enabling collection, sessionId=' + sessionIdRef.current.slice(0, 8) + '...')
    worker.enableCollection(sessionIdRef.current, fftSize, sampleRate)
    setIsCollecting(true)
  }, [])

  const disableCollection = useCallback(() => {
    workerRef.current?.disableCollection()
    setIsCollecting(false)
  }, [])

  // ─── Auto-enable on audio start ─────────────────────────────────────────

  const promptIfNeeded = useCallback((fftSize: number, sampleRate: number) => {
    audioParamsRef.current = { fftSize, sampleRate }

    const consent = loadConsent()
    if (consent.status === 'declined') {
      // User explicitly opted out — respect it
      return
    }

    if (consent.status === 'accepted') {
      // Already accepted — enable collection immediately
      enableCollection(fftSize, sampleRate)
      return
    }

    // Not yet asked — show consent dialog (opt-in model)
    setShowConsentDialog(true)
  }, [enableCollection])

  // ─── Settings toggle actions ───────────────────────────────────────────

  const handleAccept = useCallback(() => {
    acceptConsent(isEU ? 'EU' : 'other')
    setConsentStatus('accepted')
    setShowConsentDialog(false)

    if (audioParamsRef.current) {
      enableCollection(audioParamsRef.current.fftSize, audioParamsRef.current.sampleRate)
    }
  }, [enableCollection, isEU])

  const handleDecline = useCallback(() => {
    declineConsent(isEU ? 'EU' : 'other')
    setConsentStatus('declined')
    setShowConsentDialog(false)
    disableCollection()
  }, [disableCollection, isEU])

  const handleRevoke = useCallback(() => {
    revokeConsent()
    setConsentStatus('declined')
    disableCollection()
  }, [disableCollection])

  const handleReEnable = useCallback(() => {
    acceptConsent()
    setConsentStatus('accepted')

    if (audioParamsRef.current) {
      enableCollection(audioParamsRef.current.fftSize, audioParamsRef.current.sampleRate)
    }
  }, [enableCollection])

  // ─── Batch handler (wired to useDSPWorker callback) ────────────────────

  const handleSnapshotBatch = useCallback((batch: SnapshotBatch) => {
    if (!uploaderRef.current) {
      // Queue instead of dropping — flushed once uploader initializes
      pendingBatchesRef.current.push(batch)
      return
    }
    uploaderRef.current.enqueue(batch)
  }, [])

  // ─── Cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      disableCollection()
    }
  }, [disableCollection])

  return {
    consentStatus,
    showConsentDialog,
    isCollecting,
    isEU,
    handleAccept,
    handleDecline,
    handleRevoke,
    handleReEnable,
    handleSnapshotBatch,
    promptIfNeeded,
    attachWorker,
  }
}
