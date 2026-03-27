import type { SomeCompanionConfigField } from '@companion-module/base';
export interface ModuleConfig {
    siteUrl: string;
    pairingCode: string;
    pollIntervalMs: number;
    outputProtocol: 'none' | 'osc' | 'tcp';
    mixerHost: string;
    mixerPort: number;
    oscPrefix: string;
    oscEqBandParam: number;
    autoApply: boolean;
    maxCutDb: number;
}
export declare function GetConfigFields(): SomeCompanionConfigField[];
