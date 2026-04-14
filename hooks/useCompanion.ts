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
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'

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
  /** Explicit operator send that bypasses minConfidence but still requires pairing/enabled. */
  sendExplicitAdvisory: (advisory: Advisory) => Promise<boolean>
  /** Notify the module that feedback resolved naturally. */
  sendResolve: (advisoryId: string) => Promise<boolean>
  /** Notify the module that the user dismissed an active advisory. */
  sendDismiss: (advisoryId: string) => Promise<boolean>
  /** Sync the current DWA mode to the Companion module. */
  sendModeChange: (mode: string) => Promise<boolean>
  /** Auto-send only advisories that have not already been relayed this session. */
  autoSendAdvisories: (advisories: readonly Advisory[]) => void
  /** Check relay connection */
  checkConnection: () => Promise<boolean>
  /** Generate a new pairing code */
  regenerateCode: () => void
}

type CompanionRetryHistory = ReturnType<typeof getFeedbackHistory> & {
  peekRetryCompanionCut?: (frequencyHz: number) => {
    nextGainDb: number
    retryCount: number
    advisoryId: string
    bandIndex: number
  } | null
  consumeRetryCompanionCut?: (frequencyHz: number) => {
    nextGainDb: number
    retryCount: number
    advisoryId: string
    bandIndex: number
  } | null
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
const autoSentPayloadsByIdentity = new Map<string, string>()
const inFlightRelayDispatches = new Set<string>()

type SendOptions = {
  bypassMinConfidence?: boolean
  allowPossibleRing?: boolean
}

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

function shouldPublishBridgeState(pairingCode: string): boolean {
  const current = getSnapshot()
  return current.settings.enabled && current.settings.pairingCode === pairingCode
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
    autoSentPayloadsByIdentity.clear()
    inFlightRelayDispatches.clear()
  }

  publish({
    settings: nextSettings,
    connected: disableRequested || pairingCodeChanged ? false : current.connected,
    lastError: disableRequested || pairingCodeChanged ? null : current.lastError,
  })
}

function clearRelayTrackingForAdvisory(advisoryId: string): void {
  autoSentPayloadsByIdentity.delete(advisoryId)
  for (const identity of Array.from(autoSentPayloadsByIdentity.keys())) {
    if (identity.startsWith(`${advisoryId}:retry:`)) {
      autoSentPayloadsByIdentity.delete(identity)
    }
  }

  for (const dispatchKey of Array.from(inFlightRelayDispatches)) {
    if (
      dispatchKey.startsWith(`${advisoryId}|`) ||
      dispatchKey.startsWith(`${advisoryId}:retry:`)
    ) {
      inFlightRelayDispatches.delete(dispatchKey)
    }
  }
}

async function checkCompanionConnection(): Promise<boolean> {
  if (pendingStatusCheck) return pendingStatusCheck

  const currentBridge = getBridge()
  pendingStatusCheck = currentBridge.checkStatus()
    .then((status) => {
      const ok = status !== null
      if (shouldPublishBridgeState(currentBridge.pairingCode)) {
        const current = getSnapshot()
        publish({
          ...current,
          connected: ok,
          lastError: ok ? null : currentBridge.lastError,
        })
      }
      return ok
    })
    .finally(() => {
      pendingStatusCheck = null
    })

  return pendingStatusCheck
}

function isExplicitRelayEligibleAdvisory(advisory: Advisory): boolean {
  return advisory.label === 'ACOUSTIC_FEEDBACK' || advisory.label === 'POSSIBLE_RING'
}

function isAutoRelayEligibleAdvisory(advisory: Advisory): boolean {
  return advisory.label === 'ACOUSTIC_FEEDBACK'
}

function isRetryRelayEligibleAdvisory(advisory: Advisory): boolean {
  return isExplicitRelayEligibleAdvisory(advisory)
}

function buildRelayPayloadKey(advisory: Advisory, autoApply: boolean): string {
  const payload = {
    type: autoApply ? 'auto_apply' : 'advisory',
    trueFrequencyHz: advisory.trueFrequencyHz,
    peq: {
      type: advisory.advisory.peq.type,
      hz: advisory.advisory.peq.hz,
      q: advisory.advisory.peq.q,
      gainDb: advisory.advisory.peq.gainDb,
    },
    geq: {
      bandHz: advisory.advisory.geq.bandHz,
      bandIndex: advisory.advisory.geq.bandIndex,
      suggestedDb: advisory.advisory.geq.suggestedDb,
    },
  }

  return JSON.stringify(payload)
}

