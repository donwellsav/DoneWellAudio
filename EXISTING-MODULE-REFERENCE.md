# DWA Companion Module — Complete Source Reference

This file contains the complete source code of the existing DWA Companion module
as of v0.3.20260328. Use this as context when adding new mixer profiles or
modifying the hardware control layer.

Architecture: The module polls a cloud relay for advisories from the DWA web app,
manages PEQ slot allocation, and sends EQ commands to hardware via OSC (UDP) or TCP.

## File: companion-module/package.json

```json
{
  "name": "companion-module-donewell-audio",
  "version": "0.3.20260328",
  "type": "module",
  "main": "dist/main.js",
  "license": "MIT",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch"
  },
  "engines": {
    "node": ">=22.20"
  },
  "dependencies": {
    "@companion-module/base": "~1.14.1"
  },
  "devDependencies": {
    "typescript": "~5.9.3"
  }
}
```

## File: companion-module/companion/manifest.json

```json
{
  "$schema": "../node_modules/@companion-module/base/assets/manifest.schema.json",
  "id": "donewell-audio",
  "name": "DoneWell Audio",
  "shortname": "DoneWell",
  "description": "Receives real-time feedback detection and EQ recommendations from DoneWell Audio PWA. Exposes frequency, Q, gain, and filter type as variables for use with any Companion mixer module.",
  "version": "0.3.20260328",
  "license": "MIT",
  "repository": "git+https://github.com/donwellsav/donewellaudio.git",
  "bugs": "https://github.com/donwellsav/donewellaudio/issues",
  "maintainers": [
    {
      "name": "DoneWell Audio",
      "email": "support@donewellaudio.com"
    }
  ],
  "runtime": {
    "type": "node22",
    "api": "nodejs-ipc",
    "apiVersion": "1.14.1",
    "entrypoint": "../dist/main.js"
  },
  "legacyIds": [],
  "manufacturer": "DoneWell Audio",
  "products": ["DoneWell Audio PWA"],
  "keywords": ["feedback", "eq", "audio", "analysis", "detection"]
}
```

## File: companion-module/src/config.ts

```typescript
import type { SomeCompanionConfigField } from '@companion-module/base'
import { MIXER_MODEL_CHOICES } from './mixerProfiles.js'
import type { MixerModelId } from './mixerProfiles.js'

export interface ModuleConfig {
  // Input: relay connection
  siteUrl: string
  pairingCode: string
  pollIntervalMs: number

  // Output: mixer connection
  mixerModel: MixerModelId
  outputProtocol: 'none' | 'osc' | 'tcp'
  mixerHost: string
  mixerPort: number
  oscPrefix: string
  autoApply: boolean
  maxCutDb: number

  // Slot management
  peqBandCount: number
  peqBandStart: number

  // Output mode
  outputMode: 'peq' | 'geq' | 'both'
}

export function GetConfigFields(): SomeCompanionConfigField[] {
  return [
    // ── Input ──
    {
      type: 'static-text',
      id: 'input_header',
      label: '',
      value: '── Input: Relay Connection ──',
      width: 12,
    },
    {
      type: 'textinput',
      id: 'pairingCode',
      label: 'Pairing Code',
      default: '',
      width: 6,
    },
    {
      type: 'textinput',
      id: 'siteUrl',
      label: 'Site URL',
      default: '',
      width: 6,
    },
    {
      type: 'number',
      id: 'pollIntervalMs',
      label: 'Poll Interval (ms)',
      default: 500,
      min: 200,
      max: 5000,
      step: 100,
      width: 6,
    },

    // ── Output ──
    {
      type: 'static-text',
      id: 'output_header',
      label: '',
      value: '── Output: Mixer Connection ──',
      width: 12,
    },
    {
      type: 'dropdown',
      id: 'mixerModel',
      label: 'Mixer Model',
      default: 'x32',
      choices: [
        { id: 'none', label: 'None (variables only)' },
        ...MIXER_MODEL_CHOICES,
      ],
      width: 6,
    },
    {
      type: 'textinput',
      id: 'mixerHost',
      label: 'Mixer IP Address',
      default: '',
      width: 6,
    },
    {
      type: 'number',
      id: 'mixerPort',
      label: 'Mixer Port (auto-set by model, override here)',
      default: 10023,
      min: 1,
      max: 65535,
      width: 6,
    },
    {
      type: 'textinput',
      id: 'oscPrefix',
      label: 'Channel/EQ Prefix (e.g. /ch/01/eq)',
      default: '/ch/01/eq',
      width: 6,
    },
    {
      type: 'number',
      id: 'peqBandCount',
      label: 'PEQ Bands Available (for slot management)',
      default: 6,
      min: 1,
      max: 8,
      width: 6,
    },
    {
      type: 'number',
      id: 'peqBandStart',
      label: 'First PEQ Band Number',
      default: 1,
      min: 1,
      max: 8,
      width: 6,
    },
    {
      type: 'dropdown',
      id: 'outputMode',
      label: 'EQ Output Mode',
      default: 'peq',
      choices: [
        { id: 'peq', label: 'PEQ (parametric notches)' },
        { id: 'geq', label: 'GEQ (graphic EQ bands)' },
        { id: 'both', label: 'Both PEQ + GEQ' },
      ],
      width: 6,
    },
    {
      type: 'checkbox',
      id: 'autoApply',
      label: 'Auto-Apply EQ on advisory receive',
      default: false,
      width: 6,
    },
    {
      type: 'number',
      id: 'maxCutDb',
      label: 'Max Cut Depth (dB)',
      default: -12,
      min: -24,
      max: -3,
      step: 1,
      width: 6,
    },
  ]
}
```

