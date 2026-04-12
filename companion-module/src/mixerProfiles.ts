/**
 * Mixer profiles — auto-configure OSC/TCP format per mixer family.
 *
 * Each profile defines:
 * - protocol: 'osc' or 'tcp'
 * - defaultPort: standard control port
 * - peqBands: how many PEQ bands are available
 * - buildEqMessage(): converts frequency/gain/Q to the mixer's native format
 * - buildClearMessage(): zeros a PEQ band
 *
 * OSC parameter normalization references:
 * - X32/M32/Midas: Behringer X32 OSC protocol (log freq 20-20k → 0-1, gain ±15 → 0-1, Q log 10-0.3 → 0-1)
 * - Yamaha TF/CL/QL: Yamaha StageMix OSC (direct values, different address format)
 * - A&H dLive/SQ: Allen & Heath TCP/MIDI NRPN (binary, not OSC)
 */

export type MixerModelId =
  | 'x32'
  | 'midas_m32'
  | 'yamaha_tf'
  | 'yamaha_cl'
  | 'ah_dlive'
  | 'ah_sq'
  | 'pa2'
  | 'generic_osc'
  | 'venu360'

export interface EqMessage {
  /** For OSC: address + args pairs. For TCP: raw string payloads. */
  readonly protocol: 'osc' | 'tcp'
  readonly oscMessages?: readonly OscMsg[]
  readonly tcpPayload?: string
}

export type OscArg = { type: 'f'; value: number } | { type: 's'; value: string }

export interface OscMsg {
  readonly address: string
  readonly args: readonly OscArg[]
}

export interface MixerProfile {
  readonly id: MixerModelId
  readonly label: string
  readonly protocol: 'osc' | 'tcp'
  readonly defaultPort: number
  /** Number of PEQ bands available for notch filters */
  readonly peqBands: number
  /** Default OSC channel prefix (user can override) */
  readonly defaultOscPrefix: string

  /** Build EQ messages to set a PEQ notch filter */
  buildEqMessage(params: {
    prefix: string
    band: number
    freqHz: number
    gainDb: number
    q: number
  }): EqMessage

  /** Build message to clear/zero a PEQ band */
  buildClearMessage(params: { prefix: string; band: number }): EqMessage

  /** Build GEQ band adjustment (bandIndex 0-30, gainDb) */
  buildGeqMessage?(params: {
    prefix: string
    bandIndex: number
    gainDb: number
  }): EqMessage

  /** When true, GEQ requires an explicit geqPrefix — do not fall back to oscPrefix */
  requireGeqPrefix?: boolean
}

// ═══ X32 / M32 / Midas Parameter Normalization ═══

/** Log-scale frequency: 20-20000 Hz → 0.0-1.0 */
function x32FreqNorm(hz: number): number {
  return Math.max(0, Math.min(1, Math.log(hz / 20) / Math.log(20000 / 20)))
}

/** Gain: -15 to +15 dB → 0.0-1.0 */
function x32GainNorm(db: number): number {
  return Math.max(0, Math.min(1, (Math.max(-15, Math.min(15, db)) + 15) / 30))
}

/** Q: 10 (narrow) to 0.3 (wide), log scale → 0.0-1.0 */
function x32QNorm(q: number): number {
  const clamped = Math.max(0.3, Math.min(10, q))
  return Math.max(0, Math.min(1, 1 - Math.log(clamped / 0.3) / Math.log(10 / 0.3)))
}

function buildX32Eq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/${band}/type`, args: [{ type: 'f', value: 3 }] }, // 3 = PEQ (parametric)
      { address: `${prefix}/${band}/f`, args: [{ type: 'f', value: x32FreqNorm(freqHz) }] },
      { address: `${prefix}/${band}/g`, args: [{ type: 'f', value: x32GainNorm(gainDb) }] },
      { address: `${prefix}/${band}/q`, args: [{ type: 'f', value: x32QNorm(q) }] },
    ],
  }
}

function clearX32Eq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/${band}/g`, args: [{ type: 'f', value: 0.5 }] }, // 0dB = 0.5
    ],
  }
}

