'use client'

import { DEFAULT_PA2_SETTINGS } from '@/types/pa2'
import type { PA2ContextValue } from '@/contexts/PA2Context'

const NOOP_ASYNC = async () => {}

export const NOOP_PA2_CONTEXT: PA2ContextValue = {
  status: 'disconnected',
  pa2Connected: false,
  lastPollTimestamp: 0,
  rta: [],
  geq: null,
  meters: null,
  mutes: null,
  error: null,
  notchSlotsUsed: 0,
  notchSlotsAvailable: 0,
  lastAutoSendResult: null,
  lastAutoSendError: null,
  autoSendDiag: null,
  effectiveConfidence: 0,
  sendCorrections: NOOP_ASYNC,
  sendDetections: NOOP_ASYNC,
  flattenGEQ: NOOP_ASYNC,
  autoEQ: NOOP_ASYNC,
  sendAction: NOOP_ASYNC,
  clearNotches: NOOP_ASYNC,
  client: null,
  settings: DEFAULT_PA2_SETTINGS,
  updateSettings: () => {},
}