## File: companion-module/src/main.ts

```typescript
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
              this.mixerOutput.clearByAdvisoryId(advisoryId).then((cleared) => {
                if (cleared) {
                  const after = this.mixerOutput!.getSlotSummary()
                  this.setVariableValues({ slots_used: String(after.used) })
                  this.log('info', `Cleared slot for ${event.type}d advisory ${advisoryId}`)
                  // Echo the cleared state back to DWA
                  void this.sendToApp({
                    type: 'cleared',
                    advisoryId,
                    slotIndex: slotMatch?.band ?? 0,
                    timestamp: Date.now(),
                  })
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
      this.mixerOutput.applyWithMode(advisory).then((slot) => {
        if (slot) {
          const summary = this.mixerOutput!.getSlotSummary()
          this.setVariableValues({
            slots_used: String(summary.used),
            slots_total: String(summary.total),
          })
          // Notify DWA that the cut was sent to the mixer
          void this.sendToApp({
            type: 'applied',
            advisoryId: advisory.id,
            bandIndex: advisory.geq.bandIndex,
            appliedGainDb: advisory.peq.gainDb,
            frequencyHz: advisory.peq.hz,
            slotIndex: slot.band,
            timestamp: Date.now(),
          })
        } else {
          // applyWithMode returned null — slot allocation failed
          void this.sendToApp({
            type: 'apply_failed',
            advisoryId: advisory.id,
            reason: 'No slot available',
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
    this.mixerOutput.applyWithMode(latest).then((slot) => {
      if (slot) {
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
```

## File: companion-module/src/actions.ts

```typescript
import type { ModuleInstance } from './main.js'

/**
 * Available DWA commands — must match the app's useCompanionInbound dispatcher.
 */
const DWA_MODES = [
  { id: 'speech', label: 'Speech' },
  { id: 'worship', label: 'Worship' },
  { id: 'liveMusic', label: 'Live Music' },
  { id: 'theater', label: 'Theater' },
  { id: 'monitors', label: 'Monitors' },
  { id: 'ringOut', label: 'Ring Out' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'outdoor', label: 'Outdoor' },
]

export function UpdateActions(self: ModuleInstance): void {
  self.setActionDefinitions({
    // ── Local module actions (no network) ────────────────────────────
    acknowledge_latest: {
      name: 'Acknowledge Latest Advisory',
      options: [],
      callback: async () => {
        self.acknowledgeLatest()
      },
    },

    acknowledge_all: {
      name: 'Acknowledge All Advisories',
      options: [],
      callback: async () => {
        self.acknowledgeAll()
      },
    },

    clear_all: {
      name: 'Clear All Advisories (local)',
      options: [],
      callback: async () => {
        self.clearAll()
      },
    },

    apply_latest: {
      name: 'Apply Latest EQ to Mixer',
      options: [],
      callback: async () => {
        self.applyLatest()
      },
    },

    // ── Remote DWA control (module → app commands) ─────────────────
    // These POST to /api/companion/relay/[code]?direction=app so DWA's
    // inbound poller picks them up and executes the corresponding action.

    dwa_start_analysis: {
      name: 'DWA: Start Analysis',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'start', timestamp: Date.now() })
      },
    },

    dwa_stop_analysis: {
      name: 'DWA: Stop Analysis',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'stop', timestamp: Date.now() })
      },
    },

    dwa_clear_all: {
      name: 'DWA: Clear All Advisories (remote)',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'clear_all', timestamp: Date.now() })
      },
    },

    dwa_freeze: {
      name: 'DWA: Freeze Spectrum',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'freeze', timestamp: Date.now() })
      },
    },

    dwa_unfreeze: {
      name: 'DWA: Unfreeze Spectrum',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'unfreeze', timestamp: Date.now() })
      },
    },

    dwa_set_mode: {
      name: 'DWA: Switch Detection Mode',
      options: [
        {
          id: 'mode',
          type: 'dropdown',
          label: 'Mode',
          default: 'speech',
          choices: DWA_MODES,
        },
      ],
      callback: async (event) => {
        const mode = event.options.mode as string
        await self.sendToApp({
          type: 'command',
          action: `mode:${mode}`,
          timestamp: Date.now(),
        })
      },
    },

    dwa_start_ringout: {
      name: 'DWA: Start Ring-Out Wizard',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'ringout_start', timestamp: Date.now() })
      },
    },

    dwa_stop_ringout: {
      name: 'DWA: Stop Ring-Out Wizard',
      options: [],
      callback: async () => {
        await self.sendToApp({ type: 'command', action: 'ringout_stop', timestamp: Date.now() })
      },
    },
  })
}
```

