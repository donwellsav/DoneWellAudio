'use client'

import { useEffect, useMemo, memo } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { calculateRoomModes, formatRoomModesForDisplay } from '@/lib/dsp/acousticUtils'
import { getRoomParametersFromDimensions, feetToMeters, calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'
import { ROOM_PRESETS, ROOM_ESTIMATION } from '@/lib/dsp/constants'
import type { RoomPresetKey } from '@/lib/dsp/constants'
import type { DetectorSettings } from '@/types/advisory'
import type { EnvironmentSelection, RoomTemplateId } from '@/types/settings'
// RoomDimensionEstimate flows through EngineContext — no direct import needed
import { useEngine } from '@/contexts/EngineContext'
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

// ── Auto-Detect Room Display ──────────────────────────────────────────────────

function metersToFeet(m: number): number {
  return m * 3.28084
}

function formatDim(m: number, unit: 'meters' | 'feet'): string {
  const val = unit === 'feet' ? metersToFeet(m) : m
  return val.toFixed(1)
}

function AutoDetectRoom({
  unit,
  onApplyDimensions,
}: {
  unit: 'meters' | 'feet'
  onApplyDimensions: (lengthM: number, widthM: number, heightM: number) => void
}) {
  const {
    isRunning,
    roomEstimate: estimate,
    roomMeasuring: isListening,
    roomProgress,
    startRoomMeasurement: startMeasurement,
    stopRoomMeasurement: stopMeasurement,
    clearRoomEstimate: clearEstimate,
  } = useEngine()
  const { elapsedMs, stablePeaks } = roomProgress
  const progressPct = Math.min((elapsedMs / ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS) * 100, 100)
  const unitLabel = unit === 'feet' ? 'ft' : 'm'

  return (
    <div className="space-y-3">
      {/* Measure / Stop button */}
      <div className="flex items-center gap-2">
        {isListening ? (
          <button
            onClick={stopMeasurement}
            className="flex-1 px-3 py-2 text-sm font-mono rounded bg-destructive/20 text-destructive hover:bg-destructive/30 cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Square className="w-3 h-3 inline mr-1" /> Stop Measuring
          </button>
        ) : (
          <button
            onClick={startMeasurement}
            disabled={!isRunning}
            className="flex-1 px-3 py-2 text-sm font-mono rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Mic className="w-3.5 h-3.5 inline mr-1" /> Measure Room
          </button>
        )}
        {estimate && !isListening && (
          <button
            onClick={clearEstimate}
            className="px-2 py-2 text-sm font-mono rounded bg-card/40 text-muted-foreground hover:bg-muted cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            title="Clear estimate"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!isRunning && !isListening && (
        <p className="text-sm text-muted-foreground font-mono">
          Start analysis first, then measure room dimensions from detected resonances.
        </p>
      )}

      {/* Progress bar */}
      {isListening && (
        <div className="space-y-1.5">
          <div className="h-1.5 bg-card/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
            <span>Listening... {stablePeaks} stable peaks</span>
            <span>{Math.round(elapsedMs / 1000)}s / {ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS / 1000}s</span>
          </div>
        </div>
      )}

      {/* Results */}
      {estimate && (
        <div className="space-y-3">
          {/* Dimension readouts */}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['L', estimate.dimensions.length],
              ['W', estimate.dimensions.width],
              ['H', estimate.dimensions.height],
            ] as const).map(([label, val]) => (
              <div key={label} className="bg-primary/10 rounded px-2 py-1.5 text-center">
                <div className="font-mono font-bold text-foreground tabular-nums">
                  {val > 0 ? `${formatDim(val, unit)}${unitLabel}` : '—'}
                </div>
                <div className="text-sm text-muted-foreground font-mono">{label}</div>
              </div>
            ))}
          </div>

          {/* Confidence & stats */}
          <div className="flex items-center gap-3 text-sm font-mono text-muted-foreground">
            <span>Confidence: <span className={estimate.confidence > 0.7 ? 'text-green-500' : estimate.confidence > 0.4 ? 'text-yellow-500' : 'text-destructive'}>{Math.round(estimate.confidence * 100)}%</span></span>
            <span>•</span>
            <span>{estimate.seriesFound}/3 axes found</span>
            <span>•</span>
            <span>±{estimate.residualError.toFixed(1)}Hz</span>
          </div>

          {/* Detected series detail */}
          {estimate.detectedSeries.map((series, i) => (
            <div key={i} className="text-sm font-mono pl-2 border-l-2 border-primary/30">
              <span className="text-muted-foreground">Axis {i + 1}:</span>{' '}
              <span className="text-foreground">{formatDim(series.dimensionM, unit)}{unitLabel}</span>{' '}
              <span className="text-muted-foreground">
                ({series.harmonicsMatched} harmonics @ {series.fundamentalHz.toFixed(1)}Hz spacing)
              </span>
            </div>
          ))}

          {/* Apply button */}
          {estimate.seriesFound >= 2 && (
            <button
              onClick={() => {
                const { length, width, height } = estimate.dimensions
                // Convert to user's unit for the dimension inputs
                const l = unit === 'feet' ? metersToFeet(length) : length
                const w = unit === 'feet' ? metersToFeet(width) : width
                const h = unit === 'feet' ? metersToFeet(height > 0 ? height : 2.7) : (height > 0 ? height : 2.7)
                onApplyDimensions(l, w, h)
              }}
              className="w-full px-3 py-2 text-sm font-mono rounded bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Apply to Room Settings
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Room Tab ────────────────────────────────────────────────────────────────────

interface RoomTabProps extends TabSettingsProps {
  setEnvironment?: (env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => void
}

export const RoomTab = memo(function RoomTab({
  settings,
  onSettingsChange,
  setEnvironment: setEnvAction,
}: RoomTabProps) {
  // Wrapper: use semantic action when available, legacy shim as fallback
  const applyEnv = setEnvAction ?? ((env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => {
    // Legacy fallback: route through onSettingsChange which hits applyLegacyPartial
    const updates: Partial<DetectorSettings> = {}
    if (env.templateId) updates.roomPreset = env.templateId as RoomPresetKey
    if (env.dimensionsM) {
      updates.roomLengthM = env.dimensionsM.length
      updates.roomWidthM = env.dimensionsM.width
      updates.roomHeightM = env.dimensionsM.height
    }
    if (env.treatment) updates.roomTreatment = env.treatment
    if (env.displayUnit) updates.roomDimensionsUnit = env.displayUnit
    onSettingsChange(updates)
  })

  // Auto-derive RT60 and Volume from dimensions + treatment whenever they change
  useEffect(() => {
    if (settings.roomPreset === 'none') return
    const l = settings.roomLengthM
    const w = settings.roomWidthM
    const h = settings.roomHeightM
    if (l <= 0 || w <= 0 || h <= 0) return
    const lM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(l) : l
    const wM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(w) : w
    const hM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(h) : h
    const params = getRoomParametersFromDimensions(lM, wM, hM, settings.roomTreatment)
    // When semantic action is available, RT60/volume are computed in derivation.
    // For legacy path, push through onSettingsChange.
    if (!setEnvAction) {
      onSettingsChange({
        roomRT60: Math.round(params.rt60 * 10) / 10,
        roomVolume: Math.round(params.volume),
      })
    }
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
                      // Semantic: setEnvironment applies offsets, not absolute thresholds.
                      // This fixes the architectural bug flagged in the deep audit.
                      applyEnv({ templateId: key })
                    }}
                    className={`flex flex-col items-start px-2 py-1.5 rounded text-left transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
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
            <p className="text-xs text-muted-foreground/70 font-mono mt-1">Also adjusts detection sensitivity for that environment.</p>
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
                      onClick={() => applyEnv({ displayUnit: unit })}
                      className={`px-2 py-0.5 text-sm rounded cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
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
                  ['Length', 'length', 100] as const,
                  ['Width', 'width', 100] as const,
                  ['Height', 'height', 30] as const,
                ]).map(([label, dimKey, max]) => (
                  <div key={dimKey} className="space-y-1">
                    <label className="text-sm text-muted-foreground font-mono">{label}</label>
                    <input
                      type="number"
                      value={dimKey === 'length' ? settings.roomLengthM : dimKey === 'width' ? settings.roomWidthM : settings.roomHeightM}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1
                        const currentDims = {
                          length: settings.roomLengthM,
                          width: settings.roomWidthM,
                          height: settings.roomHeightM,
                        }
                        currentDims[dimKey] = val
                        applyEnv({
                          templateId: 'custom',
                          provenance: 'manual',
                          dimensionsM: currentDims,
                        })
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
                    ['untreated', 'Untreated', 'Hard walls, no panels or curtains — high reflections'],
                    ['typical', 'Typical', 'Some soft furnishings, partial treatment — average venue'],
                    ['treated', 'Treated', 'Acoustic panels, bass traps, diffusers — studio-grade'],
                  ] as const).map(([val, label, desc]) => (
                    <button
                      key={val}
                      title={desc}
                      onClick={() => applyEnv({ treatment: val, templateId: 'custom', provenance: 'manual' })}
                      className={`flex-1 px-2 py-1 text-sm rounded cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
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

      {/* Auto-Detect Room — uses EngineContext directly */}
      <Section
        title="Auto-Detect Room"
        showTooltip={settings.showTooltips}
        tooltip="Listens for room resonances at high sensitivity and estimates room dimensions from their frequencies. Works best with no audio playing — just the room's natural resonance. Requires analysis to be running."
      >
        <AutoDetectRoom
          unit={settings.roomDimensionsUnit ?? 'feet'}
          onApplyDimensions={(l, w, h) => {
            applyEnv({
              templateId: 'custom',
              provenance: 'measured',
              dimensionsM: {
                length: Math.round(l * 10) / 10,
                width: Math.round(w * 10) / 10,
                height: Math.round(h * 10) / 10,
              },
            })
          }}
        />
      </Section>

    </div>
  )
})
