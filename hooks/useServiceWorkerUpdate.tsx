'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'

/**
 * Detects when a new service worker is waiting to activate and
 * prompts the user via the toast system.
 *
 * Flow:
 *   1. On mount, check the current SW registration.
 *   2. If a SW is already waiting, show the update toast immediately.
 *   3. Otherwise, listen for `updatefound` → track the installing SW →
 *      `statechange` → when it reaches "installed", show the toast.
 *   4. User taps "Refresh" → posts SKIP_WAITING → controllerchange → reload.
 */
export function useServiceWorkerUpdate(): void {
  const promptedRef = useRef(false)

  const activateUpdate = useCallback((waitingSW: ServiceWorker) => {
    waitingSW.postMessage({ type: 'SKIP_WAITING' })

    // Reload once the new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  const showUpdateToast = useCallback((waitingSW: ServiceWorker) => {
    if (promptedRef.current) return
    promptedRef.current = true

    toast({
      title: 'Update available',
      description: 'A new version is ready — tap to refresh.',
      duration: Infinity,
      action: (
        <ToastAction altText="Refresh to update" onClick={() => activateUpdate(waitingSW)}>
          Refresh
        </ToastAction>
      ),
    })
  }, [activateUpdate])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | undefined

    const onStateChange = (event: Event) => {
      const sw = event.target as ServiceWorker
      if (sw.state === 'installed' && registration?.waiting) {
        showUpdateToast(registration.waiting)
      }
    }

    const onUpdateFound = () => {
      const installing = registration?.installing
      if (!installing) return
      installing.addEventListener('statechange', onStateChange)
    }

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg

      // Case 1: a SW is already waiting (e.g. user revisited after a deploy)
      if (reg.waiting) {
        showUpdateToast(reg.waiting)
        return
      }

      // Case 2: watch for future updates
      reg.addEventListener('updatefound', onUpdateFound)

      // If an installing SW already exists when we register the listener
      if (reg.installing) {
        reg.installing.addEventListener('statechange', onStateChange)
      }
    })

    return () => {
      registration?.removeEventListener('updatefound', onUpdateFound)
    }
  }, [showUpdateToast])
}
