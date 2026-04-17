'use client'

import { memo, type ComponentType, type CSSProperties } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  SkipForward,
  X,
} from 'lucide-react'
import { getSeverityColor } from '@/lib/utils/advisoryDisplay'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import type { Advisory } from '@/types/advisory'
import {
  isSameRingOutBand,
  findAdjacentMode,
  type NotchedFreq,
} from '@/hooks/useRingOutWizardState'

interface SharedHeaderProps {
  title: string
  onClose?: () => void
  icon?: ComponentType<{ className?: string }>
  colorClassName?: string
  titleStyle?: CSSProperties
}

const SharedHeader = memo(function SharedHeader({
  title,
  onClose,
  icon: Icon,
  colorClassName = 'text-[var(--console-amber)]',
  titleStyle,
}: SharedHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h3
        className={`font-mono text-xs font-bold tracking-[0.15em] uppercase flex items-center gap-1.5 ${colorClassName}`}
        style={titleStyle}
      >
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {title}
      </h3>
      {onClose ? (
        <button
          onClick={onClose}
          aria-label="Exit ring-out wizard"
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  )
})

interface RingOutListeningPhaseProps {
  isRunning: boolean
  notched: readonly NotchedFreq[]
  onExit: () => void
  onFinish: () => void
}

export const RingOutListeningPhase = memo(function RingOutListeningPhase({
  isRunning,
  notched,
  onExit,
  onFinish,
}: RingOutListeningPhaseProps) {
  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <SharedHeader
        title={`Step ${notched.length + 1}: Raise Gain`}
        onClose={onExit}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-primary/40 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-primary" />
        </div>

        <p className="font-mono text-sm text-muted-foreground max-w-[200px]">
          Slowly raise the gain on your console until feedback appears
        </p>

        <div className="glass-card rounded-lg p-3 max-w-[260px] text-left space-y-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
            Before You Raise Gain
          </span>
          <ul className="space-y-1 font-mono text-[11px] text-muted-foreground leading-relaxed">
            <li>Mute unused mics and speakers first.</li>
            <li>Finish broad EQ and placement fixes before chasing narrow rings.</li>
            <li>Use performers, wedges, and real show positions when possible.</li>
          </ul>
          <p className="font-mono text-[11px] text-muted-foreground/80 leading-relaxed">
            This is a pre-show baseline. During the show, new cuts are backup only,
            not the main tuning workflow.
          </p>
        </div>

        {!isRunning ? (
          <p className="font-mono text-xs text-destructive">
            Analysis not running - start analysis first
          </p>
        ) : null}
      </div>

      {notched.length > 0 ? (
        <div className="space-y-1">
          <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
            {notched.length} notched
          </span>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {notched.map((entry, index) => (
              <div
                key={`${entry.frequencyHz}-${index}`}
                className="flex items-center justify-between font-mono text-xs text-muted-foreground"
              >
                <span>
                  {formatFrequency(entry.frequencyHz)} ({entry.pitch})
                </span>
                <span>
                  {entry.gainDb.toFixed(1)} dB Q={entry.q.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button
        onClick={onFinish}
        className="w-full py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
      >
        Finish Ring-Out
      </button>
    </div>
  )
})

interface RingOutDetectedPhaseProps {
  advisory: Advisory
  isDark: boolean
  notched: readonly NotchedFreq[]
  onExit: () => void
  onSkip: () => void
  onNext: () => void
  roomModes?: readonly RoomMode[] | null
}

export const RingOutDetectedPhase = memo(function RingOutDetectedPhase({
  advisory,
  isDark,
  notched,
  onExit,
  onSkip,
  onNext,
  roomModes,
}: RingOutDetectedPhaseProps) {
  const color = getSeverityColor(advisory.severity, isDark)
  const pitch = `${advisory.advisory.pitch.note}${advisory.advisory.pitch.octave}`
  const adjacentMode = findAdjacentMode(advisory.trueFrequencyHz, roomModes)
  const nearbyAcceptedCuts = notched.filter((entry) =>
    isSameRingOutBand(entry.frequencyHz, advisory.trueFrequencyHz),
  )
  const isMergedRegion = (advisory.clusterCount ?? 1) > 1

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <SharedHeader
        title="Feedback Detected!"
        onClose={onExit}
        icon={AlertTriangle}
        colorClassName=""
        titleStyle={{ color }}
      />

      <div
        className="glass-card rounded-lg p-4 text-center space-y-1"
        style={{ borderColor: color }}
      >
        <div
          className="font-mono text-2xl font-black tracking-wide"
          style={{ color }}
        >
          {formatFrequency(advisory.trueFrequencyHz)}
        </div>
        <div className="font-mono text-sm text-muted-foreground">{pitch}</div>
      </div>

      <div className="glass-card rounded-lg p-3 space-y-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
          Recommended Cut
        </span>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-mono text-lg font-bold text-foreground">
              {formatFrequency(advisory.advisory.peq.hz)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              FREQ
            </div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-destructive">
              {advisory.advisory.peq.gainDb.toFixed(1)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              CUT dB
            </div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-foreground">
              {advisory.advisory.peq.q.toFixed(1)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">Q</div>
          </div>
        </div>
      </div>

      {isMergedRegion || nearbyAcceptedCuts.length > 0 ? (
        <div className="glass-card rounded-lg p-2.5 border-blue-500/30 bg-blue-500/5">
          <p className="font-mono text-[11px] text-blue-400 text-center leading-relaxed">
            {isMergedRegion
              ? `This detection merged ${advisory.clusterCount} nearby peaks. If the region feels broad or keeps shifting, check placement, reflections, or broad EQ before stacking more narrow cuts.`
              : `This band already needed ${nearbyAcceptedCuts.length} accepted ${nearbyAcceptedCuts.length === 1 ? 'cut' : 'cuts'} during ring-out. Recheck mic and speaker geometry before adding more notches in the same region.`}
          </p>
        </div>
      ) : null}

      {adjacentMode ? (
        <div className="glass-card rounded-lg p-2.5 border-amber-500/30 bg-amber-500/5">
          <p className="font-mono text-[11px] text-amber-400 text-center leading-relaxed">
            Warning: {formatFrequency(advisory.trueFrequencyHz)} is near room mode{' '}
            {adjacentMode.label} ({Math.round(adjacentMode.frequency)} Hz).
            Consider broadband treatment or mic repositioning before notching.
          </p>
        </div>
      ) : null}

      <p className="font-mono text-xs text-muted-foreground text-center">
        Apply this cut only if it is a stable narrow ring, then click Next. If the
        band feels broad or unstable, stop and fix placement or broad EQ first.
      </p>

      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex items-center justify-center gap-1"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          Next
        </button>
      </div>

      {notched.length > 0 ? (
        <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
          {notched.map((entry, index) => (
            <div
              key={`${entry.frequencyHz}-${index}`}
              className="flex items-center justify-between font-mono text-[10px] text-muted-foreground/70"
            >
              <span>{formatFrequency(entry.frequencyHz)}</span>
              <span>{entry.gainDb.toFixed(1)} dB</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
})

interface RingOutSummaryPhaseProps {
  advisories: readonly Advisory[]
  companionEnabled: boolean
  notched: readonly NotchedFreq[]
  patternWarnings: readonly string[]
  onDone: () => void
  onExport: () => void
  onSendAll: () => void
}

export const RingOutSummaryPhase = memo(function RingOutSummaryPhase({
  advisories,
  companionEnabled,
  notched,
  patternWarnings,
  onDone,
  onExport,
  onSendAll,
}: RingOutSummaryPhaseProps) {
  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <SharedHeader
        title="Ring-Out Complete"
        icon={Check}
        colorClassName="text-[var(--console-amber)]"
      />

      <div className="font-mono text-sm text-foreground">
        {notched.length} {notched.length === 1 ? 'frequency' : 'frequencies'}{' '}
        notched
      </div>

      {notched.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-1">
          {notched.map((entry, index) => (
            <div
              key={`${entry.frequencyHz}-${index}`}
              className="glass-card rounded p-2 flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-sm font-bold text-foreground">
                  {formatFrequency(entry.frequencyHz)}
                </span>
                <span className="font-mono text-xs text-muted-foreground ml-2">
                  {entry.pitch}
                </span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {entry.gainDb.toFixed(1)} dB Q={entry.q.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-sm text-muted-foreground">
            No frequencies were notched
          </p>
        </div>
      )}

      {patternWarnings.length > 0 ? (
        <div className="glass-card rounded-lg p-3 space-y-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
            Pattern Warnings
          </span>
          <ul className="space-y-1 font-mono text-[11px] text-muted-foreground leading-relaxed">
            {patternWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="font-mono text-[11px] text-muted-foreground/80 leading-relaxed">
        Treat this as your pre-show baseline. If you keep cutting the same region
        during the show, that usually points to placement, reflections, or a broader
        tonal problem rather than bad luck.
      </p>

      <div className="flex gap-2">
        {notched.length > 0 ? (
          <button
            onClick={onExport}
            className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        ) : null}
        {companionEnabled && advisories.length > 0 && notched.length > 0 ? (
          <button
            onClick={onSendAll}
            className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            Send All
          </button>
        ) : null}
        <button
          onClick={onDone}
          className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  )
})
