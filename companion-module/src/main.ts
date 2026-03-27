import {
  InstanceBase,
  InstanceStatus,
  runEntrypoint,
} from '@companion-module/base'
import type {
  CompanionHTTPRequest,
  CompanionHTTPResponse,
} from '@companion-module/base'

import { GetConfigFields } from './config.js'
import type { ModuleConfig } from './config.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'

/** Advisory payload received from DoneWell Audio PWA */
interface DwaAdvisory {
  id: string
  trueFrequencyHz: number
  severity: string
  confidence: number
  peq: { type: string; hz: number; q: number; gainDb: number }
  geq: { bandHz: number; bandIndex: number; suggestedDb: number }
  pitch: { note: string; octave: number; cents: number; midi: number }
}

const SEVERITY_RANK: Record<string, number> = {
  RUNAWAY: 4,
  GROWING: 3,
  RESONANCE: 2,
  POSSIBLE_RING: 1,
}

export class ModuleInstance extends InstanceBase<ModuleConfig> {
  config: ModuleConfig = {
    minConfidence: 0.5,
    minSeverity: 'POSSIBLE_RING',
    maxCutDb: -12,
    autoAckSeconds: 0,
  }

  pendingAdvisories: DwaAdvisory[] = []
  private autoAckTimer: ReturnType<typeof setTimeout> | null = null

  async init(config: ModuleConfig): Promise<void> {
    this.config = config
    this.updateStatus(InstanceStatus.Ok)

    UpdateActions(this)
    UpdateFeedbacks(this)
    UpdateVariableDefinitions(this)
    UpdatePresets(this)

    this.resetVariables()
    this.log('info', 'DoneWell Audio module initialized — waiting for advisories')
  }

  async configUpdated(config: ModuleConfig): Promise<void> {
    this.config = config
  }

  async destroy(): Promise<void> {
    if (this.autoAckTimer) clearTimeout(this.autoAckTimer)
    this.pendingAdvisories = []
  }

  getConfigFields() {
    return GetConfigFields()
  }

  // ── HTTP Handler ─────────────────────────────────────────────
  // DoneWell PWA posts advisories here:
  //   POST /instance/<instance-name>/advisory
  //   GET  /instance/<instance-name>/status

  handleHttpRequest(
    request: CompanionHTTPRequest,
  ): CompanionHTTPResponse {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders, body: '' }
    }

    if (request.path === '/advisory' && request.method === 'POST') {
      return this.handleAdvisory(request, corsHeaders)
    }

    if (request.path === '/status') {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          ok: true,
          pendingCount: this.pendingAdvisories.length,
        }),
      }
    }

    return { status: 404, headers: corsHeaders, body: 'Not found' }
  }

  private handleAdvisory(
    request: CompanionHTTPRequest,
    corsHeaders: Record<string, string>,
  ): CompanionHTTPResponse {
    let advisory: DwaAdvisory
    try {
      advisory = JSON.parse(request.body ?? '{}') as DwaAdvisory
    } catch {
      return {
        status: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      }
    }

    // Validate required fields
    if (!advisory.peq || !advisory.geq || !advisory.pitch) {
      return {
        status: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing peq, geq, or pitch' }),
      }
    }

    // Confidence gate
    if (advisory.confidence < this.config.minConfidence) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ accepted: false, reason: 'Below confidence threshold' }),
      }
    }

    // Severity gate
    const advisorySeverityRank = SEVERITY_RANK[advisory.severity] ?? 0
    const minSeverityRank = SEVERITY_RANK[this.config.minSeverity] ?? 0
    if (advisorySeverityRank < minSeverityRank) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ accepted: false, reason: 'Below severity threshold' }),
      }
    }

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

    this.log('info', `Advisory received: ${Math.round(advisory.peq.hz)}Hz ${advisory.severity} (${advisory.peq.gainDb}dB)`)

    // Auto-acknowledge timer
    if (this.config.autoAckSeconds > 0) {
      if (this.autoAckTimer) clearTimeout(this.autoAckTimer)
      this.autoAckTimer = setTimeout(() => {
        this.acknowledgeAll()
      }, this.config.autoAckSeconds * 1000)
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ accepted: true, pendingCount: this.pendingAdvisories.length }),
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