## File: companion-module/src/feedbacks.ts

```typescript
import { combineRgb } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdateFeedbacks(self: ModuleInstance): void {
  self.setFeedbackDefinitions({
    advisory_pending: {
      name: 'Advisory Pending',
      type: 'boolean',
      defaultStyle: {
        bgcolor: combineRgb(180, 130, 0),
        color: combineRgb(255, 255, 255),
      },
      options: [],
      callback: () => {
        return self.pendingAdvisories.length > 0
      },
    },

    severity_runaway: {
      name: 'Severity is Runaway',
      type: 'boolean',
      defaultStyle: {
        bgcolor: combineRgb(200, 0, 0),
        color: combineRgb(255, 255, 255),
      },
      options: [],
      callback: () => {
        const latest = self.pendingAdvisories[self.pendingAdvisories.length - 1]
        return latest?.severity === 'RUNAWAY'
      },
    },

    severity_growing: {
      name: 'Severity is Growing',
      type: 'boolean',
      defaultStyle: {
        bgcolor: combineRgb(200, 100, 0),
        color: combineRgb(255, 255, 255),
      },
      options: [],
      callback: () => {
        const latest = self.pendingAdvisories[self.pendingAdvisories.length - 1]
        return latest?.severity === 'GROWING'
      },
    },
  })
}
```

## File: companion-module/src/variables.ts

```typescript
import type { ModuleInstance } from './main.js'

export function UpdateVariableDefinitions(self: ModuleInstance): void {
  self.setVariableDefinitions([
    // PEQ recommendation
    { variableId: 'peq_frequency', name: 'PEQ Frequency (Hz)' },
    { variableId: 'peq_q', name: 'PEQ Q Factor' },
    { variableId: 'peq_gain', name: 'PEQ Gain (dB)' },
    { variableId: 'peq_type', name: 'PEQ Filter Type' },

    // GEQ recommendation
    { variableId: 'geq_band', name: 'GEQ Band Center (Hz)' },
    { variableId: 'geq_band_index', name: 'GEQ Fader Index (0-30)' },
    { variableId: 'geq_gain', name: 'GEQ Suggested Gain (dB)' },

    // Pitch & detection
    { variableId: 'note', name: 'Musical Pitch' },
    { variableId: 'severity', name: 'Detection Severity' },
    { variableId: 'confidence', name: 'Detection Confidence' },

    // State
    { variableId: 'pending_count', name: 'Pending Advisory Count' },
    { variableId: 'last_updated', name: 'Last Advisory Timestamp' },

    // Slot management
    { variableId: 'slots_used', name: 'PEQ Slots In Use' },
    { variableId: 'slots_total', name: 'PEQ Slots Available' },
    { variableId: 'mixer_model', name: 'Mixer Model' },
  ])
}
```

## File: companion-module/src/mixerOutput.ts

