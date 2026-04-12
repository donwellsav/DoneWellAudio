import type { ModuleConfig } from './config.js';
/** Advisory payload from the relay */
export interface DwaAdvisory {
    id: string;
    peq: {
        type: string;
        hz: number;
        q: number;
        gainDb: number;
    };
    geq: {
        bandHz: number;
        bandIndex: number;
        suggestedDb: number;
    };
    severity: string;
    confidence: number;
}
/** A PEQ slot actively in use on the mixer */
export interface ActiveSlot {
    band: number;
    advisoryId: string;
    freqHz: number;
    gainDb: number;
    q: number;
    severity: string;
    timestamp: number;
}
/** A GEQ band write tracked for rollback on advisory dismiss/resolve */
export interface ActiveGeqWrite {
    advisoryId: string;
    prefix: string;
    bandIndex: number;
    gainDb: number;
    timestamp: number;
}
/** Result from clearByAdvisoryId() — per-output clear status */
export interface ClearResult {
    peqCleared: boolean;
    geqCleared: boolean;
    /** True if everything that was active got cleared */
    fullyCleared: boolean;
}
/** Result from applyWithMode() — distinguishes PEQ slot success from GEQ-only success */
export interface ApplyResult {
    peqSlot: ActiveSlot | null;
    geqApplied: boolean;
    /** Non-empty when one or both outputs failed */
    failReason: string | null;
}
export declare class MixerOutput {
    private udpSocket;
    private tcpSocket;
    private config;
    private log;
    private profile;
    /** Active PEQ slots on the mixer — keyed by band number */
    activeSlots: Map<number, ActiveSlot>;
    /** Last PEQ failure reason — set by applyAdvisory when it returns null */
    private lastPeqFailReason;
    /** Active GEQ writes on the mixer — keyed by advisory ID for rollback */
    activeGeqWrites: Map<string, ActiveGeqWrite>;
    /** Reference count per GEQ band — only zero hardware when count drops to 0 */
    private geqBandRefCount;
    /** Orphaned GEQ writes from failed relocation clears — retried on clearAll and clearByAdvisoryId */
    private orphanedGeqWrites;
    /** Session action log for export */
    sessionLog: Array<{
        action: string;
        freqHz: number;
        gainDb: number;
        q: number;
        band: number;
        timestamp: number;
    }>;
    constructor(config: ModuleConfig, log: (level: string, msg: string) => void);
    updateConfig(config: ModuleConfig): Promise<void>;
    disconnect(): void;
    /** Apply an advisory's PEQ to the mixer using smart slot management */
    applyAdvisory(advisory: DwaAdvisory): Promise<ActiveSlot | null>;
    /** Apply GEQ correction from advisory's GEQ recommendation. Returns true only if the command was actually sent. */
    applyGEQ(advisory: DwaAdvisory): Promise<boolean>;
    /** Apply advisory using configured output mode (PEQ, GEQ, or both) */
    applyWithMode(advisory: DwaAdvisory): Promise<ApplyResult>;
    /** Clear PEQ slot and/or GEQ write by advisory ID (when feedback resolves) */
    clearByAdvisoryId(advisoryId: string): Promise<ClearResult>;
    /** Clear a specific PEQ band on the mixer */
    clearSlot(band: number): Promise<boolean>;
    /** Clear all active PEQ slots and GEQ writes */
    clearAll(): Promise<void>;
    /** Get slot usage summary */
    getSlotSummary(): {
        used: number;
        total: number;
        slots: ActiveSlot[];
    };
    /**
     * Find a band number for this advisory.
     * 1. Check if this advisory already has a slot (update in place)
     * 2. Find an empty slot
     * 3. Replace the lowest-severity / oldest slot
     */
    private allocateSlot;
    private sendEqMessage;
    private sendOscMessages;
    private getUdpSocket;
    private sendTcpPayload;
    private getTcpSocket;
}
