'use client'

/**
 * useCompanion — manages Companion module connection, pairing, and advisory relay.
 *
 * Handles relay bridge lifecycle, connectivity checks, auto-send of new advisories,
 * pairing code generation, and settings persistence. Companion modules are external
 * hardware/software (e.g., Wing OSC, dbx DriveRack PA2) that receive EQ recommendations.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Advisory } from '@/types/advisory'
import type { CompanionSettings } from '@/types/companion'
import { DEFAULT_COMPANION_SETTINGS } from '@/types/companion'
import { companionStorage } from '@/lib/companion/companionStorage'
import { CompanionBridge, generatePairingCode } from '@/lib/companion/companionBridge'

interface UseCompanionReturn {
  /** Current companion settings */
  settings: CompanionSettings
  /** Update settings (partial merge, auto-persists) */
  updateSettings: (partial: Partial<CompanionSettings>) => void
  /** Whether relay is reachable (always true — same origin) */
  connected: boolean
  /** Last error message, or null */
  lastError: string | null
  /** Send a single advisory to the relay. Returns true if accepted. */
  sendAdvisory: (advisory: Advisory) => Promise<boolean>
  /** Auto-send only advisories that have not already been relayed this session. */
  autoSendAdvisories: (advisories: readonly Advisory[]) => void
  /** Check relay connection */
  checkConnection: () => Promise<boolean>
  /** Generate a new pairing code */
  regenerateCode: () => void
}

interface CompanionSnapshot {
  readonly settings: CompanionSettings
  readonly connected: boolean
  readonly lastError: string | null
}

const listeners = new Set<() => void>()
let snapshot: CompanionSnapshot | null = null
let bridge: CompanionBridge | null = null
let pendingStatusCheck: Promise<boolean> | null = null
const autoSentAdvisoryIds = new Set<string>()

function loadSettings(): CompanionSettings {
  const saved = companionStorage.load()
  if (saved.pairingCode) return saved

  const next = { ...saved, pairingCode: generatePairingCode() }
  companionStorage.save(next)
  return next
}

function ensureSnapshot(): CompanionSnapshot {
  if (snapshot) return snapshot

  const settings = loadSettings()
  bridge = new CompanionBridge(settings.pairingCode)
  snapshot = { settings, connected: false, lastError: null }
  return snapshot
}

function getBridge(): CompanionBridge {
  const current = ensureSnapshot()
  if (!bridge) {
    bridge = new CompanionBridge(current.settings.pairingCode)
  }
  return bridge
}

function publish(next: CompanionSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): CompanionSnapshot {
  return ensureSnapshot()
}

function updateCompanionSettings(partial: Partial<CompanionSettings>): void {
  const current = getSnapshot()
  const nextSettings = { ...current.settings, ...partial }
  const pairingCodeChanged = nextSettings.pairingCode !== current.settings.pairingCode
  const disableRequested = partial.enabled === false

  companionStorage.save(nextSettings)

  if (pairingCodeChanged) {
    getBridge().configure(nextSettings.pairingCode)
  }

  if (disableRequested || pairingCodeChanged) {
    autoSentAdvisoryIds.clear()
  }

  publish({
    settings: nextSettings,
    connected: disableRequested || pairingCodeChanged ? false : current.connected,
    lastError: disableRequested || pairingCodeChanged ? null : current.lastError,
  })
}

async function checkCompanionConnection(): Promise<boolean> {
  if (pendingStatusCheck) return pendingStatusCheck

  const currentBridge = getBridge()
  pendingStatusCheck = currentBridge.checkStatus()
    .then((status) => {
      const ok = status !== null
      const current = getSnapshot()
      publish({
        ...current,
        connected: ok,
        lastError: ok ? null : currentBridge.lastError,
      })
      return ok
    })
    .finally(() => {
      pendingStatusCheck = null
    })

  return pendingStatusCheck
}

async function sendCompanionAdvisory(advisory: Advisory): Promise<boolean> {
  const current = getSnapshot()
  if (!current.settings.enabled) return false
  if (advisory.confidence < current.settings.minConfidence) return false

  const currentBridge = getBridge()
  const result = await currentBridge.sendAdvisory(advisory)
  publish({
    ...getSnapshot(),
    connected: currentBridge.connected,
    lastError: currentBridge.lastError,
  })
  return result.accepted
}

function autoSendCompanionAdvisories(advisories: readonly Advisory[]): void {
  const current = getSnapshot()
  if (!current.settings.enabled || !current.settings.autoSend) return

  for (const advisory of advisories) {
    if (advisory.resolved) continue
    if (advisory.confidence < current.settings.minConfidence) continue
    if (autoSentAdvisoryIds.has(advisory.id)) continue

    autoSentAdvisoryIds.add(advisory.id)
    void sendCompanionAdvisory(advisory)
      .then((accepted) => {
        if (!accepted) autoSentAdvisoryIds.delete(advisory.id)
      })
      .catch(() => {
        autoSentAdvisoryIds.delete(advisory.id)
      })
  }
}

function regenerateCompanionCode(): void {
  updateCompanionSettings({ pairingCode: generatePairingCode() })
}

export function useCompanion(): UseCompanionReturn {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (current.settings.enabled) {
      void checkCompanionConnection()
      return
    }

    if (current.connected || current.lastError !== null) {
      publish({ ...current, connected: false, lastError: null })
    }
  }, [current.settings.enabled])

  return useMemo(() => ({
    settings: current.settings,
    updateSettings: updateCompanionSettings,
    connected: current.connected,
    lastError: current.lastError,
    sendAdvisory: sendCompanionAdvisory,
    autoSendAdvisories: autoSendCompanionAdvisories,
    checkConnection: checkCompanionConnection,
    regenerateCode: regenerateCompanionCode,
  }), [current.settings, current.connected, current.lastError])
}

export { DEFAULT_COMPANION_SETTINGS }
