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
