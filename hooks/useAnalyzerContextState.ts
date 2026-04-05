'use client'

import { useCallback, useEffect, type RefObject } from 'react'
import { useAudioAnalyzer, type UseAudioAnalyzerReturn } from '@/hooks/useAudioAnalyzer'
import { useAudioDevices, type AudioDevice } from '@/hooks/useAudioDevices'
import type { SnapshotBatch } from '@/types/data'
import type { DataCollectionHandle } from '@/hooks/useDataCollection'

export interface AnalyzerContextState extends UseAudioAnalyzerReturn {
  devices: AudioDevice[]
  selectedDeviceId: string
  startWithDevice: () => Promise<void>
  handleDeviceChange: (deviceId: string) => void
  inputLevel: number
  isAutoGain: boolean
  autoGainDb: number | undefined
  autoGainLocked: boolean
}

interface UseAnalyzerContextStateOptions {
  dataCollection: DataCollectionHandle
  frozenRef?: RefObject<boolean>
}

export function useAnalyzerContextState({
  dataCollection,
  frozenRef,
}: UseAnalyzerContextStateOptions): AnalyzerContextState {
  const analyzer = useAudioAnalyzer(
    {},
    {
      onSnapshotBatch: (batch: SnapshotBatch) => dataCollection.handleSnapshotBatch(batch),
    },
    frozenRef,
  )
  const {
    dspWorker,
    isRunning,
    start,
    switchDevice,
    spectrumStatus,
    settings,
  } = analyzer

  useEffect(() => {
    dataCollection.attachWorker(dspWorker)
    return () => dataCollection.attachWorker(null)
  }, [dataCollection, dspWorker])

  const { devices, selectedDeviceId, setSelectedDeviceId, refresh: refreshDevices } = useAudioDevices()

  useEffect(() => {
    if (isRunning) {
      void refreshDevices()
    }
  }, [isRunning, refreshDevices])

  const startWithDevice = useCallback(async () => {
    await start({ deviceId: selectedDeviceId || undefined })
  }, [selectedDeviceId, start])

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    void switchDevice(deviceId)
  }, [setSelectedDeviceId, switchDevice])

  const inputLevel = spectrumStatus?.peak ?? -60
  const autoGainDb = spectrumStatus?.autoGainDb
  const isAutoGain = spectrumStatus?.autoGainEnabled ?? settings.autoGainEnabled
  const autoGainLocked = spectrumStatus?.autoGainLocked ?? false

  return {
    ...analyzer,
    devices,
    selectedDeviceId,
    startWithDevice,
    handleDeviceChange,
    inputLevel,
    isAutoGain,
    autoGainDb,
    autoGainLocked,
  }
}
