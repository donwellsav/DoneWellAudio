'use client'

import { useEffect, useRef } from 'react'
import type { OperationMode } from '@/types/advisory'
import { useCompanion } from '@/hooks/useCompanion'

export function useCompanionModeSync(mode: OperationMode): void {
  const { settings, sendModeChange } = useCompanion()
  const lastSyncedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!settings.enabled || !settings.pairingCode) {
      lastSyncedKeyRef.current = null
      return
    }

    const syncKey = `${settings.pairingCode}:${mode}`
    if (lastSyncedKeyRef.current === syncKey) {
      return
    }

    lastSyncedKeyRef.current = syncKey
    void sendModeChange(mode).then((accepted) => {
      if (!accepted && lastSyncedKeyRef.current === syncKey) {
        lastSyncedKeyRef.current = null
      }
    })
  }, [mode, sendModeChange, settings.enabled, settings.pairingCode])
}
