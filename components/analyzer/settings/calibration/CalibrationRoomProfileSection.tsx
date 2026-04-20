'use client'

import { memo } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Section, SectionGroup } from '@/components/analyzer/settings/SettingsShared'
import type {
  CeilingMaterial,
  DimensionUnit,
  FloorMaterial,
  MicType,
  RoomProfile,
  WallMaterial,
} from '@/types/calibration'

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

interface CalibrationRoomProfileSectionProps {
  room: RoomProfile
  updateRoom: (partial: Partial<RoomProfile>) => void
  clearRoom: () => void
  handleMicToggle: (mic: MicType) => void
  handleDimension: (key: 'length' | 'width' | 'height', value: string) => void
  handleUnit: (unit: DimensionUnit) => void
}

export const CalibrationRoomProfileSection = memo(function CalibrationRoomProfileSection({
  room,
  updateRoom,
  clearRoom,
  handleMicToggle,
  handleDimension,
  handleUnit,
}: CalibrationRoomProfileSectionProps) {
  return (
    <SectionGroup title="Room Profile">
      <p className="text-dwa-sm text-muted-foreground/50 mb-1.5 px-1">
        Venue details for session logs, room mode calculation, and threshold tuning.
      </p>

      <Section title="Venue Name">
        <Input
          name="venueName"
          aria-label="Venue name"
          autoComplete="organization"
          value={room.name}
          onChange={(event) => updateRoom({ name: event.target.value })}
          placeholder="Hotel Ballroom - Corporate Conference"
          className="font-mono text-sm"
        />
      </Section>

      <Section title="Dimensions" tooltip="Room dimensions for mode prediction and Schroeder frequency. Used to auto-tune detection thresholds.">
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">L</Label>
            <Input
              type="number"
              min={0}
              value={room.dimensions.length || ''}
              onChange={(event) => handleDimension('length', event.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">W</Label>
            <Input
              type="number"
              min={0}
              value={room.dimensions.width || ''}
              onChange={(event) => handleDimension('width', event.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">H</Label>
            <Input
              type="number"
              min={0}
              value={room.dimensions.height || ''}
              onChange={(event) => handleDimension('height', event.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex gap-1 pt-4">
            {(['ft', 'm'] as DimensionUnit[]).map((unit) => (
              <button
                key={unit}
                onClick={() => handleUnit(unit)}
                className={`px-2 py-1 text-xs font-mono rounded border transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  room.dimensions.unit === unit
                    ? 'bg-[rgba(74,222,128,0.12)] text-[var(--console-green)] border-[rgba(74,222,128,0.40)]'
                    : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Materials" tooltip="Surface materials affect RT60 and resonance damping estimates.">
        <div className="grid grid-cols-1 @[350px]:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Floor</Label>
            <Select value={room.floor} onValueChange={(value: FloorMaterial) => updateRoom({ floor: value })}>
              <SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLOOR_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs font-mono">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Walls</Label>
            <Select value={room.walls} onValueChange={(value: WallMaterial) => updateRoom({ walls: value })}>
              <SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WALL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs font-mono">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Ceiling</Label>
            <Select value={room.ceiling} onValueChange={(value: CeilingMaterial) => updateRoom({ ceiling: value })}>
              <SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CEILING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs font-mono">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Microphones" tooltip="Select mic type for calibration compensation. More open mics = more gain-before-feedback risk.">
        <div className="flex flex-wrap gap-1.5">
          {MIC_OPTIONS.map((mic) => (
            <button
              key={mic.value}
              onClick={() => handleMicToggle(mic.value)}
              title={mic.fullName}
              className={`px-2.5 py-1 text-xs font-mono font-bold tracking-wider rounded border transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                room.micTypes.includes(mic.value)
                  ? 'bg-[rgba(74,222,128,0.12)] text-[var(--console-green)] border-[rgba(74,222,128,0.40)]'
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
            onChange={(event) => updateRoom({ micCount: parseInt(event.target.value, 10) || 1 })}
            className="font-mono text-sm w-20"
          />
        </div>
      </Section>

      <Section title="Signal Path">
        <Input
          name="signalPath"
          aria-label="Signal path"
          autoComplete="off"
          value={room.signalPath}
          onChange={(event) => updateRoom({ signalPath: event.target.value })}
          placeholder="Yamaha TF -> USB -> Laptop"
          className="font-mono text-sm"
        />
      </Section>

      <Section title="Notes">
        <Textarea
          name="roomNotes"
          aria-label="Notes"
          autoComplete="off"
          value={room.notes}
          onChange={(event) => updateRoom({ notes: event.target.value })}
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
  )
})
