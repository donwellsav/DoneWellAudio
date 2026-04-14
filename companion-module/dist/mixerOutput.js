import * as dgram from 'node:dgram';
import * as net from 'node:net';
import { getMixerProfile } from './mixerProfiles.js';
/**
 * Encode an OSC message (minimal implementation — no external deps).
 * OSC spec: address (string) + type tag (string) + arguments.
 */
function oscString(str) {
    const buf = Buffer.from(str + '\0');
    const pad = 4 - (buf.length % 4);
    return pad < 4 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
}
function oscFloat(val) {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(val, 0);
    return buf;
}
function oscMessage(address, args) {
    const addrBuf = oscString(address);
    const typeTags = ',' + args.map((a) => a.type).join('');
    const tagBuf = oscString(typeTags);
    const argBufs = args.map((a) => a.type === 's' ? oscString(a.value) : oscFloat(a.value));
    return Buffer.concat([addrBuf, tagBuf, ...argBufs]);
}
/** Severity priority for slot replacement (higher = harder to replace) */
const SEVERITY_PRIORITY = {
    RUNAWAY: 5,
    GROWING: 4,
    WHISTLE: 3,
    RESONANCE: 2,
    POSSIBLE_RING: 1,
    INSTRUMENT: 0,
};
export class MixerOutput {
    udpSocket = null;
    tcpSocket = null;
    config;
    log;
    profile;
    /** Active PEQ slots on the mixer — keyed by band number */
    activeSlots = new Map();
    /** Last PEQ failure reason — set by applyAdvisory when it returns null */
    lastPeqFailReason = null;
    /** Active GEQ writes on the mixer — keyed by advisory ID for rollback */
    activeGeqWrites = new Map();
    /** Reference count per GEQ band — only zero hardware when count drops to 0 */
    geqBandRefCount = new Map();
    /** Orphaned GEQ writes from failed relocation clears — retried on clearAll and clearByAdvisoryId */
    orphanedGeqWrites = [];
    /** Session action log for export */
    sessionLog = [];
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.profile = getMixerProfile(config.mixerModel);
    }
    async updateConfig(config) {
        // Drain all active state on the current profile/target before swapping
        if (this.activeSlots.size > 0 || this.activeGeqWrites.size > 0) {
            await this.clearAll();
            // Log if anything couldn't be cleared (orphaned GEQ entries survive)
            if (this.activeGeqWrites.size > 0) {
                this.log('warn', `${this.activeGeqWrites.size} GEQ write(s) could not be cleared before config change`);
            }
        }
        this.config = config;
        this.profile = getMixerProfile(config.mixerModel);
        this.disconnect();
    }
    disconnect() {
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
        if (this.tcpSocket) {
            this.tcpSocket.destroy();
            this.tcpSocket = null;
        }
    }
    /** Apply an advisory's PEQ to the mixer using smart slot management */
    async applyAdvisory(advisory) {
        this.lastPeqFailReason = null;
        if (this.config.mixerModel === 'none') {
            this.lastPeqFailReason = 'No mixer model configured';
            return null;
        }
        if (!this.config.mixerHost) {
            this.lastPeqFailReason = 'No mixer host configured';
            return null;
        }
        const gainClamped = Math.max(advisory.peq.gainDb, this.config.maxCutDb);
        // Find a slot for this advisory
        const band = this.allocateSlot(advisory);
        if (band === null) {
            this.lastPeqFailReason = `No PEQ slot available (all ${this.config.peqBandCount} in use)`;
            this.log('warn', `${this.lastPeqFailReason} for ${Math.round(advisory.peq.hz)}Hz`);
            return null;
        }
        // Build and send EQ message using the mixer profile
        let msg;
        try {
            msg = this.profile.buildEqMessage({
                prefix: this.config.oscPrefix || this.profile.defaultOscPrefix,
                band,
                freqHz: advisory.peq.hz,
                gainDb: gainClamped,
                q: advisory.peq.q,
            });
        }
        catch (err) {
            this.lastPeqFailReason = err instanceof Error ? err.message : 'PEQ build failed';
            this.log('error', this.lastPeqFailReason);
            return null;
        }
        await this.sendEqMessage(msg);
        // Track the slot
        const slot = {
            band,
            advisoryId: advisory.id,
            freqHz: advisory.peq.hz,
            gainDb: gainClamped,
            q: advisory.peq.q,
            severity: advisory.severity,
            timestamp: Date.now(),
        };
        this.activeSlots.set(band, slot);
        // Log for session export
        this.sessionLog.push({
            action: 'apply',
            freqHz: advisory.peq.hz,
            gainDb: gainClamped,
            q: advisory.peq.q,
            band,
            timestamp: Date.now(),
        });
        this.log('info', `Slot ${band}: ${Math.round(advisory.peq.hz)}Hz ${gainClamped}dB Q=${advisory.peq.q} (${advisory.severity})`);
        return slot;
    }
    /** Apply GEQ correction from advisory's GEQ recommendation. Returns true only if the command was actually sent. */
    async applyGEQ(advisory) {
        if (!this.config.mixerHost)
            return false;
        if (!this.profile.buildGeqMessage) {
            this.log('warn', `${this.profile.label} does not support GEQ output`);
            return false;
        }
        const gainClamped = Math.max(advisory.geq.suggestedDb, this.config.maxCutDb);
        // Profiles with requireGeqPrefix (e.g. VENU360) need an explicit GEQ prefix —
        // do not fall back to oscPrefix because the address spaces differ.
        if (this.profile.requireGeqPrefix && !this.config.geqPrefix) {
            this.log('error', `${this.profile.label} requires an explicit GEQ Prefix (set in module config)`);
            return false;
        }
        const geqPrefix = this.config.geqPrefix || this.config.oscPrefix || this.profile.defaultOscPrefix;
        let msg;
        try {
            msg = this.profile.buildGeqMessage({
                prefix: geqPrefix,
                bandIndex: advisory.geq.bandIndex,
                gainDb: gainClamped,
            });
        }
        catch (err) {
            this.log('error', err instanceof Error ? err.message : 'GEQ build failed');
            return false;
        }
        await this.sendEqMessage(msg);
        // If this advisory previously wrote a different GEQ band/prefix, handle relocation
        const prev = this.activeGeqWrites.get(advisory.id);
        if (prev && (prev.bandIndex !== advisory.geq.bandIndex || prev.prefix !== geqPrefix)) {
            const oldKey = `${prev.prefix}:${prev.bandIndex}`;
            const oldCount = (this.geqBandRefCount.get(oldKey) ?? 1) - 1;
            if (oldCount <= 0) {
                // Last advisory on this band — zero the hardware
                this.geqBandRefCount.delete(oldKey);
                try {
                    const clearMsg = this.profile.buildGeqMessage({
                        prefix: prev.prefix,
                        bandIndex: prev.bandIndex,
                        gainDb: 0,
                    });
                    await this.sendEqMessage(clearMsg);
                    this.log('info', `Cleared relocated GEQ band ${prev.bandIndex} (advisory ${advisory.id} moved to band ${advisory.geq.bandIndex})`);
                }
                catch {
                    // Old band clear failed — retain as orphan for retry via clearByAdvisoryId or clearAll
                    this.orphanedGeqWrites.push(prev);
                    this.log('warn', `Failed to clear old GEQ band ${prev.bandIndex} — retained as orphan for retry`);
                }
            }
            else {
                // Other advisories still targeting this band — just decrement
                this.geqBandRefCount.set(oldKey, oldCount);
                this.log('info', `Decremented ref on GEQ band ${prev.bandIndex} (${oldCount} remaining)`);
            }
        }
        // Increment ref count for the new band
        const newKey = `${geqPrefix}:${advisory.geq.bandIndex}`;
        if (!prev || prev.bandIndex !== advisory.geq.bandIndex || prev.prefix !== geqPrefix) {
            this.geqBandRefCount.set(newKey, (this.geqBandRefCount.get(newKey) ?? 0) + 1);
        }
        // Track for rollback on advisory dismiss/resolve
        this.activeGeqWrites.set(advisory.id, {
            advisoryId: advisory.id,
            prefix: geqPrefix,
            bandIndex: advisory.geq.bandIndex,
            gainDb: gainClamped,
            timestamp: Date.now(),
        });
        this.sessionLog.push({
            action: 'geq',
            freqHz: advisory.geq.bandHz,
            gainDb: gainClamped,
            q: 0,
            band: advisory.geq.bandIndex,
            timestamp: Date.now(),
        });
        this.log('info', `GEQ band ${advisory.geq.bandIndex} (${advisory.geq.bandHz}Hz) → ${gainClamped}dB`);
        return true;
    }
    /** Apply advisory using configured output mode (PEQ, GEQ, or both) */
    async applyWithMode(advisory) {
        const mode = this.config.outputMode || 'peq';
        let peqSlot = null;
        let geqApplied = false;
        const failures = [];
        if (mode === 'peq' || mode === 'both') {
            peqSlot = await this.applyAdvisory(advisory);
            if (!peqSlot)
                failures.push(this.lastPeqFailReason || 'PEQ apply failed');
        }
        if (mode === 'geq' || mode === 'both') {
            geqApplied = await this.applyGEQ(advisory);
            if (!geqApplied)
                failures.push('GEQ apply failed (check mixer host, model, and GEQ prefix)');
        }
        const failReason = failures.length > 0 ? failures.join('; ') : null;
        return { peqSlot, geqApplied, failReason };
    }
    /** Clear PEQ slot and/or GEQ write by advisory ID (when feedback resolves) */
    async clearByAdvisoryId(advisoryId) {
        let peqCleared = false;
        let geqCleared = false;
        let hadPeq = false;
        let hadGeq = false;
        const hadOrphanedGeq = this.orphanedGeqWrites.some((orphan) => orphan.advisoryId === advisoryId);
        let orphanedGeqCleared = !hadOrphanedGeq;
        // Clear PEQ slot
        for (const [band, slot] of this.activeSlots) {
            if (slot.advisoryId === advisoryId) {
                hadPeq = true;
                peqCleared = await this.clearSlot(band);
                break;
            }
        }
        // Revert GEQ write — only zero hardware when this is the last advisory on the band
        const geqWrite = this.activeGeqWrites.get(advisoryId);
        if (geqWrite && this.profile.buildGeqMessage) {
            hadGeq = true;
            const bandKey = `${geqWrite.prefix}:${geqWrite.bandIndex}`;
            const refCount = (this.geqBandRefCount.get(bandKey) ?? 1) - 1;
            if (refCount <= 0) {
                // Last advisory on this band — zero the hardware
                this.geqBandRefCount.delete(bandKey);
                try {
                    const msg = this.profile.buildGeqMessage({
                        prefix: geqWrite.prefix,
                        bandIndex: geqWrite.bandIndex,
                        gainDb: 0,
                    });
                    await this.sendEqMessage(msg);
                    this.activeGeqWrites.delete(advisoryId);
                    this.sessionLog.push({
                        action: 'geq_clear',
                        freqHz: 0,
                        gainDb: 0,
                        q: 0,
                        band: geqWrite.bandIndex,
                        timestamp: Date.now(),
                    });
                    this.log('info', `Cleared GEQ band ${geqWrite.bandIndex} (advisory ${advisoryId}, last ref)`);
                    geqCleared = true;
                }
                catch {
                    this.log('warn', `Failed to clear GEQ band ${geqWrite.bandIndex} for advisory ${advisoryId}`);
                    // Restore ref count since clear failed
                    this.geqBandRefCount.set(bandKey, 1);
                }
            }
            else {
                // Other advisories still need this band — just remove our tracking entry
                this.geqBandRefCount.set(bandKey, refCount);
                this.activeGeqWrites.delete(advisoryId);
                this.log('info', `Released GEQ band ${geqWrite.bandIndex} ref (advisory ${advisoryId}, ${refCount} remaining)`);
                geqCleared = true;
            }
        }
        // Also attempt to clear any orphaned GEQ writes from failed relocations for this advisory
        const remainingOrphans = [];
        for (const orphan of this.orphanedGeqWrites) {
            if (orphan.advisoryId === advisoryId && this.profile.buildGeqMessage) {
                try {
                    const msg = this.profile.buildGeqMessage({
                        prefix: orphan.prefix,
                        bandIndex: orphan.bandIndex,
                        gainDb: 0,
                    });
                    await this.sendEqMessage(msg);
                    this.log('info', `Cleared orphaned GEQ band ${orphan.bandIndex} (advisory ${advisoryId})`);
                }
                catch {
                    orphanedGeqCleared = false;
                    remainingOrphans.push(orphan);
                }
            }
            else {
                remainingOrphans.push(orphan);
            }
        }
        this.orphanedGeqWrites = remainingOrphans;
        const hadAnyGeqState = hadGeq || hadOrphanedGeq;
        geqCleared = hadAnyGeqState && (!hadGeq || geqCleared) && orphanedGeqCleared;
        const fullyCleared = (!hadPeq || peqCleared) && (!hadAnyGeqState || geqCleared);
        return { peqCleared, geqCleared, fullyCleared };
    }
    /** Clear a specific PEQ band on the mixer */
    async clearSlot(band) {
        const msg = this.profile.buildClearMessage({
            prefix: this.config.oscPrefix || this.profile.defaultOscPrefix,
            band,
        });
        try {
            await this.sendEqMessage(msg);
            const slot = this.activeSlots.get(band);
            this.activeSlots.delete(band);
            if (slot) {
                this.sessionLog.push({
                    action: 'clear',
                    freqHz: slot.freqHz,
                    gainDb: 0,
                    q: 0,
                    band,
                    timestamp: Date.now(),
                });
                this.log('info', `Cleared slot ${band} (was ${Math.round(slot.freqHz)}Hz)`);
            }
            return true;
        }
        catch {
            return false;
        }
    }
    /** Clear all active PEQ slots and GEQ writes */
    async clearAll() {
        for (const band of [...this.activeSlots.keys()]) {
            await this.clearSlot(band);
        }
        if (!this.profile.buildGeqMessage) {
            this.activeGeqWrites.clear();
            this.geqBandRefCount.clear();
            this.orphanedGeqWrites = [];
            return;
        }
        const clearedBands = new Set();
        const failedBands = new Set();
        const groupedActiveWrites = new Map();
        for (const geqWrite of this.activeGeqWrites.values()) {
            const bandKey = `${geqWrite.prefix}:${geqWrite.bandIndex}`;
            const existing = groupedActiveWrites.get(bandKey);
            if (existing) {
                existing.push(geqWrite);
            }
            else {
                groupedActiveWrites.set(bandKey, [geqWrite]);
            }
        }
        const remainingActiveGeqWrites = new Map();
        for (const [bandKey, writes] of groupedActiveWrites) {
            const [prefix, bandIndexValue] = bandKey.split(':');
            const bandIndex = Number(bandIndexValue);
            try {
                const msg = this.profile.buildGeqMessage({
                    prefix,
                    bandIndex,
                    gainDb: 0,
                });
                await this.sendEqMessage(msg);
                clearedBands.add(bandKey);
            }
            catch {
                failedBands.add(bandKey);
                this.log('warn', `Failed to clear GEQ band ${bandIndex} - entries retained for retry`);
                for (const geqWrite of writes) {
                    remainingActiveGeqWrites.set(geqWrite.advisoryId, geqWrite);
                }
            }
        }
        this.activeGeqWrites = remainingActiveGeqWrites;
        const nextGeqBandRefCount = new Map();
        for (const geqWrite of this.activeGeqWrites.values()) {
            const bandKey = `${geqWrite.prefix}:${geqWrite.bandIndex}`;
            nextGeqBandRefCount.set(bandKey, (nextGeqBandRefCount.get(bandKey) ?? 0) + 1);
        }
        this.geqBandRefCount = nextGeqBandRefCount;
        const groupedOrphans = new Map();
        for (const orphan of this.orphanedGeqWrites) {
            const bandKey = `${orphan.prefix}:${orphan.bandIndex}`;
            const existing = groupedOrphans.get(bandKey);
            if (existing) {
                existing.push(orphan);
            }
            else {
                groupedOrphans.set(bandKey, [orphan]);
            }
        }
        const remainingOrphans = [];
        for (const [bandKey, orphans] of groupedOrphans) {
            if (failedBands.has(bandKey)) {
                remainingOrphans.push(...orphans);
                continue;
            }
            if (clearedBands.has(bandKey)) {
                continue;
            }
            const [prefix, bandIndexValue] = bandKey.split(':');
            const bandIndex = Number(bandIndexValue);
            try {
                const msg = this.profile.buildGeqMessage({
                    prefix,
                    bandIndex,
                    gainDb: 0,
                });
                await this.sendEqMessage(msg);
            }
            catch {
                remainingOrphans.push(...orphans);
            }
        }
        this.orphanedGeqWrites = remainingOrphans;
    }
    /** Get slot usage summary */
    getSlotSummary() {
        return {
            used: this.activeSlots.size,
            total: this.config.peqBandCount,
            slots: [...this.activeSlots.values()],
        };
    }
    /** Get all advisory IDs that still own mixer-managed state. */
    getTrackedAdvisoryIds() {
        const advisoryIds = new Set();
        for (const slot of this.activeSlots.values()) {
            advisoryIds.add(slot.advisoryId);
        }
        for (const geqWrite of this.activeGeqWrites.values()) {
            advisoryIds.add(geqWrite.advisoryId);
        }
        for (const orphan of this.orphanedGeqWrites) {
            advisoryIds.add(orphan.advisoryId);
        }
        return [...advisoryIds];
    }
    // ── Slot Allocation ─────────────────────────────────────────
    /**
     * Find a band number for this advisory.
     * 1. Check if this advisory already has a slot (update in place)
     * 2. Find an empty slot
     * 3. Replace the lowest-severity / oldest slot
     */
    allocateSlot(advisory) {
        const start = this.config.peqBandStart || 1;
        const count = this.config.peqBandCount || this.profile.peqBands;
        const end = start + count - 1;
        // Already has a slot? Update in place.
        for (const [band, slot] of this.activeSlots) {
            if (slot.advisoryId === advisory.id)
                return band;
        }
        // Check for nearby frequency (within 1/3 octave) — reuse that slot
        for (const [band, slot] of this.activeSlots) {
            const ratio = Math.max(slot.freqHz, advisory.peq.hz) / Math.min(slot.freqHz, advisory.peq.hz);
            if (ratio <= 1.26)
                return band; // 2^(1/3) ≈ 1.26
        }
        // Find empty slot
        for (let b = start; b <= end; b++) {
            if (!this.activeSlots.has(b))
                return b;
        }
        // All full — replace lowest-severity, then oldest
        let weakest = null;
        for (const [band, slot] of this.activeSlots) {
            if (band < start || band > end)
                continue;
            const priority = SEVERITY_PRIORITY[slot.severity] ?? 0;
            if (!weakest || priority < weakest.priority || (priority === weakest.priority && slot.timestamp < weakest.timestamp)) {
                weakest = { band, priority, timestamp: slot.timestamp };
            }
        }
        if (weakest) {
            const incomingPriority = SEVERITY_PRIORITY[advisory.severity] ?? 0;
            // Only replace if incoming is more severe
            if (incomingPriority > weakest.priority) {
                return weakest.band;
            }
        }
        return null;
    }
    // ── Message Sending ─────────────────────────────────────────
    async sendEqMessage(msg) {
        if (msg.protocol === 'osc' && msg.oscMessages) {
            await this.sendOscMessages(msg.oscMessages);
        }
        else if (msg.protocol === 'tcp' && msg.tcpPayload) {
            await this.sendTcpPayload(msg.tcpPayload);
        }
    }
    async sendOscMessages(messages) {
        if (!this.config.mixerHost)
            return;
        const socket = this.getUdpSocket();
        const port = this.config.mixerPort || this.profile.defaultPort;
        for (const msg of messages) {
            const buf = oscMessage(msg.address, [...msg.args]);
            await new Promise((resolve, reject) => {
                socket.send(buf, port, this.config.mixerHost, (err) => {
                    if (err) {
                        this.log('error', `OSC send error: ${err.message}`);
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
    }
    getUdpSocket() {
        if (!this.udpSocket) {
            this.udpSocket = dgram.createSocket('udp4');
        }
        return this.udpSocket;
    }
    async sendTcpPayload(payload) {
        if (!this.config.mixerHost)
            return;
        try {
            const socket = await this.getTcpSocket();
            socket.write(payload);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'TCP error';
            this.log('error', `TCP send error: ${msg}`);
            throw err;
        }
    }
    getTcpSocket() {
        return new Promise((resolve, reject) => {
            if (this.tcpSocket && !this.tcpSocket.destroyed) {
                resolve(this.tcpSocket);
                return;
            }
            const port = this.config.mixerPort || this.profile.defaultPort;
            const socket = net.createConnection({ host: this.config.mixerHost, port, timeout: 3000 }, () => {
                this.tcpSocket = socket;
                resolve(socket);
            });
            socket.on('error', (err) => {
                this.log('error', `TCP connection error: ${err.message}`);
                reject(err);
            });
            socket.on('close', () => {
                this.tcpSocket = null;
            });
        });
    }
}
//# sourceMappingURL=mixerOutput.js.map