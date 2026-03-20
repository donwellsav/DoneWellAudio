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
      } catch {
        // QuotaExceeded or blocked — fail silently
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
      } catch {
        // QuotaExceeded or blocked
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
      } catch {
        // Ignore
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

/** Detection custom presets */
interface CustomPreset {
  name: string
  settings: Partial<DetectorSettings>
}

export const presetStorage = typedStorage<CustomPreset[]>('ktr-custom-presets', [])

/** Selected audio input device ID */
export const deviceStorage = stringStorage('ktr-audio-device')

/** Room profile for calibration */
export const roomStorage = typedStorage<RoomProfile>('ktr-calibration-room', { ...EMPTY_ROOM_PROFILE })

/** First-run onboarding flag */
export const onboardingStorage = flagStorage('ktr-onboarding-seen')

/** User's saved custom defaults (full DetectorSettings snapshot) */
export const customDefaultsStorage = typedStorage<DetectorSettings | null>('ktr-custom-defaults', null)

/** First-drag hint dismissed — once user drags the RTA threshold, hide the "Drag to adjust" label forever */
export const thresholdDraggedStorage = flagStorage('ktr-threshold-dragged')

/** Swipe gesture hint shown — once user sees the swipe labeling tooltip, don't show again */
export const swipeHintStorage = flagStorage('ktr-swipe-hint-seen')


/** Clear resizable panel layout data (forces re-mount to defaults) */
export function clearPanelLayouts(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem('react-resizable-panels:ktr-layout-main')
    localStorage.removeItem('react-resizable-panels:ktr-layout-main-v2')
    localStorage.removeItem('react-resizable-panels:ktr-layout-main-v3')
    localStorage.removeItem('react-resizable-panels:ktr-layout-main-v4')
    localStorage.removeItem('react-resizable-panels:ktr-layout-vertical')
    localStorage.removeItem('react-resizable-panels:ktr-layout-bottom')
  } catch {
    // Ignore
  }
}
