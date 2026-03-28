const { InstanceBase, Regex, runEntrypoint, InstanceStatus, TCPHelper } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')
const UpdatePresetDefinitions = require('./presets')
const { GEQ_BANDS, GEQ_LABELS_TO_NUM, buildCommand, parseResponse } = require('./pa2-protocol')

const PA2_PORT = 19272
const DSP_PORT = 19274
const HANDSHAKE_TIMEOUT_MS = 10000
const METER_POLL_INTERVAL_MS = 200  // 5 Hz meter refresh

// Mute output → formatted variable key mapping
const MUTE_FMT_MAP = {
	HighLeft: 'high_l', HighRight: 'high_r',
	MidLeft: 'mid_l', MidRight: 'mid_r',
	LowLeft: 'low_l', LowRight: 'low_r',
}

// GEQ band → short label for formatted variables
const GEQ_SHORT_FMT = {
	1: '20', 2: '25', 3: '31', 4: '40', 5: '50', 6: '63', 7: '80', 8: '100',
	9: '125', 10: '160', 11: '200', 12: '250', 13: '315', 14: '400', 15: '500',
	16: '630', 17: '800', 18: '1k', 19: '1.2k', 20: '1.6k', 21: '2k', 22: '2.5k',
	23: '3.1k', 24: '4k', 25: '5k', 26: '6.3k', 27: '8k', 28: '10k', 29: '12k',
	30: '16k', 31: '20k',
}

