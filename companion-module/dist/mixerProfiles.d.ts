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
export type MixerModelId = 'x32' | 'midas_m32' | 'yamaha_tf' | 'yamaha_cl' | 'ah_dlive' | 'ah_sq' | 'pa2' | 'generic_osc' | 'venu360';
export interface EqMessage {
    /** For OSC: address + args pairs. For TCP: raw string payloads. */
    readonly protocol: 'osc' | 'tcp';
    readonly oscMessages?: readonly OscMsg[];
    readonly tcpPayload?: string;
}
export type OscArg = {
    type: 'f';
    value: number;
} | {
    type: 's';
    value: string;
};
export interface OscMsg {
    readonly address: string;
    readonly args: readonly OscArg[];
}
export interface MixerProfile {
    readonly id: MixerModelId;
    readonly label: string;
    readonly protocol: 'osc' | 'tcp';
    readonly defaultPort: number;
    /** Number of PEQ bands available for notch filters */
    readonly peqBands: number;
    /** Default OSC channel prefix (user can override) */
    readonly defaultOscPrefix: string;
    /** Build EQ messages to set a PEQ notch filter */
    buildEqMessage(params: {
        prefix: string;
        band: number;
        freqHz: number;
        gainDb: number;
        q: number;
    }): EqMessage;
    /** Build message to clear/zero a PEQ band */
    buildClearMessage(params: {
        prefix: string;
        band: number;
    }): EqMessage;
    /** Build GEQ band adjustment (bandIndex 0-30, gainDb) */
    buildGeqMessage?(params: {
        prefix: string;
        bandIndex: number;
        gainDb: number;
    }): EqMessage;
    /** When true, GEQ requires an explicit geqPrefix — do not fall back to oscPrefix */
    requireGeqPrefix?: boolean;
}
export declare const MIXER_PROFILES: Record<MixerModelId, MixerProfile>;
/** Dropdown choices for Companion config */
export declare const MIXER_MODEL_CHOICES: {
    id: MixerModelId;
    label: string;
}[];
/** Look up a profile by ID, falling back to generic_osc */
export declare function getMixerProfile(id: string): MixerProfile;
