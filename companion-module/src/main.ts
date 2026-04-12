import {
  InstanceBase,
  InstanceStatus,
  runEntrypoint,
} from '@companion-module/base'

import { GetConfigFields } from './config.js'
import type { ModuleConfig } from './config.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'
import { MixerOutput } from './mixerOutput.js'
import { getMixerProfile } from './mixerProfiles.js'

/** Advisory payload received from the cloud relay */
interface DwaAdvisory {
  /** Optional type marker — 'auto_apply' = apply immediately regardless of config */
  type?: 'auto_apply'
  id: string
  trueFrequencyHz: number
  severity: string
  confidence: number
  peq: { type: string; hz: number; q: number; gainDb: number }
  geq: { bandHz: number; bandIndex: number; suggestedDb: number }
  pitch: { note: string; octave: number; cents: number; midi: number }
}

/** Messages sent from module back to DWA via POST ?direction=app */
type ModuleToAppMessage =
  | { type: 'ack'; advisoryId: string; timestamp: number }
  | {
      type: 'applied'
      advisoryId: string
      bandIndex: number
      appliedGainDb: number
      frequencyHz: number
      slotIndex: number
      timestamp: number
    }
  | { type: 'apply_failed'; advisoryId: string; reason: string; timestamp: number }
  | {
      type: 'partial_apply'
      advisoryId: string
      peqApplied: boolean
      geqApplied: boolean
      failReason: string
      timestamp: number
    }
  | { type: 'cleared'; advisoryId: string; slotIndex: number; timestamp: number }
  | {
      type: 'command'
      action: string
      timestamp: number
    }

export class ModuleInstance extends InstanceBase<ModuleConfig> {
  config: ModuleConfig = {
    siteUrl: '',
    pairingCode: '',
    pollIntervalMs: 500,
    mixerModel: 'x32',
    outputProtocol: 'none',
    mixerHost: '',
    mixerPort: 10023,
    oscPrefix: '/ch/01/eq',
    autoApply: false,
    maxCutDb: -12,
    peqBandCount: 6,
    peqBandStart: 1,
    outputMode: 'peq',
    geqPrefix: '',
  }

  pendingAdvisories: DwaAdvisory[] = []
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private mixerOutput: MixerOutput | null = null

  async init(config: ModuleConfig): Promise<void> {
    this.config = config

    UpdateActions(this)
    UpdateFeedbacks(this)
    UpdateVariableDefinitions(this)
    UpdatePresets(this)

    this.resetVariables()
    this.mixerOutput = new MixerOutput(config, (level, msg) => this.log(level as 'info' | 'error', msg))
    this.startPolling()
    this.log('info', 'Module initialized — polling for advisories')
  }

  async configUpdated(config: ModuleConfig): Promise<void> {
    // Snapshot previous config before overwriting — used for model-switch migration
    const prevConfig = { ...this.config }
    this.config = config

    if (config.mixerModel !== prevConfig.mixerModel) {
      const prevProfile = getMixerProfile(prevConfig.mixerModel)
      const newProfile = getMixerProfile(config.mixerModel)
      // Only migrate fields that the user did NOT change from the previously
      // persisted value AND that value matched the old model's default.
      // This avoids overwriting explicit user input that happens to equal the old default.
      if (config.mixerPort === prevConfig.mixerPort && prevConfig.mixerPort === prevProfile.defaultPort) {
        this.config.mixerPort = newProfile.defaultPort
      }
      if (config.oscPrefix === prevConfig.oscPrefix && prevConfig.oscPrefix === prevProfile.defaultOscPrefix) {
        this.config.oscPrefix = newProfile.defaultOscPrefix
      }
      // Profiles with requireGeqPrefix need a valid default — don't leave blank
      if (!this.config.geqPrefix && newProfile.requireGeqPrefix) {
        this.config.geqPrefix = '1'
      } else if (!this.config.geqPrefix) {
        this.config.geqPrefix = ''
      }
      if (config.peqBandCount === prevConfig.peqBandCount && prevConfig.peqBandCount === prevProfile.peqBands) {
        this.config.peqBandCount = newProfile.peqBands
      }
      this.saveConfig(this.config)
    }

    await this.mixerOutput?.updateConfig(this.config)
    this.startPolling()
  }

