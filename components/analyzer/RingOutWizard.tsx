'use client'

import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { AlertTriangle, Check, ChevronRight, Download, SkipForward, X } from 'lucide-react'
import type { Advisory } from '@/types/advisory'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import { useCompanion } from '@/hooks/useCompanion'

interface NotchedFreq {
  frequencyHz: number
  pitch: string
  gainDb: number
  q: number
  severity: string
  timestamp: number
  modeAdjacent?: string // e.g. "1,0,0" if near a room mode
}

interface RingOutWizardProps {
  advisories: Advisory[]
  onFinish: () => void
  isRunning: boolean
  roomModes?: RoomMode[] | null
}

/** Check if a frequency is near a room mode. Threshold: max(1.5 Hz, 50 cents), cap 5 Hz */
function findAdjacentMode(freqHz: number, modes: RoomMode[] | null | undefined): RoomMode | null {
  if (!modes || modes.length === 0) return null
  for (const mode of modes) {
    const centsHz = mode.frequency * (Math.pow(2, 50 / 1200) - 1)
    const thresh = Math.min(Math.max(1.5, centsHz), 5)
    if (Math.abs(freqHz - mode.frequency) <= thresh) return mode
  }
  return null
}

type WizardPhase = 'listening' | 'detected' | 'summary'

