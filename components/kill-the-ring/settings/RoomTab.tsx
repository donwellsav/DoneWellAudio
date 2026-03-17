'use client'

import { useEffect, useMemo, memo } from 'react'
import { calculateRoomModes, formatRoomModesForDisplay } from '@/lib/dsp/acousticUtils'
import { getRoomParametersFromDimensions, feetToMeters, calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'
import { ROOM_PRESETS } from '@/lib/dsp/constants'
import type { RoomPresetKey } from '@/lib/dsp/constants'
import type { DetectorSettings } from '@/types/advisory'
import { Section, type TabSettingsProps } from './SettingsShared'

// ── Room Modes Display ─────────────────────────────────────────────────────────

function RoomModesDisplay({ lengthM, widthM, heightM }: { lengthM: number; widthM: number; heightM: number }) {
  const modes = useMemo(() => {
    if (lengthM <= 0 || widthM <= 0 || heightM <= 0) return null
    return calculateRoomModes(lengthM, widthM, heightM)
  }, [lengthM, widthM, heightM])

  const formatted = useMemo(() => {
    if (!modes) return null
    return formatRoomModesForDisplay(modes)
  }, [modes])

  if (!formatted || formatted.all.length === 0) {
    return (
      <p className="text-sm text-muted-foreground font-mono">
        Enter valid room dimensions to calculate modes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground font-mono">
        Found {formatted.all.length} room modes below 300Hz:
      </p>
      {formatted.axial.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-sm font-mono font-medium text-foreground">Axial (strongest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.axial.slice(0, 8).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-sm font-mono bg-destructive/10 text-destructive rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.axial.length > 8 && <span className="text-sm text-muted-foreground font-mono">+{formatted.axial.length - 8} more</span>}
          </div>
        </div>
      )}
      {formatted.tangential.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-sm font-mono font-medium text-foreground">Tangential (medium)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.tangential.slice(0, 6).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-sm font-mono bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.tangential.length > 6 && <span className="text-sm text-muted-foreground font-mono">+{formatted.tangential.length - 6} more</span>}
          </div>
        </div>
      )}
      {formatted.oblique.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            <span className="text-sm font-mono font-medium text-foreground">Oblique (weakest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.oblique.slice(0, 4).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-sm font-mono bg-card/40 text-muted-foreground rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.oblique.length > 4 && <span className="text-sm text-muted-foreground font-mono">+{formatted.oblique.length - 4} more</span>}
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground pt-1">
        Tip: If detected feedback matches a room mode, it may be a resonance rather than feedback.
      </p>
    </div>
  )
}

// ── Room Tab ────────────────────────────────────────────────────────────────────

export const RoomTab = memo(function RoomTab({
  settings,
  onSettingsChange,
}: TabSettingsProps) {
  // Auto-derive RT60 and Volume from dimensions + treatment whenever they change
  useEffect(() => {
    if (settings.roomPreset === 'none') return // No auto-derivation for 'none'
    const l = settings.roomLengthM
    const w = settings.roomWidthM
    const h = settings.roomHeightM
    if (l <= 0 || w <= 0 || h <= 0) return
    // Convert from display unit to meters for calculation
    const lM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(l) : l
    const wM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(w) : w
    const hM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(h) : h
    const params = getRoomParametersFromDimensions(lM, wM, hM, settings.roomTreatment)
    onSettingsChange({
      roomRT60: Math.round(params.rt60 * 10) / 10,
      roomVolume: Math.round(params.volume),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.roomLengthM, settings.roomWidthM, settings.roomHeightM, settings.roomTreatment, settings.roomDimensionsUnit, settings.roomPreset])

  return (
    <div className="mt-4 space-y-4">

      <Section
        title="Room Physics"
        showTooltip={settings.showTooltips}
        tooltip="Room dimensions configure frequency-dependent thresholds, Schroeder boundary, room mode identification, and reverberation analysis. Select 'None' for raw detection without room modeling."
      >
        <div className="space-y-4">
          {/* Preset grid */}
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Room Preset</span>
            <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-1.5">
              {(Object.keys(ROOM_PRESETS) as RoomPresetKey[]).map((key) => {
                const preset = ROOM_PRESETS[key]
                const isSelected = settings.roomPreset === key
                return (
                  <button
                    key={key}
                    onClick={() => {
                      const updates: Partial<DetectorSettings> = {
                        roomPreset: key,
                        feedbackThresholdDb: preset.feedbackThresholdDb,
                        ringThresholdDb: preset.ringThresholdDb,
                      }
                      if (key !== 'none') {
                        updates.roomLengthM = preset.lengthM
                        updates.roomWidthM = preset.widthM
                        updates.roomHeightM = preset.heightM
                        updates.roomTreatment = preset.treatment
                      }
                      onSettingsChange(updates)
                    }}
                    className={`flex flex-col items-start px-2 py-1.5 rounded text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                      isSelected
                        ? 'bg-primary/20 border border-primary/50 text-primary'
                        : 'bg-card/40 border border-transparent hover:bg-muted'
                    }`}
                  >
                    <span className="text-sm font-mono font-bold">{preset.label}</span>
                    <span className="text-sm text-muted-foreground font-mono">{preset.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* All controls below are only shown when preset !== 'none' */}
          {settings.roomPreset !== 'none' && (
            <>
              {/* Unit toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono tracking-wide">Unit:</span>
                <div className="flex gap-1">
                  {(['meters', 'feet'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onSettingsChange({ roomDimensionsUnit: unit })}
                      className={`px-2 py-0.5 text-sm rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                        settings.roomDimensionsUnit === unit
                          ? 'bg-primary/20 text-primary'
                          : 'bg-card/40 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {unit === 'meters' ? 'm' : 'ft'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shared dimension inputs */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['Length', 'roomLengthM', 100] as const,
                  ['Width', 'roomWidthM', 100] as const,
                  ['Height', 'roomHeightM', 30] as const,
                ]).map(([label, field, max]) => (
                  <div key={field} className="space-y-1">
                    <label className="text-sm text-muted-foreground font-mono">{label}</label>
                    <input
                      type="number"
                      value={settings[field]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1
                        const update: Partial<DetectorSettings> = { [field]: val }
                        // Auto-switch to 'custom' if editing dimensions on a named preset
                        if (settings.roomPreset !== 'custom') {
                          update.roomPreset = 'custom'
                        }
                        onSettingsChange(update)
                      }}
                      className="w-full h-7 px-2 text-sm rounded border border-border/40 bg-input font-mono focus:outline-none focus:border-primary"
                      min={1} max={max} step={0.5}
                    />
                  </div>
                ))}
              </div>

              {/* Treatment selector */}
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground font-mono">Acoustic Treatment</label>
                <div className="flex gap-1">
                  {([
                    ['untreated', 'Untreated'],
                    ['typical', 'Typical'],
                    ['treated', 'Treated'],
                  ] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => {
                        const update: Partial<DetectorSettings> = { roomTreatment: val }
                        if (settings.roomPreset !== 'custom') update.roomPreset = 'custom'
                        onSettingsChange(update)
                      }}
                      className={`flex-1 px-2 py-1 text-sm rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                        settings.roomTreatment === val
                          ? 'bg-primary/20 text-primary'
                          : 'bg-card/40 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-derived readouts */}
              <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                <div className="bg-card/40 panel-recessed rounded px-2 py-1.5 text-center">
                  <div className="font-mono font-medium text-foreground tabular-nums">{settings.roomRT60.toFixed(1)}s</div>
                  <div>RT60</div>
                </div>
                <div className="bg-card/40 panel-recessed rounded px-2 py-1.5 text-center">
                  <div className="font-mono font-medium text-foreground tabular-nums">{settings.roomVolume}m³</div>
                  <div>Volume</div>
                </div>
                <div className="bg-card/40 panel-recessed rounded px-2 py-1.5 text-center">
                  <div className="font-mono font-medium text-foreground tabular-nums">{Math.round(calculateSchroederFrequency(settings.roomRT60, settings.roomVolume))}Hz</div>
                  <div>Schroeder</div>
                </div>
              </div>

              {/* Room Modes */}
              <div className="pt-2 panel-groove">
                <RoomModesDisplay
                  lengthM={settings.roomDimensionsUnit === 'feet' ? settings.roomLengthM * 0.3048 : settings.roomLengthM}
                  widthM={settings.roomDimensionsUnit === 'feet' ? settings.roomWidthM * 0.3048 : settings.roomWidthM}
                  heightM={settings.roomDimensionsUnit === 'feet' ? settings.roomHeightM * 0.3048 : settings.roomHeightM}
                />
              </div>
            </>
          )}
        </div>
      </Section>
    </div>
  )
})
