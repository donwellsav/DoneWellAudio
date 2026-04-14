'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCompanion } from '@/hooks/useCompanion'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import type { Advisory } from '@/types/advisory'

export interface NotchedFreq {
  frequencyHz: number
  pitch: string
  gainDb: number
  q: number
  severity: string
  timestamp: number
  modeAdjacent?: string
}

export type WizardPhase = 'listening' | 'detected' | 'summary'

interface UseRingOutWizardStateParams {
  advisories: readonly Advisory[]
  isRunning: boolean
  roomModes?: RoomMode[] | null
}

interface UseRingOutWizardStateResult {
  phase: WizardPhase
  notched: NotchedFreq[]
  currentAdvisory: Advisory | null
  companionEnabled: boolean
  handleNext: () => void
  handleSkip: () => void
  handleFinish: () => void
  handleExport: () => void
  handleSendAll: () => void
}

const RING_OUT_SEVERITY_ORDER = {
  RUNAWAY: 0,
  GROWING: 1,
  RESONANCE: 2,
  POSSIBLE_RING: 3,
} as const

export function findAdjacentMode(
  freqHz: number,
  modes: readonly RoomMode[] | null | undefined,
): RoomMode | null {
  if (!modes || modes.length === 0) return null

  for (const mode of modes) {
    const centsHz = mode.frequency * (Math.pow(2, 50 / 1200) - 1)
    const thresholdHz = Math.min(Math.max(1.5, centsHz), 5)
    if (Math.abs(freqHz - mode.frequency) <= thresholdHz) {
      return mode
    }
  }

  return null
}

export function getRingOutActiveAdvisories(
  advisories: readonly Advisory[],
): Advisory[] {
  return advisories.filter(
    (advisory) =>
      advisory.severity !== 'INSTRUMENT' && advisory.severity !== 'WHISTLE',
  )
}

export function getRingOutDetectedAdvisory(
  advisories: readonly Advisory[],
): Advisory | null {
  if (advisories.length === 0) return null

  return [...advisories].sort((left, right) => {
    const leftRank =
      RING_OUT_SEVERITY_ORDER[
        left.severity as keyof typeof RING_OUT_SEVERITY_ORDER
      ] ?? 4
    const rightRank =
      RING_OUT_SEVERITY_ORDER[
        right.severity as keyof typeof RING_OUT_SEVERITY_ORDER
      ] ?? 4
    return leftRank - rightRank
  })[0]
}

export function buildRingOutExportLines(
  notched: readonly NotchedFreq[],
  now: Date,
): string[] {
  return [
    'DoneWell Audio - Ring-Out Session Report',
    `Date: ${now.toLocaleString()}`,
    `Frequencies notched: ${notched.length}`,
    '',
    'Freq (Hz) | Note | Cut (dB) | Q',
    '-'.repeat(40),
    ...notched.map((entry) =>
      `${formatFrequency(entry.frequencyHz).padEnd(10)}| ${entry.pitch.padEnd(5)}| ${entry.gainDb
        .toFixed(1)
        .padEnd(9)}| ${entry.q.toFixed(1)}`,
    ),
  ]
}

export function useRingOutWizardState({
  advisories,
  isRunning,
  roomModes,
}: UseRingOutWizardStateParams): UseRingOutWizardStateResult {
  const [phase, setPhase] = useState<WizardPhase>('listening')
  const [notched, setNotched] = useState<NotchedFreq[]>([])
  const [currentAdvisory, setCurrentAdvisory] = useState<Advisory | null>(null)
  const prevAdvisoryCountRef = useRef(0)
  const acceptedAdvisoriesRef = useRef<Advisory[]>([])
  const companion = useCompanion()

  const activeAdvisories = useMemo(
    () => getRingOutActiveAdvisories(advisories),
    [advisories],
  )

  useEffect(() => {
    if (phase !== 'listening' || !isRunning) return

    if (
      activeAdvisories.length > prevAdvisoryCountRef.current &&
      activeAdvisories.length > 0
    ) {
      setCurrentAdvisory(getRingOutDetectedAdvisory(activeAdvisories))
      setPhase('detected')
    }

    prevAdvisoryCountRef.current = activeAdvisories.length
  }, [activeAdvisories, isRunning, phase])

  useEffect(() => {
    if (phase === 'listening') {
      prevAdvisoryCountRef.current = activeAdvisories.length
    }
  }, [activeAdvisories, phase])

  const handleNext = useCallback(() => {
    if (!currentAdvisory) return

    const pitch = currentAdvisory.advisory.pitch
    const adjacentMode = findAdjacentMode(
      currentAdvisory.trueFrequencyHz,
      roomModes,
    )

    setNotched((previous) => [
      ...previous,
      {
        frequencyHz: currentAdvisory.trueFrequencyHz,
        pitch: `${pitch.note}${pitch.octave}`,
        gainDb: currentAdvisory.advisory.peq.gainDb,
        q: currentAdvisory.advisory.peq.q,
        severity: currentAdvisory.severity,
        timestamp: Date.now(),
        modeAdjacent: adjacentMode?.label,
      },
    ])
    acceptedAdvisoriesRef.current = [
      ...acceptedAdvisoriesRef.current,
      currentAdvisory,
    ]

    if (companion.settings.enabled && companion.settings.ringOutAutoSend) {
      void companion.sendExplicitAdvisory(currentAdvisory)
    }

    setCurrentAdvisory(null)
    setPhase('listening')
  }, [companion, currentAdvisory, roomModes])

  const handleSkip = useCallback(() => {
    setCurrentAdvisory(null)
    setPhase('listening')
  }, [])

  const handleFinish = useCallback(() => {
    setPhase('summary')
  }, [])

  const handleExport = useCallback(() => {
    if (notched.length === 0) return

    const blob = new Blob(
      [buildRingOutExportLines(notched, new Date()).join('\n')],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ringout-${new Date().toISOString().slice(0, 10)}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [notched])

  const handleSendAll = useCallback(() => {
    for (const advisory of acceptedAdvisoriesRef.current) {
      void companion.sendExplicitAdvisory(advisory)
    }
  }, [companion])

  const companionEnabled = companion.settings.enabled

  return {
    phase,
    notched,
    currentAdvisory,
    companionEnabled,
    handleNext,
    handleSkip,
    handleFinish,
    handleExport,
    handleSendAll,
  }
}