```typescript
import * as dgram from 'node:dgram'
import * as net from 'node:net'
import type { ModuleConfig } from './config.js'
import { getMixerProfile } from './mixerProfiles.js'
import type { MixerProfile, EqMessage } from './mixerProfiles.js'

/** Advisory payload from the relay */
export interface DwaAdvisory {
  id: string
  peq: { type: string; hz: number; q: number; gainDb: number }
  geq: { bandHz: number; bandIndex: number; suggestedDb: number }
  severity: string
  confidence: number
}

/** A PEQ slot actively in use on the mixer */
export interface ActiveSlot {
  band: number
  advisoryId: string
  freqHz: number
  gainDb: number
  q: number
  severity: string
  timestamp: number
}

/**
 * Encode an OSC message (minimal implementation — no external deps).
 * OSC spec: address (string) + type tag (string) + arguments.
 */
function oscString(str: string): Buffer {
  const buf = Buffer.from(str + '\0')
  const pad = 4 - (buf.length % 4)
  return pad < 4 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf
}

function oscFloat(val: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeFloatBE(val, 0)
  return buf
}

function oscMessage(address: string, args: Array<{ type: 'f'; value: number }>): Buffer {
  const addrBuf = oscString(address)
  const typeTags = ',' + args.map((a) => a.type).join('')
  const tagBuf = oscString(typeTags)
  const argBufs = args.map((a) => oscFloat(a.value))
  return Buffer.concat([addrBuf, tagBuf, ...argBufs])
}

/** Severity priority for slot replacement (higher = harder to replace) */
const SEVERITY_PRIORITY: Record<string, number> = {
  RUNAWAY: 5,
  GROWING: 4,
  WHISTLE: 3,
  RESONANCE: 2,
  POSSIBLE_RING: 1,
  INSTRUMENT: 0,
}

export class MixerOutput {
  private udpSocket: dgram.Socket | null = null
  private tcpSocket: net.Socket | null = null
  private config: ModuleConfig
  private log: (level: string, msg: string) => void
  private profile: MixerProfile

  /** Active PEQ slots on the mixer — keyed by band number */
  activeSlots: Map<number, ActiveSlot> = new Map()

  /** Session action log for export */
  sessionLog: Array<{ action: string; freqHz: number; gainDb: number; q: number; band: number; timestamp: number }> = []

  constructor(config: ModuleConfig, log: (level: string, msg: string) => void) {
    this.config = config
    this.log = log
    this.profile = getMixerProfile(config.mixerModel)
  }

  updateConfig(config: ModuleConfig): void {
    this.config = config
    this.profile = getMixerProfile(config.mixerModel)
    this.disconnect()
  }

  disconnect(): void {
    if (this.udpSocket) {
      this.udpSocket.close()
      this.udpSocket = null
    }
    if (this.tcpSocket) {
      this.tcpSocket.destroy()
      this.tcpSocket = null
    }
  }

  /** Apply an advisory's PEQ to the mixer using smart slot management */
  async applyAdvisory(advisory: DwaAdvisory): Promise<ActiveSlot | null> {
    if (this.config.mixerModel === 'none' as string) return null
    if (!this.config.mixerHost) return null

    const gainClamped = Math.max(advisory.peq.gainDb, this.config.maxCutDb)

    // Find a slot for this advisory
    const band = this.allocateSlot(advisory)
    if (band === null) {
      this.log('warn', `No PEQ slot available for ${Math.round(advisory.peq.hz)}Hz — all ${this.config.peqBandCount} slots in use`)
      return null
    }

    // Build and send EQ message using the mixer profile
    const msg = this.profile.buildEqMessage({
      prefix: this.config.oscPrefix || this.profile.defaultOscPrefix,
      band,
      freqHz: advisory.peq.hz,
      gainDb: gainClamped,
      q: advisory.peq.q,
    })

    await this.sendEqMessage(msg)

    // Track the slot
    const slot: ActiveSlot = {
      band,
      advisoryId: advisory.id,
      freqHz: advisory.peq.hz,
      gainDb: gainClamped,
      q: advisory.peq.q,
      severity: advisory.severity,
      timestamp: Date.now(),
    }
    this.activeSlots.set(band, slot)

    // Log for session export
    this.sessionLog.push({
      action: 'apply',
      freqHz: advisory.peq.hz,
      gainDb: gainClamped,
      q: advisory.peq.q,
      band,
      timestamp: Date.now(),
    })

    this.log('info', `Slot ${band}: ${Math.round(advisory.peq.hz)}Hz ${gainClamped}dB Q=${advisory.peq.q} (${advisory.severity})`)
    return slot
  }

  /** Apply GEQ correction from advisory's GEQ recommendation */
  async applyGEQ(advisory: DwaAdvisory): Promise<void> {
    if (!this.config.mixerHost) return
    if (!this.profile.buildGeqMessage) {
      this.log('warn', `${this.profile.label} does not support GEQ output`)
      return
    }

    const gainClamped = Math.max(advisory.geq.suggestedDb, this.config.maxCutDb)
    const msg = this.profile.buildGeqMessage({
      prefix: this.config.oscPrefix || this.profile.defaultOscPrefix,
      bandIndex: advisory.geq.bandIndex,
      gainDb: gainClamped,
    })

    await this.sendEqMessage(msg)

    this.sessionLog.push({
      action: 'geq',
      freqHz: advisory.geq.bandHz,
      gainDb: gainClamped,
      q: 0,
      band: advisory.geq.bandIndex,
      timestamp: Date.now(),
    })

    this.log('info', `GEQ band ${advisory.geq.bandIndex} (${advisory.geq.bandHz}Hz) → ${gainClamped}dB`)
  }

  /** Apply advisory using configured output mode (PEQ, GEQ, or both) */
  async applyWithMode(advisory: DwaAdvisory): Promise<ActiveSlot | null> {
    const mode = this.config.outputMode || 'peq'
    let slot: ActiveSlot | null = null

    if (mode === 'peq' || mode === 'both') {
      slot = await this.applyAdvisory(advisory)
    }
    if (mode === 'geq' || mode === 'both') {
      await this.applyGEQ(advisory)
    }

    return slot
  }

  /** Clear a slot by advisory ID (when feedback resolves) */
  async clearByAdvisoryId(advisoryId: string): Promise<boolean> {
    for (const [band, slot] of this.activeSlots) {
      if (slot.advisoryId === advisoryId) {
        return this.clearSlot(band)
      }
    }
    return false
  }

  /** Clear a specific PEQ band on the mixer */
  async clearSlot(band: number): Promise<boolean> {
    const msg = this.profile.buildClearMessage({
      prefix: this.config.oscPrefix || this.profile.defaultOscPrefix,
      band,
    })

    try {
      await this.sendEqMessage(msg)
      const slot = this.activeSlots.get(band)
      this.activeSlots.delete(band)

      if (slot) {
        this.sessionLog.push({
          action: 'clear',
          freqHz: slot.freqHz,
          gainDb: 0,
          q: 0,
          band,
          timestamp: Date.now(),
        })
        this.log('info', `Cleared slot ${band} (was ${Math.round(slot.freqHz)}Hz)`)
      }
      return true
    } catch {
      return false
    }
  }

  /** Clear all active slots */
  async clearAll(): Promise<void> {
    for (const band of [...this.activeSlots.keys()]) {
      await this.clearSlot(band)
    }
  }

  /** Get slot usage summary */
  getSlotSummary(): { used: number; total: number; slots: ActiveSlot[] } {
    return {
      used: this.activeSlots.size,
      total: this.config.peqBandCount,
      slots: [...this.activeSlots.values()],
    }
  }

  // ── Slot Allocation ─────────────────────────────────────────

  /**
   * Find a band number for this advisory.
   * 1. Check if this advisory already has a slot (update in place)
   * 2. Find an empty slot
   * 3. Replace the lowest-severity / oldest slot
   */
  private allocateSlot(advisory: DwaAdvisory): number | null {
    const start = this.config.peqBandStart || 1
    const count = this.config.peqBandCount || this.profile.peqBands
    const end = start + count - 1

    // Already has a slot? Update in place.
    for (const [band, slot] of this.activeSlots) {
      if (slot.advisoryId === advisory.id) return band
    }

    // Check for nearby frequency (within 1/3 octave) — reuse that slot
    for (const [band, slot] of this.activeSlots) {
      const ratio = Math.max(slot.freqHz, advisory.peq.hz) / Math.min(slot.freqHz, advisory.peq.hz)
      if (ratio <= 1.26) return band // 2^(1/3) ≈ 1.26
    }

    // Find empty slot
    for (let b = start; b <= end; b++) {
      if (!this.activeSlots.has(b)) return b
    }

    // All full — replace lowest-severity, then oldest
    let weakest: { band: number; priority: number; timestamp: number } | null = null
    for (const [band, slot] of this.activeSlots) {
      if (band < start || band > end) continue
      const priority = SEVERITY_PRIORITY[slot.severity] ?? 0
      if (!weakest || priority < weakest.priority || (priority === weakest.priority && slot.timestamp < weakest.timestamp)) {
        weakest = { band, priority, timestamp: slot.timestamp }
      }
    }

    if (weakest) {
      const incomingPriority = SEVERITY_PRIORITY[advisory.severity] ?? 0
      // Only replace if incoming is more severe
      if (incomingPriority > weakest.priority) {
        return weakest.band
      }
    }

    return null
  }

  // ── Message Sending ─────────────────────────────────────────

  private async sendEqMessage(msg: EqMessage): Promise<void> {
    if (msg.protocol === 'osc' && msg.oscMessages) {
      await this.sendOscMessages(msg.oscMessages)
    } else if (msg.protocol === 'tcp' && msg.tcpPayload) {
      await this.sendTcpPayload(msg.tcpPayload)
    }
  }

  private async sendOscMessages(messages: readonly { address: string; args: readonly { type: 'f'; value: number }[] }[]): Promise<void> {
    if (!this.config.mixerHost) return
    const socket = this.getUdpSocket()
    const port = this.config.mixerPort || this.profile.defaultPort

    for (const msg of messages) {
      const buf = oscMessage(msg.address, [...msg.args])
      await new Promise<void>((resolve, reject) => {
        socket.send(buf, port, this.config.mixerHost, (err) => {
          if (err) {
            this.log('error', `OSC send error: ${err.message}`)
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }
  }

  private getUdpSocket(): dgram.Socket {
    if (!this.udpSocket) {
      this.udpSocket = dgram.createSocket('udp4')
    }
    return this.udpSocket
  }

  private async sendTcpPayload(payload: string): Promise<void> {
    if (!this.config.mixerHost) return
    try {
      const socket = await this.getTcpSocket()
      socket.write(payload)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TCP error'
      this.log('error', `TCP send error: ${msg}`)
      throw err
    }
  }

  private getTcpSocket(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      if (this.tcpSocket && !this.tcpSocket.destroyed) {
        resolve(this.tcpSocket)
        return
      }

      const port = this.config.mixerPort || this.profile.defaultPort
      const socket = net.createConnection(
        { host: this.config.mixerHost, port, timeout: 3000 },
        () => {
          this.tcpSocket = socket
          resolve(socket)
        },
      )

      socket.on('error', (err) => {
        this.log('error', `TCP connection error: ${err.message}`)
        reject(err)
      })

      socket.on('close', () => {
        this.tcpSocket = null
      })
    })
  }
}
```

