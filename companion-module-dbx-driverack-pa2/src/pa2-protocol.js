// src/pa2-protocol.js
// Built following CLAUDE.md spec exactly.
// CommonJS only (READ FIRST rule 1).

// ═══ GEQ BAND CONSTANTS ═══
const GEQ_BANDS = {
	1: '20 Hz', 2: '25 Hz', 3: '31.5 Hz', 4: '40 Hz', 5: '50 Hz', 6: '63 Hz',
	7: '80 Hz', 8: '100 Hz', 9: '125 Hz', 10: '160 Hz', 11: '200 Hz', 12: '250 Hz',
	13: '315 Hz', 14: '400 Hz', 15: '500 Hz', 16: '630 Hz', 17: '800 Hz', 18: '1.0 kHz',
	19: '1.25 kHz', 20: '1.6 kHz', 21: '2.0 kHz', 22: '2.5 kHz', 23: '3.15 kHz',
	24: '4.0 kHz', 25: '5.0 kHz', 26: '6.3 kHz', 27: '8.0 kHz', 28: '10.0 kHz',
	29: '12.5 kHz', 30: '16.0 kHz', 31: '20.0 kHz',
}

// Reverse mapping: label → band number
const GEQ_LABELS_TO_NUM = {}
for (const [num, label] of Object.entries(GEQ_BANDS)) {
	GEQ_LABELS_TO_NUM[label] = parseInt(num)
}

