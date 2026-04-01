'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { deviceStorage } from '@/lib/storage/dwaStorage'

export interface AudioDevice {
  deviceId: string
  label: string
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>('')
  const mountedRef = useRef(true)
  const selectedDeviceIdRef = useRef('')

  const enumerate = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }))
      if (mountedRef.current) setDevices(inputs)
      const currentSelectedId = selectedDeviceIdRef.current
      if (currentSelectedId && !inputs.some(d => d.deviceId === currentSelectedId)) {
        selectedDeviceIdRef.current = ''
        deviceStorage.clear()
        if (mountedRef.current) setSelectedDeviceIdState('')
      }
      return inputs
    } catch {
      return []
    }
  }, [])

  // Load saved device + initial enumerate
  useEffect(() => {
    mountedRef.current = true
    const saved = deviceStorage.load()
    selectedDeviceIdRef.current = saved
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: restore saved device preference from localStorage on mount
    setSelectedDeviceIdState(saved)
    void enumerate()
    return () => { mountedRef.current = false }
  }, [enumerate])

  // Watch for device changes (plug/unplug)
  useEffect(() => {
    const handler = () => { enumerate() }
    navigator.mediaDevices.addEventListener('devicechange', handler)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }, [enumerate])

  const setSelectedDeviceId = useCallback((id: string) => {
    selectedDeviceIdRef.current = id
    setSelectedDeviceIdState(id)
    if (id) {
      deviceStorage.save(id)
    } else {
      deviceStorage.clear()
    }
  }, [])

  return { devices, selectedDeviceId, setSelectedDeviceId, refresh: enumerate }
}
