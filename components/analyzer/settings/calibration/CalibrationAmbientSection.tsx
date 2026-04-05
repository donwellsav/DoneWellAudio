'use client'

import { memo } from 'react'
import { Loader2, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Section, SectionGroup } from '@/components/analyzer/settings/SettingsShared'
import type { DetectorSettings, MicCalibrationProfile } from '@/types/advisory'
import type { AmbientCapture } from '@/types/calibration'

interface CalibrationAmbientSectionProps {
  settings: DetectorSettings
  setMicProfile: (profile: MicCalibrationProfile) => void
  ambientCapture: AmbientCapture | null
  isCapturingAmbient: boolean
  handleCaptureAmbient: () => void
}

export const CalibrationAmbientSection = memo(function CalibrationAmbientSection({
  settings,
  setMicProfile,
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

      <Section title="Mic Calibration" tooltip="Applies inverse frequency response compensation for a measurement mic. Flattens the mic's coloration so the RTA shows true SPL. Select your mic model or 'None' to disable.">
        <div className="space-y-1">
          <Label className="text-sm font-mono">Measurement Mic</Label>
          <Select
            value={settings.micCalibrationProfile}
            onValueChange={(value) => setMicProfile(value as MicCalibrationProfile)}
          >
            <SelectTrigger className="h-8 text-sm font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="ecm8000">Behringer ECM8000 (CSL 746)</SelectItem>
              <SelectItem value="rta-m">dbx RTA-M</SelectItem>
              <SelectItem value="smartphone">Smartphone (Generic MEMS)</SelectItem>
            </SelectContent>
          </Select>

          {settings.micCalibrationProfile !== 'none' ? (
            <p className="text-[11px] text-muted-foreground font-mono leading-tight">
              {settings.micCalibrationProfile === 'ecm8000'
                ? 'Compensates +4.7 dB HF rise (10-16 kHz)'
                : settings.micCalibrationProfile === 'smartphone'
                  ? 'Compensates -12 dB LF roll-off plus MEMS resonance peak'
                  : 'Compensates +/-1.5 dB LF/HF roll-off'}
            </p>
          ) : null}
        </div>
      </Section>
    </SectionGroup>
  )
})