## File: companion-module/src/mixerProfiles.ts

```typescript
/**
 * Mixer profiles — auto-configure OSC/TCP format per mixer family.
 *
 * Each profile defines:
 * - protocol: 'osc' or 'tcp'
 * - defaultPort: standard control port
 * - peqBands: how many PEQ bands are available
 * - buildEqMessage(): converts frequency/gain/Q to the mixer's native format
 * - buildClearMessage(): zeros a PEQ band
 *
 * OSC parameter normalization references:
 * - X32/M32/Midas: Behringer X32 OSC protocol (log freq 20-20k → 0-1, gain ±15 → 0-1, Q log 10-0.3 → 0-1)
 * - Yamaha TF/CL/QL: Yamaha StageMix OSC (direct values, different address format)
 * - A&H dLive/SQ: Allen & Heath TCP/MIDI NRPN (binary, not OSC)
 */

export type MixerModelId =
  | 'x32'
  | 'midas_m32'
  | 'yamaha_tf'
  | 'yamaha_cl'
  | 'ah_dlive'
  | 'ah_sq'
  | 'pa2'
  | 'generic_osc'

export interface EqMessage {
  /** For OSC: address + args pairs. For TCP: raw string payloads. */
  readonly protocol: 'osc' | 'tcp'
  readonly oscMessages?: readonly OscMsg[]
  readonly tcpPayload?: string
}

export interface OscMsg {
  readonly address: string
  readonly args: readonly { type: 'f'; value: number }[]
}

export interface MixerProfile {
  readonly id: MixerModelId
  readonly label: string
  readonly protocol: 'osc' | 'tcp'
  readonly defaultPort: number
  /** Number of PEQ bands available for notch filters */
  readonly peqBands: number
  /** Default OSC channel prefix (user can override) */
  readonly defaultOscPrefix: string

  /** Build EQ messages to set a PEQ notch filter */
  buildEqMessage(params: {
    prefix: string
    band: number
    freqHz: number
    gainDb: number
    q: number
  }): EqMessage

  /** Build message to clear/zero a PEQ band */
  buildClearMessage(params: { prefix: string; band: number }): EqMessage

  /** Build GEQ band adjustment (bandIndex 0-30, gainDb) */
  buildGeqMessage?(params: {
    prefix: string
    bandIndex: number
    gainDb: number
  }): EqMessage
}

// ═══ X32 / M32 / Midas Parameter Normalization ═══

/** Log-scale frequency: 20-20000 Hz → 0.0-1.0 */
function x32FreqNorm(hz: number): number {
  return Math.max(0, Math.min(1, Math.log(hz / 20) / Math.log(20000 / 20)))
}

/** Gain: -15 to +15 dB → 0.0-1.0 */
function x32GainNorm(db: number): number {
  return Math.max(0, Math.min(1, (Math.max(-15, Math.min(15, db)) + 15) / 30))
}

/** Q: 10 (narrow) to 0.3 (wide), log scale → 0.0-1.0 */
function x32QNorm(q: number): number {
  const clamped = Math.max(0.3, Math.min(10, q))
  return Math.max(0, Math.min(1, 1 - Math.log(clamped / 0.3) / Math.log(10 / 0.3)))
}

function buildX32Eq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/${band}/type`, args: [{ type: 'f', value: 3 }] }, // 3 = PEQ (parametric)
      { address: `${prefix}/${band}/f`, args: [{ type: 'f', value: x32FreqNorm(freqHz) }] },
      { address: `${prefix}/${band}/g`, args: [{ type: 'f', value: x32GainNorm(gainDb) }] },
      { address: `${prefix}/${band}/q`, args: [{ type: 'f', value: x32QNorm(q) }] },
    ],
  }
}