class PA2Instance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config
		this.pa2State = this._defaultState()

		// TCP line buffering — data arrives as raw Buffer chunks, not lines
		this.tcpBuffer = ''

		// Connection state machine: IDLE → WAIT_HELLO → AUTHENTICATING → DISCOVERING → READY
		this.connState = 'IDLE'

		// Track whether initial state has been loaded from PA2
		this.stateLoaded = false

		// Serialized command queue tail — PEQ writes chain through this
		this._cmdQueueTail = Promise.resolve()

		// Topology — populated during DISCOVERING phase
		this.topology = {}

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updatePresetDefinitions()

		this.updateStatus(InstanceStatus.Disconnected)

		if (this.config.host) {
			this._initTcp()
		}
	}

	async destroy() {
		if (this._handshakeTimer) { clearTimeout(this._handshakeTimer); this._handshakeTimer = null }
		this._stopKeepalive()
		this._destroyDspMeters()
		if (this.tcp) {
			this.tcp.destroy()
			this.tcp = null
		}
	}

	async configUpdated(config) {
		const needsReconnect =
			this.config.host !== config.host ||
			this.config.port !== config.port ||
			this.config.password !== config.password
		this.config = config

		if (needsReconnect) {
			// Tear down old connection
			if (this._handshakeTimer) { clearTimeout(this._handshakeTimer); this._handshakeTimer = null }
			this._destroyDspMeters()
			if (this.tcp) {
				this.tcp.destroy()
				this.tcp = null
			}
			this._setConnState('IDLE')
			this.tcpBuffer = ''
			this.pa2State = this._defaultState()

			if (this.config.host) {
				this._initTcp()
			}
		}
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'discovery_hint',
				label: 'Tip',
				width: 12,
				value: 'Use the "Scan for PA2" action to find devices on your network, or enter the IP manually.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'PA2 IP Address',
				width: 8,
				regex: Regex.IP,
			},
			{
				type: 'number',
				id: 'port',
				label: 'Port',
				width: 4,
				default: PA2_PORT,
				min: 1,
				max: 65535,
			},
			{
				type: 'textinput',
				id: 'password',
				label: 'Password',
				width: 8,
				default: 'administrator',
			},
			{
				type: 'textinput',
				id: 'httpApiKey',
				label: 'HTTP Bridge API Key (optional — leave blank to allow all)',
				width: 12,
				default: '',
			},
			// ── donewellaudio.com integration ──
			{
				type: 'number',
				id: 'notchConfidenceThreshold',
				label: 'Auto-notch confidence threshold (0.0-1.0)',
				width: 4,
				default: 0,
				min: 0,
				max: 1,
				step: 0.05,
			},
			{
				type: 'number',
				id: 'notchMaxDepth',
				label: 'Max auto-notch depth (dB)',
				width: 4,
				default: -6,
				min: -20,
				max: 0,
			},
			{
				type: 'dropdown',
				id: 'notchMode',
				label: 'Auto-notch mode',
				width: 6,
				default: 'auto',
				choices: [
					{ id: 'auto', label: 'Auto-apply (write to PA2) (Recommended)' },
					{ id: 'suggest', label: 'Suggest only (show on Stream Deck)' },
					{ id: 'approve', label: 'Require approval (via /approve)' },
				],
			},
		]
	}

	// ═══════════════════════════════════════════════════════════
	// TCP CONNECTION
	// TCPHelper auto-connects via setImmediate in its constructor.
	// You do NOT call connect() manually — creating the object starts it.
	// Events: 'connect', 'data' (Buffer), 'end', 'error', 'status_change'
	// ═══════════════════════════════════════════════════════════
	_initTcp() {
		this.connState = 'WAIT_HELLO'
		this.updateStatus(InstanceStatus.Connecting)

		// TCPHelper constructor triggers connect automatically
		this.tcp = new TCPHelper(this.config.host, this.config.port || PA2_PORT)

		this.tcp.on('status_change', (status, message) => {
			// IMPORTANT: Don't forward InstanceStatus.Ok from TCPHelper — it fires
			// when the TCP socket connects, BEFORE authentication. We set Ok ourselves
			// only after topology discovery completes. Forward all other statuses.
			if (status !== InstanceStatus.Ok) {
				this.updateStatus(status, message)
			}
		})

		this.tcp.on('error', (err) => {
			this.log('error', `TCP error: ${err.message}`)
			this._setConnState('IDLE')
		})

		this.tcp.on('connect', () => {
			this.log('info', `TCP connected to ${this.config.host}`)
			// Clear buffer from any previous connection (prevents parse errors on reconnect)
			this.tcpBuffer = ''
			// Now wait for "HiQnet Console" — handled in data event
			this._setConnState('WAIT_HELLO')

			// Handshake timeout — if we don't reach READY within 10s, kill the connection
			if (this._handshakeTimer) clearTimeout(this._handshakeTimer)
			this._handshakeTimer = setTimeout(() => {
				if (this.connState !== 'READY') {
					this.log('error', `Handshake timeout — PA2 did not complete handshake within ${HANDSHAKE_TIMEOUT_MS / 1000}s (stuck in ${this.connState})`)
					this.updateStatus(InstanceStatus.ConnectionFailure, 'Handshake timeout')
					this._setConnState('IDLE')
					if (this.tcp) {
						this.tcp.destroy()
						this.tcp = null
					}
				}
			}, HANDSHAKE_TIMEOUT_MS)
		})

		this.tcp.on('data', (data) => {
			// data is a Buffer — convert to string and buffer for line splitting
			this.tcpBuffer += data.toString()
			const lines = this.tcpBuffer.split('\n')

			// Last element is either empty (complete line) or partial (incomplete)
			this.tcpBuffer = lines.pop() || ''

			for (const line of lines) {
				const trimmed = line.trim()
				if (trimmed.length > 0) {
					this._handleLine(trimmed)
				}
			}
		})

		this.tcp.on('end', () => {
			this.log('info', 'TCP connection closed')
			this._setConnState('IDLE')
		})
	}

	// ═══════════════════════════════════════════════════════════
	// CONNECTION STATE + FORMATTED VARIABLE
	// ═══════════════════════════════════════════════════════════
	_setConnState(state) {
		this.connState = state
		const fmtMap = { IDLE: 'DISCONNECTED', WAIT_HELLO: 'CONNECTING', AUTHENTICATING: 'AUTH', DISCOVERING: 'DISCOVERING', READY: 'OK' }
		this.setVariableValues({ conn_status_fmt: fmtMap[state] || state })
	}

	// ═══════════════════════════════════════════════════════════
	// LINE HANDLER — state machine for handshake + response parsing
	// ═══════════════════════════════════════════════════════════
	_handleLine(line) {
		switch (this.connState) {
			case 'WAIT_HELLO':
				if (line === 'HiQnet Console') {
					this.log('info', 'Got handshake, authenticating...')
					this._setConnState('AUTHENTICATING')
					const password = this.config.password || 'administrator'
					this.tcp.send(`connect administrator ${password}\n`)
				}
				break

			case 'AUTHENTICATING':
				if (line.startsWith('connect logged in as')) {
					this.log('info', 'Authenticated, discovering topology...')
					this._setConnState('DISCOVERING')
					this._discoveryModules = []
					this.tcp.send('ls "\\\\Preset"\n')
				} else if (line.startsWith('error')) {
					this.log('error', `Auth failed: ${line}`)
					this.updateStatus(InstanceStatus.ConnectionFailure, 'Auth failed — check password')
					this._setConnState('IDLE')
					// IMPORTANT: Destroy TCP to prevent infinite reconnect loop with bad password
					if (this.tcp) {
						this.tcp.destroy()
						this.tcp = null
					}
				}
				break

			case 'DISCOVERING':
				if (line === 'endls') {
					this._finalizeTopology()
					this._setConnState('READY')
					this.updateStatus(InstanceStatus.Ok)
					// Clear handshake timeout
					if (this._handshakeTimer) { clearTimeout(this._handshakeTimer); this._handshakeTimer = null }
					this.log('info', `Topology: ${JSON.stringify(this.topology)}`)

					// Re-register actions/feedbacks/variables now that we know topology
					// Dropdown choices may differ based on which output bands exist
					this.updateActions()
					this.updateFeedbacks()
					this.updateVariableDefinitions()

					// Read all parameters from PA2
					this._readAllState()

					// Start DSP meter connection for RTA + level meters
					this._initDspMeters()
				} else {
					// Lines look like "  ModuleName :" or "ModuleName :"
					// Skip the ls echo line if PA2 sends it back
					if (line.startsWith('ls ')) break
					const cleaned = line.replace(/\s*:\s*$/, '').trim()
					if (cleaned && cleaned !== '..') {
						this._discoveryModules.push(cleaned)
					}
				}
				break

			case 'READY':
				// Log PA2 errors (e.g. invalid path responses)
				if (line.startsWith('error')) {
					this.log('warn', `PA2 error: ${line}`)
					break
				}
				// Parse response and update state
				const result = parseResponse(line)
				if (result) {
					this._updateStateFromParsed(result)
				} else {
					this.log('debug', `PA2 unparsed: ${line}`)
				}
				break
		}
	}

	_finalizeTopology() {
		const m = this._discoveryModules || []
		this.topology = {
			modules: m,
			stereoGeq: m.includes('StereoGEQ'),
			leftGeq: m.includes('LeftGEQ'),
			rightGeq: m.includes('RightGEQ'),
			hasHigh: m.includes('High Outputs PEQ'),
			hasMid: m.includes('Mid Outputs PEQ'),
			hasLow: m.includes('Low Outputs PEQ'),
			hasAfs: m.includes('Afs'),
			hasCompressor: m.includes('Compressor'),
			hasSubharmonic: m.includes('SubharmonicSynth'),
			hasCrossover: m.includes('Crossover'),
		}
		this.pa2State.topology = this.topology
		// Push topology variables
		const t = this.topology
		const geqMode = t.stereoGeq ? 'stereo' : (t.leftGeq || t.rightGeq) ? 'dual-mono' : 'unknown'
		const outputs = [t.hasHigh ? 'High' : null, t.hasMid ? 'Mid' : null, t.hasLow ? 'Low' : null].filter(Boolean).join('+') || 'High'
		this.setVariableValues({ topology_geq_mode: geqMode, topology_outputs: outputs })
	}

	// ═══════════════════════════════════════════════════════════
	// READ ALL STATE — generate get commands for all parameters
	// ═══════════════════════════════════════════════════════════
	async _readAllState() {
		const cmds = []
		const t = this.topology

		// Device info
		cmds.push('get \\\\Node\\AT\\Class_Name')
		cmds.push('get \\\\Node\\AT\\Instance_Name')
		cmds.push('get \\\\Node\\AT\\Software_Version')

		// Preset
		cmds.push('get "\\\\Storage\\Presets\\SV\\CurrentPreset"')

		// GEQ
		const geqBases = t.stereoGeq
			? ['\\\\Preset\\StereoGEQ']
			: [t.leftGeq ? '\\\\Preset\\LeftGEQ' : null, t.rightGeq ? '\\\\Preset\\RightGEQ' : null].filter(Boolean)
		for (const base of geqBases) {
			cmds.push(`get ${base}\\SV\\GraphicEQ`)
			cmds.push(`get ${base}\\SV\\QuickCurve`)
			for (const [, label] of Object.entries(GEQ_BANDS)) {
				cmds.push(`get "${base}\\SV\\${label}"`)
			}
		}

		// PEQ per output
		const outputs = [t.hasHigh ? 'High' : null, t.hasMid ? 'Mid' : null, t.hasLow ? 'Low' : null].filter(Boolean)
		if (outputs.length === 0) outputs.push('High') // fallback
		for (const out of outputs) {
			const base = `\\\\Preset\\${out} Outputs PEQ`
			cmds.push(`get "${base}\\SV\\ParametricEQ"`)
			for (let n = 1; n <= 8; n++) {
				cmds.push(`get "${base}\\SV\\Band_${n}_Type"`)
				cmds.push(`get "${base}\\SV\\Band_${n}_Frequency"`)
				cmds.push(`get "${base}\\SV\\Band_${n}_Gain"`)
				cmds.push(`get "${base}\\SV\\Band_${n}_Q"`)
				cmds.push(`get "${base}\\SV\\Band_${n}_Slope"`)
			}
		}

		// RoomEQ / AutoEQ
		cmds.push('get "\\\\Preset\\RoomEQ\\SV\\ParametricEQ"')
		cmds.push('get \\\\Preset\\RoomEQ\\SV\\Flatten')
		for (let n = 1; n <= 8; n++) {
			cmds.push(`get "\\\\Preset\\RoomEQ\\SV\\Band_${n}_Type"`)
			cmds.push(`get "\\\\Preset\\RoomEQ\\SV\\Band_${n}_Frequency"`)
			cmds.push(`get "\\\\Preset\\RoomEQ\\SV\\Band_${n}_Gain"`)
			cmds.push(`get "\\\\Preset\\RoomEQ\\SV\\Band_${n}_Q"`)
			cmds.push(`get "\\\\Preset\\RoomEQ\\SV\\Band_${n}_Slope"`)
		}

		// AFS
		cmds.push('get \\\\Preset\\Afs\\SV\\AFS')
		cmds.push('get \\\\Preset\\Afs\\SV\\FilterMode')
		cmds.push('get "\\\\Preset\\Afs\\SV\\ContentMode"')
		cmds.push('get \\\\Preset\\Afs\\SV\\MaxFixedFilters')
		cmds.push('get \\\\Preset\\Afs\\SV\\LiftTime')

		// Compressor
		cmds.push('get \\\\Preset\\Compressor\\SV\\Compressor')
		cmds.push('get \\\\Preset\\Compressor\\SV\\Threshold')
		cmds.push('get \\\\Preset\\Compressor\\SV\\Gain')
		cmds.push('get \\\\Preset\\Compressor\\SV\\Ratio')
		cmds.push('get \\\\Preset\\Compressor\\SV\\OverEasy')

		// Limiters
		for (const out of outputs) {
			const base = `\\\\Preset\\${out} Outputs Limiter`
			cmds.push(`get "${base}\\SV\\Limiter"`)
			cmds.push(`get "${base}\\SV\\Threshold"`)
			cmds.push(`get "${base}\\SV\\OverEasy"`)
		}

		// Mutes
		for (const m of ['HighLeft', 'HighRight', 'MidLeft', 'MidRight', 'LowLeft', 'LowRight']) {
			cmds.push(`get \\\\Preset\\OutputGains\\SV\\${m}OutputMute`)
		}

		// Subharmonic
		cmds.push('get \\\\Preset\\SubharmonicSynth\\SV\\SubharmonicSynth')
		cmds.push('get \\\\Preset\\SubharmonicSynth\\SV\\Subharmonics')
		cmds.push('get "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 24-36Hz"')
		cmds.push('get "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 36-56Hz"')

		// Generator
		cmds.push('get "\\\\Preset\\SignalGenerator\\SV\\Signal Generator"')
		cmds.push('get "\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude"')

		// Input delay
		cmds.push('get "\\\\Preset\\Back Line Delay\\SV\\Delay"')
		cmds.push('get "\\\\Preset\\Back Line Delay\\SV\\Amount"')

		// Output delays
		for (const out of outputs) {
			cmds.push(`get "\\\\Preset\\${out} Outputs Delay\\SV\\Delay"`)
			cmds.push(`get "\\\\Preset\\${out} Outputs Delay\\SV\\Amount"`)
		}

		// RTA
		cmds.push('get \\\\Preset\\RTA\\SV\\Rate')
		cmds.push('get \\\\Preset\\RTA\\SV\\Gain')

		// Crossover (if present — no relay reference, built from PROTOCOL.md)
		if (t.hasCrossover) {
			for (const band of ['Band_1', 'Band_2', 'Band_3', 'MonoSub']) {
				for (const p of ['HPType', 'LPType', 'HPFrequency', 'LPFrequency', 'Gain', 'Polarity']) {
					cmds.push(`get "\\\\Preset\\Crossover\\SV\\${band}_${p}"`)
				}
			}
		}

		this.log('info', `Reading ${cmds.length} parameters from PA2...`)
		await this.sendCommands(cmds)

		// Mark state as loaded after a delay (allow responses to arrive)
		setTimeout(() => {
			this.stateLoaded = true
			this.log('info', 'Initial state load complete')

			// After state is loaded, subscribe to real-time changes
			this._subscribeAll()

			// Start keepalive ping every 30 seconds
			this._startKeepalive()
		}, Math.max(cmds.length * 25, 5000))
	}

	// ═══════════════════════════════════════════════════════════
	// SUBSCRIPTIONS — real-time state push from PA2
	// PA2 sends subr "path" "value" whenever a subscribed param changes
	// ═══════════════════════════════════════════════════════════
	async _subscribeAll() {
		const subs = []

		// Mutes — critical for live feedback
		for (const out of ['HighLeft', 'HighRight', 'MidLeft', 'MidRight', 'LowLeft', 'LowRight']) {
			subs.push(`sub "\\\\Preset\\OutputGains\\SV\\${out}OutputMute\\*"`)
		}

		// Preset changes
		subs.push('sub "\\\\Storage\\Presets\\SV\\CurrentPreset\\*"')
		subs.push('sub "\\\\Storage\\Presets\\SV\\Changed\\*"')

		// AFS state
		subs.push('sub "\\\\Preset\\Afs\\SV\\AFS\\*"')
		subs.push('sub "\\\\Preset\\Afs\\SV\\FilterMode\\*"')

		// Compressor
		subs.push('sub "\\\\Preset\\Compressor\\SV\\Compressor\\*"')
		subs.push('sub "\\\\Preset\\Compressor\\SV\\Threshold\\*"')

		// Generator — safety critical
		subs.push('sub "\\\\Preset\\SignalGenerator\\SV\\Signal Generator\\*"')
		subs.push('sub "\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude\\*"')

		// GEQ enable
		const geqBases = this.topology.stereoGeq
			? ['\\\\Preset\\StereoGEQ']
			: [this.topology.leftGeq ? '\\\\Preset\\LeftGEQ' : null, this.topology.rightGeq ? '\\\\Preset\\RightGEQ' : null].filter(Boolean)
		for (const base of geqBases) {
			subs.push(`sub "${base}\\SV\\GraphicEQ\\*"`)
			subs.push(`sub "${base}\\SV\\QuickCurve\\*"`)
			// Subscribe to all 31 GEQ band paths for live state
			for (const [, label] of Object.entries(GEQ_BANDS)) {
				subs.push(`sub "${base}\\SV\\${label}\\*"`)
			}
		}

		// Room EQ
		subs.push('sub "\\\\Preset\\RoomEQ\\SV\\ParametricEQ\\*"')

		// Subharmonic
		subs.push('sub "\\\\Preset\\SubharmonicSynth\\SV\\SubharmonicSynth\\*"')

		// Limiter High
		subs.push('sub "\\\\Preset\\High Outputs Limiter\\SV\\Limiter\\*"')

		// PEQ High enable
		subs.push('sub "\\\\Preset\\High Outputs PEQ\\SV\\ParametricEQ\\*"')

		// Input delay
		subs.push('sub "\\\\Preset\\Back Line Delay\\SV\\Delay\\*"')
		subs.push('sub "\\\\Preset\\Back Line Delay\\SV\\Amount\\*"')

		// Wizard state monitoring — detect front-panel AutoEQ runs
		subs.push('sub "\\\\Node\\Wizard\\SV\\WizardState\\*"')
		subs.push('sub "\\\\Node\\Wizard\\SV\\WizardEvent\\*"')

		this.log('info', `Subscribing to ${subs.length} parameters for real-time updates...`)
		await this.sendCommands(subs)
	}

	// ═══════════════════════════════════════════════════════════
	// KEEPALIVE — periodic ping to detect dead connections
	// ═══════════════════════════════════════════════════════════
	_startKeepalive() {
		this._stopKeepalive()
		this._keepaliveTimer = setInterval(() => {
			if (this.connState === 'READY' && this.tcp) {
				this.tcp.send('get \\\\Node\\AT\\Class_Name\n').catch(() => {
					this.log('warn', 'Keepalive failed — connection may be dead')
				})
			}
		}, 30000)
	}

	_stopKeepalive() {
		if (this._keepaliveTimer) {
			clearInterval(this._keepaliveTimer)
			this._keepaliveTimer = null
		}
	}

	// ═══════════════════════════════════════════════════════════
	// DSP METER CONNECTION — port 19274 (dspcmd / Stockbridge)
	// Provides: RTA 31-band spectrum, input/output levels,
	// compressor gain reduction, limiter gain reduction
	// ═══════════════════════════════════════════════════════════
	_initDspMeters() {
		if (this.dspSocket) { this.dspSocket.destroy(); this.dspSocket = null }
		this._stopMeterPoll()

		this.dspSocket = new (require('net')).Socket()
		this.dspBuf = ''
		this.dspReady = false
		this.meterIds = {}  // populated after discovery

		// Initialize meter state
		this.pa2State.meters = {
			rta: new Array(31).fill(-90),
			inputL: -120, inputR: -120,
			compInput: -120, compGR: 0,
			limInput: -120, limGR: 0,
			outputHL: -120, outputHR: -120,
		}

		this.dspSocket.connect(DSP_PORT, this.config.host, () => {
			this.log('info', 'DSP meter port connected (19274)')
		})

		this.dspSocket.on('data', (d) => {
			this.dspBuf += d.toString()
			const lines = this.dspBuf.split('\n')
			this.dspBuf = lines.pop() || ''
			for (const l of lines) {
				const t = l.replace(/\r/g, '').trim()
				if (!t) continue
				if (t.includes('Started Dspcmd')) {
					this.dspReady = true
					this._discoverMeterIds()
				} else if (this._meterDiscoveryCallback) {
					this._meterDiscoveryCallback(t)
				} else if (this._meterReadCallback) {
					this._meterReadCallback(t)
				}
			}
		})

		this.dspSocket.on('error', (err) => {
			this.log('debug', `DSP meter error: ${err.message}`)
		})

		this.dspSocket.on('close', () => {
			this.log('debug', 'DSP meter port closed')
			this.dspReady = false
			this._stopMeterPoll()
		})
	}

	_discoverMeterIds() {
		// Get meter IDs for the modules we care about
		const moduleMeters = [
			{ mod: 'OA/da_RTA01000064', key: 'rta' },
			{ mod: 'OA/da_InputMeterL01000066', key: 'inputL' },
			{ mod: 'OA/da_InputMeterR01000066', key: 'inputR' },
			{ mod: 'OA/da_Compressor010002BD', key: 'comp' },
			{ mod: 'OA/da_Limiter0100044D', key: 'lim' },
			{ mod: 'OA/da_HighLeftMeter01000579', key: 'outputHL' },
			{ mod: 'OA/da_HighRightMeter01000579', key: 'outputHR' },
		]

		const responses = []
		let expecting = moduleMeters.length

		this._meterDiscoveryCallback = (line) => {
			responses.push(line)
			// Each meterids response is one line with space-separated hex IDs
			if (responses.length >= expecting) {
				this._meterDiscoveryCallback = null
				// Map responses to keys
				for (let i = 0; i < moduleMeters.length; i++) {
					const ids = responses[i].split(/\s+/).filter(Boolean)
					this.meterIds[moduleMeters[i].key] = ids
				}
				this.log('info', `DSP meter IDs discovered: ${JSON.stringify(this.meterIds)}`)
				this._startMeterPoll()
			}
		}

		for (const mm of moduleMeters) {
			this.dspSocket.write(`module "${mm.mod}" meterids\n`)
		}
	}

	_startMeterPoll() {
		this._stopMeterPoll()
		this._meterPollTimer = setInterval(() => this._pollMeters(), METER_POLL_INTERVAL_MS)
		this.log('info', `Meter polling started (${METER_POLL_INTERVAL_MS}ms interval)`)
	}

	_stopMeterPoll() {
		if (this._meterPollTimer) {
			clearInterval(this._meterPollTimer)
			this._meterPollTimer = null
		}
	}

	_pollMeters() {
		if (!this.dspSocket || !this.dspReady) return

		const ids = this.meterIds
		if (!ids.rta) return

		// Build read commands — RTA needs 31 reads (at 0 0..30), others are single values
		const cmds = []
		const readMap = []  // tracks what each response line maps to

		// RTA: 31 bands
		for (let col = 0; col < 31; col++) {
			cmds.push(`meterid ${ids.rta[0]} at 0 ${col} get`)
			readMap.push({ type: 'rta', band: col })
		}

		// Input L/R
		if (ids.inputL) { cmds.push(`meterid ${ids.inputL[0]} get`); readMap.push({ type: 'inputL' }) }
		if (ids.inputR) { cmds.push(`meterid ${ids.inputR[0]} get`); readMap.push({ type: 'inputR' }) }

		// Compressor: [0]=Input Level, [1]=Gain Reduction
		if (ids.comp && ids.comp.length >= 2) {
			cmds.push(`meterid ${ids.comp[0]} get`); readMap.push({ type: 'compInput' })
			cmds.push(`meterid ${ids.comp[1]} get`); readMap.push({ type: 'compGR' })
		}

		// Limiter: [0]=Input Level, [1]=Gain Reduction
		if (ids.lim && ids.lim.length >= 2) {
			cmds.push(`meterid ${ids.lim[0]} get`); readMap.push({ type: 'limInput' })
			cmds.push(`meterid ${ids.lim[1]} get`); readMap.push({ type: 'limGR' })
		}

		// Output meters
		if (ids.outputHL) { cmds.push(`meterid ${ids.outputHL[0]} get`); readMap.push({ type: 'outputHL' }) }
		if (ids.outputHR) { cmds.push(`meterid ${ids.outputHR[0]} get`); readMap.push({ type: 'outputHR' }) }

		// Send all commands at once
		let responseIdx = 0
		const vars = {}

		this._meterReadCallback = (line) => {
			if (responseIdx >= readMap.length) return
			const val = parseFloat(line)
			if (isNaN(val)) return

			const map = readMap[responseIdx]
			responseIdx++

			switch (map.type) {
				case 'rta':
					this.pa2State.meters.rta[map.band] = val
					vars[`rta_band_${map.band + 1}`] = Math.round(val * 10) / 10
					break
				case 'inputL':
					this.pa2State.meters.inputL = val
					vars['meter_input_l'] = Math.round(val * 10) / 10
					break
				case 'inputR':
					this.pa2State.meters.inputR = val
					vars['meter_input_r'] = Math.round(val * 10) / 10
					break
				case 'compInput':
					this.pa2State.meters.compInput = val
					vars['meter_comp_input'] = Math.round(val * 10) / 10
					break
				case 'compGR':
					this.pa2State.meters.compGR = val
					vars['meter_comp_gr'] = Math.round(val * 10) / 10
					vars['meter_comp_gr_fmt'] = val > 0 ? `-${Math.round(val * 10) / 10}dB` : '0dB'
					break
				case 'limInput':
					this.pa2State.meters.limInput = val
					vars['meter_lim_input'] = Math.round(val * 10) / 10
					break
				case 'limGR':
					this.pa2State.meters.limGR = val
					vars['meter_lim_gr'] = Math.round(val * 10) / 10
					vars['meter_lim_gr_fmt'] = val > 0 ? `-${Math.round(val * 10) / 10}dB` : '0dB'
					break
				case 'outputHL':
					this.pa2State.meters.outputHL = val
					vars['meter_output_hl'] = Math.round(val * 10) / 10
					break
				case 'outputHR':
					this.pa2State.meters.outputHR = val
					vars['meter_output_hr'] = Math.round(val * 10) / 10
					break
			}

			// When all responses received, compute visuals and push variables
			if (responseIdx >= readMap.length) {
				this._meterReadCallback = null
				this._computeMeterVisuals(vars)
				if (Object.keys(vars).length > 0) {
					this.setVariableValues(vars)
				}
				this.checkFeedbacks('meter_clip', 'meter_gr_active')
			}
		}

		this.dspSocket.write(cmds.join('\n') + '\n')
	}

	// ═══════════════════════════════════════════════════════════
	// METER VISUALS — computed every poll cycle
	// Unicode bar blocks: ▁▂▃▄▅▆▇█ (U+2581-U+2588)
	// ═══════════════════════════════════════════════════════════
	_computeMeterVisuals(vars) {
		const BARS = ' \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'
		const m = this.pa2State.meters

		// Helper: dB to bar character (maps a range to 0-8 bar index)
		const dbToBar = (db, floor, ceil) => {
			const norm = Math.max(0, Math.min(1, (db - floor) / (ceil - floor)))
			return BARS[Math.round(norm * 8)]
		}

		// Helper: dB to bar string (wider meter, N characters)
		const dbToBarStr = (db, floor, ceil, width) => {
			const norm = Math.max(0, Math.min(1, (db - floor) / (ceil - floor)))
			const filled = Math.round(norm * width)
			return '\u2588'.repeat(filled) + '\u2581'.repeat(width - filled)
		}

		// ── RTA visual bars (one bar char per band, compact 31-char string) ──
		let rtaBar = ''
		for (let i = 0; i < 31; i++) {
			rtaBar += dbToBar(m.rta[i], -90, -20)
		}
		vars['rta_visual'] = rtaBar

		// ── RTA visual in 4 groups of ~8 bands for Stream Deck buttons ──
		const rtaGroups = [
			{ key: 'rta_vis_lows', start: 0, end: 7, label: 'LOWS' },
			{ key: 'rta_vis_lowmids', start: 8, end: 15, label: 'LO-MID' },
			{ key: 'rta_vis_himids', start: 16, end: 23, label: 'HI-MID' },
			{ key: 'rta_vis_highs', start: 24, end: 30, label: 'HIGHS' },
		]
		for (const g of rtaGroups) {
			let bar = ''
			for (let i = g.start; i <= g.end; i++) {
				bar += dbToBar(m.rta[i], -90, -20)
			}
			vars[g.key] = bar
		}

		// ── Peak frequency tracker ──
		let peakVal = -Infinity, peakIdx = 0
		for (let i = 0; i < 31; i++) {
			if (m.rta[i] > peakVal) { peakVal = m.rta[i]; peakIdx = i }
		}
		const GEQ_SHORT = ['20','25','31','40','50','63','80','100','125','160','200','250','315','400','500','630','800','1k','1.25k','1.6k','2k','2.5k','3.15k','4k','5k','6.3k','8k','10k','12.5k','16k','20k']
		vars['rta_peak_freq'] = GEQ_SHORT[peakIdx]
		vars['rta_peak_db'] = Math.round(peakVal * 10) / 10
		vars['rta_peak_band'] = peakIdx + 1
		vars['rta_peak_fmt'] = `${GEQ_SHORT[peakIdx]}\\n${Math.round(peakVal)}dB`

		// ── RTA flatness score (RMS deviation from mean, lower = flatter) ──
		const activeBands = m.rta.filter(v => v > -89)
		if (activeBands.length > 2) {
			const mean = activeBands.reduce((s, v) => s + v, 0) / activeBands.length
			const rmsdev = Math.sqrt(activeBands.reduce((s, v) => s + (v - mean) ** 2, 0) / activeBands.length)
			vars['rta_flat_score'] = `${Math.round(rmsdev * 10) / 10}dB`
		}

		// ── Input level bars ──
		vars['meter_input_l_bar'] = dbToBarStr(m.inputL, -60, 0, 6)
		vars['meter_input_r_bar'] = dbToBarStr(m.inputR, -60, 0, 6)
		vars['meter_input_fmt'] = `L${Math.round(m.inputL)} R${Math.round(m.inputR)}`

		// ── Output level bars ──
		vars['meter_output_hl_bar'] = dbToBarStr(m.outputHL, -60, 0, 6)
		vars['meter_output_hr_bar'] = dbToBarStr(m.outputHR, -60, 0, 6)

		// ── Compressor GR bar (inverted — more GR = more bar) ──
		vars['meter_comp_gr_bar'] = dbToBarStr(m.compGR, 0, 20, 6)

		// ── Limiter GR bar ──
		vars['meter_lim_gr_bar'] = dbToBarStr(m.limGR, 0, 20, 6)
	}

	// Route a frequency to the correct PEQ output band based on crossover state
	_routeToOutput(freqHz) {
		const xo = this.pa2State.crossover
		const t = this.topology
		if (!xo || !t) return 'High'

		// Route by crossover LP boundaries (upper edge of each band).
		// Check Low first (lowest band), then Mid, fallback to High.
		// Use lpFreq (upper boundary) — hpFreq can be 0 when HPF is bypassed/"Out".
		if (t.hasLow && xo.Band_3 && xo.Band_3.lpFreq > 0) {
			if (freqHz < xo.Band_3.lpFreq) return 'Low'
		}
		if (t.hasMid && xo.Band_2 && xo.Band_2.lpFreq > 0) {
			if (freqHz < xo.Band_2.lpFreq) return 'Mid'
		}
		return 'High'
	}

	_rtaPeakIdx() {
		const rta = this.pa2State.meters?.rta
		if (!rta) return 0
		let peak = -Infinity, idx = 0
		for (let i = 0; i < 31; i++) { if (rta[i] > peak) { peak = rta[i]; idx = i } }
		return idx
	}

	_destroyDspMeters() {
		this._stopMeterPoll()
		this._meterDiscoveryCallback = null
		this._meterReadCallback = null
		if (this.dspSocket) {
			this.dspSocket.destroy()
			this.dspSocket = null
		}
	}

	// ═══════════════════════════════════════════════════════════
	// UPDATE STATE — map parsed response to pa2State + variables
	// ═══════════════════════════════════════════════════════════
	_updateStateFromParsed(r) {
		const vars = {}

		switch (r.module) {
			case 'device':
				this.pa2State.device[r.param] = r.value
				vars[`device_${r.param}`] = r.value
				break

			case 'preset':
				if (r.param === 'current') {
					this.pa2State.preset.current = r.value
					vars['preset_current'] = r.value
					vars['preset_fmt'] = `P${r.value}`
				} else if (r.param === 'changed') {
					this.pa2State.preset.changed = r.value === 'Changed'
					vars['preset_changed'] = r.value
				}
				break

			case 'geq':
				if (r.param === 'enabled') {
					this.pa2State.geq.enabled = r.value
					vars['geq_enabled'] = r.value ? 'On' : 'Off'
				} else if (r.param === 'mode') {
					this.pa2State.geq.mode = r.value
					vars['geq_mode'] = r.value
				} else if (r.param === 'band') {
					this.pa2State.geq.bands[r.band] = r.value
					vars[`geq_band_${r.band}`] = r.value
					// Formatted GEQ variable
					const fmtLabel = GEQ_SHORT_FMT[r.band]
					if (fmtLabel) {
						const v = r.value || 0
						vars[`geq_${fmtLabel}_fmt`] = v === 0 ? '0dB' : `${v > 0 ? '+' : ''}${v}dB`
					}
				}
				break

			case 'peq':
				if (!this.pa2State.peq[r.output]) this.pa2State.peq[r.output] = { enabled: false, filters: {} }
				if (r.param === 'enabled') {
					this.pa2State.peq[r.output].enabled = r.value
					vars[`peq_${r.output.toLowerCase()}_enabled`] = r.value ? 'On' : 'Off'
				} else if (r.param === 'filter') {
					if (!this.pa2State.peq[r.output].filters[r.filter]) this.pa2State.peq[r.output].filters[r.filter] = {}
					this.pa2State.peq[r.output].filters[r.filter][r.field] = r.value
					vars[`peq_${r.output.toLowerCase()}_${r.filter}_${r.field.toLowerCase()}`] = r.value
				}
				break

			case 'autoeq':
				if (r.param === 'enabled') {
					this.pa2State.autoeq.enabled = r.value
					vars['autoeq_enabled'] = r.value ? 'On' : 'Off'
				} else if (r.param === 'mode') {
					this.pa2State.autoeq.mode = r.value
					vars['autoeq_mode'] = r.value
				} else if (r.param === 'filter') {
					if (!this.pa2State.autoeq.filters[r.filter]) this.pa2State.autoeq.filters[r.filter] = {}
					this.pa2State.autoeq.filters[r.filter][r.field] = r.value
				}
				break

			case 'afs':
				this.pa2State.afs[r.param] = r.value
				vars[`afs_${r.param.toLowerCase()}`] = r.value
				// Formatted AFS status
				if (r.param === 'AFS' || r.param === 'FilterMode') {
					const enabled = r.param === 'AFS' ? r.value : this.pa2State.afs.AFS
					const mode = r.param === 'FilterMode' ? r.value : this.pa2State.afs.FilterMode
					vars['afs_status_fmt'] = enabled ? (mode === 'Live' ? 'LIVE' : 'FIXED') : 'OFF'
				}
				break

			case 'compressor':
				this.pa2State.compressor[r.param.toLowerCase()] = r.value
				vars[`comp_${r.param.toLowerCase()}`] = r.value
				// Formatted compressor variables
				if (r.param === 'Threshold') vars['comp_thr_fmt'] = `${r.value}dB`
				if (r.param === 'Ratio') vars['comp_ratio_fmt'] = r.value.replace('.0:1', ':1')
				break

			case 'limiter':
				if (!this.pa2State.limiters[r.output]) this.pa2State.limiters[r.output] = {}
				this.pa2State.limiters[r.output][r.param.toLowerCase()] = r.value
				vars[`lim_${r.output.toLowerCase()}_${r.param.toLowerCase()}`] = r.value
				break

			case 'mute': {
				this.pa2State.mutes[r.output] = r.value
				vars[`mute_${r.output.toLowerCase()}`] = r.value ? 'MUTED' : 'LIVE'
				// Formatted mute variable: HighLeft → high_l, MidRight → mid_r
				const fmtKey = MUTE_FMT_MAP[r.output]
				if (fmtKey) vars[`mute_${fmtKey}_fmt`] = r.value ? 'MUTED' : 'LIVE'
				break
			}

			case 'subharmonic':
				this.pa2State.subharmonic[r.param] = r.value
				vars[`sub_${r.param}`] = r.value
				break

			case 'generator':
				this.pa2State.generator[r.param] = r.value
				vars[`gen_${r.param}`] = r.value
				// Formatted generator status
				if (r.param === 'mode') vars['gen_status_fmt'] = r.value === 'Off' ? 'OFF' : r.value.toUpperCase()
				break

			case 'input_delay':
				if (r.param === 'enabled') this.pa2State.inputDelay.enabled = r.value
				else if (r.param === 'ms') {
					this.pa2State.inputDelay.ms = r.value
					vars['input_delay_fmt'] = `${r.value}ms`
				}
				vars[`input_delay_${r.param}`] = r.value
				break

			case 'output_delay':
				if (!this.pa2State.outputDelays[r.output]) this.pa2State.outputDelays[r.output] = {}
				if (r.param === 'enabled') this.pa2State.outputDelays[r.output].enabled = r.value
				else if (r.param === 'ms') this.pa2State.outputDelays[r.output].ms = r.value
				vars[`output_delay_${r.output.toLowerCase()}_${r.param}`] = r.value
				break

			case 'rta':
				this.pa2State.rta[r.param] = r.value
				vars[`rta_${r.param}`] = r.value
				break

			case 'crossover': {
				if (!this.pa2State.crossover[r.band]) this.pa2State.crossover[r.band] = {}
				const paramMap = {
					HPType: 'hpType', LPType: 'lpType',
					HPFrequency: 'hpFreq', LPFrequency: 'lpFreq',
					Gain: 'gain', Polarity: 'polarity',
				}
				const stateKey = paramMap[r.param]
				if (stateKey) {
					this.pa2State.crossover[r.band][stateKey] = r.value
					const bandVar = r.band.toLowerCase().replace('_', '')
					const paramVar = stateKey.replace(/([A-Z])/g, '_$1').toLowerCase()
					vars[`xover_${bandVar}_${paramVar}`] = r.value
				}
				break
			}

			case 'wizard':
				if (r.param === 'state' && r.value !== 'Inactive') {
					this.log('warn', `PA2 Wizard is ACTIVE (${r.value}) — someone is running a wizard from the front panel. Parameters may change unexpectedly.`)
				}
				if (r.param === 'state' && r.value === 'Inactive') {
					this.log('info', 'PA2 Wizard finished — re-reading all state')
					this._readAllState()
				}
				break
		}

		// Push variable updates to Companion
		if (Object.keys(vars).length > 0) {
			this.setVariableValues(vars)
		}

		// Refresh feedbacks
		this.checkFeedbacks()
	}

	// ═══════════════════════════════════════════════════════════
	// SEND COMMAND — serialized queue for PEQ writes, 5ms spacing
	// ═══════════════════════════════════════════════════════════
	sendCommand(cmd) {
		if (this.tcp && this.connState === 'READY') {
			this.tcp.send(cmd + '\n').catch((err) => {
				this.log('error', `Send failed: ${err.message}`)
			})
		}
	}

	/**
	 * Send commands with 5ms spacing, serialized through the command queue.
	 * Multiple callers wait in line — PEQ writes never interleave.
	 */
	async sendCommands(cmds) {
		this._scanGEQWriteThrough(cmds)
		// Queue behind any in-flight command batch
		const prev = this._cmdQueueTail || Promise.resolve()
		const work = prev.then(async () => {
			for (const cmd of cmds) {
				this.sendCommand(cmd)
				await new Promise((r) => setTimeout(r, 5))
			}
		}).catch((err) => {
			this.log('error', `Queued send failed: ${err.message}`)
		})
		this._cmdQueueTail = work
		return work
	}

	// Burst send — no spacing, for GEQ sweeps and time-critical operations
	sendCommandsBurst(cmds) {
		this._scanGEQWriteThrough(cmds)
		if (this.tcp && this.connState === 'READY') {
			this.tcp.send(cmds.join('\n') + '\n').catch((err) => {
				this.log('error', `Burst send failed: ${err.message}`)
			})
		}
	}

	// ═══ Smooth PEQ Gain Fade Engine ═══
	// Ramps gain over multiple steps to avoid audible jumps.
	// 500ms fade, ~50ms steps = 10 steps per fade.

	_startGainFade(output, filter, fromGain, toGain, durationMs = 500) {
		const key = `${output}_${filter}`
		// Cancel any existing fade on this slot
		if (this._activeFades && this._activeFades[key]) {
			clearInterval(this._activeFades[key].timer)
		}
		if (!this._activeFades) this._activeFades = {}

		const stepMs = 50
		const steps = Math.max(2, Math.round(durationMs / stepMs))
		const gainDelta = (toGain - fromGain) / steps
		let currentStep = 0

		const timer = setInterval(() => {
			currentStep++
			const gain = currentStep >= steps ? toGain : fromGain + gainDelta * currentStep
			const cmd = buildCommand('peq_filter', { output, filter, gain: Math.round(gain * 10) / 10 }, this.topology)
			if (cmd.length > 0) this.sendCommand(cmd[0])

			if (currentStep >= steps) {
				clearInterval(timer)
				delete this._activeFades[key]
			}
		}, stepMs)

		this._activeFades[key] = { timer, target: toGain }
	}

	// Conservative GEQ write-through: mark stale + trigger re-read, no direct band mutation
	_scanGEQWriteThrough(cmds) {
		let geqTouched = false
		for (const cmd of cmds) {
			if (cmd.includes('GEQ') && cmd.startsWith('set ')) {
				geqTouched = true
				break
			}
		}
		if (geqTouched) {
			this.pa2State.geq._stale = true
			// Async re-read clears stale flag when complete
			setTimeout(() => this._readGEQBands(), 50)
		}
	}

	// Re-read all 31 GEQ bands from PA2, clears stale flag on completion
	async _readGEQBands() {
		const t = this.topology || {}
		const geqBases = t.stereoGeq
			? ['\\\\Preset\\StereoGEQ']
			: [t.leftGeq ? '\\\\Preset\\LeftGEQ' : null, t.rightGeq ? '\\\\Preset\\RightGEQ' : null].filter(Boolean)
		const cmds = []
		for (const base of geqBases) {
			for (const [, label] of Object.entries(GEQ_BANDS)) {
				cmds.push(`get "${base}\\SV\\${label}"`)
			}
		}
		await this.sendCommands(cmds)
		// Stale cleared after responses arrive (allow time for echo)
		setTimeout(() => {
			this.pa2State.geq._stale = false
		}, Math.max(cmds.length * 10, 500))
	}

	// ═══════════════════════════════════════════════════════════
	// HTTP BRIDGE for killthering.com
	// Companion routes requests to: /instance/<label>/<path>
	// ═══════════════════════════════════════════════════════════
	handleHttpRequest(request) {
		const cors = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
		}

		if (request.method === 'OPTIONS') {
			return { status: 204, headers: cors, body: '' }
		}

		// API key check — if configured, require it in header or query param
		if (this.config.httpApiKey) {
			const headerKey = request.headers['x-api-key'] || ''
			const queryKey = request.query?.key || ''
			if (headerKey !== this.config.httpApiKey && queryKey !== this.config.httpApiKey) {
				return { status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
					body: JSON.stringify({ error: 'Unauthorized — provide X-Api-Key header or ?key= parameter' }) }
			}
		}

		const path = request.path.replace(/^\//, '').toLowerCase()
		const json = (data) => ({
			status: 200,
			headers: { 'Content-Type': 'application/json', ...cors },
			body: JSON.stringify(data),
		})
		// Companion may pass request.body as parsed object or JSON string
		const parseBody = (raw) => (typeof raw === 'object' && raw !== null) ? raw : JSON.parse(raw || '{}')

		// ── Self-hosted control page — bypasses HTTPS mixed content ──
		if (path === 'app') {
			return {
				status: 200,
				headers: { 'Content-Type': 'text/html', ...cors },
				body: this._buildAppHtml(),
			}
		}

		if (path === 'ping') {
			return json({ ok: true, connected: this.connState === 'READY', host: this.config.host })
		}

		if (path === 'state') {
			return json(this.pa2State)
		}

		if (path === 'topology') {
			return json(this.topology)
		}

		// ═══════════════════════════════════════════════════════════
		// DONEWELLAUDIO GEQ CONTROL FRAMEWORK
		// Closed loop: donewellaudio.com → Companion → PA2 → RTA → donewellaudio.com
		// ═══════════════════════════════════════════════════════════

		// GET /rta — live 31-band RTA spectrum (fast, lightweight)
		if (path === 'rta') {
			const m = this.pa2State.meters
			if (!m || !m.rta) return json({ error: 'RTA not available' })
			const bands = {}
			const GEQ_FREQS = [20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000]
			for (let i = 0; i < 31; i++) {
				bands[GEQ_FREQS[i]] = Math.round(m.rta[i] * 100) / 100
			}
			return json({
				bands,
				peak: { freq: GEQ_FREQS[this._rtaPeakIdx() || 0], db: m.rta[this._rtaPeakIdx() || 0] },
				timestamp: Date.now(),
			})
		}

		// POST /geq — set GEQ bands (burst mode for speed)
		// IMPORTANT: POST must be checked BEFORE the GET fallback below
		// Body: { bands: { 1: -3, 12: -6, 18: +2, ... } }
		// Or:   { bands: [-12,-12,-10,-8,...] }  (array of 31 values)
		// Or:   { flat: true }  (flatten all)
		if (path === 'geq' && request.method === 'POST') {
			if (this.connState !== 'READY') return json({ error: 'PA2 not connected' })
			try {
				const body = parseBody(request.body)

				if (body.flat) {
					const cmds = buildCommand('geq_flat', { mode: 'Flat' }, this.topology)
					this.sendCommandsBurst(cmds)
					return json({ ok: true, action: 'flat' })
				}

				if (body.bands) {
					const cmds = []
					if (Array.isArray(body.bands)) {
						// Array of 31 values
						for (let i = 0; i < Math.min(body.bands.length, 31); i++) {
							const gain = Math.max(-12, Math.min(12, parseFloat(body.bands[i]) || 0))
							cmds.push(...buildCommand('geq_band_set', { band: i + 1, gain }, this.topology))
						}
					} else {
						// Object with band number keys
						for (const [band, gain] of Object.entries(body.bands)) {
							const b = parseInt(band)
							if (b >= 1 && b <= 31) {
								const g = Math.max(-12, Math.min(12, parseFloat(gain) || 0))
								cmds.push(...buildCommand('geq_band_set', { band: b, gain: g }, this.topology))
							}
						}
					}
					this.sendCommandsBurst(cmds)
					return json({ ok: true, commands: cmds.length, timestamp: Date.now() })
				}

				return json({ ok: false, error: 'Provide "bands" object/array or "flat: true"' })
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// GET /geq — current GEQ state (all 31 bands + enabled + mode)
		if (path === 'geq') {
			return json({
				enabled: this.pa2State.geq.enabled,
				mode: this.pa2State.geq.mode,
				bands: this.pa2State.geq.bands,
				topology: this.topology.stereoGeq ? 'stereo' : 'dual-mono',
			})
		}

		// GET /meters — all live meter data in one call
		if (path === 'meters') {
			return json({
				input: { l: this.pa2State.meters?.inputL, r: this.pa2State.meters?.inputR },
				output: { hl: this.pa2State.meters?.outputHL, hr: this.pa2State.meters?.outputHR },
				compressor: { input: this.pa2State.meters?.compInput, gr: this.pa2State.meters?.compGR },
				limiter: { input: this.pa2State.meters?.limInput, gr: this.pa2State.meters?.limGR },
				timestamp: Date.now(),
			})
		}

		// POST /eq/auto — auto-EQ from current RTA (donewellaudio triggers this)
		// Body: { target: -50, maxCut: -12, maxBoost: 6 }
		if (path === 'eq/auto' && request.method === 'POST') {
			if (this.connState !== 'READY') return json({ error: 'PA2 not connected' })
			try {
				const body = parseBody(request.body)
				const rta = this.pa2State.meters?.rta
				if (!rta || rta.every(v => v <= -89)) return json({ error: 'No RTA data' })

				const target = body.target || -50
				const maxCut = body.maxCut || -12
				const maxBoost = body.maxBoost || 6
				const cmds = []
				const corrections = {}

				for (let band = 1; band <= 31; band++) {
					const current = rta[band - 1]
					if (current <= -89) continue
					let correction = target - current
					correction = Math.max(maxCut, Math.min(maxBoost, correction))
					correction = Math.round(correction * 2) / 2
					cmds.push(...buildCommand('geq_band_set', { band, gain: correction }, this.topology))
					corrections[band] = correction
				}

				this.sendCommandsBurst(cmds)
				return json({ ok: true, corrections, commands: cmds.length, timestamp: Date.now() })
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// POST /eq/curve — apply a target curve (donewellaudio sends desired shape)
		// Body: { curve: { 1: -2, 2: -1, ..., 31: -3 } }  (band → desired gain)
		if (path === 'eq/curve' && request.method === 'POST') {
			if (this.connState !== 'READY') return json({ error: 'PA2 not connected' })
			try {
				const body = parseBody(request.body)
				if (!body.curve) return json({ ok: false, error: 'Provide "curve" object with band gains' })

				const cmds = []
				for (const [band, gain] of Object.entries(body.curve)) {
					const b = parseInt(band)
					if (b >= 1 && b <= 31) {
						const g = Math.max(-12, Math.min(12, parseFloat(gain) || 0))
						cmds.push(...buildCommand('geq_band_set', { band: b, gain: g }, this.topology))
					}
				}
				this.sendCommandsBurst(cmds)
				return json({ ok: true, commands: cmds.length, timestamp: Date.now() })
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// GET /loop — single call for closed-loop control
		// Returns RTA + current GEQ + meters in one response
		if (path === 'loop') {
			const m = this.pa2State.meters || {}
			const GEQ_FREQS = [20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000]
			const rta = {}
			if (m.rta) {
				for (let i = 0; i < 31; i++) rta[GEQ_FREQS[i]] = Math.round(m.rta[i] * 100) / 100
			}
			const t = this.topology || {}
			return json({
				connected: this.connState === 'READY',
				topology: t.stereoGeq ? 'stereo' : (t.leftGeq || t.rightGeq) ? 'dual-mono' : 'unknown',
				notchMode: this.config.notchMode ?? 'suggest',
				notchConfidenceThreshold: this.config.notchConfidenceThreshold ?? 0.8,
				geqStale: this.pa2State.geq._stale || false,
				notchSlotsUsed: this.pa2State.autoNotch.slotsUsed.length,
				notchSlotsAvailable: 8 - this.pa2State.autoNotch.slotsUsed.length,
				rta,
				geq: { enabled: this.pa2State.geq.enabled, mode: this.pa2State.geq.mode, bands: this.pa2State.geq.bands },
				meters: {
					input: { l: m.inputL, r: m.inputR },
					output: { hl: m.outputHL, hr: m.outputHR },
					comp_gr: m.compGR, lim_gr: m.limGR,
				},
				afs: { enabled: this.pa2State.afs.AFS, mode: this.pa2State.afs.FilterMode },
				mutes: this.pa2State.mutes,
				timestamp: Date.now(),
			})
		}

		if (path === 'command' && request.method === 'POST') {
			try {
				const body = parseBody(request.body)
				if (body.raw) {
					this.sendCommand(body.raw)
					return json({ ok: true })
				}
				// Use same action names as Stream Deck: {action: 'mute_toggle', params: {output: 'HighLeft'}}
				if (body.action) {
					const cmds = buildCommand(body.action, body.params || {}, this.topology)
					if (cmds.length === 0) {
						return json({ ok: false, error: `Unknown action: ${body.action}` })
					}
					this.sendCommands(cmds)
					return json({ ok: true, commands: cmds.length })
				}
				return json({ ok: false, error: 'Provide "action" + "params" or "raw" command' })
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// ── DoneWellAudio: POST /detect ──
		if (path === 'detect' && request.method === 'POST') {
			if (this.connState !== 'READY') {
				return json({ error: 'PA2 not connected' })
			}
			if (!this.stateLoaded) {
				return json({ error: 'PA2 state not yet loaded — try again in a few seconds' })
			}
			try {
				const body = parseBody(request.body)
				const frequencies = body.frequencies
				if (!Array.isArray(frequencies) || frequencies.length === 0) {
					return json({ error: 'frequencies must be a non-empty array' })
				}
				const threshold = this.config.notchConfidenceThreshold ?? 0.8
				const maxDepth = this.config.notchMaxDepth ?? -6
				const mode = this.config.notchMode ?? 'suggest'
				const actions = []

				for (const det of frequencies) {
					// Validate required fields
					if (typeof det.hz !== 'number' || det.hz < 20 || det.hz > 20000) {
						actions.push({ type: 'skipped_invalid', freq: det.hz, reason: 'hz must be 20-20000' })
						continue
					}
					if (typeof det.confidence !== 'number' || det.confidence < 0 || det.confidence > 1) {
						actions.push({ type: 'skipped_invalid', freq: det.hz, reason: 'confidence must be 0-1' })
						continue
					}
					const clientId = det.clientId || null

					if (det.type !== 'feedback') {
						actions.push({ type: 'skipped_not_feedback', freq: det.hz, clientId, detType: det.type })
						continue
					}
					// No hard rejection — low-confidence detections get shallower cuts via depth scaling above

					// Server-side Q clamp: use provided Q or default to 10
					const q = Math.max(4, Math.min(16, det.q ?? 10))

					// Scale notch depth by confidence: high confidence = full depth, low = shallower
					// conf >= threshold: full maxDepth. conf < threshold: half depth (min -2dB).
					let depth = maxDepth
					if (det.confidence < threshold) {
						depth = Math.max(-2, Math.round(maxDepth * 0.5))
					}

					// Update tracking
					this.pa2State.autoNotch.lastDetectFreq = det.hz
					this.pa2State.autoNotch.lastDetectAction = mode === 'suggest' ? 'PENDING' : 'NOTCHED'

					if (mode === 'suggest' || mode === 'approve') {
						const detectionId = `det_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
						this.pa2State.autoNotch.pending.push({
							detectionId, freq: det.hz, suggestedGain: maxDepth, suggestedQ: q, confidence: det.confidence, clientId,
						})
						actions.push({ type: mode === 'suggest' ? 'suggested' : 'pending_approval', freq: det.hz, clientId, detectionId })
					} else if (mode === 'auto') {
						// E1: Topology-aware output routing based on crossover frequencies
						const output = this._routeToOutput(det.hz)

						// Check PEQ is enabled on target output before placing notch
						const peqState = this.pa2State.peq[output]
						if (peqState && peqState.enabled === false) {
							actions.push({ type: 'skipped_peq_disabled', freq: det.hz, clientId, output })
							continue
						}

						// AFS coordination: if AFS is active in Fixed mode with filters,
						// note it in the response so the client knows AFS may already cover this freq
						const afsActive = this.pa2State.afs.enabled && this.pa2State.afs.fixedFilters > 0

						// E2: 1/3-octave dedup — check if existing notch is nearby
						const slots = this.pa2State.autoNotch.slotsUsed
						const nearbyIdx = slots.findIndex((s) => {
							const ratio = Math.max(s.freq, det.hz) / Math.min(s.freq, det.hz)
							return ratio <= 1.33 && s.output === output // within ~4 semitones (handles thermal drift)
						})
						if (nearbyIdx !== -1) {
							const existing = slots[nearbyIdx]
							const needsDeeper = depth < existing.gain
							const freqDrifted = Math.abs(det.hz - existing.freq) > 5
							const qChanged = Math.abs(q - (existing.q || 10)) > 1
							if (needsDeeper || freqDrifted) {
								const newGain = Math.min(existing.gain, depth)
								// Send freq/Q instantly (must track feedback), fade gain smoothly
								const instant = { output, filter: existing.filter }
								if (freqDrifted) instant.freq = det.hz
								if (qChanged) instant.q = q
								const cmds = buildCommand('peq_filter', instant, this.topology)
								if (cmds.length > 0) this.sendCommands(cmds)
								// Smooth fade for gain changes (avoids audible jump)
								if (needsDeeper) {
									this._startGainFade(output, existing.filter, existing.gain, newGain)
								}
								slots[nearbyIdx] = { ...existing, freq: det.hz, gain: newGain, q, clientId, confidence: det.confidence, placedAt: new Date().toISOString() }
								actions.push({ type: 'notch_placed', freq: det.hz, output, filter: existing.filter, gain: newGain, q, clientId, note: freqDrifted ? 'recentered_drift' : 'deepened' })
							} else {
								actions.push({ type: 'skipped_nearby', freq: det.hz, clientId, existingFreq: existing.freq })
							}
							continue
						}

						// Find available PEQ slot on the routed output
						const usedFilters = slots.filter((s) => s.output === output).map((s) => s.filter)
						let slot = null
						for (let f = 1; f <= 8; f++) {
							if (!usedFilters.includes(f)) { slot = f; break }
						}
						if (!slot) {
							// Slot prioritization: if all full, replace the lowest-confidence notch on this output
							const outputSlots = slots.filter((s) => s.output === output)
							if (outputSlots.length > 0 && det.confidence > Math.min(...outputSlots.map((s) => s.confidence || 0))) {
								const weakest = outputSlots.reduce((a, b) => ((a.confidence || 0) < (b.confidence || 0) ? a : b))
								const weakIdx = slots.indexOf(weakest)
								// Overwrite the weakest slot
								const cmds = buildCommand('peq_filter', {
									output, filter: weakest.filter,
									type: 'Notch', freq: det.hz, gain: depth, q,
								}, this.topology)
								this.sendCommands(cmds)
								slots[weakIdx] = { output, filter: weakest.filter, freq: det.hz, gain: depth, q, clientId, confidence: det.confidence, placedAt: new Date().toISOString() }
								actions.push({ type: 'notch_placed', freq: det.hz, output, filter: weakest.filter, gain: depth, q, clientId, note: 'replaced_weakest' })
								continue
							}
							actions.push({ type: 'skipped_no_slots', freq: det.hz, clientId })
							continue
						}
						// Set filter shape instantly at 0dB, then fade to target gain
						const cmds = buildCommand('peq_filter', {
							output, filter: slot,
							type: 'Notch', freq: det.hz, gain: 0, q,
						}, this.topology)
						this.sendCommands(cmds)
						this._startGainFade(output, slot, 0, depth)
						slots.push({ output, filter: slot, freq: det.hz, gain: depth, q, clientId, confidence: det.confidence, placedAt: new Date().toISOString() })
						actions.push({ type: 'notch_placed', freq: det.hz, output, filter: slot, gain: depth, q, clientId, afsActive })
					}
				}
				// Update variables
				this.pa2State.autoNotch.active = true
				this.setVariableValues({
					detect_last_freq: this.pa2State.autoNotch.lastDetectFreq ? `${this.pa2State.autoNotch.lastDetectFreq}Hz` : '',
					detect_last_action: this.pa2State.autoNotch.lastDetectAction,
					detect_slots_used: `${this.pa2State.autoNotch.slotsUsed.length}/8`,
					detect_active: 'ON',
				})
				return json({
					actions,
					slots_used: this.pa2State.autoNotch.slotsUsed.length,
					slots_available: 8 - this.pa2State.autoNotch.slotsUsed.length,
					// Include active notch state so DWA can deduplicate and visualize
					active_notches: this.pa2State.autoNotch.slotsUsed.map((s) => ({
						freq: s.freq, gain: s.gain, q: s.q, output: s.output, filter: s.filter, clientId: s.clientId,
					})),
				})
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// ── DoneWellAudio: GET /recommendations ──
		if (path === 'recommendations' && request.method === 'GET') {
			return json({
				pending: this.pa2State.autoNotch.pending,
				active_notches: this.pa2State.autoNotch.slotsUsed,
			})
		}

		// ── DoneWellAudio: POST /approve ──
		if (path === 'approve' && request.method === 'POST') {
			if (this.connState !== 'READY') {
				return json({ error: 'PA2 not connected' })
			}
			if (!this.stateLoaded) {
				return json({ error: 'PA2 state not yet loaded' })
			}
			try {
				const body = parseBody(request.body)
				const approve = body.approve || []
				const reject = body.reject || []
				const maxDepth = this.config.notchMaxDepth ?? -6
				const actions = []

				// Filter pending list
				this.pa2State.autoNotch.pending = this.pa2State.autoNotch.pending.filter((p) => {
					if (reject.includes(p.freq)) {
						actions.push({ type: 'rejected', freq: p.freq })
						return false
					}
					if (approve.includes(p.freq)) {
						// Place the notch — per-output slot allocation (matches /detect path)
						const approveOutput = this._routeToOutput(p.freq)
						const slots = this.pa2State.autoNotch.slotsUsed
						const usedFilters = slots.filter((s) => s.output === approveOutput).map((s) => s.filter)
						let slot = null
						for (let f = 1; f <= 8; f++) {
							if (!usedFilters.includes(f)) { slot = f; break }
						}
						if (!slot) {
							actions.push({ type: 'skipped_no_slots', freq: p.freq })
							return false
						}
						const approveQ = p.suggestedQ ?? 10
						// H-7: 1/3-octave dedup — same as auto mode
						const nearbyIdx = slots.findIndex((s) => {
							const ratio = Math.max(s.freq, p.freq) / Math.min(s.freq, p.freq)
							return ratio <= 1.33 && s.output === approveOutput
						})
						if (nearbyIdx !== -1) {
							actions.push({ type: 'skipped_nearby', freq: p.freq, existingFreq: slots[nearbyIdx].freq })
							return false
						}
						const cmds = buildCommand('peq_filter', {
							output: approveOutput, filter: slot,
							type: 'Notch', freq: p.freq, gain: maxDepth, q: approveQ,
						}, this.topology)
						this.sendCommands(cmds)
						slots.push({ output: approveOutput, filter: slot, freq: p.freq, gain: maxDepth, q: approveQ, placedAt: new Date().toISOString() })
						actions.push({ type: 'notch_placed', freq: p.freq, output: approveOutput, filter: slot, gain: maxDepth, q: approveQ })
						return false
					}
					return true // keep in pending
				})
				this.setVariableValues({
					detect_slots_used: `${this.pa2State.autoNotch.slotsUsed.length}/8`,
				})
				return json({ actions, remaining_pending: this.pa2State.autoNotch.pending.length })
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// ── DoneWellAudio: POST /notches/release — free one auto-notch slot by clientId ──
		if (path === 'notches/release' && request.method === 'POST') {
			if (this.connState !== 'READY') return json({ error: 'PA2 not connected' })
			try {
				const body = parseBody(request.body)
				const clientId = body.clientId
				if (!clientId) return json({ ok: false, error: 'clientId required' })

				const slots = this.pa2State.autoNotch.slotsUsed
				const idx = slots.findIndex((s) => s.clientId === clientId)
				if (idx === -1) return json({ ok: false, error: 'clientId not found' })

				const slot = slots[idx]
				// Fade out to 0dB smoothly, then reset to flat Bell
				this._startGainFade(slot.output, slot.filter, slot.gain || -6, 0, 300)
				// After fade completes, reset filter type to Bell (bypassed)
				setTimeout(() => {
					const cmds = buildCommand('peq_filter', {
						output: slot.output, filter: slot.filter,
						type: 'Bell', freq: 1000, gain: 0, q: 1,
					}, this.topology)
					this.sendCommands(cmds)
				}, 350) // slightly after fade ends
				// Remove from tracking immediately (slot is being released)
				slots.splice(idx, 1)
				this.setVariableValues({ detect_slots_used: `${slots.length}/8` })
				return json({ ok: true, clientId, freedFilter: slot.filter, slotsUsed: slots.length, slotsAvailable: 8 - slots.length })
			} catch (e) {
				return { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) }
			}
		}

		// ── DoneWellAudio: DELETE /notches — clear ALL auto-placed notches ──
		if (path === 'notches' && request.method === 'DELETE') {
			if (this.connState !== 'READY') return json({ error: 'PA2 not connected' })
			const cleared = this.pa2State.autoNotch.slotsUsed.length
			// Reset auto-placed PEQ filters to flat (gain=0)
			for (const slot of this.pa2State.autoNotch.slotsUsed) {
				const cmds = buildCommand('peq_filter', {
					output: slot.output, filter: slot.filter,
					type: 'Bell', freq: 1000, gain: 0, q: 1,
				}, this.topology)
				this.sendCommands(cmds)
			}
			this.pa2State.autoNotch.slotsUsed = []
			this.pa2State.autoNotch.pending = []
			this.pa2State.autoNotch.lastDetectAction = 'IDLE'
			this.setVariableValues({
				detect_slots_used: '0/8',
				detect_last_action: 'IDLE',
			})
			return json({ ok: true, cleared })
		}

		return { status: 404, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) }
	}

	// ═══════════════════════════════════════════════════════════
	// SELF-HOSTED CONTROL PAGE — serves from Companion's HTTP server
	// Access: http://<companion>:8000/instance/<label>/app
	// ═══════════════════════════════════════════════════════════
	_buildAppHtml() {
		return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PA2 Control</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;padding:16px}
h1{font-size:20px;margin-bottom:12px;color:#0f0}
.status{padding:8px 12px;border-radius:6px;margin-bottom:16px;font-weight:bold}
.ok{background:#0a3}
.err{background:#a00}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:20px}
.btn{padding:12px 8px;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;transition:0.15s}
.btn:active{transform:scale(0.95)}
.mute{background:#060;color:#fff}.mute.muted{background:#c00}
.action{background:#234;color:#fff}.action:hover{background:#345}
.danger{background:#900;color:#fff;font-size:16px}
.green{background:#090;color:#000}
.yellow{background:#cc0;color:#000}
.blue{background:#06c;color:#fff}
.orange{background:#f80;color:#000}
h2{font-size:15px;margin:16px 0 8px;color:#8af;border-bottom:1px solid #333;padding-bottom:4px}
.val{font-size:11px;opacity:0.7;display:block}
</style></head><body>
<h1>PA2 Control — $(DEVICE_NAME)</h1>
<div class="status" id="st">Connecting...</div>
<h2>Mutes</h2>
<div class="grid" id="mutes"></div>
<h2>Show Macros</h2>
<div class="grid" id="macros"></div>
<h2>Processing</h2>
<div class="grid" id="proc"></div>
<h2>Generator</h2>
<div class="grid" id="gen"></div>
<script>
const BASE=location.pathname.replace(/\\/app$/,'');
const api=(p,o)=>fetch(BASE+'/'+p,o).then(r=>r.json()).catch(()=>null);
const cmd=(action,params)=>api('command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,params})});

const MUTES=['HighLeft','HighRight','MidLeft','MidRight','LowLeft','LowRight'];
const muteGrid=document.getElementById('mutes');
MUTES.forEach(m=>{
  const b=document.createElement('button');
  b.className='btn mute';b.id='m_'+m;
  b.textContent=m.replace(/([A-Z])/g,' $1').trim();
  b.onclick=()=>cmd('mute_toggle',{output:m});
  muteGrid.appendChild(b);
});
const muteAll=document.createElement('button');muteAll.className='btn danger';muteAll.textContent='MUTE ALL';muteAll.onclick=()=>cmd('mute_all');muteGrid.appendChild(muteAll);
const unmuteAll=document.createElement('button');unmuteAll.className='btn green';unmuteAll.textContent='SAFE UNMUTE';unmuteAll.onclick=()=>cmd('safe_unmute');muteGrid.appendChild(unmuteAll);

const macros=document.getElementById('macros');
[['show_open','SHOW OPEN','green'],['show_close','SHOW CLOSE','danger'],['soundcheck_start','SOUNDCHECK','blue'],['ring_out','RING OUT','yellow'],['panic_mute','PANIC MUTE','danger']].forEach(([a,t,c])=>{
  const b=document.createElement('button');b.className='btn '+c;b.textContent=t;b.onclick=()=>cmd(a);macros.appendChild(b);
});

const proc=document.getElementById('proc');
[['afs_enable',{value:'true'},'AFS ON','green'],['afs_enable',{value:'false'},'AFS OFF','action'],['afs_clear_live',{},'CLR LIVE','yellow'],['afs_clear_all',{},'CLR ALL','danger'],
['comp_enable',{value:'true'},'COMP ON','orange'],['comp_enable',{value:'false'},'COMP OFF','action'],
['lim_enable',{band:'High',value:'true'},'LIM ON','orange'],['lim_enable',{band:'High',value:'false'},'LIM OFF','action'],
['geq_flat',{},'GEQ FLAT','yellow'],['peq_flatten',{output:'High'},'PEQ FLAT','yellow']
].forEach(([a,p,t,c])=>{
  const b=document.createElement('button');b.className='btn '+c;b.textContent=t;b.onclick=()=>cmd(a,p);proc.appendChild(b);
});

const gen=document.getElementById('gen');
[['Off','action'],['Pink','orange'],['White','orange']].forEach(([m,c])=>{
  const b=document.createElement('button');b.className='btn '+c;b.textContent='GEN '+m.toUpperCase();b.onclick=()=>cmd('gen_mode',{mode:m});gen.appendChild(b);
});

async function poll(){
  const s=await api('state');
  const st=document.getElementById('st');
  if(!s){st.className='status err';st.textContent='Disconnected';return}
  st.className='status ok';st.textContent='Connected — '+(s.device?.name||'PA2');
  document.querySelector('h1').textContent='PA2 Control — '+(s.device?.name||'');
  MUTES.forEach(m=>{
    const b=document.getElementById('m_'+m);
    if(b){b.className='btn mute'+(s.mutes?.[m]?' muted':'');b.innerHTML=m.replace(/([A-Z])/g,' $1').trim()+'<span class=val>'+(s.mutes?.[m]?'MUTED':'LIVE')+'</span>'}
  });
}
poll();setInterval(poll,2000);
</script></body></html>`
	}

	// ═══════════════════════════════════════════════════════════
	// UPDATE METHODS — follow template pattern exactly
	// ═══════════════════════════════════════════════════════════
	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}

	updatePresetDefinitions() {
		UpdatePresetDefinitions(this)
	}

	_defaultState() {
		return {
			device: { model: '', name: '', version: '' },
			topology: {},
			geq: { enabled: false, bands: {} },
			peq: {
				High: { enabled: false, filters: {} },
				Mid: { enabled: false, filters: {} },
				Low: { enabled: false, filters: {} },
			},
			autoeq: { enabled: false, mode: 'AutoEQ', filters: {} },
			afs: { enabled: false, mode: 'Live', content: 'Speech Music', fixedFilters: 6, liftTime: 300 },
			compressor: { enabled: false, threshold: 0, gain: 0, ratio: '2.0:1', overeasy: 0 },
			limiters: {
				High: { enabled: false, threshold: 0, overeasy: 0 },
				Mid: { enabled: false, threshold: 0, overeasy: 0 },
				Low: { enabled: false, threshold: 0, overeasy: 0 },
			},
			mutes: {
				HighLeft: false, HighRight: false,
				MidLeft: false, MidRight: false,
				LowLeft: false, LowRight: false,
			},
			subharmonic: { enabled: false, master: 50, lows: 50, highs: 50 },
			generator: { mode: 'Off', level: -60 },
			inputDelay: { enabled: false, ms: 0 },
			outputDelays: {
				High: { enabled: false, ms: 0 },
				Mid: { enabled: false, ms: 0 },
				Low: { enabled: false, ms: 0 },
			},
			rta: { rate: 'Slow', offset: 0 },
			crossover: {
				Band_1: { hpType: 'BW 24', lpType: 'BW 24', hpFreq: 0, lpFreq: 0, gain: 0, polarity: 'Normal' },
				Band_2: { hpType: 'BW 24', lpType: 'BW 24', hpFreq: 0, lpFreq: 0, gain: 0, polarity: 'Normal' },
				Band_3: { hpType: 'BW 24', lpType: 'BW 24', hpFreq: 0, lpFreq: 0, gain: 0, polarity: 'Normal' },
				MonoSub: { hpType: 'BW 24', lpType: 'BW 24', hpFreq: 0, lpFreq: 0, gain: 0, polarity: 'Normal' },
			},
			preset: { current: 0, changed: false },
			// donewellaudio.com auto-notch tracking
			autoNotch: {
				active: false,
				slotsUsed: [],       // [{output, filter, freq, gain, q, placedAt}]
				pending: [],         // [{freq, suggestedGain, suggestedQ, confidence}]
				lastDetectFreq: 0,
				lastDetectAction: 'IDLE',
			},
		}
	}
}

runEntrypoint(PA2Instance, UpgradeScripts)
