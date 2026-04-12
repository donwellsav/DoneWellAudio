import { InstanceBase } from '@companion-module/base';
import type { ModuleConfig } from './config.js';
/** Advisory payload received from the cloud relay */
interface DwaAdvisory {
    /** Optional type marker — 'auto_apply' = apply immediately regardless of config */
    type?: 'auto_apply';
    id: string;
    trueFrequencyHz: number;
    severity: string;
    confidence: number;
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
    pitch: {
        note: string;
        octave: number;
        cents: number;
        midi: number;
    };
}
/** Messages sent from module back to DWA via POST ?direction=app */
type ModuleToAppMessage = {
    type: 'ack';
    advisoryId: string;
    timestamp: number;
} | {
    type: 'applied';
    advisoryId: string;
    bandIndex: number;
    appliedGainDb: number;
    frequencyHz: number;
    slotIndex: number;
    timestamp: number;
} | {
    type: 'apply_failed';
    advisoryId: string;
    reason: string;
    timestamp: number;
} | {
    type: 'partial_apply';
    advisoryId: string;
    peqApplied: boolean;
    geqApplied: boolean;
    failReason: string;
    timestamp: number;
} | {
    type: 'cleared';
    advisoryId: string;
    slotIndex: number;
    timestamp: number;
} | {
    type: 'command';
    action: string;
    timestamp: number;
};
export declare class ModuleInstance extends InstanceBase<ModuleConfig> {
    config: ModuleConfig;
    pendingAdvisories: DwaAdvisory[];
    private pollTimer;
    private mixerOutput;
    init(config: ModuleConfig): Promise<void>;
    configUpdated(config: ModuleConfig): Promise<void>;
    destroy(): Promise<void>;
    getConfigFields(): import("@companion-module/base").SomeCompanionConfigField[];
    /** Build the relay URL with the app-direction query parameter. */
    private relayUrlForApp;
    /** POST a message to the toApp queue so DWA can pick it up on its next poll. */
    sendToApp(message: ModuleToAppMessage): Promise<void>;
    private startPolling;
    private stopPolling;
    private processAdvisory;
    acknowledgeLatest(): void;
    acknowledgeAll(): void;
    applyLatest(): void;
    clearAll(): void;
    private refreshState;
    private resetVariables;
}
export {};