function clearX32Eq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/${band}/g`, args: [{ type: 'f', value: 0.5 }] }, // 0dB = 0.5
    ],
  }
}

// ═══ Yamaha TF/CL/QL ═══
// Yamaha uses direct values in OSC, different address format

function buildYamahaTfEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  // TF series: /ch/01/eq/band/1/Freq, /ch/01/eq/band/1/Gain, /ch/01/eq/band/1/Q
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/Freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `${prefix}/band/${band}/Gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `${prefix}/band/${band}/Q`, args: [{ type: 'f', value: q }] },
    ],
  }
}

function clearYamahaTfEq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/Gain`, args: [{ type: 'f', value: 0 }] },
    ],
  }
}

function buildYamahaClEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  // CL/QL series: similar address, same direct values
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/Freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `${prefix}/band/${band}/Gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `${prefix}/band/${band}/Q`, args: [{ type: 'f', value: q }] },
    ],
  }
}

// ═══ Allen & Heath dLive / SQ ═══
// A&H uses TCP MIDI (NRPN). Simplified to JSON-line TCP for now.

function buildAhEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', channel: prefix, band, frequency: freqHz, gain: gainDb, q }) + '\n',
  }
}

function clearAhEq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', channel: prefix, band, frequency: 1000, gain: 0, q: 1 }) + '\n',
  }
}

