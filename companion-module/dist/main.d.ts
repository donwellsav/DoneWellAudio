import { InstanceBase } from '@companion-module/base';
import type { ModuleConfig } from './config.js';
/** Advisory payload received from the cloud relay */
interface DwaAdvisory {
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
export declare class ModuleInstance extends InstanceBase<ModuleConfig> {
    config: ModuleConfig;
    pendingAdvisories: DwaAdvisory[];
    private pollTimer;
    private mixerOutput;
    init(config: ModuleConfig): Promise<void>;
    configUpdated(config: ModuleConfig): Promise<void>;
    destroy(): Promise<void>;
    getConfigFields(): SomeCompanionConfigField[];
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
