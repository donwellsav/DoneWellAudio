/**
 * PA2 session log — records every action sent to the PA2 during a show.
 * Export as JSON venue profile, import to replay all notches/GEQ corrections.
 */

export interface PA2SessionAction {
  readonly type:
    | 'notch_placed' | 'notch_deepened' | 'notch_recentered'
    | 'notch_released' | 'notch_replaced' | 'notch_cleared'
    | 'geq_correction' | 'geq_flat'
    | 'mode_sync' | 'panic_mute' | 'panic_unmute'
    | 'verify_effective' | 'verify_ineffective'
  readonly frequencyHz?: number
  readonly gainDb?: number
  readonly q?: number
  readonly band?: number
  readonly output?: string
  readonly filter?: number
  readonly mode?: string
  readonly timestamp: number
  /** Advisory ID that triggered this action */
  readonly clientId?: string
  /** Confidence at time of action */
  readonly confidence?: number
  /** For verify: dB drop observed */
  readonly verifyDropDb?: number
  /** For deepened/recentered: previous value */
  readonly previousGainDb?: number
  readonly previousFrequencyHz?: number
  /** For replaced: what was evicted */
  readonly replacedClientId?: string
}

export interface PA2VenueProfile {
  readonly version: 1
  readonly exportedAt: string
  readonly venueName: string
  readonly sessionDurationMs: number
  readonly actions: readonly PA2SessionAction[]
  readonly summary: {
    readonly totalNotches: number
    readonly totalDeepened: number
    readonly totalRecentered: number
    readonly totalReleased: number
    readonly totalGEQCorrections: number
    readonly panicEvents: number
    readonly verifyEffective: number
    readonly verifyIneffective: number
    readonly frequenciesNotched: readonly number[]
    /** Top 5 most frequently notched frequencies */
    readonly hotspots: readonly { hz: number; count: number }[]
    readonly maxSimultaneousNotches: number
    readonly avgNotchLifeMs: number
  }
}

/** In-memory session log */
const _log: PA2SessionAction[] = []
let _sessionStartMs = 0

export function startSession(): void {
  _log.length = 0
  _sessionStartMs = Date.now()
}

export function logAction(action: PA2SessionAction): void {
  if (_sessionStartMs === 0) _sessionStartMs = Date.now()
  _log.push(action)
}

export function getSessionLog(): readonly PA2SessionAction[] {
  return _log
}

export function exportVenueProfile(venueName: string): PA2VenueProfile {
  const notches = _log.filter(a => a.type === 'notch_placed')
  const deepened = _log.filter(a => a.type === 'notch_deepened')
  const recentered = _log.filter(a => a.type === 'notch_recentered')
  const released = _log.filter(a => a.type === 'notch_released')
  const geqCorrections = _log.filter(a => a.type === 'geq_correction')
  const panics = _log.filter(a => a.type === 'panic_mute')
  const verifyOk = _log.filter(a => a.type === 'verify_effective')
  const verifyFail = _log.filter(a => a.type === 'verify_ineffective')

  const allFreqs = notches.map(a => a.frequencyHz).filter((f): f is number => f !== undefined)
  const uniqueFreqs = [...new Set(allFreqs)]

  // Hotspots: most frequently notched frequencies
  const freqCounts = new Map<number, number>()
  for (const f of allFreqs) freqCounts.set(f, (freqCounts.get(f) ?? 0) + 1)
  const hotspots = [...freqCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hz, count]) => ({ hz, count }))

  // Avg notch life: time between place and release for same clientId
  let totalLifeMs = 0
  let lifeCount = 0
  for (const rel of released) {
    if (!rel.clientId) continue
    const placed = notches.find(n => n.clientId === rel.clientId)
    if (placed) {
      totalLifeMs += rel.timestamp - placed.timestamp
      lifeCount++
    }
  }

  // Max simultaneous: track active count over time
  let active = 0
  let maxActive = 0
  for (const a of _log) {
    if (a.type === 'notch_placed') active++
    else if (a.type === 'notch_released' || a.type === 'notch_cleared') active = Math.max(0, active - 1)
    maxActive = Math.max(maxActive, active)
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    venueName,
    sessionDurationMs: _sessionStartMs > 0 ? Date.now() - _sessionStartMs : 0,
    actions: [..._log],
    summary: {
      totalNotches: notches.length,
      totalDeepened: deepened.length,
      totalRecentered: recentered.length,
      totalReleased: released.length,
      totalGEQCorrections: geqCorrections.length,
      panicEvents: panics.length,
      verifyEffective: verifyOk.length,
      verifyIneffective: verifyFail.length,
      frequenciesNotched: uniqueFreqs.sort((a, b) => a - b),
      hotspots,
      maxSimultaneousNotches: maxActive,
      avgNotchLifeMs: lifeCount > 0 ? Math.round(totalLifeMs / lifeCount) : 0,
    },
  }
}

export function clearSession(): void {
  _log.length = 0
  _sessionStartMs = 0
}
