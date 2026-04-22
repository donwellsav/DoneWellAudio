'use client'

import { memo } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PillToggle } from '@/components/ui/pill-toggle'
import { Section, SectionGroup } from '@/components/analyzer/settings/SettingsShared'
import type { CalibrationStats } from '@/types/calibration'

interface CalibrationSessionSectionProps {
  calibrationEnabled: boolean
  setCalibrationEnabled: (enabled: boolean) => void
  isRecording: boolean
  stats: CalibrationStats
  elapsed: string
  onExport: () => void
}

export const CalibrationSessionSection = memo(function CalibrationSessionSection({
  calibrationEnabled,
  setCalibrationEnabled,
  isRecording,
  stats,
  elapsed,
  onExport,
}: CalibrationSessionSectionProps) {
  return (
    <SectionGroup title="Calibration Session">
      <Section title="Detection Recording" tooltip="When enabled, all detection events, spectrum snapshots, and noise floor readings are automatically recorded during analysis for later export.">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-muted-foreground">Enable</span>
          <PillToggle
            checked={calibrationEnabled}
            onChange={setCalibrationEnabled}
            label="detection recording"
          />
        </div>
      </Section>

      {calibrationEnabled ? (
        <div className="space-y-2">
          <div className={`rounded border px-3 py-2 font-mono text-sm space-y-1 ${
            isRecording ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={isRecording ? 'text-[var(--console-green)] font-medium' : 'text-muted-foreground'}>
                {isRecording ? 'Recording' : 'Waiting for analysis...'}
              </span>
            </div>

            {isRecording ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Elapsed</span>
                  <span className="text-foreground">{elapsed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Detections</span>
                  <span className="text-foreground">{stats.detectionCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">FALSE +</span>
                  <span className={stats.falsePositiveCount > 0 ? 'text-red-400' : 'text-foreground'}>
                    {stats.falsePositiveCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Missed</span>
                  <span className={stats.missedCount > 0 ? 'text-amber-400' : 'text-foreground'}>
                    {stats.missedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Snapshots</span>
                  <span className="text-foreground">{stats.snapshotCount}</span>
                </div>
              </>
            ) : null}
          </div>

          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={onExport}
            disabled={stats.detectionCount === 0 && stats.snapshotCount === 0}
          >
            <Download className="h-3.5 w-3.5 mr-2" />
            Export Calibration Data
          </Button>

          {stats.detectionCount === 0 && stats.snapshotCount === 0 ? (
            <p className="text-xs text-muted-foreground font-mono text-center">
              Start analysis to collect data
            </p>
          ) : null}
        </div>
      ) : null}
    </SectionGroup>
  )
})