// ═══ RESPONSE PARSING ═══
// Two-regex approach per CLAUDE.md READ FIRST rule 3
const RE_QUOTED = /^(get|subr)\s+"([^"]+)"\s+"([^"]*)"/
const RE_UNQUOTED = /^(get|subr)\s+(\S+)\s+(\S+)/

function splitResponseLine(line) {
	let m = line.match(RE_QUOTED)
	if (m) return { cmd: m[1], path: m[2], value: m[3] }
	m = line.match(RE_UNQUOTED)
	if (m) return { cmd: m[1], path: m[2], value: m[3] }
	return null
}

// ═══ VALUE PARSERS ═══
function parseDb(s) {
	return parseFloat(s)
}

function parseFreq(s) {
	const m = s.match(/([\d.]+)\s*(k?Hz)/i)
	if (!m) return parseFloat(s)
	return m[2].startsWith('k') ? parseFloat(m[1]) * 1000 : parseFloat(m[1])
}

function parsePercent(s) {
	return parseFloat(s)
}

function parseTime(s) {
	const m = s.match(/([\d.]+)\s*(m?s)/i)
	if (!m) return parseFloat(s)
	return m[2] === 'ms' ? parseFloat(m[1]) : parseFloat(m[1]) * 1000
}

function parseOverEasy(s) {
	return s === 'Off' ? 0 : parseFloat(s)
}

// ═══ parseResponse ═══
// Returns object per CLAUDE.md "parseResponse Return Schema" or null
function parseResponse(line) {
	const split = splitResponseLine(line)
	if (!split) return null

	const { path, value } = split

	// ── Device info ──
	if (path.includes('\\Node\\AT\\Class_Name')) return { module: 'device', param: 'model', value: value }
	if (path.includes('\\Node\\AT\\Instance_Name')) return { module: 'device', param: 'name', value: value }
	if (path.includes('\\Node\\AT\\Software_Version')) return { module: 'device', param: 'version', value: value }

	// ── Wizard state ──
	if (path.includes('\\Node\\Wizard\\SV\\WizardState')) return { module: 'wizard', param: 'state', value: value }
	if (path.includes('\\Node\\Wizard\\SV\\WizardEvent')) return { module: 'wizard', param: 'event', value: value }

	// ── Preset ──
	if (path.includes('\\Storage\\Presets\\SV\\CurrentPreset')) return { module: 'preset', param: 'current', value: parseInt(value) }
	if (path.includes('\\Storage\\Presets\\SV\\Changed')) return { module: 'preset', param: 'changed', value: value }

	// ── GEQ ──
	const geqMatch = path.match(/\\(StereoGEQ|LeftGEQ|RightGEQ)\\SV\\(.+)$/)
	if (geqMatch) {
		const param = geqMatch[2]
		if (param === 'GraphicEQ') return { module: 'geq', param: 'enabled', value: value === 'On' }
		if (param === 'QuickCurve') return { module: 'geq', param: 'mode', value: value }
		// Band gain
		const bandNum = GEQ_LABELS_TO_NUM[param]
		if (bandNum) return { module: 'geq', param: 'band', band: bandNum, value: parseDb(value) }
		return null
	}

	// ── PEQ ──
	const peqMatch = path.match(/\\(High|Mid|Low) Outputs PEQ\\SV\\(.+)$/)
	if (peqMatch) {
		const output = peqMatch[1]
		const param = peqMatch[2]
		if (param === 'ParametricEQ') return { module: 'peq', output, param: 'enabled', value: value === 'On' }
		if (param === 'Flatten') return { module: 'peq', output, param: 'flatten', value: value }
		const bandMatch = param.match(/^Band_(\d+)_(.+)$/)
		if (bandMatch) {
			const filter = parseInt(bandMatch[1])
			const field = bandMatch[2]
			let parsed = value
			if (field === 'Frequency') parsed = parseFreq(value)
			else if (field === 'Gain') parsed = parseDb(value)
			else if (field === 'Q') parsed = parseFloat(value)
			else if (field === 'Slope') parsed = parseFloat(value)
			// else Type — string
			return { module: 'peq', output, param: 'filter', filter, field, value: parsed }
		}
		return null
	}

	// ── AutoEQ / RoomEQ ──
	const aeqMatch = path.match(/\\RoomEQ\\SV\\(.+)$/)
	if (aeqMatch) {
		const param = aeqMatch[1]
		if (param === 'ParametricEQ') return { module: 'autoeq', param: 'enabled', value: value === 'On' }
		if (param === 'Flatten') return { module: 'autoeq', param: 'mode', value: value }
		const bandMatch = param.match(/^Band_(\d+)_(.+)$/)
		if (bandMatch) {
			const filter = parseInt(bandMatch[1])
			const field = bandMatch[2]
			let parsed = value
			if (field === 'Frequency') parsed = parseFreq(value)
			else if (field === 'Gain') parsed = parseDb(value)
			else if (field === 'Q') parsed = parseFloat(value)
			else if (field === 'Slope') parsed = parseFloat(value)
			return { module: 'autoeq', param: 'filter', filter, field, value: parsed }
		}
		return null
	}

	// ── AFS ──
	const afsMatch = path.match(/\\Afs\\SV\\(.+)$/)
	if (afsMatch) {
		const param = afsMatch[1]
		const afsParams = {
			'AFS': (v) => ({ module: 'afs', param: 'AFS', value: v === 'On' }),
			'FilterMode': (v) => ({ module: 'afs', param: 'FilterMode', value: v }),
			'ContentMode': (v) => ({ module: 'afs', param: 'ContentMode', value: v }),
			'MaxFixedFilters': (v) => ({ module: 'afs', param: 'MaxFixedFilters', value: parseInt(v) }),
			'LiftTime': (v) => ({ module: 'afs', param: 'LiftTime', value: parseInt(v) }),
		}
		if (afsParams[param]) return afsParams[param](value)
		return null
	}

	// ── Compressor ──
	const compMatch = path.match(/\\Compressor\\SV\\(.+)$/)
	if (compMatch) {
		const param = compMatch[1]
		const compParams = {
			'Compressor': (v) => ({ module: 'compressor', param: 'Compressor', value: v === 'On' }),
			'Threshold': (v) => ({ module: 'compressor', param: 'Threshold', value: parseDb(v) }),
			'Gain': (v) => ({ module: 'compressor', param: 'Gain', value: parseDb(v) }),
			'Ratio': (v) => ({ module: 'compressor', param: 'Ratio', value: v }),
			'OverEasy': (v) => ({ module: 'compressor', param: 'OverEasy', value: parseOverEasy(v) }),
		}
		if (compParams[param]) return compParams[param](value)
		return null
	}

	// ── Limiter ──
	const limMatch = path.match(/\\(High|Mid|Low) Outputs Limiter\\SV\\(.+)$/)
	if (limMatch) {
		const output = limMatch[1]
		const param = limMatch[2]
		const limParams = {
			'Limiter': (v) => ({ module: 'limiter', output, param: 'Limiter', value: v === 'On' }),
			'Threshold': (v) => ({ module: 'limiter', output, param: 'Threshold', value: parseDb(v) }),
			'OverEasy': (v) => ({ module: 'limiter', output, param: 'OverEasy', value: parseOverEasy(v) }),
		}
		if (limParams[param]) return limParams[param](value)
		return null
	}

	// ── Mutes ──
	const muteMatch = path.match(/\\OutputGains\\SV\\(.+)OutputMute$/)
	if (muteMatch) {
		const output = muteMatch[1]
		return { module: 'mute', output, value: value === 'On' }
	}

	// ── Subharmonic ──
	const subMatch = path.match(/\\SubharmonicSynth\\SV\\(.+)$/)
	if (subMatch) {
		const param = subMatch[1]
		if (param === 'SubharmonicSynth') return { module: 'subharmonic', param: 'enabled', value: value === 'On' }
		if (param === 'Subharmonics') return { module: 'subharmonic', param: 'master', value: parsePercent(value) }
		if (param === 'Synthesis Level 24-36Hz') return { module: 'subharmonic', param: 'lows', value: parsePercent(value) }
		if (param === 'Synthesis Level 36-56Hz') return { module: 'subharmonic', param: 'highs', value: parsePercent(value) }
		return null
	}

	// ── Input Delay ──
	const idlyMatch = path.match(/\\Back Line Delay\\SV\\(.+)$/)
	if (idlyMatch) {
		const param = idlyMatch[1]
		if (param === 'Delay') return { module: 'input_delay', param: 'enabled', value: value === 'On' }
		if (param === 'Amount') return { module: 'input_delay', param: 'ms', value: parseTime(value) }
		return null
	}

	// ── Output Delay ──
	const odlyMatch = path.match(/\\(High|Mid|Low) Outputs Delay\\SV\\(.+)$/)
	if (odlyMatch) {
		const output = odlyMatch[1]
		const param = odlyMatch[2]
		if (param === 'Delay') return { module: 'output_delay', output, param: 'enabled', value: value === 'On' }
		if (param === 'Amount') return { module: 'output_delay', output, param: 'ms', value: parseTime(value) }
		return null
	}

	// ── Generator ──
	const genMatch = path.match(/\\SignalGenerator\\SV\\(.+)$/)
	if (genMatch) {
		const param = genMatch[1]
		if (param === 'Signal Generator') return { module: 'generator', param: 'mode', value: value }
		if (param === 'Signal Amplitude') return { module: 'generator', param: 'level', value: parseDb(value) }
		return null
	}

	// ── RTA ──
	const rtaMatch = path.match(/\\RTA\\SV\\(.+)$/)
	if (rtaMatch) {
		const param = rtaMatch[1]
		if (param === 'Rate') return { module: 'rta', param: 'rate', value: value }
		if (param === 'Gain') return { module: 'rta', param: 'offset', value: parseDb(value) }
		return null
	}

	// ── Crossover ──
	const xoverMatch = path.match(/\\Crossover\\SV\\(Band_1|Band_2|Band_3|MonoSub)_(.+)$/)
	if (xoverMatch) {
		const band = xoverMatch[1]
		const param = xoverMatch[2]
		let parsed = value
		if (param === 'HPFrequency' || param === 'LPFrequency') {
			parsed = value === 'Out' ? -1 : parseFreq(value)
		} else if (param === 'Gain') {
			parsed = parseDb(value)
		}
		// HPType, LPType, Polarity remain as strings
		return { module: 'crossover', band, param, value: parsed }
	}

	return null
}

// ═══ buildCommand ═══
// Pure function: takes action name, params, topology → returns array of command strings
function buildCommand(action, params, topology) {
	const commands = []

	// Helper: get GEQ base paths based on topology
	function geqBases() {
		if (topology.stereoGeq) return ['\\\\Preset\\StereoGEQ']
		const bases = []
		if (topology.leftGeq) bases.push('\\\\Preset\\LeftGEQ')
		if (topology.rightGeq) bases.push('\\\\Preset\\RightGEQ')
		return bases
	}

	// Helper: get output band names that exist
	function outputBands() {
		const bands = []
		if (topology.hasHigh) bands.push('High')
		if (topology.hasMid) bands.push('Mid')
		if (topology.hasLow) bands.push('Low')
		return bands.length > 0 ? bands : ['High'] // fallback
	}

	switch (action) {
		case 'raw':
			if (params.command) commands.push(params.command)
			break

		case 'mute':
		case 'mute_set':
			commands.push(`set \\\\Preset\\OutputGains\\SV\\${params.output}OutputMute ${params.value ? 'On' : 'Off'}`)
			break

		case 'mute_toggle':
			// NOTE: Toggle logic is in the action callback (reads pa2State), not here
			// This just sends the set command
			commands.push(`set \\\\Preset\\OutputGains\\SV\\${params.output}OutputMute ${params.value ? 'On' : 'Off'}`)
			break

		case 'mute_all':
			for (const out of ['HighLeft', 'HighRight', 'MidLeft', 'MidRight', 'LowLeft', 'LowRight']) {
				commands.push(`set \\\\Preset\\OutputGains\\SV\\${out}OutputMute On`)
			}
			break

		case 'unmute_all':
			for (const out of ['HighLeft', 'HighRight', 'MidLeft', 'MidRight', 'LowLeft', 'LowRight']) {
				commands.push(`set \\\\Preset\\OutputGains\\SV\\${out}OutputMute Off`)
			}
			break

		case 'geq_enable':
			for (const base of geqBases()) {
				commands.push(`set ${base}\\SV\\GraphicEQ ${params.value ? 'On' : 'Off'}`)
			}
			break

		case 'geq_band': {
			const label = GEQ_BANDS[params.band]
			if (!label) break
			for (const base of geqBases()) {
				commands.push(`set "${base}\\SV\\${label}" ${params.gain}`)
			}
			break
		}

		case 'geq_flat':
		case 'geq_quick_curve':
			for (const base of geqBases()) {
				commands.push(`set ${base}\\SV\\QuickCurve ${params.mode || 'Flat'}`)
			}
			break

		case 'afs_enable':
			commands.push(`set \\\\Preset\\Afs\\SV\\AFS ${params.value ? 'On' : 'Off'}`)
			break

		case 'afs_mode':
			commands.push(`set \\\\Preset\\Afs\\SV\\FilterMode ${params.mode}`)
			break

		case 'afs_content':
			commands.push(`set "\\\\Preset\\Afs\\SV\\ContentMode" ${params.content}`)
			break

		case 'afs_fixed_filters':
			commands.push(`set \\\\Preset\\Afs\\SV\\MaxFixedFilters ${params.count}`)
			break

		case 'afs_lift_time':
			commands.push(`set \\\\Preset\\Afs\\SV\\LiftTime ${params.seconds}`)
			break

		case 'afs_clear_live':
			commands.push('set \\\\Preset\\Afs\\SV\\ClearLive On')
			break

		case 'afs_clear_all':
			commands.push('set \\\\Preset\\Afs\\SV\\ClearAll On')
			break

		case 'comp_enable':
			commands.push(`set \\\\Preset\\Compressor\\SV\\Compressor ${params.value ? 'On' : 'Off'}`)
			break

		case 'comp_threshold':
			commands.push(`set \\\\Preset\\Compressor\\SV\\Threshold ${params.value}`)
			break

		case 'comp_gain':
			commands.push(`set \\\\Preset\\Compressor\\SV\\Gain ${params.value}`)
			break

		case 'comp_ratio':
			commands.push(`set \\\\Preset\\Compressor\\SV\\Ratio ${params.value}`)
			break

		case 'comp_overeasy':
			commands.push(`set \\\\Preset\\Compressor\\SV\\OverEasy ${params.value}`)
			break

		case 'gen_mode':
			commands.push(`set "\\\\Preset\\SignalGenerator\\SV\\Signal Generator" ${params.mode}`)
			break

		case 'gen_level':
			commands.push(`set "\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude" ${params.value}`)
			break

		case 'sub_enable':
			commands.push(`set \\\\Preset\\SubharmonicSynth\\SV\\SubharmonicSynth ${params.value ? 'On' : 'Off'}`)
			break

		case 'sub_master':
			commands.push(`set \\\\Preset\\SubharmonicSynth\\SV\\Subharmonics ${params.value}`)
			break

		case 'sub_lows':
			commands.push(`set "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 24-36Hz" ${params.value}`)
			break

		case 'sub_highs':
			commands.push(`set "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 36-56Hz" ${params.value}`)
			break

		case 'input_delay_enable':
			commands.push(`set "\\\\Preset\\Back Line Delay\\SV\\Delay" ${params.value ? 'On' : 'Off'}`)
			break

		case 'input_delay_time':
			commands.push(`set "\\\\Preset\\Back Line Delay\\SV\\Amount" ${(params.ms / 1000).toFixed(4)}`)
			break

		case 'rta_rate':
			commands.push(`set \\\\Preset\\RTA\\SV\\Rate ${params.value}`)
			break

		case 'rta_offset':
			commands.push(`set \\\\Preset\\RTA\\SV\\Gain ${params.value}`)
			break

		// ── PEQ ──
		case 'peq_enable':
			commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\ParametricEQ" ${params.value ? 'On' : 'Off'}`)
			break

		case 'peq_flatten':
			commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Flatten" Flat`)
			break

		case 'peq_restore':
			commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Flatten" Restore`)
			break

		case 'peq_filter':
			// params: output, filter, type, freq, gain, q, slope
			if (params.type !== undefined)
				commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Band_${params.filter}_Type" ${params.type}`)
			if (params.freq !== undefined)
				commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Band_${params.filter}_Frequency" ${parseFloat(params.freq).toFixed(2)}`)
			if (params.gain !== undefined)
				commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Band_${params.filter}_Gain" ${parseFloat(params.gain).toFixed(1)}`)
			if (params.q !== undefined)
				commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Band_${params.filter}_Q" ${parseFloat(params.q).toFixed(1)}`)
			if (params.slope !== undefined)
				commands.push(`set "\\\\Preset\\${params.output} Outputs PEQ\\SV\\Band_${params.filter}_Slope" ${parseFloat(params.slope).toFixed(1)}`)
			break

		// ── AutoEQ / RoomEQ ──
		case 'autoeq_enable':
			commands.push(`set \\\\Preset\\RoomEQ\\SV\\ParametricEQ ${params.value ? 'On' : 'Off'}`)
			break

		case 'autoeq_mode':
			commands.push(`set \\\\Preset\\RoomEQ\\SV\\Flatten ${params.mode}`)
			break

		case 'autoeq_filter':
			// Same structure as peq_filter but different base path
			if (params.type !== undefined)
				commands.push(`set "\\\\Preset\\RoomEQ\\SV\\Band_${params.filter}_Type" ${params.type}`)
			if (params.freq !== undefined)
				commands.push(`set "\\\\Preset\\RoomEQ\\SV\\Band_${params.filter}_Frequency" ${parseFloat(params.freq).toFixed(2)}`)
			if (params.gain !== undefined)
				commands.push(`set "\\\\Preset\\RoomEQ\\SV\\Band_${params.filter}_Gain" ${parseFloat(params.gain).toFixed(1)}`)
			if (params.q !== undefined)
				commands.push(`set "\\\\Preset\\RoomEQ\\SV\\Band_${params.filter}_Q" ${parseFloat(params.q).toFixed(1)}`)
			if (params.slope !== undefined)
				commands.push(`set "\\\\Preset\\RoomEQ\\SV\\Band_${params.filter}_Slope" ${parseFloat(params.slope).toFixed(1)}`)
			break

		// ── Limiters ──
		case 'lim_enable':
			commands.push(`set "\\\\Preset\\${params.band} Outputs Limiter\\SV\\Limiter" ${params.value ? 'On' : 'Off'}`)
			break

		case 'lim_threshold':
			commands.push(`set "\\\\Preset\\${params.band} Outputs Limiter\\SV\\Threshold" ${parseFloat(params.value).toFixed(2)}`)
			break

		case 'lim_overeasy':
			commands.push(`set "\\\\Preset\\${params.band} Outputs Limiter\\SV\\OverEasy" ${params.value}`)
			break

		// ── Output Delays ──
		case 'output_delay_enable':
			commands.push(`set "\\\\Preset\\${params.band} Outputs Delay\\SV\\Delay" ${params.value ? 'On' : 'Off'}`)
			break

		case 'output_delay_time':
			commands.push(`set "\\\\Preset\\${params.band} Outputs Delay\\SV\\Amount" ${(params.ms / 1000).toFixed(4)}`)
			break

		// ── Crossover (VERIFIED from dbxdriverack library crossover.py) ──
		// Band naming: Band_1=High, Band_2=Mid, Band_3=Low, MonoSub=Low(mono)
		// params.band should be Band_1, Band_2, Band_3, or MonoSub
		// Use topology.lowMono to determine if Low is MonoSub
		case 'xover_hp_type':
			commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_HPType" ${params.value}`)
			break

		case 'xover_lp_type':
			commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_LPType" ${params.value}`)
			break

		case 'xover_hp_freq':
			// 'Out' uses percentage encoding: send 0 to path with \% suffix
			if (params.value === 'Out' || params.value === -1) {
				commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_HPFrequency\\%" 0`)
			} else {
				commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_HPFrequency" ${parseFloat(params.value).toFixed(2)}`)
			}
			break

		case 'xover_lp_freq':
			// 'Out' uses percentage encoding: send 100 to path with \% suffix
			if (params.value === 'Out' || params.value === -1) {
				commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_LPFrequency\\%" 100`)
			} else {
				commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_LPFrequency" ${parseFloat(params.value).toFixed(2)}`)
			}
			break

		case 'xover_gain':
			commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_Gain" ${parseFloat(params.value).toFixed(2)}`)
			break

		case 'xover_polarity':
			commands.push(`set "\\\\Preset\\Crossover\\SV\\${params.band}_Polarity" ${params.value}`)
			break

		// Compound actions
		case 'show_open':
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			break

		case 'show_close':
			commands.push(...buildCommand('mute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_clear_live', {}, topology))
			break

		case 'soundcheck_start':
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('geq_flat', { mode: 'Flat' }, topology))
			break

		case 'ring_out':
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Fixed' }, topology))
			commands.push(...buildCommand('afs_fixed_filters', { count: 12 }, topology))
			commands.push(...buildCommand('afs_clear_all', {}, topology))
			break

		case 'panic_mute':
			commands.push(...buildCommand('mute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			break

		// safe_unmute: state check is in ACTION CALLBACK per READ FIRST rule 4
		// buildCommand just generates the unmute commands
		case 'safe_unmute':
			commands.push(...buildCommand('unmute_all', {}, topology))
			break

		// ── Preset recall ──
		case 'preset_recall':
			commands.push(`set "\\\\Storage\\Presets\\SV\\CurrentPreset" ${params.number}`)
			break

		// ═══ SMART MACROS ═══

		// Speech mode — optimized for spoken word (announcements, MC, pastor)
		case 'macro_speech':
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -24 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '3.0:1' }, topology))
			commands.push(...buildCommand('comp_gain', { value: 3 }, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			break

		// Music mode — wider dynamics, music-aware AFS
		case 'macro_music':
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Music' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -18 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '2.0:1' }, topology))
			commands.push(...buildCommand('comp_gain', { value: 0 }, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			break

		// Band changeover — mute, flatten EQ, clear AFS, reset for next act
		case 'macro_changeover':
			commands.push(...buildCommand('mute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_clear_live', {}, topology))
			commands.push(...buildCommand('geq_flat', { mode: 'Flat' }, topology))
			commands.push(...buildCommand('peq_flatten', { output: 'High' }, topology))
			commands.push(...buildCommand('comp_enable', { value: false }, topology))
			break

		// Monitor check — safe pink noise for tuning monitors/speakers
		case 'macro_monitor_check':
			commands.push(...buildCommand('mute_all', {}, topology))
			commands.push(...buildCommand('gen_level', { value: -20 }, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Pink' }, topology))
			commands.push(...buildCommand('comp_enable', { value: false }, topology))
			commands.push(...buildCommand('lim_enable', { band: 'High', value: true }, topology))
			commands.push(...buildCommand('lim_threshold', { band: 'High', value: -6 }, topology))
			break

		// Vocal focus — cut mud, boost presence, tame sibilance
		case 'macro_vocal_focus':
			// Band 12 (250Hz) -4dB: reduce mud
			commands.push(...buildCommand('geq_band_set', { band: 12, gain: -4 }, topology))
			// Band 14 (400Hz) -3dB: reduce boxiness
			commands.push(...buildCommand('geq_band_set', { band: 14, gain: -3 }, topology))
			// Band 20 (1.6kHz) +2dB: add clarity
			commands.push(...buildCommand('geq_band_set', { band: 20, gain: 2 }, topology))
			// Band 22 (2.5kHz) +3dB: presence
			commands.push(...buildCommand('geq_band_set', { band: 22, gain: 3 }, topology))
			// Band 27 (8kHz) -2dB: tame sibilance
			commands.push(...buildCommand('geq_band_set', { band: 27, gain: -2 }, topology))
			break

		// De-mud — surgical cut of common mud/boom frequencies
		case 'macro_de_mud':
			commands.push(...buildCommand('geq_band_set', { band: 10, gain: -3 }, topology))  // 160Hz
			commands.push(...buildCommand('geq_band_set', { band: 11, gain: -4 }, topology))  // 200Hz
			commands.push(...buildCommand('geq_band_set', { band: 12, gain: -5 }, topology))  // 250Hz
			commands.push(...buildCommand('geq_band_set', { band: 13, gain: -4 }, topology))  // 315Hz
			commands.push(...buildCommand('geq_band_set', { band: 14, gain: -3 }, topology))  // 400Hz
			break

		// Sibilance tamer — cut harsh high frequencies
		case 'macro_de_ess':
			commands.push(...buildCommand('geq_band_set', { band: 24, gain: -2 }, topology))  // 4kHz
			commands.push(...buildCommand('geq_band_set', { band: 25, gain: -3 }, topology))  // 5kHz
			commands.push(...buildCommand('geq_band_set', { band: 26, gain: -4 }, topology))  // 6.3kHz
			commands.push(...buildCommand('geq_band_set', { band: 27, gain: -3 }, topology))  // 8kHz
			commands.push(...buildCommand('geq_band_set', { band: 28, gain: -2 }, topology))  // 10kHz
			break

		// Low cut — remove sub rumble (stage noise, HVAC, wind)
		case 'macro_low_cut':
			commands.push(...buildCommand('geq_band_set', { band: 1, gain: -12 }, topology))  // 20Hz
			commands.push(...buildCommand('geq_band_set', { band: 2, gain: -12 }, topology))  // 25Hz
			commands.push(...buildCommand('geq_band_set', { band: 3, gain: -10 }, topology))  // 31.5Hz
			commands.push(...buildCommand('geq_band_set', { band: 4, gain: -8 }, topology))   // 40Hz
			commands.push(...buildCommand('geq_band_set', { band: 5, gain: -6 }, topology))   // 50Hz
			commands.push(...buildCommand('geq_band_set', { band: 6, gain: -3 }, topology))   // 63Hz
			break

		// Loudness contour — Fletcher-Munson compensation for low-volume playback
		case 'macro_loudness':
			commands.push(...buildCommand('geq_band_set', { band: 3, gain: 4 }, topology))    // 31.5Hz +4
			commands.push(...buildCommand('geq_band_set', { band: 5, gain: 3 }, topology))    // 50Hz +3
			commands.push(...buildCommand('geq_band_set', { band: 7, gain: 2 }, topology))    // 80Hz +2
			commands.push(...buildCommand('geq_band_set', { band: 22, gain: 2 }, topology))   // 2.5kHz +2
			commands.push(...buildCommand('geq_band_set', { band: 24, gain: 3 }, topology))   // 4kHz +3
			commands.push(...buildCommand('geq_band_set', { band: 28, gain: 2 }, topology))   // 10kHz +2
			break

		// Intermission — background music settings (gentle, compressed, no feedback risk)
		case 'macro_intermission':
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Fixed' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Music' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -30 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '4.0:1' }, topology))
			commands.push(...buildCommand('comp_gain', { value: 6 }, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			break

		// DJ handoff — settings for DJ taking over (wide dynamics, subs hot)
		case 'macro_dj':
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'DJ' }, topology))
			commands.push(...buildCommand('afs_enable', { value: false }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -12 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '2.0:1' }, topology))
			commands.push(...buildCommand('comp_gain', { value: 0 }, topology))
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { value: 75 }, topology))
			break

		// Full reset — nuclear option, everything back to safe defaults
		case 'macro_full_reset':
			commands.push(...buildCommand('mute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('geq_flat', { mode: 'Flat' }, topology))
			commands.push(...buildCommand('peq_flatten', { output: 'High' }, topology))
			commands.push(...buildCommand('afs_clear_all', {}, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech Music' }, topology))
			commands.push(...buildCommand('comp_enable', { value: false }, topology))
			commands.push(...buildCommand('lim_enable', { band: 'High', value: false }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('input_delay_enable', { value: false }, topology))
			break

		// ── NEW LIVE SOUND MACROS ──
		case 'macro_outdoor':
			// Outdoor venue: cut room boom, boost highs for throw
			for (const [band, gain] of [[11, -2], [12, -2], [13, -2], [14, -2], [24, 2], [25, 2], [26, 2], [27, 2]]) {
				commands.push(...buildCommand('geq_band_set', { band, gain }, topology))
			}
			commands.push(...buildCommand('afs_content', { content: 'Music' }, topology))
			break

		case 'macro_feedback_emergency':
			// Kill mids — emergency feedback suppression
			for (const band of [17, 18, 19, 20, 21, 22, 23, 24]) {
				commands.push(...buildCommand('geq_band_set', { band, gain: -6 }, topology))
			}
			commands.push(...buildCommand('afs_clear_live', {}, topology))
			break

		case 'macro_sub_check':
			// Subharmonic test: enable sub, send pink noise
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { value: 75 }, topology))
			commands.push(...buildCommand('sub_lows', { value: 100 }, topology))
			commands.push(...buildCommand('sub_highs', { value: 50 }, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Pink' }, topology))
			commands.push(...buildCommand('gen_level', { value: -30 }, topology))
			break

		case 'macro_walk_music':
			// Walk-in/walk-out music: compression + loudness curve + sub
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -20 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '4.0:1' }, topology))
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { value: 50 }, topology))
			// Loudness contour: boost lows and highs
			for (const [band, gain] of [[1, 4], [2, 4], [3, 3], [4, 3], [5, 2], [6, 2], [27, 2], [28, 2], [29, 3], [30, 3], [31, 4]]) {
				commands.push(...buildCommand('geq_band_set', { band, gain }, topology))
			}
			break

		case 'macro_prayer':
			// Spoken word: minimal processing, clean signal
			commands.push(...buildCommand('comp_enable', { value: false }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('geq_flat', { mode: 'Flat' }, topology))
			break

		case 'macro_worship':
			// Worship band: full processing, sub, music mode
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { level: 50 }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Music' }, topology))
			break

		// ═══ CORPORATE AV SCENE MACROS ═══

		case 'scene_keynote':
			// Single presenter at podium: speech AFS, gentle comp, no sub, speech GEQ
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -25 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '2.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 5 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 3 }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Speech' }, topology))
			break

		case 'scene_panel':
			// Multiple table mics: aggressive AFS, heavier comp for level matching
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('afs_fixed_filters', { count: 12 }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -20 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '4.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 3 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 5 }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Flat' }, topology))
			// Cut rumble below 100Hz
			for (let b = 1; b <= 7; b++) {
				commands.push(...buildCommand('geq_band_set', { band: b, gain: -12 }, topology))
			}
			commands.push(...buildCommand('geq_band_set', { band: 8, gain: -6 }, topology))
			break

		case 'scene_qa':
			// Handheld roaming: max AFS, speech, comp for varying distance
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('afs_fixed_filters', { count: 12 }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -22 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '3.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 4 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 4 }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Speech' }, topology))
			// Presence boost for intelligibility
			commands.push(...buildCommand('geq_band_set', { band: 21, gain: 2 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 22, gain: 2 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 23, gain: 1 }, topology))
			break

		case 'scene_video':
			// Video playback: music AFS, comp, sub on, full bandwidth
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Music' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -15 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '3.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 5 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 3 }, topology))
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { level: 50 }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Flat' }, topology))
			break

		case 'scene_break':
			// Break music: loudness curve, comp, sub, background level
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Music' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -20 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '4.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 5 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 2 }, topology))
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { level: 40 }, topology))
			commands.push(...buildCommand('macro_loudness', {}, topology))
			break

		case 'scene_hybrid':
			// Zoom/Teams: heavy comp for consistent send, no sub, clean flat
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Live' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('afs_fixed_filters', { count: 12 }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -18 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '5.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 3 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 6 }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Flat' }, topology))
			for (let b = 1; b <= 7; b++) {
				commands.push(...buildCommand('geq_band_set', { band: b, gain: -12 }, topology))
			}
			commands.push(...buildCommand('geq_band_set', { band: 8, gain: -6 }, topology))
			break

		case 'scene_awards':
			// Ceremony — speech + walk-up music: balanced
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech Music' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -20 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '3.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 5 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 4 }, topology))
			commands.push(...buildCommand('sub_enable', { value: true }, topology))
			commands.push(...buildCommand('sub_master', { level: 30 }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Flat' }, topology))
			break

		case 'scene_announce':
			// Emergency PA: max intelligibility, heavy comp, presence boost
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -15 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '8.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 2 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 8 }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Speech' }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 21, gain: 3 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 22, gain: 4 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 23, gain: 3 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 24, gain: 2 }, topology))
			for (let b = 1; b <= 6; b++) {
				commands.push(...buildCommand('geq_band_set', { band: b, gain: -12 }, topology))
			}
			break

		case 'scene_lectern':
			// Fixed podium mic: AFS Fixed for ring-out, anti-feedback GEQ cuts
			commands.push(...buildCommand('unmute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			commands.push(...buildCommand('afs_enable', { value: true }, topology))
			commands.push(...buildCommand('afs_mode', { mode: 'Fixed' }, topology))
			commands.push(...buildCommand('afs_content', { content: 'Speech' }, topology))
			commands.push(...buildCommand('afs_fixed_filters', { count: 12 }, topology))
			commands.push(...buildCommand('comp_enable', { value: true }, topology))
			commands.push(...buildCommand('comp_threshold', { value: -22 }, topology))
			commands.push(...buildCommand('comp_ratio', { value: '3.0:1' }, topology))
			commands.push(...buildCommand('comp_overeasy', { value: 4 }, topology))
			commands.push(...buildCommand('comp_gain', { value: 4 }, topology))
			commands.push(...buildCommand('sub_enable', { value: false }, topology))
			commands.push(...buildCommand('geq_quick_curve', { mode: 'Speech' }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 12, gain: -3 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 17, gain: -2 }, topology))
			commands.push(...buildCommand('geq_band_set', { band: 20, gain: -2 }, topology))
			break

		case 'scene_mute_hold':
			// Presenter paused — mute everything
			commands.push(...buildCommand('mute_all', {}, topology))
			commands.push(...buildCommand('gen_mode', { mode: 'Off' }, topology))
			break

		// ── GEQ increment/decrement (resolved gain computed in action callback) ──
		case 'geq_band_set': {
			const label = GEQ_BANDS[params.band]
			if (!label) break
			for (const base of geqBases()) {
				commands.push(`set "${base}\\SV\\${label}" ${params.gain}`)
			}
			break
		}
	}

	return commands
}

module.exports = {
	GEQ_BANDS,
	GEQ_LABELS_TO_NUM,
	parseResponse,
	buildCommand,
}
