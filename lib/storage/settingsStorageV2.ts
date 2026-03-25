/**
 * Settings Storage v2 — layered state persistence.
 *
 * Uses entirely new localStorage keys (dwa-v2-*) to avoid any conflict
 * with the old dwa-custom-defaults / dwa-custom-presets keys.
 * This is a clean break — no migration from v1.
 *
 * Storage domains:
 *   - session:  Active layered state (mode + env + live + diagnostics + mic)
 *   - display:  Display preferences (separate lifecycle from rig state)
 *   - presets:  Structured rig presets (RigPresetV1[])
 *   - startup:  Which preset to load on launch
 *
 * @see lib/storage/dwaStorage.ts for the typedStorage factory
 * @see types/settings.ts for interface definitions
 */

import { typedStorage } from '@/lib/storage/dwaStorage'
import { DEFAULT_DISPLAY_PREFS, DEFAULT_SESSION_STATE } from '@/lib/settings/defaults'
import type { DisplayPrefs, DwaSessionState, RigPresetV1, StartupPreference } from '@/types/settings'

/** Active layered session state */
export const sessionStorageV2 = typedStorage<DwaSessionState>(
  'dwa-v2-session',
  DEFAULT_SESSION_STATE,
)

/** Display preferences (separate from rig state) */
export const displayStorageV2 = typedStorage<DisplayPrefs>(
  'dwa-v2-display',
  DEFAULT_DISPLAY_PREFS,
)

/** Structured rig presets */
export const presetsStorageV2 = typedStorage<RigPresetV1[]>(
  'dwa-v2-presets',
  [],
)

/** Startup preference — which preset to auto-load on launch */
export const startupStorageV2 = typedStorage<StartupPreference>(
  'dwa-v2-startup',
  {},
)
