/**
 * Typed localStorage abstraction — generic factory for per-domain storage.
 *
 * Every domain gets a typed accessor via typedStorage<T>(key, defaultValue).
 * All accessors share: try/catch, JSON ser/de, SSR guard, quota-safe writes.
 *
 * Domains with complex storage logic (consent.ts, feedbackHistory.ts) are
 * intentionally NOT migrated here — their storage is intertwined with
 * business logic (versioning, debounced writes, quota recovery).
 */

// ── Quota exceeded detection ─────────────────────────────────────────────────

function isQuotaExceeded(err: unknown): boolean {
  return err instanceof DOMException && (
    err.name === 'QuotaExceededError' || err.code === 22
  )
}

/**
 * Notify the UI that localStorage is full. Dispatches a custom event on window
 * so any component can listen for it (e.g., show a "storage full" banner).
 */
function notifyQuotaExceeded(key: string): void {
  console.error(`[dwaStorage] Storage quota exceeded writing "${key}" — settings may not persist. Clear old data or reduce usage.`)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dwa:storage-quota-exceeded', { detail: { key } }))
  }
}

// ── Generic factory ──────────────────────────────────────────────────────────

export interface TypedStorage<T> {
  load(): T
  save(value: T): void
  clear(): void
}

/**
 * Create a typed localStorage accessor for a single domain.
 *
 * @param key       localStorage key
 * @param fallback  default value returned when key is missing or corrupt
 */
export function typedStorage<T>(key: string, fallback: T): TypedStorage<T> {
  return {
    load(): T {
      if (typeof window === 'undefined') return fallback
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) return fallback
        return JSON.parse(raw) as T
      } catch {
        return fallback
      }
    },

    save(value: T): void {
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch (err) {
        if (isQuotaExceeded(err)) {
          notifyQuotaExceeded(key)
        } else {
          console.warn(`[dwaStorage] Failed to save "${key}":`, err instanceof Error ? err.message : err)
        }
      }
    },

    clear(): void {
      if (typeof window === 'undefined') return
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    },
  }
}

// ── String storage (no JSON wrapper) ─────────────────────────────────────────

export interface StringStorage {
  load(): string
  save(value: string): void
  clear(): void
}

/**
 * Like typedStorage but for raw string values (no JSON serialization).
 */
export function stringStorage(key: string, fallback: string = ''): StringStorage {
  return {
    load(): string {
      if (typeof window === 'undefined') return fallback
      try {
        return localStorage.getItem(key) ?? fallback
      } catch {
        return fallback
      }
    },

    save(value: string): void {
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(key, value)
      } catch (err) {
        if (isQuotaExceeded(err)) {
          notifyQuotaExceeded(key)
        } else {
          console.warn(`[dwaStorage] Failed to save "${key}":`, err instanceof Error ? err.message : err)
        }
      }
    },

    clear(): void {
      if (typeof window === 'undefined') return
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    },
  }
}

// ── Flag storage (boolean presence check) ────────────────────────────────────

export interface FlagStorage {
  isSet(): boolean
  set(): void
  clear(): void
}

/**
 * Boolean flag backed by key presence (value = 'true').
 * Used for one-time gates like onboarding.
 */
export function flagStorage(key: string): FlagStorage {
  return {
    isSet(): boolean {
      if (typeof window === 'undefined') return false
      try {
        return localStorage.getItem(key) !== null
      } catch {
        return false
      }
    },

    set(): void {
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(key, 'true')
      } catch (err) {
        if (isQuotaExceeded(err)) {
          notifyQuotaExceeded(key)
        } else {
          console.warn(`[dwaStorage] Failed to set flag "${key}":`, err instanceof Error ? err.message : err)
        }
      }
    },

    clear(): void {
      if (typeof window === 'undefined') return
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    },
  }
}

// ── Domain accessors ─────────────────────────────────────────────────────────

import type { DetectorSettings } from '@/types/advisory'
import type { RoomProfile } from '@/types/calibration'
import { EMPTY_ROOM_PROFILE } from '@/types/calibration'

/**
 * @deprecated Legacy flat preset storage. Replaced by structured rig presets
 * in `lib/storage/settingsStorageV2.ts` (key: dwa-v2-presets). Old data is
 * not migrated — intent cannot be reverse-engineered from partial field bags.
 * Will be removed in Phase 6.
 */
interface CustomPreset {
  name: string
  settings: Partial<DetectorSettings>
}

/** @deprecated Use `presetsStorageV2` from settingsStorageV2.ts instead. */
export const presetStorage = typedStorage<CustomPreset[]>('dwa-custom-presets', [])

/** Selected audio input device ID */
export const deviceStorage = stringStorage('dwa-audio-device')

/** Room profile for calibration */
export const roomStorage = typedStorage<RoomProfile>('dwa-calibration-room', { ...EMPTY_ROOM_PROFILE })

/** First-run onboarding flag */
export const onboardingStorage = flagStorage('dwa-onboarding-seen')

/**
 * @deprecated Legacy full-snapshot defaults. Session state is now managed by
 * `useLayeredSettings` via `sessionStorageV2` (key: dwa-v2-session). The old
 * auto-persist-everything model is replaced by layered ownership.
 * Will be removed in Phase 6.
 */
export const customDefaultsStorage = typedStorage<DetectorSettings | null>('dwa-custom-defaults', null)

/** First-drag hint dismissed — once user drags the RTA threshold, hide the "Drag to adjust" label forever */
export const thresholdDraggedStorage = flagStorage('dwa-threshold-dragged')

/** Swipe gesture hint shown — once user sees the swipe labeling tooltip, don't show again */
export const swipeHintStorage = flagStorage('dwa-swipe-hint-seen')


/** Clear resizable panel layout data (forces re-mount to defaults) */
export function clearPanelLayouts(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem('react-resizable-panels:dwa-layout-main')
    localStorage.removeItem('react-resizable-panels:dwa-layout-main-v2')
    localStorage.removeItem('react-resizable-panels:dwa-layout-main-v3')
    localStorage.removeItem('react-resizable-panels:dwa-layout-main-v4')
    localStorage.removeItem('react-resizable-panels:dwa-layout-vertical')
    localStorage.removeItem('react-resizable-panels:dwa-layout-bottom')
  } catch {
    // Ignore
  }
}
