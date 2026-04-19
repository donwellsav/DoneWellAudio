'use client'

import { memo } from 'react'
import { calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'
import { ROOM_PRESETS } from '@/lib/dsp/constants'
import type { RoomPresetKey } from '@/lib/dsp/constants'
import type { DetectorSettings } from '@/types/advisory'
import type { EnvironmentSelection } from '@/types/settings'
import { Input } from '@/components/ui/input'
import { Section } from '@/components/analyzer/settings/SettingsShared'
import { RoomModesDisplay } from './RoomModesDisplay'

interface RoomPhysicsSectionProps {
  settings: DetectorSettings
  setRoomPreset: (templateId: RoomPresetKey) => void
  setDisplayUnit: (displayUnit: 'meters' | 'feet') => void
  updateDimension: (dimension: 'length' | 'width' | 'height', rawValue: string) => void
  setTreatment: (treatment: EnvironmentSelection['treatment']) => void
}

export const RoomPhysicsSection = memo(function RoomPhysicsSection({
  settings,
  setRoomPreset,
  setDisplayUnit,
  updateDimension,
  setTreatment,
}: RoomPhysicsSectionProps) {
  return (
    <Section
      title="Room Physics"
      showTooltip={settings.showTooltips}
      tooltip="Room dimensions configure frequency-dependent thresholds, Schroeder boundary, room mode identification, and reverberation analysis. Select 'None' for raw detection without room modeling."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <span id="room-preset-label" className="text-sm text-muted-foreground font-mono tracking-wide">Room Preset</span>
          <div role="radiogroup" aria-labelledby="room-preset-label" className="grid grid-cols-1 @[300px]:grid-cols-2 gap-1.5">
            {(Object.keys(ROOM_PRESETS) as RoomPresetKey[]).map((key) => {
              const preset = ROOM_PRESETS[key]
              const isSelected = settings.roomPreset === key

              return (
                <button
                  key={key}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setRoomPreset(key)}
                  className={`flex flex-col items-start px-2 py-1.5 rounded text-left transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    isSelected
                      ? 'bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.40)] text-[var(--console-green)]'
                      : 'bg-card/40 border border-transparent hover:bg-muted'
                  }`}
                >
                  <span className="text-sm font-mono font-bold">{preset.label}</span>
                  <span className="text-sm text-muted-foreground font-mono">{preset.description}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground/70 font-mono mt-1">
            Also adjusts detection sensitivity for that environment.
          </p>
        </div>

        {settings.roomPreset !== 'none' ? (
          <>
            <div className="flex items-center gap-2">
              <span id="room-unit-label" className="text-sm text-muted-foreground font-mono tracking-wide">Unit:</span>
              <div role="radiogroup" aria-labelledby="room-unit-label" className="flex gap-1">
                {(['meters', 'feet'] as const).map((unit) => (
                  <button
                    key={unit}
                    role="radio"
                    aria-checked={settings.roomDimensionsUnit === unit}
                    aria-label={unit === 'meters' ? 'Meters' : 'Feet'}
                    onClick={() => setDisplayUnit(unit)}
                    className={`px-2 py-0.5 text-sm rounded cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                      settings.roomDimensionsUnit === unit
                        ? 'bg-[rgba(74,222,128,0.12)] text-[var(--console-green)]'
                        : 'bg-card/40 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {unit === 'meters' ? 'm' : 'ft'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                ['Length', 'length', 100] as const,
                ['Width', 'width', 100] as const,
                ['Height', 'height', 30] as const,
              ]).map(([label, dimension, max]) => (
                <div key={dimension} className="space-y-1">
                  <label htmlFor={`room-dimension-${dimension}`} className="text-sm text-muted-foreground font-mono">
                    {label}
                  </label>
                  <Input
                    id={`room-dimension-${dimension}`}
                    type="number"
                    value={dimension === 'length'
                      ? settings.roomLengthM
                      : dimension === 'width'
                        ? settings.roomWidthM
                        : settings.roomHeightM}
                    onChange={(event) => updateDimension(dimension, event.target.value)}
                    className="w-full h-7 px-2 text-sm rounded border border-border/40 bg-input font-mono"
                    min={1}
                    max={max}
                    step={0.5}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <span id="room-treatment-label" className="text-sm text-muted-foreground font-mono">Acoustic Treatment</span>
              <div role="radiogroup" aria-labelledby="room-treatment-label" className="flex gap-1">
                {([
                  ['untreated', 'Untreated', 'Hard walls, no panels or curtains - high reflections'],
                  ['typical', 'Typical', 'Some soft furnishings, partial treatment - average venue'],
                  ['treated', 'Treated', 'Acoustic panels, bass traps, diffusers - studio-grade'],
                ] as const).map(([value, label, description]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={settings.roomTreatment === value}
                    title={description}
                    onClick={() => setTreatment(value)}
                    className={`flex-1 px-2 py-1 text-sm rounded cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                      settings.roomTreatment === value
                        ? 'bg-[rgba(74,222,128,0.12)] text-[var(--console-green)]'
                        : 'bg-card/40 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
              <div className="bg-card/40 panel-recessed rounded px-2 py-1.5 text-center">
                <div className="font-mono font-medium text-foreground tabular-nums">{settings.roomRT60.toFixed(1)}s</div>
                <div>RT60</div>
              </div>
              <div className="bg-card/40 panel-recessed rounded px-2 py-1.5 text-center">
                <div className="font-mono font-medium text-foreground tabular-nums">{settings.roomVolume}m^3</div>
                <div>Volume</div>
              </div>
              <div className="bg-card/40 panel-recessed rounded px-2 py-1.5 text-center">
                <div className="font-mono font-medium text-foreground tabular-nums">
                  {Math.round(calculateSchroederFrequency(settings.roomRT60, settings.roomVolume))}Hz
                </div>
                <div>Schroeder</div>
              </div>
            </div>

            <div className="pt-2 panel-groove">
              <RoomModesDisplay
                lengthM={settings.roomDimensionsUnit === 'feet' ? settings.roomLengthM * 0.3048 : settings.roomLengthM}
                widthM={settings.roomDimensionsUnit === 'feet' ? settings.roomWidthM * 0.3048 : settings.roomWidthM}
                heightM={settings.roomDimensionsUnit === 'feet' ? settings.roomHeightM * 0.3048 : settings.roomHeightM}
              />
            </div>
          </>
        ) : null}
      </div>
    </Section>
  )
})