  async destroy(): Promise<void> {
    this.stopPolling()
    this.mixerOutput?.disconnect()
    this.pendingAdvisories = []
  }

  getConfigFields() {
    return GetConfigFields()
  }

  // ── Outbound (module → app) ─────────────────────────────────────
  //
  // The relay endpoint accepts POST with ?direction=app for module-initiated
  // messages. Fire-and-forget: failures are logged but don't block processing.

  /** Build the relay URL with the app-direction query parameter. */
  private relayUrlForApp(): string {
    return `${this.config.siteUrl.replace(/\/$/, '')}/api/companion/relay/${this.config.pairingCode}?direction=app`
  }

  /** POST a message to the toApp queue so DWA can pick it up on its next poll. */
  async sendToApp(message: ModuleToAppMessage): Promise<void> {
    if (!this.config.siteUrl || !this.config.pairingCode) return

    try {
      const response = await fetch(this.relayUrlForApp(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) {
        this.log('warn', `sendToApp (${message.type}) returned HTTP ${response.status}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'sendToApp failed'
      this.log('warn', `sendToApp (${message.type}) failed: ${msg}`)
    }
  }

  // ── Polling ──────────────────────────────────────────────────

  private startPolling(): void {
    this.stopPolling()

    if (!this.config.siteUrl || !this.config.pairingCode) {
      this.updateStatus(InstanceStatus.BadConfig, 'Missing site URL or pairing code')
      return
    }

    this.updateStatus(InstanceStatus.Connecting)

    const url = `${this.config.siteUrl.replace(/\/$/, '')}/api/companion/relay/${this.config.pairingCode}`

    this.pollTimer = setInterval(async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) })

        if (!response.ok) {
          this.updateStatus(InstanceStatus.ConnectionFailure, `HTTP ${response.status}`)
          return
        }

        const data = (await response.json()) as {
          ok: boolean
          advisories: DwaAdvisory[]
          events?: Array<{ type: string; advisoryId?: string; mode?: string }>
          pendingCount: number
        }

        this.updateStatus(InstanceStatus.Ok)

        if (data.advisories && data.advisories.length > 0) {
          for (const advisory of data.advisories) {
            this.processAdvisory(advisory)
          }
        }

        // Handle lifecycle events (resolve, dismiss, mode change)
        if (data.events && data.events.length > 0) {
          for (const event of data.events) {
            if ((event.type === 'resolve' || event.type === 'dismiss') && event.advisoryId && this.mixerOutput) {
              const advisoryId = event.advisoryId
              // Find the slot BEFORE clearing so we can report its index back
              const summary = this.mixerOutput.getSlotSummary()
              const slotMatch = summary.slots.find((s) => s.advisoryId === advisoryId)
              this.mixerOutput.clearByAdvisoryId(advisoryId).then((result) => {
                if (result.fullyCleared) {
                  const after = this.mixerOutput!.getSlotSummary()
                  this.setVariableValues({ slots_used: String(after.used) })
                  this.log('info', `Cleared slot for ${event.type}d advisory ${advisoryId}`)
                  void this.sendToApp({
                    type: 'cleared',
                    advisoryId,
                    slotIndex: slotMatch?.band ?? 0,
                    timestamp: Date.now(),
                  })
                } else if (result.peqCleared || result.geqCleared) {
                  // Partial clear — report what succeeded but log the gap
                  const after = this.mixerOutput!.getSlotSummary()
                  this.setVariableValues({ slots_used: String(after.used) })
                  const partial = result.peqCleared ? 'PEQ cleared, GEQ failed' : 'GEQ cleared, PEQ failed'
                  this.log('warn', `Partial clear for advisory ${advisoryId}: ${partial}`)
                  void this.sendToApp({
                    type: 'cleared',
                    advisoryId,
                    slotIndex: slotMatch?.band ?? 0,
                    timestamp: Date.now(),
                  })
                } else {
                  this.log('error', `Failed to clear any outputs for advisory ${advisoryId}`)
                }
              })
              // Remove from pending
              this.pendingAdvisories = this.pendingAdvisories.filter(a => a.id !== advisoryId)
            }
          }
          this.refreshState()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Poll failed'
        this.updateStatus(InstanceStatus.ConnectionFailure, msg)
      }
    }, this.config.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private processAdvisory(advisory: DwaAdvisory): void {
    // Clamp cut depth to safety limit
    advisory.peq.gainDb = Math.max(advisory.peq.gainDb, this.config.maxCutDb)
    advisory.geq.suggestedDb = Math.max(advisory.geq.suggestedDb, this.config.maxCutDb)

    // Add to queue
    this.pendingAdvisories.push(advisory)

    // Send ack immediately so DWA knows the module received it
    void this.sendToApp({ type: 'ack', advisoryId: advisory.id, timestamp: Date.now() })

    // Update Companion variables with latest advisory data
    const pitchStr = `${advisory.pitch.note}${advisory.pitch.octave}${advisory.pitch.cents >= 0 ? '+' : ''}${advisory.pitch.cents}c`
    this.setVariableValues({
      peq_frequency: String(Math.round(advisory.peq.hz)),
      peq_q: String(advisory.peq.q),
      peq_gain: String(advisory.peq.gainDb),
      peq_type: advisory.peq.type,
      geq_band: String(advisory.geq.bandHz),
      geq_band_index: String(advisory.geq.bandIndex),
      geq_gain: String(advisory.geq.suggestedDb),
      note: pitchStr,
      severity: advisory.severity,
      confidence: String(advisory.confidence.toFixed(2)),
      pending_count: String(this.pendingAdvisories.length),
      last_updated: new Date().toLocaleTimeString(),
    })

    // Update feedbacks (button colors)
    this.checkFeedbacks('advisory_pending', 'severity_runaway', 'severity_growing')

    this.log('info', `Advisory: ${Math.round(advisory.peq.hz)}Hz ${advisory.severity} (${advisory.peq.gainDb}dB)`)

    // Auto-apply conditions:
    //  - `autoApply: true` in module config (full auto), OR
    //  - message has `type: 'auto_apply'` (DWA forced it — used for RUNAWAY hybrid)
    const shouldAutoApply =
      (this.config.autoApply || advisory.type === 'auto_apply') &&
      this.config.mixerModel !== ('none' as string) &&
      this.mixerOutput !== null

    if (shouldAutoApply && this.mixerOutput) {
      this.mixerOutput.applyWithMode(advisory).then((result) => {
        // Update slot variables if PEQ landed
        if (result.peqSlot) {
          const summary = this.mixerOutput!.getSlotSummary()
          this.setVariableValues({
            slots_used: String(summary.used),
            slots_total: String(summary.total),
          })
        }

        // Report to DWA based on what actually succeeded
        const mode = this.config.outputMode || 'peq'
        const anythingSucceeded = result.peqSlot || result.geqApplied
        const everythingSucceeded = !result.failReason

        if (anythingSucceeded && everythingSucceeded) {
          // Full success — all requested outputs landed
          void this.sendToApp({
            type: 'applied',
            advisoryId: advisory.id,
            bandIndex: advisory.geq.bandIndex,
            appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
            frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
            slotIndex: result.peqSlot?.band ?? 0,
            timestamp: Date.now(),
          })
        } else if (anythingSucceeded && mode === 'both') {
          // Partial success in both mode — one side failed
          this.log('warn', `Partial apply for ${Math.round(advisory.peq.hz)}Hz: ${result.failReason}`)
          void this.sendToApp({
            type: 'partial_apply',
            advisoryId: advisory.id,
            peqApplied: !!result.peqSlot,
            geqApplied: result.geqApplied,
            failReason: result.failReason!,
            timestamp: Date.now(),
          })
        } else if (anythingSucceeded) {
          // Single-mode success (peq-only or geq-only mode)
          void this.sendToApp({
            type: 'applied',
            advisoryId: advisory.id,
            bandIndex: advisory.geq.bandIndex,
            appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
            frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
            slotIndex: result.peqSlot?.band ?? 0,
            timestamp: Date.now(),
          })
        } else {
          // Nothing succeeded
          void this.sendToApp({
            type: 'apply_failed',
            advisoryId: advisory.id,
            reason: result.failReason || 'Apply failed',
            timestamp: Date.now(),
          })
        }
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : 'Apply failed'
        this.log('error', `Auto-apply failed: ${msg}`)
        void this.sendToApp({
          type: 'apply_failed',
          advisoryId: advisory.id,
          reason: msg,
          timestamp: Date.now(),
        })
      })
    }
  }

  // ── Public methods (called by actions) ───────────────────────

  acknowledgeLatest(): void {
    if (this.pendingAdvisories.length === 0) return
    const acked = this.pendingAdvisories.pop()
    this.log('info', `Acknowledged: ${Math.round(acked!.peq.hz)}Hz`)
    this.refreshState()
  }

  acknowledgeAll(): void {
    const count = this.pendingAdvisories.length
    this.pendingAdvisories = []
    this.log('info', `Acknowledged all (${count} advisories)`)
    this.refreshState()
  }

  applyLatest(): void {
    const latest = this.pendingAdvisories[this.pendingAdvisories.length - 1]
    if (!latest) {
      this.log('info', 'No advisory to apply')
      return
    }
    if (this.config.mixerModel === ('none' as string) || !this.mixerOutput) {
      this.log('warn', 'No mixer output configured — set Mixer Model in module settings')
      return
    }
    this.mixerOutput.applyWithMode(latest).then((result) => {
      if (result.peqSlot) {
        const summary = this.mixerOutput!.getSlotSummary()
        this.setVariableValues({
          slots_used: String(summary.used),
          slots_total: String(summary.total),
        })
      }
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Apply failed'
      this.log('error', `Apply failed: ${msg}`)
    })
  }

  clearAll(): void {
    this.pendingAdvisories = []
    this.resetVariables()
    this.checkFeedbacks('advisory_pending', 'severity_runaway', 'severity_growing')
    this.log('info', 'Cleared all advisories')
  }

  private refreshState(): void {
    const latest = this.pendingAdvisories[this.pendingAdvisories.length - 1]
    if (latest) {
      const pitchStr = `${latest.pitch.note}${latest.pitch.octave}${latest.pitch.cents >= 0 ? '+' : ''}${latest.pitch.cents}c`
      this.setVariableValues({
        peq_frequency: String(Math.round(latest.peq.hz)),
        peq_q: String(latest.peq.q),
        peq_gain: String(latest.peq.gainDb),
        peq_type: latest.peq.type,
        geq_band: String(latest.geq.bandHz),
        geq_band_index: String(latest.geq.bandIndex),
        geq_gain: String(latest.geq.suggestedDb),
        note: pitchStr,
        severity: latest.severity,
        confidence: String(latest.confidence.toFixed(2)),
        pending_count: String(this.pendingAdvisories.length),
        last_updated: new Date().toLocaleTimeString(),
      })
    } else {
      this.resetVariables()
    }
    this.checkFeedbacks('advisory_pending', 'severity_runaway', 'severity_growing')
  }

  private resetVariables(): void {
    this.setVariableValues({
      peq_frequency: '--',
      peq_q: '--',
      peq_gain: '--',
      peq_type: '--',
      geq_band: '--',
      geq_band_index: '--',
      geq_gain: '--',
      note: '--',
      severity: '--',
      confidence: '--',
      pending_count: '0',
      last_updated: '--',
    })
  }
}

runEntrypoint(ModuleInstance, UpgradeScripts)
