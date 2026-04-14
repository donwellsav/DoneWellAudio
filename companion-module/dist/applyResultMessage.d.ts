interface AdvisoryApplyShape {
    id: string;
    peq: {
        hz: number;
        gainDb: number;
    };
    geq: {
        bandIndex: number;
        bandHz: number;
        suggestedDb: number;
    };
}
interface ApplyResultShape {
    peqSlot: {
        band: number;
    } | null;
    geqApplied: boolean;
    failReason: string | null;
}
type OutputMode = 'peq' | 'geq' | 'both';
export type ApplyResultMessage = {
    type: 'applied';
    advisoryId: string;
    bandIndex: number;
    appliedGainDb: number;
    maxCutDb?: number;
    frequencyHz: number;
    slotIndex?: number;
    timestamp: number;
} | {
    type: 'partial_apply';
    advisoryId: string;
    peqApplied: boolean;
    geqApplied: boolean;
    bandIndex?: number;
    appliedGainDb?: number;
    maxCutDb?: number;
    frequencyHz?: number;
    slotIndex?: number;
    failReason: string;
    timestamp: number;
} | {
    type: 'apply_failed';
    advisoryId: string;
    reason: string;
    timestamp: number;
};
export declare function reconcilePendingAdvisoriesAfterApply<T extends {
    id: string;
}>(pendingAdvisories: readonly T[], message: ApplyResultMessage): T[];
export declare function reconcilePendingAdvisoriesAfterClear<T extends {
    id: string;
}>(pendingAdvisories: readonly T[], advisoryId: string, fullyCleared: boolean): T[];
export declare function buildApplyResultMessage(args: {
    advisory: AdvisoryApplyShape;
    result: ApplyResultShape;
    outputMode: OutputMode;
    maxCutDb: number;
    timestamp: number;
}): ApplyResultMessage;
export {};
