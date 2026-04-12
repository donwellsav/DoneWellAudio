'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * useServiceWorkerUpdate — detects when a new service worker is waiting
 * and provides a callback to activate it.
 *
 * The SW uses `skipWaiting: false` (app/sw.ts), so new versions wait until
 * the user explicitly accepts the update. This hook:
 *  1. Checks for a waiting SW on mount
 *  2. Listens for `updatefound` events on the registration
 *  3. Exposes `updateAvailable` boolean + `applyUpdate()` callback
 *
 * After `applyUpdate()`, the new SW calls `self.skipWaiting()` which triggers
 * `controllerchange` → page reload.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    let cancelled = false
    let regRef: ServiceWorkerRegistration | null = null
    let onUpdateFound: (() => void) | null = null
    let installingRef: ServiceWorker | null = null
    let onStateChange: (() => void) | null = null

    navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return
      regRef = reg
      setRegistration(reg)

      // Check if there's already a waiting worker
      if (reg.waiting) {
        setUpdateAvailable(true)
        return
      }

      // Listen for new workers that enter the waiting state
      onUpdateFound = () => {
        const installing = reg.installing
        if (!installing) return

        // Clean up previous installing listener if a new install starts
        if (installingRef && onStateChange) {
          installingRef.removeEventListener('statechange', onStateChange)
        }
        installingRef = installing
        onStateChange = () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            if (!cancelled) setUpdateAvailable(true)
          }
        }
        installing.addEventListener('statechange', onStateChange)
      }
      reg.addEventListener('updatefound', onUpdateFound)
    }).catch(() => {
      // SW not supported or not registered — no update to offer
    })

    // Reload when new SW takes control
    const onControllerChange = () => window.location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (regRef && onUpdateFound) {
        regRef.removeEventListener('updatefound', onUpdateFound)
      }
      if (installingRef && onStateChange) {
        installingRef.removeEventListener('statechange', onStateChange)
      }
    }
  }, [])

  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return
    // Tell the waiting SW to skip waiting and activate
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }, [registration])

  return { updateAvailable, applyUpdate }
}
