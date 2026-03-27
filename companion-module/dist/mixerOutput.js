import * as dgram from 'node:dgram';
import * as net from 'node:net';
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
    const argBufs = args.map((a) => oscFloat(a.value));
    return Buffer.concat([addrBuf, tagBuf, ...argBufs]);
}
export class MixerOutput {
    udpSocket = null;
    tcpSocket = null;
    config;
    log;
    constructor(config, log) {
        this.config = config;
        this.log = log;
    }
    updateConfig(config) {
        this.config = config;
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
    /** Apply an advisory's EQ to the mixer */
    async applyAdvisory(advisory) {
        if (this.config.outputProtocol === 'osc') {
            await this.sendOsc(advisory);
        }
        else if (this.config.outputProtocol === 'tcp') {
            await this.sendTcp(advisory);
        }
    }
    // ── OSC Output (X32, Yamaha, Allen & Heath, etc.) ────────────
    async sendOsc(advisory) {
        if (!this.config.mixerHost)
            return;
        const prefix = this.config.oscPrefix || '/ch/01/eq';
        const band = this.config.oscEqBandParam || 1;
        // X32/M32 OSC convention:
        //   /ch/01/eq/{band}/f  — frequency (20-20000 mapped to 0.0-1.0 log scale)
        //   /ch/01/eq/{band}/g  — gain (-15 to +15 mapped to 0.0-1.0)
        //   /ch/01/eq/{band}/q  — Q factor (0.3-10 mapped to 0.0-1.0 log scale)
        //   /ch/01/eq/{band}/type — filter type (0-5)
        // Convert frequency to X32 normalized value (log scale 20-20000)
        const freqNorm = Math.log(advisory.peq.hz / 20) / Math.log(20000 / 20);
        const freqClamped = Math.max(0, Math.min(1, freqNorm));
        // Convert gain to normalized (-15 to +15 → 0 to 1)
        const gainClamped = Math.max(advisory.peq.gainDb, this.config.maxCutDb);
        const gainNorm = (gainClamped + 15) / 30;
        // Convert Q to normalized (log scale 10-0.3 → 0-1)
        const qClamped = Math.max(0.3, Math.min(10, advisory.peq.q));
        const qNorm = 1 - (Math.log(qClamped / 0.3) / Math.log(10 / 0.3));
        const messages = [
            oscMessage(`${prefix}/${band}/f`, [{ type: 'f', value: freqClamped }]),
            oscMessage(`${prefix}/${band}/g`, [{ type: 'f', value: gainNorm }]),
            oscMessage(`${prefix}/${band}/q`, [{ type: 'f', value: qNorm }]),
        ];
        const socket = this.getUdpSocket();
        for (const msg of messages) {
            await new Promise((resolve, reject) => {
                socket.send(msg, this.config.mixerPort, this.config.mixerHost, (err) => {
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
        this.log('info', `OSC → ${this.config.mixerHost}:${this.config.mixerPort} ${prefix}/${band} f=${advisory.peq.hz}Hz g=${gainClamped}dB Q=${advisory.peq.q}`);
    }
    getUdpSocket() {
        if (!this.udpSocket) {
            this.udpSocket = dgram.createSocket('udp4');
        }
        return this.udpSocket;
    }
    // ── TCP Output (dbx PA2, generic devices) ────────────────────
    async sendTcp(advisory) {
        if (!this.config.mixerHost)
            return;
        const gainClamped = Math.max(advisory.peq.gainDb, this.config.maxCutDb);
        // Generic TCP: send a JSON line (device-specific parsing on the other end)
        const payload = JSON.stringify({
            command: 'set_peq',
            frequency: advisory.peq.hz,
            gain: gainClamped,
            q: advisory.peq.q,
            type: advisory.peq.type,
        }) + '\n';
        try {
            const socket = await this.getTcpSocket();
            socket.write(payload);
            this.log('info', `TCP → ${this.config.mixerHost}:${this.config.mixerPort} PEQ ${advisory.peq.hz}Hz ${gainClamped}dB Q=${advisory.peq.q}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'TCP error';
            this.log('error', `TCP send error: ${msg}`);
        }
    }
    getTcpSocket() {
        return new Promise((resolve, reject) => {
            if (this.tcpSocket && !this.tcpSocket.destroyed) {
                resolve(this.tcpSocket);
                return;
            }
            const socket = net.createConnection({ host: this.config.mixerHost, port: this.config.mixerPort, timeout: 3000 }, () => {
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