// ═══ PA2 TCP ═══

function buildPa2Eq(_prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', filter: band, frequency: freqHz, gain: gainDb, q, type: 'Bell' }) + '\n',
  }
}

function clearPa2Eq(_prefix: string, band: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', filter: band, frequency: 1000, gain: 0, q: 4, type: 'Bell' }) + '\n',
  }
}

// ═══ Generic OSC (uses X32 normalization as baseline) ═══

function buildGenericOscEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return buildX32Eq(prefix, band, freqHz, gainDb, q)
}

// ═══ Profile Registry ═══

export const MIXER_PROFILES: Record<MixerModelId, MixerProfile> = {
  x32: {
    id: 'x32',
    label: 'Behringer X32 / X-Air',
    protocol: 'osc',
    defaultPort: 10023,
    peqBands: 6,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildX32Eq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearX32Eq(p.prefix, p.band),
    buildGeqMessage: (p) => ({
      protocol: 'osc' as const,
      oscMessages: [
        // X32 GEQ: /bus/01/eq/{band}/g or use same channel PEQ path with gain-only
        { address: `${p.prefix}/${p.bandIndex + 1}/g`, args: [{ type: 'f' as const, value: x32GainNorm(p.gainDb) }] },
      ],
    }),
  },
  midas_m32: {
    id: 'midas_m32',
    label: 'Midas M32 / Pro Series',
    protocol: 'osc',
    defaultPort: 10023,
    peqBands: 6,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildX32Eq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearX32Eq(p.prefix, p.band),
    buildGeqMessage: (p) => ({
      protocol: 'osc' as const,
      oscMessages: [
        { address: `${p.prefix}/${p.bandIndex + 1}/g`, args: [{ type: 'f' as const, value: x32GainNorm(p.gainDb) }] },
      ],
    }),
  },
  yamaha_tf: {
    id: 'yamaha_tf',
    label: 'Yamaha TF Series',
    protocol: 'osc',
    defaultPort: 49280,
    peqBands: 4,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildYamahaTfEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearYamahaTfEq(p.prefix, p.band),
  },
  yamaha_cl: {
    id: 'yamaha_cl',
    label: 'Yamaha CL / QL Series',
    protocol: 'osc',
    defaultPort: 49280,
    peqBands: 4,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildYamahaClEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearYamahaTfEq(p.prefix, p.band),
  },
  ah_dlive: {
    id: 'ah_dlive',
    label: 'Allen & Heath dLive',
    protocol: 'tcp',
    defaultPort: 51325,
    peqBands: 8,
    defaultOscPrefix: '1',
    buildEqMessage: (p) => buildAhEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearAhEq(p.prefix, p.band),
  },
  ah_sq: {
    id: 'ah_sq',
    label: 'Allen & Heath SQ',
    protocol: 'tcp',
    defaultPort: 51326,
    peqBands: 6,
    defaultOscPrefix: '1',
    buildEqMessage: (p) => buildAhEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearAhEq(p.prefix, p.band),
  },
  pa2: {
    id: 'pa2',
    label: 'dbx DriveRack PA2',
    protocol: 'tcp',
    defaultPort: 19272,
    peqBands: 8,
    defaultOscPrefix: 'High',
    buildEqMessage: (p) => buildPa2Eq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearPa2Eq(p.prefix, p.band),
  },
  generic_osc: {
    id: 'generic_osc',
    label: 'Generic OSC',
    protocol: 'osc',
    defaultPort: 10023,
    peqBands: 6,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildGenericOscEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearX32Eq(p.prefix, p.band),
  },
}