// ═══ Yamaha TF/CL/QL ═══
// Yamaha uses direct values in OSC, different address format

function buildYamahaTfEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  // TF series: /ch/01/eq/band/1/Freq, /ch/01/eq/band/1/Gain, /ch/01/eq/band/1/Q
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/Freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `${prefix}/band/${band}/Gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `${prefix}/band/${band}/Q`, args: [{ type: 'f', value: q }] },
    ],
  }
}

function clearYamahaTfEq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/Gain`, args: [{ type: 'f', value: 0 }] },
    ],
  }
}

function buildYamahaClEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  // CL/QL series: similar address, same direct values
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `${prefix}/band/${band}/Freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `${prefix}/band/${band}/Gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `${prefix}/band/${band}/Q`, args: [{ type: 'f', value: q }] },
    ],
  }
}

// ═══ Allen & Heath dLive / SQ ═══
// A&H uses TCP MIDI (NRPN). Simplified to JSON-line TCP for now.

function buildAhEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', channel: prefix, band, frequency: freqHz, gain: gainDb, q }) + '\n',
  }
}

function clearAhEq(prefix: string, band: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', channel: prefix, band, frequency: 1000, gain: 0, q: 1 }) + '\n',
  }
}

// ═══ PA2 TCP ═══

function buildPa2Eq(_prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', filter: band, frequency: freqHz, gain: gainDb, q, type: 'Bell' }) + '\n',
  }
}

function clearPa2Eq(_prefix: string, band: number): EqMessage {
  return {
    protocol: 'tcp',
    tcpPayload: JSON.stringify({ command: 'set_peq', filter: band, frequency: 1000, gain: 0, q: 4, type: 'Bell' }) + '\n',
  }
}

// ═══ VENU360 (OSC via VENU360 Companion module) ═══
// Sends to the VENU360 Companion module's OSC receive port.
// Frequency as float Hz — the VENU360 module auto-formats to
// device strings ("250Hz", "1kHz", "12.5kHz").

function venu360ValidateOutput(prefix: string): string {
  const trimmed = prefix.trim()
  if (!/^[1-6]$/.test(trimmed)) {
    throw new Error(`VENU360 PEQ output must be 1-6, got '${prefix}'. Set the Channel/EQ Prefix to a valid output number.`)
  }
  return trimmed
}

function buildVenu360PeqEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  const inst = venu360ValidateOutput(prefix || '1')
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `/venu360/peqout/${inst}/band/${band}/type`, args: [{ type: 's', value: 'Bell' }] },
      { address: `/venu360/peqout/${inst}/band/${band}/freq`, args: [{ type: 'f', value: freqHz }] },
      { address: `/venu360/peqout/${inst}/band/${band}/gain`, args: [{ type: 'f', value: gainDb }] },
      { address: `/venu360/peqout/${inst}/band/${band}/q`, args: [{ type: 'f', value: q }] },
    ],
  }
}

function clearVenu360PeqEq(prefix: string, band: number): EqMessage {
  const inst = venu360ValidateOutput(prefix || '1')
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `/venu360/peqout/${inst}/band/${band}/gain`, args: [{ type: 'f', value: 0 }] },
    ],
  }
}

function buildVenu360Geq(prefix: string, bandIndex: number, gainDb: number): EqMessage {
  // VENU360 GEQ chains are 1-3 only. Reject invalid values instead of guessing.
  const trimmed = prefix.trim()
  if (!/^[1-3]$/.test(trimmed)) {
    throw new Error(`VENU360 GEQ chain must be 1-3, got '${prefix}'. Set the GEQ Prefix field to a valid chain number.`)
  }
  return {
    protocol: 'osc',
    oscMessages: [
      { address: `/venu360/geq/${trimmed}/band/${bandIndex + 1}`, args: [{ type: 'f', value: gainDb }] },
    ],
  }
}

// ═══ Generic OSC (uses X32 normalization as baseline) ═══

function buildGenericOscEq(prefix: string, band: number, freqHz: number, gainDb: number, q: number): EqMessage {
  return buildX32Eq(prefix, band, freqHz, gainDb, q)
}

// ═══ Profile Registry ═══