export const RingOutWizard = memo(function RingOutWizard({
  advisories,
  onFinish,
  isRunning,
  roomModes,
}: RingOutWizardProps) {
  const [phase, setPhase] = useState<WizardPhase>('listening')
  const [notched, setNotched] = useState<NotchedFreq[]>([])
  const [currentAdvisory, setCurrentAdvisory] = useState<Advisory | null>(null)
  const prevAdvisoryCountRef = useRef(0)
  const companion = useCompanion()

  // Watch for new advisories during listening phase
  useEffect(() => {
    if (phase !== 'listening' || !isRunning) return

    // Detect new advisory appearing (count increased)
    const activeAdvisories = advisories.filter(a =>
      a.severity !== 'INSTRUMENT' && a.severity !== 'WHISTLE'
    )

    if (activeAdvisories.length > prevAdvisoryCountRef.current && activeAdvisories.length > 0) {
      // New feedback detected — pick the highest severity one
      const sorted = [...activeAdvisories].sort((a, b) => {
        const order = { RUNAWAY: 0, GROWING: 1, RESONANCE: 2, POSSIBLE_RING: 3 }
        return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4)
      })
      setCurrentAdvisory(sorted[0])
      setPhase('detected')
    }
    prevAdvisoryCountRef.current = activeAdvisories.length
  }, [advisories, phase, isRunning])

  // Reset advisory count when entering listening phase
  useEffect(() => {
    if (phase === 'listening') {
      const activeCount = advisories.filter(a =>
        a.severity !== 'INSTRUMENT' && a.severity !== 'WHISTLE'
      ).length
      prevAdvisoryCountRef.current = activeCount
    }
  }, [phase, advisories])

  const handleNext = useCallback(() => {
    if (!currentAdvisory) return
    const pitchInfo = currentAdvisory.advisory.pitch
    const adjacent = findAdjacentMode(currentAdvisory.trueFrequencyHz, roomModes)
    setNotched(prev => [...prev, {
      frequencyHz: currentAdvisory.trueFrequencyHz,
      pitch: `${pitchInfo.note}${pitchInfo.octave}`,
      gainDb: currentAdvisory.advisory.peq.gainDb,
      q: currentAdvisory.advisory.peq.q,
      severity: currentAdvisory.severity,
      timestamp: Date.now(),
      modeAdjacent: adjacent?.label,
    }])
    // Auto-send to Companion during ring-out when enabled
    if (companion.settings.enabled && companion.settings.ringOutAutoSend) {
      companion.sendAdvisory(currentAdvisory)
    }
    setCurrentAdvisory(null)
    setPhase('listening')
  }, [currentAdvisory, roomModes, companion])

  const handleSkip = useCallback(() => {
    setCurrentAdvisory(null)
    setPhase('listening')
  }, [])

  const handleFinish = useCallback(() => {
    setPhase('summary')
  }, [])

  const handleExport = useCallback(() => {
    if (notched.length === 0) return
    const lines = [
      'DoneWell Audio — Ring-Out Session Report',
      `Date: ${new Date().toLocaleString()}`,
      `Frequencies notched: ${notched.length}`,
      '',
      'Freq (Hz) | Note | Cut (dB) | Q',
      '-'.repeat(40),
      ...notched.map(n =>
        `${formatFrequency(n.frequencyHz).padEnd(10)}| ${n.pitch.padEnd(5)}| ${n.gainDb.toFixed(1).padEnd(9)}| ${n.q.toFixed(1)}`
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ringout-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [notched])

  // ── Listening Phase ────────────────────────────────────────────────
  if (phase === 'listening') {
    return (
      <div className="flex flex-col h-full p-3 gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-primary">
            Step {notched.length + 1}: Raise Gain
          </h3>
          <button
            onClick={onFinish}
            aria-label="Exit ring-out wizard"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          {/* Pulsing indicator */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="absolute inset-2 rounded-full bg-primary/40 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-primary" />
          </div>

          <p className="font-mono text-sm text-muted-foreground max-w-[200px]">
            Slowly raise the gain on your console until feedback appears
          </p>

          {!isRunning && (
            <p className="font-mono text-xs text-destructive">
              Analysis not running — start analysis first
            </p>
          )}
        </div>

        {/* Previous notches */}
        {notched.length > 0 && (
          <div className="space-y-1">
            <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
              {notched.length} notched
            </span>
            <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {notched.map((n, i) => (
                <div key={i} className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                  <span>{formatFrequency(n.frequencyHz)} ({n.pitch})</span>
                  <span>{n.gainDb.toFixed(1)} dB Q={n.q.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleFinish}
          className="w-full py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
        >
          Finish Ring-Out
        </button>
      </div>
    )
  }

  // ── Detected Phase ─────────────────────────────────────────────────
  if (phase === 'detected' && currentAdvisory) {
    const { trueFrequencyHz, severity, advisory: eqAdv } = currentAdvisory
    const color = getSeverityColor(severity)
    const pitchInfo = eqAdv.pitch
    const pitch = `${pitchInfo.note}${pitchInfo.octave}`

    return (
      <div className="flex flex-col h-full p-3 gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-xs font-bold tracking-[0.15em] uppercase flex items-center gap-1.5" style={{ color }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Feedback Detected!
          </h3>
          <button
            onClick={onFinish}
            aria-label="Exit ring-out wizard"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detected frequency — large and prominent */}
        <div className="glass-card rounded-lg p-4 text-center space-y-1" style={{ borderColor: color }}>
          <div className="font-mono text-2xl font-black tracking-wide" style={{ color }}>
            {formatFrequency(trueFrequencyHz)}
          </div>
          <div className="font-mono text-sm text-muted-foreground">
            {pitch}
          </div>
        </div>

        {/* EQ Recommendation */}
        <div className="glass-card rounded-lg p-3 space-y-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
            Recommended Cut
          </span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="font-mono text-lg font-bold text-foreground">{formatFrequency(eqAdv.peq.hz)}</div>
              <div className="font-mono text-[10px] text-muted-foreground">FREQ</div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-destructive">{eqAdv.peq.gainDb.toFixed(1)}</div>
              <div className="font-mono text-[10px] text-muted-foreground">CUT dB</div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-foreground">{eqAdv.peq.q.toFixed(1)}</div>
              <div className="font-mono text-[10px] text-muted-foreground">Q</div>
            </div>
          </div>
        </div>

        {(() => {
          const adjacent = findAdjacentMode(trueFrequencyHz, roomModes)
          if (adjacent) {
            return (
              <div className="glass-card rounded-lg p-2.5 border-amber-500/30 bg-amber-500/5">
                <p className="font-mono text-[11px] text-amber-400 text-center leading-relaxed">
                  ⚠ {formatFrequency(trueFrequencyHz)} is near room mode {adjacent.label} ({Math.round(adjacent.frequency)} Hz).
                  Consider broadband treatment or mic repositioning before notching.
                </p>
              </div>
            )
          }
          return null
        })()}
        <p className="font-mono text-xs text-muted-foreground text-center">
          Apply this cut on your console, then click Next
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
          <button
            onClick={handleNext}
            className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Next
          </button>
        </div>

        {/* Previous notches */}
        {notched.length > 0 && (
          <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
            {notched.map((n, i) => (
              <div key={i} className="flex items-center justify-between font-mono text-[10px] text-muted-foreground/70">
                <span>{formatFrequency(n.frequencyHz)}</span>
                <span>{n.gainDb.toFixed(1)} dB</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Summary Phase ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-primary flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          Ring-Out Complete
        </h3>
      </div>

      <div className="font-mono text-sm text-foreground">
        {notched.length} {notched.length === 1 ? 'frequency' : 'frequencies'} notched
      </div>

      {notched.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-1">
          {notched.map((n, i) => (
            <div key={i} className="glass-card rounded p-2 flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-bold text-foreground">{formatFrequency(n.frequencyHz)}</span>
                <span className="font-mono text-xs text-muted-foreground ml-2">{n.pitch}</span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {n.gainDb.toFixed(1)} dB Q={n.q.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-sm text-muted-foreground">No frequencies were notched</p>
        </div>
      )}

      <div className="flex gap-2">
        {notched.length > 0 && (
          <button
            onClick={handleExport}
            className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
        {companion.settings.enabled && notched.length > 0 && (
          <button
            onClick={() => {
              for (const a of advisories) {
                companion.sendAdvisory(a)
              }
            }}
            className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            Send All
          </button>
        )}
        <button
          onClick={onFinish}
          className="flex-1 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  )
})
