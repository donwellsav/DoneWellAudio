const { buildCommand, GEQ_BANDS } = require('./pa2-protocol')
const dgram = require('dgram')

// Mute output choices
const MUTE_OUTPUTS = [
	{ id: 'HighLeft', label: 'High Left' },
	{ id: 'HighRight', label: 'High Right' },
	{ id: 'MidLeft', label: 'Mid Left' },
	{ id: 'MidRight', label: 'Mid Right' },
	{ id: 'LowLeft', label: 'Low Left' },
	{ id: 'LowRight', label: 'Low Right' },
]

// Output band choices (for PEQ, limiters, delays)
const OUTPUT_BANDS = [
	{ id: 'High', label: 'High' },
	{ id: 'Mid', label: 'Mid' },
	{ id: 'Low', label: 'Low' },
]

// GEQ band choices (1-31)
const GEQ_BAND_CHOICES = Object.entries(GEQ_BANDS).map(([num, label]) => ({
	id: parseInt(num),
	label: `${num}: ${label}`,
}))

// Crossover band choices
const XOVER_BANDS = [
	{ id: 'Band_1', label: 'Band 1 (High)' },
	{ id: 'Band_2', label: 'Band 2 (Mid)' },
	{ id: 'Band_3', label: 'Band 3 (Low)' },
	{ id: 'MonoSub', label: 'Mono Sub' },
]

// Crossover filter type choices
const XOVER_FILTER_TYPES = [
	{ id: 'BW 6', label: 'BW 6' },
	{ id: 'BW 12', label: 'BW 12' },
	{ id: 'BW 18', label: 'BW 18' },
	{ id: 'BW 24', label: 'BW 24' },
	{ id: 'BW 30', label: 'BW 30' },
	{ id: 'BW 36', label: 'BW 36' },
	{ id: 'BW 42', label: 'BW 42' },
	{ id: 'BW 48', label: 'BW 48' },
	{ id: 'LR 12', label: 'LR 12' },
	{ id: 'LR 24', label: 'LR 24' },
	{ id: 'LR 36', label: 'LR 36' },
	{ id: 'LR 48', label: 'LR 48' },
]

// PEQ filter type choices
const PEQ_FILTER_TYPES = [
	{ id: 'Bell', label: 'Bell' },
	{ id: 'Low Shelf', label: 'Low Shelf' },
	{ id: 'High Shelf', label: 'High Shelf' },
]

// PEQ filter number choices (1-8)
const PEQ_FILTER_NUMS = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, label: `Band ${i + 1}` }))

// On/Off toggle choices
const ON_OFF = [
	{ id: 'true', label: 'On' },
	{ id: 'false', label: 'Off' },
]

// Compressor ratio choices
const COMP_RATIOS = [
	'1.0:1', '1.2:1', '1.5:1', '2.0:1', '2.5:1', '3.0:1', '4.0:1', '5.0:1',
	'6.0:1', '8.0:1', '10.0:1', '15.0:1', '20.0:1', '40.0:1', 'Inf:1',
].map((r) => ({ id: r, label: r }))