export const MIXER_PROFILES: Record<MixerModelId, MixerProfile> = {
  x32: {
    id: 'x32',
    label: 'Behringer X32 / X-Air',
    protocol: 'osc',
    defaultPort: 10023,
    peqBands: 6,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildX32Eq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearX32Eq(p.prefix, p.band),
    buildGeqMessage: (p) => ({
      protocol: 'osc' as const,
      oscMessages: [
        // X32 GEQ: /bus/01/eq/{band}/g or use same channel PEQ path with gain-only
        { address: `${p.prefix}/${p.bandIndex + 1}/g`, args: [{ type: 'f' as const, value: x32GainNorm(p.gainDb) }] },
      ],
    }),
  },
  midas_m32: {
    id: 'midas_m32',
    label: 'Midas M32 / Pro Series',
    protocol: 'osc',
    defaultPort: 10023,
    peqBands: 6,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildX32Eq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearX32Eq(p.prefix, p.band),
    buildGeqMessage: (p) => ({
      protocol: 'osc' as const,
      oscMessages: [
        { address: `${p.prefix}/${p.bandIndex + 1}/g`, args: [{ type: 'f' as const, value: x32GainNorm(p.gainDb) }] },
      ],
    }),
  },
  yamaha_tf: {
    id: 'yamaha_tf',
    label: 'Yamaha TF Series',
    protocol: 'osc',
    defaultPort: 49280,
    peqBands: 4,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildYamahaTfEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearYamahaTfEq(p.prefix, p.band),
  },
  yamaha_cl: {
    id: 'yamaha_cl',
    label: 'Yamaha CL / QL Series',
    protocol: 'osc',
    defaultPort: 49280,
    peqBands: 4,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildYamahaClEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearYamahaTfEq(p.prefix, p.band),
  },
  ah_dlive: {
    id: 'ah_dlive',
    label: 'Allen & Heath dLive',
    protocol: 'tcp',
    defaultPort: 51325,
    peqBands: 8,
    defaultOscPrefix: '1',
    buildEqMessage: (p) => buildAhEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearAhEq(p.prefix, p.band),
  },
  ah_sq: {
    id: 'ah_sq',
    label: 'Allen & Heath SQ',
    protocol: 'tcp',
    defaultPort: 51326,
    peqBands: 6,
    defaultOscPrefix: '1',
    buildEqMessage: (p) => buildAhEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearAhEq(p.prefix, p.band),
  },
  pa2: {
    id: 'pa2',
    label: 'dbx DriveRack PA2',
    protocol: 'tcp',
    defaultPort: 19272,
    peqBands: 8,
    defaultOscPrefix: 'High',
    buildEqMessage: (p) => buildPa2Eq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearPa2Eq(p.prefix, p.band),
  },
  venu360: {
    id: 'venu360',
    label: 'dbx DriveRack VENU360',
    protocol: 'osc',
    defaultPort: 9000,
    peqBands: 8,
    defaultOscPrefix: '1',
    buildEqMessage: (p) => buildVenu360PeqEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearVenu360PeqEq(p.prefix, p.band),
    buildGeqMessage: (p) => buildVenu360Geq(p.prefix, p.bandIndex, p.gainDb),
    requireGeqPrefix: true,
  },
  generic_osc: {
    id: 'generic_osc',
    label: 'Generic OSC',
    protocol: 'osc',
    defaultPort: 10023,
    peqBands: 6,
    defaultOscPrefix: '/ch/01/eq',
    buildEqMessage: (p) => buildGenericOscEq(p.prefix, p.band, p.freqHz, p.gainDb, p.q),
    buildClearMessage: (p) => clearX32Eq(p.prefix, p.band),
  },
}

/** Dropdown choices for Companion config */
export const MIXER_MODEL_CHOICES = Object.values(MIXER_PROFILES).map((p) => ({
  id: p.id,
  label: p.label,
}))

/** Look up a profile by ID, falling back to generic_osc */
export function getMixerProfile(id: string): MixerProfile {
  return MIXER_PROFILES[id as MixerModelId] ?? MIXER_PROFILES.generic_osc
}
