import type { ModuleConfig } from './config.js';
/** Advisory payload from the relay */
interface DwaAdvisory {
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
}
export declare class MixerOutput {
    private udpSocket;
    private tcpSocket;
    private config;
    private log;
    constructor(config: ModuleConfig, log: (level: string, msg: string) => void);
    updateConfig(config: ModuleConfig): void;
    disconnect(): void;
    /** Apply an advisory's EQ to the mixer */
    applyAdvisory(advisory: DwaAdvisory): Promise<void>;
    private sendOsc;
    private getUdpSocket;
    private sendTcp;
    private getTcpSocket;
}
export {};
