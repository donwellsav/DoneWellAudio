'use client'

import { memo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PillToggle } from '@/components/ui/pill-toggle'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Section, SectionGroup } from './SettingsShared'
import { Download, Trash2, Mic, Loader2 } from 'lucide-react'
import type { DetectorSettings } from '@/types/advisory'
import type {
  RoomProfile,
  AmbientCapture,
  CalibrationStats,
  FloorMaterial,
  WallMaterial,
  CeilingMaterial,
  MicType,
  DimensionUnit,
} from '@/types/calibration'
import type { SpectrumData } from '@/types/advisory'

// ── Material options ─────────────────────────────────────────────────────────

const FLOOR_OPTIONS: { value: FloorMaterial; label: string }[] = [
  { value: 'carpet', label: 'Carpet' },
  { value: 'hardwood', label: 'Hardwood' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'tile', label: 'Tile' },
  { value: 'vinyl', label: 'Vinyl' },
]

const WALL_OPTIONS: { value: WallMaterial; label: string }[] = [
  { value: 'drywall', label: 'Drywall' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'glass', label: 'Glass' },
  { value: 'curtain', label: 'Curtain / Drape' },
  { value: 'wood_panel', label: 'Wood Panel' },
]

const CEILING_OPTIONS: { value: CeilingMaterial; label: string }[] = [
  { value: 'acoustic_tile', label: 'Acoustic Tile' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'open', label: 'Open / Exposed' },
]

const MIC_OPTIONS: { value: MicType; label: string; fullName: string }[] = [
  { value: 'lav', label: 'LAV', fullName: 'Lavalier' },
  { value: 'handheld', label: 'HH', fullName: 'Handheld' },
  { value: 'headset', label: 'HEADSET', fullName: 'Headset' },
  { value: 'gooseneck', label: 'GOOSE', fullName: 'Gooseneck' },
  { value: 'shotgun', label: 'SHOT', fullName: 'Shotgun' },
  { value: 'boundary', label: 'PZM', fullName: 'Pressure Zone (Boundary)' },
]

// ── Props ────────────────────────────────────────────────────────────────────

