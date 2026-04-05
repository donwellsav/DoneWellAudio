'use client'

import { memo } from 'react'
import { useTheme } from 'next-themes'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import type { Advisory } from '@/types/advisory'
import {
  RingOutDetectedPhase,
  RingOutListeningPhase,
  RingOutSummaryPhase,
} from '@/components/analyzer/RingOutWizardSections'
import { useRingOutWizardState } from '@/hooks/useRingOutWizardState'

interface RingOutWizardProps {
  advisories: Advisory[]
  onFinish: () => void
  isRunning: boolean
  roomModes?: RoomMode[] | null
}

export const RingOutWizard = memo(function RingOutWizard({
  advisories,
  onFinish,
  isRunning,
  roomModes,
}: RingOutWizardProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  const {
    phase,
    notched,
    currentAdvisory,
    companionEnabled,
    handleNext,
    handleSkip,
    handleFinish,
    handleExport,
    handleSendAll,
  } = useRingOutWizardState({
    advisories,
    isRunning,
    roomModes,
  })

  if (phase === 'listening') {
    return (
      <RingOutListeningPhase
        isRunning={isRunning}
        notched={notched}
        onExit={onFinish}
        onFinish={handleFinish}
      />
    )
  }

  if (phase === 'detected' && currentAdvisory) {
    return (
      <RingOutDetectedPhase
        advisory={currentAdvisory}
        isDark={isDark}
        notched={notched}
        onExit={onFinish}
        onSkip={handleSkip}
        onNext={handleNext}
        roomModes={roomModes}
      />
    )
  }

  return (
    <RingOutSummaryPhase
      advisories={advisories}
      companionEnabled={companionEnabled}
      notched={notched}
      onDone={onFinish}
      onExport={handleExport}
      onSendAll={handleSendAll}
    />
  )
})
