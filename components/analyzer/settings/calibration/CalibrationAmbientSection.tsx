'use client'

import { memo } from 'react'
import { Loader2, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Section, SectionGroup } from '@/components/analyzer/settings/SettingsShared'
import type { AmbientCapture } from '@/types/calibration'

interface CalibrationAmbientSectionProps {
  ambientCapture: AmbientCapture | null
  isCapturingAmbient: boolean
  handleCaptureAmbient: () => void
}

export const CalibrationAmbientSection = memo(function CalibrationAmbientSection({
  ambientCapture,
  isCapturingAmbient,
  handleCaptureAmbient,
}: CalibrationAmbientSectionProps) {
  return (
    <SectionGroup title="Ambient Noise Capture">
      <Section title="Noise Floor" tooltip="Records 5 seconds of ambient noise to establish the room's baseline noise floor spectrum.">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={handleCaptureAmbient}
          disabled={isCapturingAmbient}
        >
          {isCapturingAmbient ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Capturing (5s)...
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5 mr-2" />
              Capture Noise Floor
            </>
          )}
        </Button>

        {ambientCapture ? (
          <div className="text-sm font-mono text-muted-foreground mt-1.5 space-y-0.5">
            <div>
              Ambient: <span className="text-foreground font-medium">{ambientCapture.avgNoiseFloorDb.toFixed(1)} dB</span> avg
            </div>
            <div className="text-xs">
              Captured {new Date(ambientCapture.capturedAt).toLocaleTimeString()}
            </div>
          </div>
        ) : null}
      </Section>
    </SectionGroup>
  )
})