module.exports = function (self) {
	self.setActionDefinitions({
		// ═══ MUTES ═══
		mute_toggle: {
			name: 'Mute Toggle',
			options: [{ id: 'output', type: 'dropdown', label: 'Output', choices: MUTE_OUTPUTS, default: 'HighLeft' }],
			callback: async (event) => {
				const out = event.options.output
				const current = self.pa2State.mutes[out]
				const cmds = buildCommand('mute_set', { output: out, value: !current }, self.topology)
				self.sendCommands(cmds)
			},
		},
		mute_set: {
			name: 'Mute Set',
			options: [
				{ id: 'output', type: 'dropdown', label: 'Output', choices: MUTE_OUTPUTS, default: 'HighLeft' },
				{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' },
			],
			callback: async (event) => {
				const cmds = buildCommand('mute_set', { output: event.options.output, value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		mute_all: {
			name: 'Mute All Outputs',
			options: [],
			callback: async () => {
				const cmds = buildCommand('mute_all', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		unmute_all: {
			name: 'Unmute All Outputs',
			options: [],
			callback: async () => {
				const cmds = buildCommand('unmute_all', {}, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ GEQ ═══
		geq_enable: {
			name: 'GEQ Enable/Disable',
			options: [{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' }],
			callback: async (event) => {
				const cmds = buildCommand('geq_enable', { value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		geq_flat: {
			name: 'GEQ Flat',
			options: [],
			callback: async () => {
				const cmds = buildCommand('geq_flat', { mode: 'Flat' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		geq_quick_curve: {
			name: 'GEQ Quick Curve',
			options: [{
				id: 'mode', type: 'dropdown', label: 'Mode',
				choices: [
					{ id: 'Flat', label: 'Flat' },
					{ id: 'MyBand', label: 'MyBand' },
					{ id: 'Speech', label: 'Speech' },
					{ id: 'PerformanceVenue', label: 'Performance Venue' },
					{ id: 'DJ', label: 'DJ' },
				],
				default: 'Flat',
			}],
			callback: async (event) => {
				const cmds = buildCommand('geq_quick_curve', { mode: event.options.mode }, self.topology)
				self.sendCommands(cmds)
			},
		},
		geq_band: {
			name: 'GEQ Band Gain',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: GEQ_BAND_CHOICES, default: 18 },
				{ id: 'gain', type: 'number', label: 'Gain (dB)', default: 0, min: -12, max: 12, step: 0.5 },
			],
			callback: async (event) => {
				const cmds = buildCommand('geq_band', { band: event.options.band, gain: event.options.gain }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ PEQ ═══
		peq_enable: {
			name: 'PEQ Enable/Disable',
			options: [
				{ id: 'output', type: 'dropdown', label: 'Output', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' },
			],
			callback: async (event) => {
				const cmds = buildCommand('peq_enable', { output: event.options.output, value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		peq_flatten: {
			name: 'PEQ Flatten',
			options: [{ id: 'output', type: 'dropdown', label: 'Output', choices: OUTPUT_BANDS, default: 'High' }],
			callback: async (event) => {
				const cmds = buildCommand('peq_flatten', { output: event.options.output }, self.topology)
				self.sendCommands(cmds)
			},
		},
		peq_restore: {
			name: 'PEQ Restore',
			options: [{ id: 'output', type: 'dropdown', label: 'Output', choices: OUTPUT_BANDS, default: 'High' }],
			callback: async (event) => {
				const cmds = buildCommand('peq_restore', { output: event.options.output }, self.topology)
				self.sendCommands(cmds)
			},
		},
		peq_filter: {
			name: 'PEQ Filter',
			options: [
				{ id: 'output', type: 'dropdown', label: 'Output', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'filter', type: 'dropdown', label: 'Filter', choices: PEQ_FILTER_NUMS, default: 1 },
				{ id: 'type', type: 'dropdown', label: 'Type', choices: PEQ_FILTER_TYPES, default: 'Bell' },
				{ id: 'freq', type: 'number', label: 'Frequency (Hz)', default: 1000, min: 20, max: 20000 },
				{ id: 'gain', type: 'number', label: 'Gain (dB)', default: 0, min: -20, max: 20, step: 0.5 },
				{ id: 'q', type: 'number', label: 'Q (Bell)', default: 4, min: 0.1, max: 16, step: 0.1 },
				{ id: 'slope', type: 'number', label: 'Slope (Shelf)', default: 6, min: 3, max: 15, step: 0.5 },
			],
			callback: async (event) => {
				const o = event.options
				const cmds = buildCommand('peq_filter', {
					output: o.output, filter: o.filter,
					type: o.type, freq: o.freq, gain: o.gain, q: o.q, slope: o.slope,
				}, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ ROOM EQ / AUTO EQ ═══
		autoeq_enable: {
			name: 'Room EQ Enable/Disable',
			options: [{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' }],
			callback: async (event) => {
				const cmds = buildCommand('autoeq_enable', { value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		autoeq_mode: {
			name: 'Room EQ Mode',
			options: [{
				id: 'mode', type: 'dropdown', label: 'Mode',
				choices: [{ id: 'Flat', label: 'Flat' }, { id: 'Manual', label: 'Manual' }, { id: 'AutoEQ', label: 'AutoEQ' }],
				default: 'AutoEQ',
			}],
			callback: async (event) => {
				const cmds = buildCommand('autoeq_mode', { mode: event.options.mode }, self.topology)
				self.sendCommands(cmds)
			},
		},
		autoeq_filter: {
			name: 'Room EQ Filter',
			options: [
				{ id: 'filter', type: 'dropdown', label: 'Filter', choices: PEQ_FILTER_NUMS, default: 1 },
				{ id: 'type', type: 'dropdown', label: 'Type', choices: PEQ_FILTER_TYPES, default: 'Bell' },
				{ id: 'freq', type: 'number', label: 'Frequency (Hz)', default: 1000, min: 20, max: 20000 },
				{ id: 'gain', type: 'number', label: 'Gain (dB)', default: 0, min: -20, max: 20, step: 0.5 },
				{ id: 'q', type: 'number', label: 'Q (Bell)', default: 4, min: 0.1, max: 16, step: 0.1 },
				{ id: 'slope', type: 'number', label: 'Slope (Shelf)', default: 6, min: 3, max: 15, step: 0.5 },
			],
			callback: async (event) => {
				const o = event.options
				const cmds = buildCommand('autoeq_filter', {
					filter: o.filter, type: o.type, freq: o.freq, gain: o.gain, q: o.q, slope: o.slope,
				}, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ AFS ═══
		afs_enable: {
			name: 'AFS Enable/Disable',
			options: [{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' }],
			callback: async (event) => {
				const cmds = buildCommand('afs_enable', { value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		afs_mode: {
			name: 'AFS Filter Mode',
			options: [{
				id: 'mode', type: 'dropdown', label: 'Mode',
				choices: [{ id: 'Live', label: 'Live' }, { id: 'Fixed', label: 'Fixed' }],
				default: 'Live',
			}],
			callback: async (event) => {
				const cmds = buildCommand('afs_mode', { mode: event.options.mode }, self.topology)
				self.sendCommands(cmds)
			},
		},
		afs_content: {
			name: 'AFS Content Mode',
			options: [{
				id: 'content', type: 'dropdown', label: 'Content',
				choices: [
					{ id: 'Speech', label: 'Speech' },
					{ id: 'Music', label: 'Music' },
					{ id: 'Speech Music', label: 'Speech Music' },
				],
				default: 'Speech Music',
			}],
			callback: async (event) => {
				const cmds = buildCommand('afs_content', { content: event.options.content }, self.topology)
				self.sendCommands(cmds)
			},
		},
		afs_fixed_filters: {
			name: 'AFS Max Fixed Filters',
			options: [{ id: 'count', type: 'number', label: 'Count (0-12)', default: 6, min: 0, max: 12 }],
			callback: async (event) => {
				const cmds = buildCommand('afs_fixed_filters', { count: event.options.count }, self.topology)
				self.sendCommands(cmds)
			},
		},
		afs_lift_time: {
			name: 'AFS Lift Time',
			options: [{ id: 'seconds', type: 'number', label: 'Seconds (5-3600)', default: 300, min: 5, max: 3600 }],
			callback: async (event) => {
				const cmds = buildCommand('afs_lift_time', { seconds: event.options.seconds }, self.topology)
				self.sendCommands(cmds)
			},
		},
		afs_clear_live: {
			name: 'AFS Clear Live Filters',
			options: [],
			callback: async () => {
				const cmds = buildCommand('afs_clear_live', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		afs_clear_all: {
			name: 'AFS Clear All Filters',
			options: [],
			callback: async () => {
				const cmds = buildCommand('afs_clear_all', {}, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ COMPRESSOR ═══
		comp_enable: {
			name: 'Compressor Enable/Disable',
			options: [{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' }],
			callback: async (event) => {
				const cmds = buildCommand('comp_enable', { value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		comp_threshold: {
			name: 'Compressor Threshold',
			options: [{ id: 'value', type: 'number', label: 'Threshold (dB)', default: -20, min: -60, max: 0 }],
			callback: async (event) => {
				const cmds = buildCommand('comp_threshold', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		comp_gain: {
			name: 'Compressor Gain',
			options: [{ id: 'value', type: 'number', label: 'Gain (dB)', default: 0, min: -20, max: 20 }],
			callback: async (event) => {
				const cmds = buildCommand('comp_gain', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		comp_ratio: {
			name: 'Compressor Ratio',
			options: [{ id: 'value', type: 'dropdown', label: 'Ratio', choices: COMP_RATIOS, default: '4.0:1' }],
			callback: async (event) => {
				const cmds = buildCommand('comp_ratio', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		comp_overeasy: {
			name: 'Compressor OverEasy',
			options: [{ id: 'value', type: 'number', label: 'OverEasy (0-10)', default: 0, min: 0, max: 10 }],
			callback: async (event) => {
				const cmds = buildCommand('comp_overeasy', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ LIMITERS ═══
		lim_enable: {
			name: 'Limiter Enable/Disable',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' },
			],
			callback: async (event) => {
				const cmds = buildCommand('lim_enable', { band: event.options.band, value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		lim_threshold: {
			name: 'Limiter Threshold',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'value', type: 'number', label: 'Threshold (dB)', default: -6, min: -60, max: 0 },
			],
			callback: async (event) => {
				const cmds = buildCommand('lim_threshold', { band: event.options.band, value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		lim_overeasy: {
			name: 'Limiter OverEasy',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'value', type: 'number', label: 'OverEasy (0-10)', default: 0, min: 0, max: 10 },
			],
			callback: async (event) => {
				const cmds = buildCommand('lim_overeasy', { band: event.options.band, value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ CROSSOVER ═══
		xover_hp_type: {
			name: 'Crossover HP Filter Type',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: XOVER_BANDS, default: 'Band_1' },
				{ id: 'value', type: 'dropdown', label: 'Type', choices: XOVER_FILTER_TYPES, default: 'BW 24' },
			],
			callback: async (event) => {
				const cmds = buildCommand('xover_hp_type', { band: event.options.band, value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		xover_lp_type: {
			name: 'Crossover LP Filter Type',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: XOVER_BANDS, default: 'Band_1' },
				{ id: 'value', type: 'dropdown', label: 'Type', choices: XOVER_FILTER_TYPES, default: 'BW 24' },
			],
			callback: async (event) => {
				const cmds = buildCommand('xover_lp_type', { band: event.options.band, value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		xover_hp_freq: {
			name: 'Crossover HP Frequency',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: XOVER_BANDS, default: 'Band_1' },
				{ id: 'value', type: 'number', label: 'Freq (Hz, -1=Out)', default: 80, min: -1, max: 20000 },
			],
			callback: async (event) => {
				const val = event.options.value === -1 ? 'Out' : event.options.value
				const cmds = buildCommand('xover_hp_freq', { band: event.options.band, value: val }, self.topology)
				self.sendCommands(cmds)
			},
		},
		xover_lp_freq: {
			name: 'Crossover LP Frequency',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: XOVER_BANDS, default: 'Band_1' },
				{ id: 'value', type: 'number', label: 'Freq (Hz, -1=Out)', default: 1200, min: -1, max: 20000 },
			],
			callback: async (event) => {
				const val = event.options.value === -1 ? 'Out' : event.options.value
				const cmds = buildCommand('xover_lp_freq', { band: event.options.band, value: val }, self.topology)
				self.sendCommands(cmds)
			},
		},
		xover_gain: {
			name: 'Crossover Band Gain',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: XOVER_BANDS, default: 'Band_1' },
				{ id: 'value', type: 'number', label: 'Gain (dB)', default: 0, min: -60, max: 20 },
			],
			callback: async (event) => {
				const cmds = buildCommand('xover_gain', { band: event.options.band, value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		xover_polarity: {
			name: 'Crossover Polarity',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: XOVER_BANDS, default: 'Band_1' },
				{ id: 'value', type: 'dropdown', label: 'Polarity', choices: [{ id: 'Normal', label: 'Normal' }, { id: 'Inverted', label: 'Inverted' }], default: 'Normal' },
			],
			callback: async (event) => {
				const cmds = buildCommand('xover_polarity', { band: event.options.band, value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ DELAYS ═══
		input_delay_enable: {
			name: 'Input Delay Enable/Disable',
			options: [{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' }],
			callback: async (event) => {
				const cmds = buildCommand('input_delay_enable', { value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		input_delay_time: {
			name: 'Input Delay Time',
			options: [{ id: 'ms', type: 'number', label: 'Time (ms)', default: 0, min: 0, max: 100, step: 0.5 }],
			callback: async (event) => {
				const cmds = buildCommand('input_delay_time', { ms: event.options.ms }, self.topology)
				self.sendCommands(cmds)
			},
		},
		output_delay_enable: {
			name: 'Output Delay Enable/Disable',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' },
			],
			callback: async (event) => {
				const cmds = buildCommand('output_delay_enable', { band: event.options.band, value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		output_delay_time: {
			name: 'Output Delay Time',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: OUTPUT_BANDS, default: 'High' },
				{ id: 'ms', type: 'number', label: 'Time (ms)', default: 0, min: 0, max: 10, step: 0.1 },
			],
			callback: async (event) => {
				const cmds = buildCommand('output_delay_time', { band: event.options.band, ms: event.options.ms }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ SUBHARMONIC ═══
		sub_enable: {
			name: 'Subharmonic Enable/Disable',
			options: [{ id: 'value', type: 'dropdown', label: 'State', choices: ON_OFF, default: 'true' }],
			callback: async (event) => {
				const cmds = buildCommand('sub_enable', { value: event.options.value === 'true' }, self.topology)
				self.sendCommands(cmds)
			},
		},
		sub_master: {
			name: 'Subharmonic Master Level',
			options: [{ id: 'value', type: 'number', label: 'Level (0-100%)', default: 50, min: 0, max: 100 }],
			callback: async (event) => {
				const cmds = buildCommand('sub_master', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		sub_lows: {
			name: 'Subharmonic Lows (24-36Hz)',
			options: [{ id: 'value', type: 'number', label: 'Level (0-100%)', default: 50, min: 0, max: 100 }],
			callback: async (event) => {
				const cmds = buildCommand('sub_lows', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		sub_highs: {
			name: 'Subharmonic Highs (36-56Hz)',
			options: [{ id: 'value', type: 'number', label: 'Level (0-100%)', default: 50, min: 0, max: 100 }],
			callback: async (event) => {
				const cmds = buildCommand('sub_highs', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ GENERATOR ═══
		gen_mode: {
			name: 'Signal Generator Mode',
			options: [{
				id: 'mode', type: 'dropdown', label: 'Mode',
				choices: [{ id: 'Off', label: 'Off' }, { id: 'Pink', label: 'Pink Noise' }, { id: 'White', label: 'White Noise' }],
				default: 'Off',
			}],
			callback: async (event) => {
				const cmds = buildCommand('gen_mode', { mode: event.options.mode }, self.topology)
				self.sendCommands(cmds)
			},
		},
		gen_level: {
			name: 'Signal Generator Level',
			options: [{ id: 'value', type: 'number', label: 'Level (dB)', default: -60, min: -60, max: 0 }],
			callback: async (event) => {
				const cmds = buildCommand('gen_level', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ RTA ═══
		rta_rate: {
			name: 'RTA Rate',
			options: [{
				id: 'value', type: 'dropdown', label: 'Rate',
				choices: [{ id: 'Slow', label: 'Slow' }, { id: 'Fast', label: 'Fast' }],
				default: 'Slow',
			}],
			callback: async (event) => {
				const cmds = buildCommand('rta_rate', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},
		rta_offset: {
			name: 'RTA Graph Offset',
			options: [{ id: 'value', type: 'number', label: 'Offset (0-40 dB)', default: 0, min: 0, max: 40 }],
			callback: async (event) => {
				const cmds = buildCommand('rta_offset', { value: event.options.value }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ RAW ═══
		raw_command: {
			name: 'Raw PA2 Command',
			options: [{ id: 'command', type: 'textinput', label: 'Command', default: 'get \\\\Node\\AT\\Class_Name' }],
			callback: async (event) => {
				self.sendCommand(event.options.command)
			},
		},

		// ═══ COMPOUND ACTIONS ═══
		show_open: {
			name: 'Show Open (Go Live)',
			options: [],
			callback: async () => {
				const cmds = buildCommand('show_open', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		show_close: {
			name: 'Show Close',
			options: [],
			callback: async () => {
				const cmds = buildCommand('show_close', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		soundcheck_start: {
			name: 'Soundcheck Start',
			options: [],
			callback: async () => {
				const cmds = buildCommand('soundcheck_start', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		ring_out: {
			name: 'Ring Out (AFS Fixed)',
			options: [],
			callback: async () => {
				const cmds = buildCommand('ring_out', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		panic_mute: {
			name: 'PANIC MUTE',
			options: [],
			callback: async () => {
				const cmds = buildCommand('panic_mute', {}, self.topology)
				self.sendCommands(cmds)
			},
		},
		safe_unmute: {
			name: 'Safe Unmute (checks generator)',
			options: [],
			callback: async () => {
				// READ FIRST rule 4: generator check in ACTION CALLBACK, not buildCommand
				if (self.pa2State.generator.mode !== 'Off') {
					self.log('warn', `Safe unmute BLOCKED — generator is ${self.pa2State.generator.mode}. Turn off generator first.`)
					return
				}
				const cmds = buildCommand('safe_unmute', {}, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ PRESET RECALL ═══
		preset_recall: {
			name: 'Recall Preset',
			options: [{ id: 'number', type: 'number', label: 'Preset Number (1-75)', default: 1, min: 1, max: 75 }],
			callback: async (event) => {
				const cmds = buildCommand('preset_recall', { number: event.options.number }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// ═══ GEQ INCREMENT / DECREMENT ═══
		geq_increment: {
			name: 'GEQ Band +dB',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: GEQ_BAND_CHOICES, default: 18 },
				{ id: 'step', type: 'number', label: 'Step (dB)', default: 1, min: 0.5, max: 6, step: 0.5 },
			],
			callback: async (event) => {
				const band = event.options.band
				const current = self.pa2State.geq.bands[band] || 0
				const newGain = Math.min(12, current + event.options.step)
				const cmds = buildCommand('geq_band_set', { band, gain: newGain }, self.topology)
				self.sendCommandsBurst(cmds)
			},
		},
		geq_decrement: {
			name: 'GEQ Band -dB',
			options: [
				{ id: 'band', type: 'dropdown', label: 'Band', choices: GEQ_BAND_CHOICES, default: 18 },
				{ id: 'step', type: 'number', label: 'Step (dB)', default: 1, min: 0.5, max: 6, step: 0.5 },
			],
			callback: async (event) => {
				const band = event.options.band
				const current = self.pa2State.geq.bands[band] || 0
				const newGain = Math.max(-12, current - event.options.step)
				const cmds = buildCommand('geq_band_set', { band, gain: newGain }, self.topology)
				self.sendCommandsBurst(cmds)
			},
		},
		// ═══ NETWORK SCAN ═══
		scan_network: {
			name: 'Scan for PA2 Devices',
			options: [],
			callback: async () => {
				self.log('info', 'Scanning network for PA2 devices...')
				const udp = dgram.createSocket('udp4')
				const found = []
				udp.on('message', (msg, rinfo) => {
					const line = msg.toString().trim()
					if (line.includes('dbxDriveRackPA2') || line.includes('Class_Name')) {
						const existing = found.find(f => f.ip === rinfo.address)
						if (!existing) {
							found.push({ ip: rinfo.address })
							self.log('info', `Found PA2 at ${rinfo.address}`)
						}
						// Try to extract name
						const nameMatch = line.match(/Instance_Name"\s+"([^"]+)"/)
						if (nameMatch) {
							const entry = found.find(f => f.ip === rinfo.address)
							if (entry) entry.name = nameMatch[1]
							self.log('info', `PA2 "${nameMatch[1]}" at ${rinfo.address}`)
						}
					}
				})
				udp.on('error', (err) => {
					self.log('error', `UDP scan error: ${err.message}`)
					udp.close()
				})
				udp.bind(() => {
					udp.setBroadcast(true)
					const probe = 'delay 100\nget \\\\Node\\AT\\Class_Name\nget \\\\Node\\AT\\Instance_Name\nget \\\\Node\\AT\\Software_Version\n'
					udp.send(probe, 0, probe.length, 19272, '255.255.255.255', (err) => {
						if (err) self.log('error', `UDP send error: ${err.message}`)
					})
					setTimeout(() => {
						udp.close()
						if (found.length === 0) {
							self.log('warn', 'No PA2 devices found on network')
						} else {
							self.log('info', `Scan complete: found ${found.length} PA2 device(s)`)
						}
					}, 3000)
				})
			},
		},
		// ═══ SMART MACROS ═══
		macro_speech: {
			name: 'Macro: Speech Mode',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_speech', {}, self.topology)) },
		},
		macro_music: {
			name: 'Macro: Music Mode',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_music', {}, self.topology)) },
		},
		macro_changeover: {
			name: 'Macro: Band Changeover',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_changeover', {}, self.topology)) },
		},
		macro_monitor_check: {
			name: 'Macro: Monitor Check (Pink Noise)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_monitor_check', {}, self.topology)) },
		},
		macro_vocal_focus: {
			name: 'Macro: Vocal Focus EQ',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_vocal_focus', {}, self.topology)) },
		},
		macro_de_mud: {
			name: 'Macro: De-Mud (cut 160-400Hz)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_de_mud', {}, self.topology)) },
		},
		macro_de_ess: {
			name: 'Macro: De-Ess (cut 4-10kHz)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_de_ess', {}, self.topology)) },
		},
		macro_low_cut: {
			name: 'Macro: Low Cut (rumble killer)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_low_cut', {}, self.topology)) },
		},
		macro_loudness: {
			name: 'Macro: Loudness Contour (Fletcher-Munson)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_loudness', {}, self.topology)) },
		},
		macro_intermission: {
			name: 'Macro: Intermission (background music)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_intermission', {}, self.topology)) },
		},
		macro_dj: {
			name: 'Macro: DJ Handoff',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_dj', {}, self.topology)) },
		},
		macro_full_reset: {
			name: 'Macro: Full Reset (nuclear option)',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_full_reset', {}, self.topology)) },
		},

		// ═══ NEW LIVE SOUND MACROS ═══

		macro_outdoor: {
			name: 'Macro: Outdoor Venue',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_outdoor', {}, self.topology)) },
		},
		macro_feedback_emergency: {
			name: 'Macro: Feedback Emergency (kill mids)',
			options: [],
			callback: async () => {
				self.log('warn', 'FEEDBACK EMERGENCY — cutting 800Hz-4kHz by -6dB')
				self.sendCommands(buildCommand('macro_feedback_emergency', {}, self.topology))
			},
		},
		macro_sub_check: {
			name: 'Macro: Subharmonic Check',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_sub_check', {}, self.topology)) },
		},
		macro_walk_music: {
			name: 'Macro: Walk-in/Walk-out Music',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_walk_music', {}, self.topology)) },
		},
		macro_prayer: {
			name: 'Macro: Prayer / Spoken Word',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_prayer', {}, self.topology)) },
		},
		macro_worship: {
			name: 'Macro: Worship Band',
			options: [],
			callback: async () => { self.sendCommands(buildCommand('macro_worship', {}, self.topology)) },
		},
		macro_ab_compare: {
			name: 'Macro: A/B EQ Compare (3s bypass)',
			options: [],
			callback: async () => {
				// Bypass GEQ for 3 seconds, then re-enable
				self.sendCommands(buildCommand('geq_enable', { value: false }, self.topology))
				self.log('info', 'A/B Compare: GEQ bypassed for 3 seconds')
				setTimeout(() => {
					self.sendCommands(buildCommand('geq_enable', { value: true }, self.topology))
					self.log('info', 'A/B Compare: GEQ re-enabled')
				}, 3000)
			},
		},

		// ═══ CORPORATE AV SCENES ═══
		scene_keynote: {
			name: 'Scene: Keynote (single presenter)',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_keynote', {}, self.topology))
				self.pa2State.activeScene = 'KEYNOTE'
				self.setVariableValues({ active_scene: 'KEYNOTE' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_panel: {
			name: 'Scene: Panel Discussion (3-6 mics)',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_panel', {}, self.topology))
				self.pa2State.activeScene = 'PANEL'
				self.setVariableValues({ active_scene: 'PANEL' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_qa: {
			name: 'Scene: Q&A (handheld roaming)',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_qa', {}, self.topology))
				self.pa2State.activeScene = 'Q&A'
				self.setVariableValues({ active_scene: 'Q&A' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_video: {
			name: 'Scene: Video Playback',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_video', {}, self.topology))
				self.pa2State.activeScene = 'VIDEO'
				self.setVariableValues({ active_scene: 'VIDEO' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_break: {
			name: 'Scene: Break / Hold Music',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_break', {}, self.topology))
				self.pa2State.activeScene = 'BREAK'
				self.setVariableValues({ active_scene: 'BREAK' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_hybrid: {
			name: 'Scene: Hybrid Meeting (Zoom/Teams)',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_hybrid', {}, self.topology))
				self.pa2State.activeScene = 'HYBRID'
				self.setVariableValues({ active_scene: 'HYBRID' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_awards: {
			name: 'Scene: Awards Ceremony',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_awards', {}, self.topology))
				self.pa2State.activeScene = 'AWARDS'
				self.setVariableValues({ active_scene: 'AWARDS' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_announce: {
			name: 'Scene: Emergency Announcement',
			options: [],
			callback: async () => {
				self.log('warn', 'ANNOUNCE SCENE — max intelligibility mode')
				self.sendCommands(buildCommand('scene_announce', {}, self.topology))
				self.pa2State.activeScene = 'ANNOUNCE'
				self.setVariableValues({ active_scene: 'ANNOUNCE' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_lectern: {
			name: 'Scene: Lectern / Podium',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_lectern', {}, self.topology))
				self.pa2State.activeScene = 'LECTERN'
				self.setVariableValues({ active_scene: 'LECTERN' })
				self.checkFeedbacks('active_scene')
			},
		},
		scene_mute_hold: {
			name: 'Scene: Mute Hold (presenter paused)',
			options: [],
			callback: async () => {
				self.sendCommands(buildCommand('scene_mute_hold', {}, self.topology))
				self.pa2State.activeScene = 'HOLD'
				self.setVariableValues({ active_scene: 'HOLD' })
				self.checkFeedbacks('active_scene')
			},
		},

		// ═══ RTA-DRIVEN MACROS ═══

		// Auto-EQ from RTA — reads live spectrum, computes inverse GEQ to flatten
		macro_auto_eq_from_rta: {
			name: 'Macro: Auto-EQ from RTA (flatten room)',
			options: [
				{ id: 'target', type: 'number', label: 'Target level (dB)', default: -50, min: -80, max: -20 },
				{ id: 'maxCut', type: 'number', label: 'Max cut (dB)', default: -12, min: -12, max: 0 },
				{ id: 'maxBoost', type: 'number', label: 'Max boost (dB)', default: 6, min: 0, max: 12 },
			],
			callback: async (event) => {
				const rta = self.pa2State.meters?.rta
				if (!rta || rta.every(v => v <= -89)) {
					self.log('warn', 'Auto-EQ: No RTA data available — is the RTA mic active?')
					return
				}
				const target = event.options.target
				const maxCut = event.options.maxCut
				const maxBoost = event.options.maxBoost
				const cmds = []

				self.log('info', `Auto-EQ: Target ${target}dB, max cut ${maxCut}dB, max boost +${maxBoost}dB`)

				for (let band = 1; band <= 31; band++) {
					const current = rta[band - 1]
					if (current <= -89) continue  // no signal in this band, skip
					let correction = target - current
					// Clamp to GEQ range
					correction = Math.max(maxCut, Math.min(maxBoost, correction))
					// Round to 0.5 dB steps
					correction = Math.round(correction * 2) / 2
					cmds.push(...buildCommand('geq_band_set', { band, gain: correction }, self.topology))
				}

				if (cmds.length > 0) {
					self.log('info', `Auto-EQ: Applying ${cmds.length} GEQ corrections (burst)`)
					self.sendCommandsBurst(cmds)
				}
			},
		},

		// RTA snapshot — save current spectrum for comparison
		macro_rta_snapshot: {
			name: 'Macro: RTA Snapshot (save current)',
			options: [],
			callback: async () => {
				const rta = self.pa2State.meters?.rta
				if (!rta) { self.log('warn', 'No RTA data'); return }
				self.pa2State.rtaSnapshot = [...rta]
				self.log('info', 'RTA snapshot saved')
				self.setVariableValues({ rta_snapshot_status: 'SAVED' })
			},
		},

		// RTA compare — show difference between snapshot and live
		macro_rta_compare: {
			name: 'Macro: RTA Compare (vs snapshot)',
			options: [],
			callback: async () => {
				const rta = self.pa2State.meters?.rta
				const snap = self.pa2State.rtaSnapshot
				if (!rta || !snap) { self.log('warn', 'Need both live RTA and a snapshot'); return }
				const vars = {}
				for (let i = 0; i < 31; i++) {
					const diff = Math.round((rta[i] - snap[i]) * 10) / 10
					vars[`rta_diff_${i + 1}`] = diff
				}
				self.setVariableValues(vars)
				self.log('info', 'RTA comparison computed')
			},
		},

		// Cut peak — find the loudest RTA band and notch it
		macro_cut_peak: {
			name: 'Macro: Cut RTA Peak (-3dB)',
			options: [
				{ id: 'depth', type: 'number', label: 'Cut depth (dB)', default: -3, min: -12, max: -1 },
			],
			callback: async (event) => {
				const rta = self.pa2State.meters?.rta
				if (!rta) { self.log('warn', 'No RTA data'); return }
				let peakVal = -Infinity, peakBand = 0
				for (let i = 0; i < 31; i++) {
					if (rta[i] > peakVal) { peakVal = rta[i]; peakBand = i + 1 }
				}
				const currentGain = self.pa2State.geq.bands[peakBand] || 0
				const newGain = Math.max(-12, currentGain + event.options.depth)
				self.log('info', `Cutting RTA peak: band ${peakBand} from ${currentGain}dB to ${newGain}dB`)
				const cmds = buildCommand('geq_band_set', { band: peakBand, gain: newGain }, self.topology)
				self.sendCommands(cmds)
			},
		},

		// Boost weakest — find the quietest RTA band and boost it
		macro_boost_weak: {
			name: 'Macro: Boost Weakest RTA Band (+2dB)',
			options: [
				{ id: 'amount', type: 'number', label: 'Boost (dB)', default: 2, min: 1, max: 6 },
			],
			callback: async (event) => {
				const rta = self.pa2State.meters?.rta
				if (!rta) { self.log('warn', 'No RTA data'); return }
				// Find weakest band that has signal (ignore -90 = no signal)
				let weakVal = Infinity, weakBand = 0
				for (let i = 0; i < 31; i++) {
					if (rta[i] > -89 && rta[i] < weakVal) { weakVal = rta[i]; weakBand = i + 1 }
				}
				if (weakBand === 0) { self.log('warn', 'No bands with signal'); return }
				const currentGain = self.pa2State.geq.bands[weakBand] || 0
				const newGain = Math.min(12, currentGain + event.options.amount)
				self.log('info', `Boosting weak band ${weakBand} from ${currentGain}dB to ${newGain}dB`)
				const cmds = buildCommand('geq_band_set', { band: weakBand, gain: newGain }, self.topology)
				self.sendCommands(cmds)
			},
		},
	})
}
