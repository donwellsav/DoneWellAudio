'use client'

import { memo } from 'react'
import { Save, Trash2, X } from 'lucide-react'
import { ChannelSection } from '@/components/ui/channel-section'

interface PresetOption {
  id: string
  name: string
}

interface RigPresetsSectionProps {
  customPresets: PresetOption[]
  canSavePreset: boolean
  showSaveInput: boolean
  setShowSaveInput: (value: boolean) => void
  presetName: string
  setPresetName: (value: string) => void
  handleSavePreset: () => void
  handleDeletePreset: (id: string) => void
  handleLoadPreset: (id: string) => void
}

export const RigPresetsSection = memo(function RigPresetsSection({
  customPresets,
  canSavePreset,
  showSaveInput,
  setShowSaveInput,
  presetName,
  setPresetName,
  handleSavePreset,
  handleDeletePreset,
  handleLoadPreset,
}: RigPresetsSectionProps) {
  return (
    <ChannelSection title="Rig Presets">
      <p className="text-[10px] text-muted-foreground/50 mb-1.5">Save and recall all current settings as named presets. Up to 10 presets for different venues or rigs.</p>
      <div className="space-y-1">
        {customPresets.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {customPresets.map((preset) => (
              <div key={preset.id} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => handleLoadPreset(preset.id)}
                  aria-label={`Load ${preset.name} preset`}
                  className="min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-2 rounded text-sm font-medium text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/50 hover:text-red-400 transition-colors p-1"
                  aria-label={`Delete ${preset.name} preset`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {showSaveInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              name="presetName"
              aria-label="Preset name"
              autoComplete="off"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              placeholder="Preset name..."
              maxLength={20}
              className="flex-1 px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              className="min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-2 rounded text-sm font-medium bg-primary/20 text-primary border border-primary/40 disabled:opacity-65 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              aria-label="Cancel preset save"
              onClick={() => {
                setShowSaveInput(false)
                setPresetName('')
              }}
              className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          canSavePreset && (
            <button
              onClick={() => setShowSaveInput(true)}
              className="min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Save className="w-3 h-3" /> Save as Preset
            </button>
          )
        )}
      </div>
    </ChannelSection>
  )
})