/** Dropdown choices for Companion config */
export const MIXER_MODEL_CHOICES = Object.values(MIXER_PROFILES).map((p) => ({
  id: p.id,
  label: p.label,
}))

/** Look up a profile by ID, falling back to generic_osc */
export function getMixerProfile(id: string): MixerProfile {
  return MIXER_PROFILES[id as MixerModelId] ?? MIXER_PROFILES.generic_osc
}
```

## File: companion-module/src/presets.ts

```typescript
import { combineRgb } from '@companion-module/base'
import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdatePresets(self: ModuleInstance): void {
  const presets: CompanionPresetDefinitions = {
    latest_advisory: {
      type: 'button',
      category: 'DoneWell Audio',
      name: 'Latest Advisory',
      style: {
        text: '$(donewell:peq_frequency)Hz\\n$(donewell:peq_gain)dB Q$(donewell:peq_q)',
        size: 'auto',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(40, 40, 40),
      },
      steps: [
        {
          down: [{ actionId: 'acknowledge_latest', options: {} }],
          up: [],
        },
      ],
      feedbacks: [
        { feedbackId: 'advisory_pending', options: {} },
        { feedbackId: 'severity_runaway', options: {} },
      ],
    },

    clear_all: {
      type: 'button',
      category: 'DoneWell Audio',
      name: 'Clear All',
      style: {
        text: 'CLEAR\\nALL',
        size: 'auto',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(80, 0, 0),
      },
      steps: [
        {
          down: [{ actionId: 'clear_all', options: {} }],
          up: [],
        },
      ],
      feedbacks: [],
    },

    status: {
      type: 'button',
      category: 'DoneWell Audio',
      name: 'Status',
      style: {
        text: 'DWA\\n$(donewell:pending_count) pending\\n$(donewell:severity)',
        size: 'auto',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(0, 60, 0),
      },
      steps: [],
      feedbacks: [{ feedbackId: 'advisory_pending', options: {} }],
    },
  }

  self.setPresetDefinitions(presets)
}
```

## File: companion-module/src/upgrades.ts

```typescript
import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = []
```
