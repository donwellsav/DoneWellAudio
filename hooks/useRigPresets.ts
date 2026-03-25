/**
 * useRigPresets — Structured rig preset management.
 *
 * Rig presets capture operator intent (mode + environment + live defaults),
 * NOT raw DetectorSettings field bags. Loading a preset reconstructs intent
 * by calling semantic actions in order: mode → environment → live overrides.
 *
 * Display prefs and diagnostics are excluded from presets by design —
 * display is device-local, diagnostics are opt-in expert state.
 *
 * @see types/settings.ts for RigPresetV1 interface
 * @see docs/CONTROLS_SETTINGS_REBUILD_SPEC_2026-03-25.md §Preset and Persistence Redesign
 */

'use client'

import { useCallback, useState } from 'react'

import { presetsStorageV2 } from '@/lib/storage/settingsStorageV2'
import type {
  DiagnosticsProfile,
  DwaSessionState,
  EnvironmentSelection,
  LiveOverrides,
  ModeId,
  RigPresetV1,
} from '@/types/settings'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of rig presets. Structured presets are small — 10 covers
 *  most engineers' venue rotation without localStorage pressure. */
const MAX_PRESETS = 10

// ─── Action interface ─────────────────────────────────────────────────────────

/** Semantic actions from useLayeredSettings — injected for testability */
export interface LayeredActions {
  setMode: (id: ModeId) => void
  setEnvironment: (env: Partial<EnvironmentSelection> & { templateId?: string }) => void
  updateLiveOverrides: (partial: Partial<LiveOverrides>) => void
  updateDiagnostics: (partial: Partial<DiagnosticsProfile>) => void
}

// ─── Return type ──────────────────────────────────────────────────────────────

export interface UseRigPresetsReturn {
  /** All saved rig presets, ordered by most-recently-updated first */
  presets: RigPresetV1[]
  /** Save current session as a new rig preset. Returns the created preset. */
  savePreset: (name: string) => RigPresetV1
  /** Load a preset by ID — calls semantic actions in mode → env → live order */
  loadPreset: (id: string) => void
  /** Delete a preset by ID */
  deletePreset: (id: string) => void
  /** Rename a preset */
  renamePreset: (id: string, name: string) => void
  /** Duplicate a preset with a new name. Returns the new preset. */
  duplicatePreset: (id: string, newName: string) => RigPresetV1 | null
  /** Whether saving is allowed (false at MAX_PRESETS limit) */
  canSave: boolean
}

// ─── Capture helper ───────────────────────────────────────────────────────────

/**
 * Snapshot the current layered session into a RigPresetV1.
 * Captures intent (mode + environment + live), not derived DetectorSettings.
 */
function captureRigPreset(name: string, session: DwaSessionState): RigPresetV1 {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    modeId: session.modeId,
    environment: { ...session.environment },
    liveDefaults: { ...session.liveOverrides },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages structured rig presets. Injected actions keep this hook testable
 * without React context — the "humble object" pattern.
 *
 * @param session  Current layered session state (for save/capture)
 * @param actions  Semantic actions from useLayeredSettings (for load/recall)
 */
export function useRigPresets(
  session: DwaSessionState,
  actions: LayeredActions,
): UseRigPresetsReturn {
  const [presets, setPresets] = useState<RigPresetV1[]>(() => {
    try { return presetsStorageV2.load() } catch { return [] }
  })

  // ── Persist helper ────────────────────────────────────────────────────

  const persist = useCallback((updated: RigPresetV1[]) => {
    setPresets(updated)
    try { presetsStorageV2.save(updated) } catch { /* quota exceeded — state still updated in memory */ }
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────

  const savePreset = useCallback((name: string): RigPresetV1 => {
    const preset = captureRigPreset(name.trim(), session)

    // Append, enforce limit by dropping oldest if at capacity
    const updated = [...presets, preset]
    if (updated.length > MAX_PRESETS) {
      // Sort by updatedAt ascending, drop the oldest
      updated.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      updated.shift()
    }
    // Sort by updatedAt descending for display (most recent first)
    updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    persist(updated)
    return preset
  }, [session, presets, persist])

  // ── Load ───────────────────────────────────────────────────────────────

  const loadPreset = useCallback((id: string): void => {
    const preset = presets.find(p => p.id === id)
    if (!preset) return

    // Semantic recall — order matters:
    // 1. Mode baseline (resets live overrides except gain)
    // 2. Environment offsets
    // 3. Live operator defaults from the preset
    actions.setMode(preset.modeId)
    actions.setEnvironment(preset.environment)
    actions.updateLiveOverrides(preset.liveDefaults)
  }, [presets, actions])

  // ── Delete ─────────────────────────────────────────────────────────────

  const deletePreset = useCallback((id: string): void => {
    persist(presets.filter(p => p.id !== id))
  }, [presets, persist])

  // ── Rename ─────────────────────────────────────────────────────────────

  const renamePreset = useCallback((id: string, name: string): void => {
    const updated = presets.map(p =>
      p.id === id
        ? { ...p, name: name.trim(), updatedAt: new Date().toISOString() }
        : p,
    )
    persist(updated)
  }, [presets, persist])

  // ── Duplicate ──────────────────────────────────────────────────────────

  const duplicatePreset = useCallback((id: string, newName: string): RigPresetV1 | null => {
    const source = presets.find(p => p.id === id)
    if (!source) return null
    if (presets.length >= MAX_PRESETS) return null

    const clone: RigPresetV1 = {
      ...source,
      id: crypto.randomUUID(),
      name: newName.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const updated = [clone, ...presets]
    persist(updated)
    return clone
  }, [presets, persist])

  return {
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    renamePreset,
    duplicatePreset,
    canSave: presets.length < MAX_PRESETS,
  }
}
