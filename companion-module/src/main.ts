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

/** Advisory payload received from the cloud relay */
interface DwaAdvisory {
  id: string
  trueFrequencyHz: number
  severity: string
  confidence: number
  peq: { type: string; hz: number; q: number; gainDb: number }
  geq: { bandHz: number; bandIndex: number; suggestedDb: number }
  pitch: { note: string; octave: number; cents: number; midi: number }
}

export class ModuleInstance extends InstanceBase<ModuleConfig> {
  config: ModuleConfig = {
    siteUrl: '',
    pairingCode: '',
    pollIntervalMs: 500,
    outputProtocol: 'none',
    mixerHost: '',
    mixerPort: 10023,
    oscPrefix: '/ch/01/eq',
    oscEqBandParam: 1,
    autoApply: false,
    maxCutDb: -12,
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
    this.config = config
    this.mixerOutput?.updateConfig(config)
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
          pendingCount: number
        }

        this.updateStatus(InstanceStatus.Ok)

        if (data.advisories && data.advisories.length > 0) {
          for (const advisory of data.advisories) {
            this.processAdvisory(advisory)
          }
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

    // Auto-apply EQ to mixer if configured
    if (this.config.autoApply && this.config.outputProtocol !== 'none' && this.mixerOutput) {
      this.mixerOutput.applyAdvisory(advisory).catch((err) => {
        const msg = err instanceof Error ? err.message : 'Apply failed'
        this.log('error', `Auto-apply failed: ${msg}`)
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
    if (this.config.outputProtocol === 'none' || !this.mixerOutput) {
      this.log('warn', 'No mixer output configured — set Protocol in module settings')
      return
    }
    this.mixerOutput.applyAdvisory(latest).catch((err) => {
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
