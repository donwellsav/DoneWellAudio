/**
 * useDataCollection — orchestrates consent, snapshot collection, and upload.
 *
 * Lifecycle:
 *   1. On mount: load consent from localStorage
 *   2. When audio starts + consent is pending → show consent dialog
 *   3. On accept: enable collection in DSP worker, wire uploader
 *   4. On decline: persist decline, never prompt again (until version bump)
 *   5. On revoke (from settings): disable collection in worker
 *
 * This hook does NOT import any data collection code at the top level.
 * The worker uses dynamic import() for snapshotCollector, and the uploader
 * is only instantiated after consent is accepted.
 *
 * The DSP worker handle is passed via a mutable ref to avoid circular
 * dependency with useAudioAnalyzer (which provides the handle).
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  loadConsent,
  markPrompted,
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
  /** User accepted data collection */
  handleAccept: () => void
  /** User declined data collection */
  handleDecline: () => void
  /** User revoked consent from settings */
  handleRevoke: () => void
  /** User re-enabled consent from settings */
  handleReEnable: () => void
  /** Called by useDSPWorker's onSnapshotBatch callback */
  handleSnapshotBatch: (batch: SnapshotBatch) => void
  /** Trigger consent prompt (called when audio starts) */
  promptIfNeeded: (fftSize: number, sampleRate: number) => void
  /** Mutable ref — set this to the DSP worker handle after useAudioAnalyzer initializes */
  workerRef: React.MutableRefObject<DSPWorkerHandle | null>
}

export function useDataCollection(): DataCollectionHandle {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => loadConsent().status)
  const [showConsentDialog, setShowConsentDialog] = useState(false)
  const [isCollecting, setIsCollecting] = useState(false)

  // DSP worker handle — set externally by the consumer after useAudioAnalyzer
  const workerRef = useRef<DSPWorkerHandle | null>(null)

  // Audio params needed to enable collection
  const audioParamsRef = useRef<{ fftSize: number; sampleRate: number } | null>(null)

  // Lazy uploader — only instantiated after consent
  const uploaderRef = useRef<import('@/lib/data/uploader').SnapshotUploader | null>(null)

  // Session ID — stable per page load
  const sessionIdRef = useRef<string>(crypto.randomUUID())

  // ─── Enable / disable collection ───────────────────────────────────────

  const enableCollection = useCallback(async (fftSize: number, sampleRate: number) => {
    const worker = workerRef.current
    if (!worker) return

    worker.enableCollection(sessionIdRef.current, fftSize, sampleRate)
    setIsCollecting(true)

    // Lazy-load uploader
    if (!uploaderRef.current) {
      const { SnapshotUploader } = await import('@/lib/data/uploader')
      uploaderRef.current = new SnapshotUploader()
      // Retry any batches from previous sessions
      uploaderRef.current.retryQueued().catch(() => {})
    }
  }, [])

  const disableCollection = useCallback(() => {
    workerRef.current?.disableCollection()
    setIsCollecting(false)
  }, [])

  // ─── Consent prompt trigger ────────────────────────────────────────────

  const promptIfNeeded = useCallback((fftSize: number, sampleRate: number) => {
    audioParamsRef.current = { fftSize, sampleRate }

    const consent = loadConsent()
    if (consent.status === 'not_asked' || consent.status === 'prompted') {
      // Show dialog for first-time users AND users who saw the dialog
      // but never responded (dismissed without clicking Accept/Decline)
      markPrompted()
      setConsentStatus('prompted')
      setShowConsentDialog(true)
    } else if (consent.status === 'accepted') {
      // Already consented — enable collection immediately
      enableCollection(fftSize, sampleRate)
    }
    // 'declined' — respect the explicit decline, don't re-prompt
  }, [enableCollection])

  // ─── User actions ─────────────────────────────────────────────────────

  const handleAccept = useCallback(() => {
    acceptConsent()
    setConsentStatus('accepted')
    setShowConsentDialog(false)

    if (audioParamsRef.current) {
      enableCollection(audioParamsRef.current.fftSize, audioParamsRef.current.sampleRate)
    }
  }, [enableCollection])

  const handleDecline = useCallback(() => {
    declineConsent()
    setConsentStatus('declined')
    setShowConsentDialog(false)
  }, [])

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
    uploaderRef.current?.enqueue(batch)
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
    handleAccept,
    handleDecline,
    handleRevoke,
    handleReEnable,
    handleSnapshotBatch,
    promptIfNeeded,
    workerRef,
  }
}
