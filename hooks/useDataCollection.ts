/**
 * useDataCollection — orchestrates anonymous spectral data collection.
 *
 * Lifecycle:
 *   1. On mount: load opt-out state from localStorage
 *   2. When audio starts: auto-enable collection (unless opted out)
 *   3. Settings toggle: user can opt out at any time
 *
 * Collection is ON by default — no consent dialog. The data is truly
 * anonymous (magnitude spectrum only, random session IDs, no PII).
 * Users who don't want to participate toggle it off in Settings → Advanced.
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
  revokeConsent,
} from '@/lib/data/consent'
import type { ConsentStatus } from '@/types/data'
import type { SnapshotBatch } from '@/types/data'
import type { DSPWorkerHandle } from './useDSPWorker'

export interface DataCollectionState {
  /** Current consent status */
  consentStatus: ConsentStatus
  /** Whether the consent dialog should be shown (always false — dialog removed) */
  showConsentDialog: boolean
  /** Whether collection is actively running */
  isCollecting: boolean
}

export interface DataCollectionHandle extends DataCollectionState {
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
  /** Mutable ref — set this to the DSP worker handle after useAudioAnalyzer initializes */
  workerRef: React.MutableRefObject<DSPWorkerHandle | null>
}

export function useDataCollection(): DataCollectionHandle {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => {
    const stored = loadConsent()
    // Migrate: treat 'not_asked' and 'prompted' as 'accepted' (opt-out model)
    if (stored.status === 'not_asked' || stored.status === 'prompted') {
      return 'accepted'
    }
    return stored.status
  })
  const [isCollecting, setIsCollecting] = useState(false)

  // DSP worker handle — set externally by the consumer after useAudioAnalyzer
  const workerRef = useRef<DSPWorkerHandle | null>(null)

  // Audio params needed to enable collection
  const audioParamsRef = useRef<{ fftSize: number; sampleRate: number } | null>(null)

  // Lazy uploader — only instantiated when collecting
  const uploaderRef = useRef<import('@/lib/data/uploader').SnapshotUploader | null>(null)

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
        // Retry any batches from previous sessions
        uploaderRef.current.retryQueued().catch(() => {})
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
      // User explicitly opted out in Settings — respect it
      return
    }

    // Auto-accept for new users (no dialog)
    if (consent.status === 'not_asked' || consent.status === 'prompted') {
      acceptConsent()
      setConsentStatus('accepted')
    }

    // Enable collection
    enableCollection(fftSize, sampleRate)
  }, [enableCollection])

  // ─── Settings toggle actions ───────────────────────────────────────────

  const handleAccept = useCallback(() => {
    acceptConsent()
    setConsentStatus('accepted')

    if (audioParamsRef.current) {
      enableCollection(audioParamsRef.current.fftSize, audioParamsRef.current.sampleRate)
    }
  }, [enableCollection])

  const handleDecline = useCallback(() => {
    revokeConsent()
    setConsentStatus('declined')
    disableCollection()
  }, [disableCollection])

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
      console.warn('[DataCollection] handleSnapshotBatch called but uploader not ready — batch dropped')
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
    showConsentDialog: false, // Dialog removed — always false
    isCollecting,
    handleAccept,
    handleDecline,
    handleRevoke,
    handleReEnable,
    handleSnapshotBatch,
    promptIfNeeded,
    workerRef,
  }
}
