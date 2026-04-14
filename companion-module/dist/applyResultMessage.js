export function reconcilePendingAdvisoriesAfterApply(pendingAdvisories, message) {
    if (message.type !== 'applied') {
        return [...pendingAdvisories];
    }
    return pendingAdvisories.filter((advisory) => advisory.id !== message.advisoryId);
}
export function reconcilePendingAdvisoriesAfterClear(pendingAdvisories, advisoryId, fullyCleared) {
    if (!fullyCleared) {
        return [...pendingAdvisories];
    }
    return pendingAdvisories.filter((advisory) => advisory.id !== advisoryId);
}
export function buildApplyResultMessage(args) {
    const { advisory, result, outputMode, maxCutDb, timestamp } = args;
    const anythingSucceeded = result.peqSlot !== null || result.geqApplied;
    const everythingSucceeded = !result.failReason;
    if (anythingSucceeded && everythingSucceeded) {
        return {
            type: 'applied',
            advisoryId: advisory.id,
            bandIndex: advisory.geq.bandIndex,
            appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
            maxCutDb,
            frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
            ...(result.peqSlot ? { slotIndex: result.peqSlot.band } : {}),
            timestamp,
        };
    }
    if (anythingSucceeded && outputMode === 'both') {
        return {
            type: 'partial_apply',
            advisoryId: advisory.id,
            peqApplied: result.peqSlot !== null,
            geqApplied: result.geqApplied,
            bandIndex: advisory.geq.bandIndex,
            appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
            maxCutDb,
            frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
            ...(result.peqSlot ? { slotIndex: result.peqSlot.band } : {}),
            failReason: result.failReason ?? 'Apply partially failed',
            timestamp,
        };
    }
    if (anythingSucceeded) {
        return {
            type: 'applied',
            advisoryId: advisory.id,
            bandIndex: advisory.geq.bandIndex,
            appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
            maxCutDb,
            frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
            ...(result.peqSlot ? { slotIndex: result.peqSlot.band } : {}),
            timestamp,
        };
    }
    return {
        type: 'apply_failed',
        advisoryId: advisory.id,
        reason: result.failReason || 'Apply failed',
        timestamp,
    };
}
//# sourceMappingURL=applyResultMessage.js.map