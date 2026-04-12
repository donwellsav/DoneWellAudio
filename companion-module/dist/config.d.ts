import type { SomeCompanionConfigField } from '@companion-module/base';
import type { MixerModelId } from './mixerProfiles.js';
export interface ModuleConfig {
    siteUrl: string;
    pairingCode: string;
    pollIntervalMs: number;
    mixerModel: MixerModelId;
    outputProtocol: 'none' | 'osc' | 'tcp';
    mixerHost: string;
    mixerPort: number;
    oscPrefix: string;
    geqPrefix: string;
    autoApply: boolean;
    maxCutDb: number;
    peqBandCount: number;
    peqBandStart: number;
    outputMode: 'peq' | 'geq' | 'both';
}
export declare function GetConfigFields(): SomeCompanionConfigField[];
