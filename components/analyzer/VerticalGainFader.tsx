'use client'

import { memo } from 'react'
import { FaderTrack } from './FaderTrack'
import { useFaderMeterCanvas } from '@/hooks/useFaderMeterCanvas'
import { useFaderControlState } from '@/hooks/useFaderControlState'
import { useSensitivityGuidance } from '@/hooks/useSensitivityGuidance'
import type { FaderMode } from './faderTypes'

interface VerticalGainFaderProps {
  value: number
  onChange: (value: number) => void
  level: number
  min?: number
  max?: number
  autoGainEnabled?: boolean
  autoGainDb?: number
  autoGainLocked?: boolean
  onAutoGainToggle?: (enabled: boolean) => void
  isRunning: boolean
  noiseFloorDb?: number | null
  faderMode: FaderMode
  onFaderModeChange: (mode: FaderMode) => void
  sensitivityValue: number
  onSensitivityChange: (db: number) => void
  activeAdvisoryCount: number
}

export const VerticalGainFader = memo(function VerticalGainFader({
  value,
  onChange,
  level,
  min = -40,
  max = 40,
  autoGainEnabled = false,
  autoGainDb,
  autoGainLocked = false,
  onAutoGainToggle,
  isRunning,
  noiseFloorDb,
  faderMode,
  onFaderModeChange,
  sensitivityValue,
  onSensitivityChange,
  activeAdvisoryCount,
}: VerticalGainFaderProps) {
  const { canvasRef, trackRef } = useFaderMeterCanvas({
    mode: faderMode,
    min,
    max,
    level,
  })

  const isSensitivity = faderMode === 'sensitivity'
  const {
    editing,
    setEditing,
    displayValue,
    effectiveMin,
    effectiveMax,
    thumbBottom,
    valueLabel,
    beginPointerDrag,
    handleKeyStep,
    commitEdit,
  } = useFaderControlState({
    mode: faderMode,
    value: isSensitivity ? sensitivityValue : value,
    onChange: isSensitivity ? onSensitivityChange : onChange,
    min,
    max,
    trackRef,
    autoGainEnabled,
    autoGainDb,
    onAutoGainToggle,
  })
  const guidance = useSensitivityGuidance({
    enabled: isSensitivity,
    isRunning,
    inputLevel: level,
    activeAdvisoryCount,
    sensitivityDb: sensitivityValue,
  })

  return (
    <div className="flex flex-col h-full items-center py-2 gap-1.5 select-none">
      <div className="flex-shrink-0 flex flex-col w-full rounded-md overflow-hidden border border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.22)] bg-[rgba(0,0,0,0.15)]">
        <button
          onClick={() => onFaderModeChange('gain')}
          className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-dwa-sm font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
            !isSensitivity
              ? 'bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.10)] text-[var(--console-amber)]'
              : 'bg-transparent text-muted-foreground hover:text-foreground/70'
          }`}
          title="Input gain fader"
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            !isSensitivity
              ? 'bg-[var(--console-amber)] shadow-[0_0_4px_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.6)]'
              : 'bg-muted-foreground/25'
          }`} />
          Gain
        </button>
        <div className="h-px bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.10)]" />
        <button
          onClick={() => onFaderModeChange('sensitivity')}
          className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-dwa-sm font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
            isSensitivity
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-transparent text-muted-foreground hover:text-foreground/70'
          }`}
          title="Detection sensitivity fader"
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            isSensitivity
              ? 'bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.6)]'
              : 'bg-muted-foreground/25'
          }`} />
          Sens
        </button>
      </div>

      <div className="w-full flex-shrink-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.12)] to-transparent" />

      {editing ? (
        <input
          autoFocus
          type="text"
          aria-label={isSensitivity ? 'Edit detection sensitivity' : 'Edit input gain'}
          defaultValue={String(displayValue)}
          className="font-mono bg-input border border-primary rounded px-0.5 text-center text-foreground focus-visible:outline-none text-sm w-12 h-6 flex-shrink-0"
          onBlur={(event) => commitEdit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEdit((event.target as HTMLInputElement).value)
            if (event.key === 'Escape') setEditing(false)
            if (event.key === 'ArrowUp') { event.preventDefault(); handleKeyStep(1) }
            if (event.key === 'ArrowDown') { event.preventDefault(); handleKeyStep(-1) }
          }}
        />
      ) : (
        <button
          className={`fader-readout font-mono text-center transition-colors cursor-text flex-shrink-0 tabular-nums text-base font-bold leading-tight ${
            isSensitivity
              ? 'text-blue-400 hover:text-blue-300'
              : 'text-[var(--console-amber)] hover:text-[var(--console-amber)]/80'
          }`}
          onClick={() => setEditing(true)}
          onWheel={(event) => {
            event.preventDefault()
            handleKeyStep(event.deltaY < 0 ? 1 : -1)
          }}
          title={
            isSensitivity
              ? `Sensitivity: ${sensitivityValue}dB threshold - click to type`
              : autoGainEnabled
                ? autoGainLocked
                  ? 'Gain locked - click to edit'
                  : 'Calibrating - click to edit'
                : 'Click to type, scroll +/-1dB'
          }
          aria-label={
            isSensitivity
              ? `Sensitivity ${sensitivityValue}dB, click to edit`
              : `Input gain ${valueLabel}dB, click to edit`
          }
        >
          {valueLabel}
          <span className={`block text-sm ${isSensitivity ? 'text-blue-400/60' : 'text-[var(--console-amber)]/60'}`}>
            {isSensitivity ? 'Sens' : 'dB'}
          </span>
        </button>
      )}

      {!isSensitivity && onAutoGainToggle && (
        <div className="w-full flex-shrink-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.12)] to-transparent" />
      )}

      {!isSensitivity && onAutoGainToggle && (
        <button
          onClick={() => onAutoGainToggle(!autoGainEnabled)}
          className={`flex-shrink-0 px-1 py-1 rounded flex items-center justify-center gap-1.5 text-dwa-sm font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
            autoGainEnabled
              ? autoGainLocked
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 motion-safe:animate-pulse'
              : 'bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.08)] text-[var(--console-amber)] border border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.30)] hover:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.12)]'
          }`}
          title={
            autoGainEnabled
              ? autoGainLocked
                ? `Gain locked at ${autoGainDb ?? 0}dB - click for manual`
                : 'Calibrating auto-gain... click for manual'
              : 'Manual gain - click for auto'
          }
          aria-label={
            autoGainEnabled
              ? autoGainLocked
                ? 'Auto gain locked, switch to manual gain'
                : 'Auto gain calibrating, switch to manual gain'
              : 'Switch to auto gain'
          }
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            autoGainEnabled
              ? autoGainLocked
                ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]'
                : 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]'
              : 'bg-[var(--console-amber)] shadow-[0_0_4px_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.4)]'
          }`} />
          {autoGainEnabled ? (autoGainLocked ? 'Lock' : 'Cal') : 'Man'}
        </button>
      )}

      <div className="relative flex-1 min-h-0 w-full flex flex-col">
        <FaderTrack
          ariaLabel={isSensitivity ? 'Detection sensitivity' : 'Input gain'}
          autoGainEnabled={autoGainEnabled}
          canvasRef={canvasRef}
          displayValue={displayValue}
          editing={editing}
          effectiveMax={effectiveMax}
          effectiveMin={effectiveMin}
          guidance={guidance}
          isSensitivity={isSensitivity}
          max={max}
          min={min}
          mode={faderMode}
          noiseFloorDb={noiseFloorDb}
          onBeginPointerDrag={beginPointerDrag}
          onKeyStep={handleKeyStep}
          thumbBottom={thumbBottom}
          trackRef={trackRef}
        />
      </div>
    </div>
  )
})
