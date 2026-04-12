'use client'

/**
 * CompanionCommandBridge — the single inbound relay poller.
 *
 * Polls the toApp queue and dispatches every message type:
 *   - Feedback acks/applied/failed/cleared → update AdvisoryContext state
 *     and record to FeedbackHistory for closed-loop learning.
 *   - Stream Deck commands → Engine/Settings/UI domain actions.
 *
 * Must be mounted INSIDE UIProvider (which is inside AudioAnalyzerProvider
 * and AdvisoryProvider). Renders nothing — it's a side-effect-only component.
 *
 * We have ONE poller (not two) because the relay's toApp queue is drained
 * on GET — a second poller would race and cause messages to be lost.
 */

import { memo, useMemo } from 'react'
import { useEngine } from '@/contexts/EngineContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useUI } from '@/contexts/UIContext'
import { useAdvisoryActions } from '@/contexts/AdvisoryContext'
import { useCompanion } from '@/hooks/useCompanion'
import { useCompanionInbound } from '@/hooks/useCompanionInbound'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'

const VALID_MODES = new Set([
  'speech', 'worship', 'liveMusic', 'theater', 'monitors', 'ringOut', 'broadcast', 'outdoor',
])

export const CompanionCommandBridge = memo(function CompanionCommandBridge() {
  const { settings: companionSettings } = useCompanion()
  const engine = useEngine()
  const settingsCtx = useSettings()
  const uiCtx = useUI()
  const { onClearAll, patchCompanionState, clearCompanionStateForAdvisory } = useAdvisoryActions()

  useCompanionInbound({
    enabled: companionSettings.enabled,
    pairingCode: companionSettings.pairingCode,
    handlers: useMemo(
      () => ({
        // ── Feedback acks/applied/failed ────────────────────────────
        onAck: (advisoryId, at) => patchCompanionState(advisoryId, { ack: { at } }),
        onApplied: ({ advisoryId, appliedGainDb, slotIndex, frequencyHz, bandIndex, timestamp }) => {
          patchCompanionState(advisoryId, {
            applied: { at: timestamp, gainDb: appliedGainDb, slotIndex },
          })
          // Record in FeedbackHistory for closed-loop verification + learning
          getFeedbackHistory().markCompanionApplied({
            frequencyHz,
            gainDb: appliedGainDb,
            bandIndex,
            advisoryId,
            at: timestamp,
          })
        },
        onApplyFailed: (advisoryId, reason, at) =>
          patchCompanionState(advisoryId, { failed: { at, reason } }),
        onCleared: (advisoryId) => clearCompanionStateForAdvisory(advisoryId),

        // ── Stream Deck remote control ─────────────────────────────
        onStart: () => { void engine.start() },
        onStop: () => { engine.stop() },
        onClearAll: () => { onClearAll() },
        onFreeze: () => { if (!uiCtx.isFrozen) uiCtx.toggleFreeze() },
        onUnfreeze: () => { if (uiCtx.isFrozen) uiCtx.toggleFreeze() },
        onModeChange: (mode) => {
          if (VALID_MODES.has(mode)) {
            settingsCtx.setMode(mode as Parameters<typeof settingsCtx.setMode>[0])
          }
        },
        onRingoutStart: () => {
          // eslint-disable-next-line no-console
          console.info('[CompanionCommand] ringout_start received (no handler wired yet)')
        },
        onRingoutStop: () => {
          // eslint-disable-next-line no-console
          console.info('[CompanionCommand] ringout_stop received (no handler wired yet)')
        },
      }),
      [engine, settingsCtx, uiCtx, onClearAll, patchCompanionState, clearCompanionStateForAdvisory],
    ),
  })

  return null
})
