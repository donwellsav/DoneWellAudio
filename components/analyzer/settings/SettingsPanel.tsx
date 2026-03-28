'use client'

import React, { memo, useCallback, useState } from 'react'
import { Zap, Wrench, Monitor, FlaskConical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResetConfirmDialog } from '../ResetConfirmDialog'
import { LiveTab } from './LiveTab'
import { SetupTab } from './SetupTab'
import { DisplayTab } from './DisplayTab'
import { AdvancedTab } from './AdvancedTab'
import { useSettings } from '@/contexts/SettingsContext'
import { useRigPresets } from '@/hooks/useRigPresets'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'
import type { AdvancedTabProps } from './AdvancedTab'

// ── Types ────────────────────────────────────────────────────────────────────

/** Data collection props forwarded to Advanced tab */
export type DataCollectionTabProps = Pick<AdvancedTabProps, 'consentStatus' | 'isCollecting' | 'onEnableCollection' | 'onDisableCollection'>

type SettingsTab = 'live' | 'setup' | 'display' | 'advanced'

export interface SettingsPanelProps {
  settings: DetectorSettings
  onModeChange: (mode: OperationMode) => void
  onReset: () => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
}

// ── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: SettingsTab; label: string; shortLabel?: string; Icon: typeof Zap }[] = [
  { id: 'live', label: 'Live', Icon: Zap },
  { id: 'setup', label: 'Setup', Icon: Wrench },
  { id: 'display', label: 'Display', Icon: Monitor },
  { id: 'advanced', label: 'Advanced', shortLabel: 'Adv', Icon: FlaskConical },
]

// ── SettingsPanel ────────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  onModeChange,
  onReset,
  calibration,
  dataCollection,
}: SettingsPanelProps) {
  // Pull semantic actions from context
  const ctx = useSettings()

  const [activeTab, setActiveTab] = useState<SettingsTab>('live')

  // ── Rig preset state (structured, semantic recall) ─────────────────
  const rigPresets = useRigPresets(
    ctx.session ?? { modeId: 'speech', environment: {} as never, liveOverrides: {} as never, diagnostics: {} as never, micCalibrationProfile: 'none' },
    {
      setMode: ctx.setMode ?? (() => {}),
      setEnvironment: ctx.setEnvironment ?? (() => {}),
      updateLiveOverrides: ctx.updateLiveOverrides ?? (() => {}),
      updateDiagnostics: ctx.updateDiagnostics ?? (() => {}),
    },
  )

  // Adapter: SetupTab expects old-format { name, settings } array for preset display
  const customPresets = rigPresets.presets.map(p => ({
    name: p.name,
    settings: {} as Partial<DetectorSettings>, // Placeholder — load uses semantic recall
    _rigId: p.id,
  }))

  const [presetName, setPresetName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim()
    if (!name) return
    rigPresets.savePreset(name)
    setPresetName('')
    setShowSaveInput(false)
  }, [presetName, rigPresets])

  const handleDeletePreset = useCallback((name: string) => {
    const match = rigPresets.presets.find(p => p.name === name)
    if (match) rigPresets.deletePreset(match.id)
  }, [rigPresets])

  const handleLoadPreset = useCallback((preset: { name: string; settings: Partial<DetectorSettings>; _rigId?: string }) => {
    if (preset._rigId) {
      // Semantic recall — calls setMode → setEnvironment → updateLiveOverrides
      rigPresets.loadPreset(preset._rigId)
    }
    // Old-format presets without _rigId are no longer supported after Phase 6c
  }, [rigPresets])

  // Save/Load Defaults removed in Phase 6c — v2 session auto-persistence replaces this feature.
  // "Reset to Defaults" (onReset) is preserved.

  return (
    <TooltipProvider delayDuration={400}>
      <div className="@container space-y-1.5">

        {/* ── 4-tab strip: Live / Setup / Display / Advanced ──── */}
        {(() => {
          // Detect non-default gate overrides for badge indicator
          const d = ctx.session?.diagnostics
          const hasCustomGates = d && (
            d.formantGateOverride !== undefined ||
            d.chromaticGateOverride !== undefined ||
            d.combSweepOverride !== undefined ||
            d.ihrGateOverride !== undefined ||
            d.ptmrGateOverride !== undefined ||
            d.mainsHumGateOverride !== undefined
          )
          return (
            <div className="tab-track -mx-1 flex gap-0.5">
              {TABS.map(({ id, label, shortLabel, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-label={label}
                  data-active={activeTab === id}
                  className={`tab-track-item relative flex-1 min-h-10 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    activeTab === id
                      ? 'text-[var(--console-amber)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden @[280px]:inline">{shortLabel ?? label}</span>
                  {id === 'advanced' && hasCustomGates && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" title="Custom gate overrides active" />
                  )}
                </button>
              ))}
            </div>
          )
        })()}

        {/* ── Content ─────────────────────────────────────────────── */}

        <div key={activeTab} className="tab-content-fade">
          {activeTab === 'live' && (
            <LiveTab settings={settings} />
          )}

          {activeTab === 'setup' && (
            <SetupTab
              settings={settings}
              onSettingsChange={() => {}} // legacy prop for RoomTab/CalibrationTab
              onModeChange={onModeChange}
              calibration={calibration}
              customPresets={customPresets}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              presetName={presetName}
              setPresetName={setPresetName}
              handleSavePreset={handleSavePreset}
              handleDeletePreset={handleDeletePreset}
              handleLoadPreset={handleLoadPreset}
            />
          )}

          {activeTab === 'display' && (
            <DisplayTab settings={settings} updateDisplay={ctx.updateDisplay} />
          )}

          {activeTab === 'advanced' && (
            <AdvancedTab
              settings={settings}
              onSettingsChange={() => {}} // legacy prop — all controls use semantic actions
              {...(dataCollection ?? {})}
            />
          )}
        </div>

        {/* ── Footer: Reset ─────────────────────────── */}
        <div className="border-t border-border/40 pt-2 mt-2">
          <ResetConfirmDialog
            onConfirm={onReset}
            trigger={
              <Button variant="outline" size="sm" className="w-full h-8">
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Reset Defaults
              </Button>
            }
          />
        </div>
      </div>
    </TooltipProvider>
  )
})

// Re-export for backward compatibility
export { type DataCollectionTabProps as UnifiedControlsDataCollectionTabProps }