async function sendCompanionAdvisory(advisory: Advisory, options: SendOptions = {}): Promise<boolean> {
  const current = getSnapshot()
  if (!current.settings.enabled) return false
  if (!isExplicitRelayEligibleAdvisory(advisory)) return false
  if (!options.bypassMinConfidence && advisory.confidence < current.settings.minConfidence) return false

  const currentBridge = getBridge()
  const result = await currentBridge.sendAdvisory(advisory)
  if (shouldPublishBridgeState(currentBridge.pairingCode)) {
    publish({
      ...getSnapshot(),
      connected: currentBridge.connected,
      lastError: currentBridge.lastError,
    })
  }
  return result.accepted
}

/**
 * Send an auto-apply directive — the module will apply the cut regardless of
 * its `autoApply` config. Used for RUNAWAY severity and closed-loop retries.
 * Still respects `enabled` and, by default, `minConfidence` gates.
 */
async function sendCompanionAutoApply(advisory: Advisory, options: SendOptions = {}): Promise<boolean> {
  const current = getSnapshot()
  if (!current.settings.enabled) return false
  const relayEligible = options.allowPossibleRing
    ? isRetryRelayEligibleAdvisory(advisory)
    : isAutoRelayEligibleAdvisory(advisory)
  if (!relayEligible) return false
  if (!options.bypassMinConfidence && advisory.confidence < current.settings.minConfidence) return false

  const currentBridge = getBridge()
  const result = await currentBridge.sendAutoApply(advisory)
  if (shouldPublishBridgeState(currentBridge.pairingCode)) {
    publish({
      ...getSnapshot(),
      connected: currentBridge.connected,
      lastError: currentBridge.lastError,
    })
  }
  return result.accepted
}

/**
 * Build a deeper-cut variant of an advisory for closed-loop retry.
 * Preserves identity fields but overrides the PEQ/GEQ gain depth.
 */
function makeRetryAdvisory(
  original: Advisory,
  retry: { nextGainDb: number; retryCount: number },
): Advisory {
  return {
    ...original,
    advisory: {
      ...original.advisory,
      peq: { ...original.advisory.peq, gainDb: retry.nextGainDb },
      geq: original.advisory.geq
        ? { ...original.advisory.geq, suggestedDb: retry.nextGainDb }
        : original.advisory.geq,
    },
  }
}

/**
 * Hybrid auto-send: RUNAWAY severities are always sent as auto_apply directives
 * (module applies immediately regardless of its config). Other severities are
 * sent only when the user's `autoSend` setting is on.
 *
 * Closed-loop retry: before sending a new advisory, checks if the same frequency
 * was just cut by Companion. If so, sends a deeper cut instead (up to MAX_RETRIES).
 */
function autoSendCompanionAdvisories(advisories: readonly Advisory[]): void {
  const current = getSnapshot()
  if (!current.settings.enabled) return

  const history = getFeedbackHistory() as CompanionRetryHistory

  for (const advisory of advisories) {
    if (advisory.resolved) continue

    const retry = history.peekRetryCompanionCut?.(advisory.trueFrequencyHz) ?? null
    const isRunaway = advisory.severity === 'RUNAWAY'
    const bypassMinConfidence = retry !== null

    if (retry) {
      if (!isRetryRelayEligibleAdvisory(advisory)) continue
    } else if (!isAutoRelayEligibleAdvisory(advisory)) {
      continue
    }
    if (!bypassMinConfidence && advisory.confidence < current.settings.minConfidence) continue

    const relayIdentity = retry
      ? `${retry.advisoryId}:retry:${retry.retryCount}`
      : advisory.id

    // Skip non-RUNAWAY advisories when autoSend is off, unless this is a
    // closed-loop retry for a cut that Companion already applied.
    if (!retry && !isRunaway && !current.settings.autoSend) continue

    // Closed-loop: if a Companion cut was just applied here and feedback
    // is still present, send a deeper cut instead of the original.
    const toSend = retry
      ? makeRetryAdvisory(advisory, retry)
      : advisory

    const useAutoApply = isRunaway || retry !== null
    const relayPayloadKey = buildRelayPayloadKey(toSend, useAutoApply)
    const inFlightKey = `${relayIdentity}|${relayPayloadKey}`

    if (autoSentPayloadsByIdentity.get(relayIdentity) === relayPayloadKey) continue
    if (inFlightRelayDispatches.has(inFlightKey)) continue

    inFlightRelayDispatches.add(inFlightKey)

    const sendPromise = useAutoApply
      ? sendCompanionAutoApply(toSend, {
          bypassMinConfidence,
          allowPossibleRing: retry !== null,
        })
      : sendCompanionAdvisory(toSend, { bypassMinConfidence })

    void sendPromise
      .then((accepted) => {
        inFlightRelayDispatches.delete(inFlightKey)
        if (!accepted) {
          return
        }
        autoSentPayloadsByIdentity.set(relayIdentity, relayPayloadKey)
      })
      .catch(() => {
        inFlightRelayDispatches.delete(inFlightKey)
      })
  }
}

