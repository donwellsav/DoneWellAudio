/**
 * Consent state machine for anonymous spectral data collection.
 *
 * State transitions:
 *   NOT_ASKED → PROMPTED → ACCEPTED | DECLINED
 *
 * A declined user can re-consent later via settings.
 * Version field enables re-consent when terms change.
 *
 * Privacy: consent is stored locally only, never transmitted.
 */

import type { ConsentState, ConsentStatus } from '@/types/data'
import { CONSENT_VERSION } from '@/types/data'

const STORAGE_KEY = 'ktr-data-consent'

// ─── Read / Write ───────────────────────────────────────────────────────────

/** Load consent state from localStorage */
export function loadConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()

    const stored: ConsentState = JSON.parse(raw)

    // Re-prompt if consent version is outdated
    if (stored.version < CONSENT_VERSION) {
      return defaultState()
    }

    return stored
  } catch {
    return defaultState()
  }
}

/** Persist consent state to localStorage */
function saveConsent(state: ConsentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage full or blocked — fail silently
  }
}

function defaultState(): ConsentState {
  return {
    status: 'not_asked',
    version: CONSENT_VERSION,
    respondedAt: null,
  }
}

// ─── State transitions ──────────────────────────────────────────────────────

/** Mark that the consent prompt has been shown to the user */
export function markPrompted(): ConsentState {
  const state: ConsentState = {
    status: 'prompted',
    version: CONSENT_VERSION,
    respondedAt: null,
  }
  saveConsent(state)
  return state
}

/** Record user's acceptance of data collection */
export function acceptConsent(): ConsentState {
  const state: ConsentState = {
    status: 'accepted',
    version: CONSENT_VERSION,
    respondedAt: new Date().toISOString(),
  }
  saveConsent(state)
  return state
}

/** Record user's decline of data collection */
export function declineConsent(): ConsentState {
  const state: ConsentState = {
    status: 'declined',
    version: CONSENT_VERSION,
    respondedAt: new Date().toISOString(),
  }
  saveConsent(state)
  return state
}

/** Revoke consent (user changed mind in settings) */
export function revokeConsent(): ConsentState {
  const state: ConsentState = {
    status: 'declined',
    version: CONSENT_VERSION,
    respondedAt: new Date().toISOString(),
  }
  saveConsent(state)
  return state
}

/** Check if collection is currently authorized */
export function isConsentGiven(): boolean {
  const state = loadConsent()
  return state.status === 'accepted' && state.version === CONSENT_VERSION
}

/** Check if user has been asked but hasn't responded yet */
export function isConsentPending(): boolean {
  const state = loadConsent()
  return state.status === 'not_asked' || state.status === 'prompted'
}

/** Get current consent status */
export function getConsentStatus(): ConsentStatus {
  return loadConsent().status
}
