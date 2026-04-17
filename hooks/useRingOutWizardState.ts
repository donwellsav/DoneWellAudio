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
  patternWarnings: string[]
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
const RING_OUT_BAND_RATIO = Math.pow(2, 1 / 6)

function buildAcceptedAdvisoryKey(advisory: Advisory): string {
  return JSON.stringify({
    trueFrequencyHz: advisory.trueFrequencyHz,
    peq: {
      type: advisory.advisory.peq.type,
      hz: advisory.advisory.peq.hz,
      q: advisory.advisory.peq.q,
      gainDb: advisory.advisory.peq.gainDb,
    },
    geq: {
      bandHz: advisory.advisory.geq.bandHz,
      bandIndex: advisory.advisory.geq.bandIndex,
      suggestedDb: advisory.advisory.geq.suggestedDb,
    },
  })
}

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

export function isSameRingOutBand(leftHz: number, rightHz: number): boolean {
  const higher = Math.max(leftHz, rightHz)
  const lower = Math.min(leftHz, rightHz)
  return higher / lower <= RING_OUT_BAND_RATIO
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
  const patternWarnings = buildRingOutPatternWarnings(notched)

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
    ...(patternWarnings.length > 0
      ? [
          '',
          'Pattern Warnings',
          '-'.repeat(40),
          ...patternWarnings.map((warning) => `- ${warning}`),
        ]
      : []),
    '',
    'Operator Note',
    '-'.repeat(40),
    'Use this report as a pre-show baseline. If cuts keep clustering in one band,',
    'recheck placement, reflective paths, and broad EQ before stacking more notches.',
  ]
}

export function buildRingOutPatternWarnings(
  notched: readonly NotchedFreq[],
): string[] {
  if (notched.length === 0) return []

  const warnings: string[] = []
  const sorted = [...notched].sort((left, right) => left.frequencyHz - right.frequencyHz)

  let groupStart = 0
  for (let index = 1; index <= sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    const inSameBand =
      current != null &&
      isSameRingOutBand(previous.frequencyHz, current.frequencyHz)

    if (inSameBand) {
      continue
    }

    const group = sorted.slice(groupStart, index)
    if (group.length >= 2) {
      const averageHz =
        group.reduce((sum, entry) => sum + entry.frequencyHz, 0) / group.length
      warnings.push(
        `${group.length} accepted cuts clustered around ${formatFrequency(averageHz)}. Recheck placement, reflections, or broad EQ before stacking more narrow notches.`,
      )
    }

    groupStart = index
  }

  const roomModeHits = notched.filter((entry) => entry.modeAdjacent)
  if (roomModeHits.length > 0) {
    warnings.push(
      `${roomModeHits.length} accepted ${roomModeHits.length === 1 ? 'cut landed' : 'cuts landed'} near predicted room modes. Treat those cuts as symptoms and recheck room-driven placement issues.`,
    )
  }

  return warnings
}

export function useRingOutWizardState({
  advisories,
  isRunning,
  roomModes,
}: UseRingOutWizardStateParams): UseRingOutWizardStateResult {
  const [phase, setPhase] = useState<WizardPhase>('listening')
  const [notched, setNotched] = useState<NotchedFreq[]>([])
  const [currentAdvisory, setCurrentAdvisory] = useState<Advisory | null>(null)
  const lastDetectedAdvisoryIdRef = useRef<string | null>(null)
  const acceptedAdvisoriesRef = useRef<Advisory[]>([])
  const sentAcceptedKeysRef = useRef<Set<string>>(new Set())
  const inFlightAcceptedKeysRef = useRef<Set<string>>(new Set())
  const companion = useCompanion()

  const activeAdvisories = useMemo(
    () => getRingOutActiveAdvisories(advisories),
    [advisories],
  )
  const detectedAdvisory = useMemo(
    () => getRingOutDetectedAdvisory(activeAdvisories),
    [activeAdvisories],
  )

  const sendAcceptedAdvisory = useCallback((advisory: Advisory) => {
    if (!companion.settings.enabled) return
    const advisoryKey = buildAcceptedAdvisoryKey(advisory)
    if (sentAcceptedKeysRef.current.has(advisoryKey)) return
    if (inFlightAcceptedKeysRef.current.has(advisoryKey)) return

    inFlightAcceptedKeysRef.current.add(advisoryKey)
    void companion.sendExplicitAdvisory(advisory)
      .then((accepted) => {
        if (accepted) {
          sentAcceptedKeysRef.current.add(advisoryKey)
        }
      })
      .finally(() => {
        inFlightAcceptedKeysRef.current.delete(advisoryKey)
      })
  }, [companion])

  useEffect(() => {
    const lastDetectedId = lastDetectedAdvisoryIdRef.current
    if (!lastDetectedId) return

    const stillActive = activeAdvisories.some((advisory) => advisory.id === lastDetectedId)
    if (!stillActive) {
      lastDetectedAdvisoryIdRef.current = null
    }
  }, [activeAdvisories])

  useEffect(() => {
    if (phase !== 'listening' || !isRunning || !detectedAdvisory) return
    if (detectedAdvisory.id === lastDetectedAdvisoryIdRef.current) return

    const timeoutId = window.setTimeout(() => {
      lastDetectedAdvisoryIdRef.current = detectedAdvisory.id
      setCurrentAdvisory(detectedAdvisory)
      setPhase('detected')
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [detectedAdvisory, isRunning, phase])

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
      sendAcceptedAdvisory(currentAdvisory)
    }

    setCurrentAdvisory(null)
    setPhase('listening')
  }, [companion.settings.enabled, companion.settings.ringOutAutoSend, currentAdvisory, roomModes, sendAcceptedAdvisory])

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
      sendAcceptedAdvisory(advisory)
    }
  }, [sendAcceptedAdvisory])

  const companionEnabled = companion.settings.enabled
  const patternWarnings = useMemo(
    () => buildRingOutPatternWarnings(notched),
    [notched],
  )

  return {
    phase,
    notched,
    currentAdvisory,
    companionEnabled,
    patternWarnings,
    handleNext,
    handleSkip,
    handleFinish,
    handleExport,
    handleSendAll,
  }
}