function sendCompanionExplicitAdvisory(advisory: Advisory): Promise<boolean> {
  if (!isExplicitRelayEligibleAdvisory(advisory)) {
    return Promise.resolve(false)
  }

  const relayPayloadKey = buildRelayPayloadKey(advisory, false)
  const inFlightKey = `${advisory.id}|${relayPayloadKey}`
  if (inFlightRelayDispatches.has(inFlightKey)) {
    return Promise.resolve(false)
  }

  inFlightRelayDispatches.add(inFlightKey)
  return sendCompanionAdvisory(advisory, { bypassMinConfidence: true })
    .then((accepted) => {
      if (accepted) {
        autoSentPayloadsByIdentity.set(advisory.id, relayPayloadKey)
      }
      return accepted
    })
    .finally(() => {
      inFlightRelayDispatches.delete(inFlightKey)
    })
}

async function sendCompanionModeChange(mode: string): Promise<boolean> {
  const current = getSnapshot()
  if (!current.settings.enabled) return false

  const currentBridge = getBridge()
  const accepted = await currentBridge.sendModeChange(mode)
  if (shouldPublishBridgeState(currentBridge.pairingCode)) {
    publish({
      ...getSnapshot(),
      connected: currentBridge.connected,
      lastError: currentBridge.lastError,
    })
  }
  return accepted
}

async function sendCompanionResolve(advisoryId: string): Promise<boolean> {
  const current = getSnapshot()
  if (!current.settings.enabled) return false

  clearRelayTrackingForAdvisory(advisoryId)
  const currentBridge = getBridge()
  const accepted = await currentBridge.sendResolve(advisoryId)
  if (shouldPublishBridgeState(currentBridge.pairingCode)) {
    publish({
      ...getSnapshot(),
      connected: currentBridge.connected,
      lastError: currentBridge.lastError,
    })
  }
  return accepted
}

async function sendCompanionDismiss(advisoryId: string): Promise<boolean> {
  const current = getSnapshot()
  if (!current.settings.enabled) return false

  clearRelayTrackingForAdvisory(advisoryId)
  const currentBridge = getBridge()
  const accepted = await currentBridge.sendDismiss(advisoryId)
  if (shouldPublishBridgeState(currentBridge.pairingCode)) {
    publish({
      ...getSnapshot(),
      connected: currentBridge.connected,
      lastError: currentBridge.lastError,
    })
  }
  return accepted
}

function regenerateCompanionCode(): void {
  updateCompanionSettings({ pairingCode: generatePairingCode() })
}

export function useCompanion(): UseCompanionReturn {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (current.settings.enabled) {
      void checkCompanionConnection()
    }
  }, [current.settings.enabled])

  return useMemo(() => ({
    settings: current.settings,
    updateSettings: updateCompanionSettings,
    connected: current.connected,
    lastError: current.lastError,
    sendAdvisory: sendCompanionAdvisory,
    sendExplicitAdvisory: sendCompanionExplicitAdvisory,
    sendResolve: sendCompanionResolve,
    sendDismiss: sendCompanionDismiss,
    sendModeChange: sendCompanionModeChange,
    autoSendAdvisories: autoSendCompanionAdvisories,
    checkConnection: checkCompanionConnection,
    regenerateCode: regenerateCompanionCode,
  }), [current.settings, current.connected, current.lastError])
}

export { DEFAULT_COMPANION_SETTINGS }