export interface CalibrationTabProps {
  settings: DetectorSettings
  onSettingsChange: (changes: Partial<DetectorSettings>) => void
  setMicProfile?: (profile: import('@/types/advisory').MicCalibrationProfile) => void
  room: RoomProfile
  updateRoom: (partial: Partial<RoomProfile>) => void
  clearRoom: () => void
  calibrationEnabled: boolean
  setCalibrationEnabled: (enabled: boolean) => void
  isRecording: boolean
  ambientCapture: AmbientCapture | null
  captureAmbient: (spectrumRef: React.RefObject<SpectrumData | null>) => void
  isCapturingAmbient: boolean
  spectrumRef: React.RefObject<SpectrumData | null>
  stats: CalibrationStats
  onExport: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export const CalibrationTab = memo(function CalibrationTab({
  settings,
  onSettingsChange,
  setMicProfile: setMicProfileAction,
  room,
  updateRoom,
  clearRoom,
  calibrationEnabled,
  setCalibrationEnabled,
  isRecording,
  ambientCapture,
  captureAmbient,
  isCapturingAmbient,
  spectrumRef,
  stats,
  onExport,
}: CalibrationTabProps) {

  const handleMicToggle = useCallback((mic: MicType) => {
    const current = room.micTypes
    const next = current.includes(mic)
      ? current.filter(m => m !== mic)
      : [...current, mic]
    updateRoom({ micTypes: next })
  }, [room.micTypes, updateRoom])

  const handleDimension = useCallback((key: 'length' | 'width' | 'height', value: string) => {
    const num = parseFloat(value) || 0
    updateRoom({ dimensions: { ...room.dimensions, [key]: num } })
  }, [room.dimensions, updateRoom])

  const handleUnit = useCallback((unit: DimensionUnit) => {
    updateRoom({ dimensions: { ...room.dimensions, unit } })
  }, [room.dimensions, updateRoom])

  const handleCaptureAmbient = useCallback(() => {
    captureAmbient(spectrumRef)
  }, [captureAmbient, spectrumRef])

  const elapsed = stats.elapsedMs > 0
    ? stats.elapsedMs < 60_000
      ? `${Math.round(stats.elapsedMs / 1000)}s`
      : `${Math.floor(stats.elapsedMs / 60_000)}m ${Math.round((stats.elapsedMs % 60_000) / 1000)}s`
    : '0s'

  return (
    <div className="space-y-5 py-2">

      {/* ── Room Profile ─────────────────────────────────────────── */}
      <SectionGroup title="Room Profile">
        <Section title="Venue Name">
          <Input
            value={room.name}
            onChange={e => updateRoom({ name: e.target.value })}
            placeholder="Hotel Ballroom — Corporate Conference"
            className="font-mono text-sm"
          />
        </Section>

        <Section title="Dimensions">
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">L</Label>
              <Input
                type="number"
                min={0}
                value={room.dimensions.length || ''}
                onChange={e => handleDimension('length', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">W</Label>
              <Input
                type="number"
                min={0}
                value={room.dimensions.width || ''}
                onChange={e => handleDimension('width', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">H</Label>
              <Input
                type="number"
                min={0}
                value={room.dimensions.height || ''}
                onChange={e => handleDimension('height', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-1 pt-4">
              {(['ft', 'm'] as DimensionUnit[]).map(u => (
                <button
                  key={u}
                  onClick={() => handleUnit(u)}
                  className={`px-2 py-1 text-xs font-mono rounded border transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    room.dimensions.unit === u
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Materials">
          <div className="grid grid-cols-1 @[350px]:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Floor</Label>
              <Select value={room.floor} onValueChange={(v: FloorMaterial) => updateRoom({ floor: v })}>
                <SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLOOR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs font-mono">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Walls</Label>
              <Select value={room.walls} onValueChange={(v: WallMaterial) => updateRoom({ walls: v })}>
                <SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WALL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs font-mono">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ceiling</Label>
              <Select value={room.ceiling} onValueChange={(v: CeilingMaterial) => updateRoom({ ceiling: v })}>
                <SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CEILING_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs font-mono">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="Microphones">
          <div className="flex flex-wrap gap-1.5">
            {MIC_OPTIONS.map(mic => (
              <button
                key={mic.value}
                onClick={() => handleMicToggle(mic.value)}
                title={mic.fullName}
                className={`px-2.5 py-1 text-xs font-mono font-bold tracking-wider rounded border transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  room.micTypes.includes(mic.value)
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                {mic.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Mic Count</Label>
            <Input
              type="number"
              min={1}
              max={64}
              value={room.micCount}
              onChange={e => updateRoom({ micCount: parseInt(e.target.value) || 1 })}
              className="font-mono text-sm w-20"
            />
          </div>
        </Section>

        <Section title="Signal Path">
          <Input
            value={room.signalPath}
            onChange={e => updateRoom({ signalPath: e.target.value })}
            placeholder="Yamaha TF → USB → Laptop"
            className="font-mono text-sm"
          />
        </Section>

        <Section title="Notes">
          <Textarea
            value={room.notes}
            onChange={e => updateRoom({ notes: e.target.value })}
            placeholder="HVAC on south wall, stage at north end..."
            className="font-mono text-sm min-h-[60px] resize-y"
            rows={2}
          />
        </Section>

        <div className="sm:col-span-full">
          <Button variant="outline" size="sm" onClick={clearRoom} className="w-full">
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            New Venue (Clear All)
          </Button>
        </div>
      </SectionGroup>

      {/* ── Ambient Capture ───────────────────────────────────────── */}
      <SectionGroup title="Ambient Noise Capture">
        <Section title="Noise Floor Measurement" tooltip="Records 5 seconds of ambient noise to establish the room's baseline noise floor spectrum.">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleCaptureAmbient}
            disabled={isCapturingAmbient}
          >
            {isCapturingAmbient ? (
              <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Capturing (5s)...</>
            ) : (
              <><Mic className="h-3.5 w-3.5 mr-2" />Capture Noise Floor</>
            )}
          </Button>
          {ambientCapture && (
            <div className="text-sm font-mono text-muted-foreground mt-1.5 space-y-0.5">
              <div>
                Ambient: <span className="text-foreground font-medium">{ambientCapture.avgNoiseFloorDb.toFixed(1)} dB</span> avg
              </div>
              <div className="text-xs">
                Captured {new Date(ambientCapture.capturedAt).toLocaleTimeString()}
              </div>
            </div>
          )}
        </Section>

        <Section title="Mic Calibration" tooltip="Applies inverse frequency response compensation for a measurement mic. Flattens the mic's coloration so the RTA shows true SPL. Select your mic model or 'None' to disable.">
          <div className="space-y-1">
            <Label className="text-sm font-mono">Measurement Mic</Label>
            <Select
              value={settings.micCalibrationProfile}
              onValueChange={(value) => {
                const profile = value as 'none' | 'ecm8000' | 'rta-m' | 'smartphone'
                if (setMicProfileAction) setMicProfileAction(profile)
                else onSettingsChange({ micCalibrationProfile: profile })
              }}
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
            {settings.micCalibrationProfile !== 'none' && (
              <p className="text-[11px] text-muted-foreground font-mono leading-tight">
                {settings.micCalibrationProfile === 'ecm8000'
                  ? 'Compensates +4.7 dB HF rise (10–16 kHz)'
                  : settings.micCalibrationProfile === 'smartphone'
                    ? 'Compensates −12 dB LF roll-off + MEMS resonance peak'
                    : 'Compensates ±1.5 dB LF/HF roll-off'}
              </p>
            )}
          </div>
        </Section>
      </SectionGroup>

      {/* ── Session Controls ──────────────────────────────────────── */}
      <SectionGroup title="Calibration Session">
        <Section title="Record Detection Data" tooltip="When enabled, all detection events, spectrum snapshots, and noise floor readings are automatically recorded during analysis for later export.">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-mono">Enable Calibration Mode</Label>
            <PillToggle
              checked={calibrationEnabled}
              onChange={setCalibrationEnabled}
            />
          </div>
        </Section>

        {calibrationEnabled && (
          <div className="space-y-2">
            <div className={`rounded border px-3 py-2 font-mono text-sm space-y-1 ${
              isRecording ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={isRecording ? 'text-primary font-medium' : 'text-muted-foreground'}>
                  {isRecording ? 'Recording' : 'Waiting for analysis...'}
                </span>
              </div>
              {isRecording && (
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
                    <span className={stats.falsePositiveCount > 0 ? 'text-red-400' : 'text-foreground'}>{stats.falsePositiveCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Missed</span>
                    <span className={stats.missedCount > 0 ? 'text-amber-400' : 'text-foreground'}>{stats.missedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Snapshots</span>
                    <span className="text-foreground">{stats.snapshotCount}</span>
                  </div>
                  {settings.micCalibrationProfile !== 'none' && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Mic Cal</span>
                      <span className="text-emerald-400 text-xs font-mono">
                        {settings.micCalibrationProfile === 'ecm8000' ? 'ECM8000' : settings.micCalibrationProfile === 'smartphone' ? 'MEMS' : 'RTA-M'} compensated
                      </span>
                    </div>
                  )}
                </>
              )}
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
            {stats.detectionCount === 0 && stats.snapshotCount === 0 && (
              <p className="text-xs text-muted-foreground font-mono text-center">
                Start analysis to collect data
              </p>
            )}
          </div>
        )}
      </SectionGroup>
    </div>
  )
})
