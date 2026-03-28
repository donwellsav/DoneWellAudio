const { combineRgb } = require('@companion-module/base')

// Color language per CLAUDE.md
const RED = combineRgb(204, 0, 0)
const GREEN = combineRgb(0, 204, 0)
const YELLOW = combineRgb(204, 204, 0)
const ORANGE = combineRgb(255, 140, 0)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

const MUTE_OUTPUTS = [
	{ id: 'HighLeft', label: 'High Left' },
	{ id: 'HighRight', label: 'High Right' },
	{ id: 'MidLeft', label: 'Mid Left' },
	{ id: 'MidRight', label: 'Mid Right' },
	{ id: 'LowLeft', label: 'Low Left' },
	{ id: 'LowRight', label: 'Low Right' },
]

const OUTPUT_BANDS = [
	{ id: 'High', label: 'High' },
	{ id: 'Mid', label: 'Mid' },
	{ id: 'Low', label: 'Low' },
]

module.exports = async function (self) {
	self.setFeedbackDefinitions({
		connected: {
			name: 'PA2 Connected',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => self.connState === 'READY',
		},

		mute_state: {
			name: 'Output Muted',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [{ id: 'output', type: 'dropdown', label: 'Output', choices: MUTE_OUTPUTS, default: 'HighLeft' }],
			callback: (feedback) => self.pa2State.mutes[feedback.options.output] === true,
		},

		geq_enabled: {
			name: 'GEQ Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => self.pa2State.geq.enabled === true,
		},

		peq_enabled: {
			name: 'PEQ Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [{ id: 'output', type: 'dropdown', label: 'Output', choices: OUTPUT_BANDS, default: 'High' }],
			callback: (feedback) => {
				const peq = self.pa2State.peq[feedback.options.output]
				return peq ? peq.enabled === true : false
			},
		},

		autoeq_enabled: {
			name: 'Room EQ Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => self.pa2State.autoeq.enabled === true,
		},

		afs_enabled: {
			name: 'AFS Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => self.pa2State.afs.AFS === true,
		},

		afs_mode_live: {
			name: 'AFS Mode is Live',
			type: 'boolean',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [],
			callback: () => self.pa2State.afs.FilterMode === 'Live',
		},

		comp_enabled: {
			name: 'Compressor Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: ORANGE, color: BLACK },
			options: [],
			callback: () => self.pa2State.compressor.compressor === true,
		},

		lim_enabled: {
			name: 'Limiter Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: ORANGE, color: BLACK },
			options: [{ id: 'band', type: 'dropdown', label: 'Band', choices: OUTPUT_BANDS, default: 'High' }],
			callback: (feedback) => {
				const lim = self.pa2State.limiters[feedback.options.band]
				return lim ? lim.limiter === true : false
			},
		},

		sub_enabled: {
			name: 'Subharmonic Enabled',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => self.pa2State.subharmonic.enabled === true,
		},

		gen_active: {
			name: 'Generator Active',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => self.pa2State.generator.mode !== 'Off',
		},

		// ── SCENE FEEDBACK ──
		active_scene: {
			name: 'Active Scene Matches',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [{
				id: 'scene', type: 'dropdown', label: 'Scene',
				choices: [
					{ id: 'KEYNOTE', label: 'Keynote' },
					{ id: 'PANEL', label: 'Panel' },
					{ id: 'Q&A', label: 'Q&A' },
					{ id: 'VIDEO', label: 'Video' },
					{ id: 'BREAK', label: 'Break' },
					{ id: 'HYBRID', label: 'Hybrid' },
					{ id: 'AWARDS', label: 'Awards' },
					{ id: 'ANNOUNCE', label: 'Announce' },
					{ id: 'LECTERN', label: 'Lectern' },
					{ id: 'HOLD', label: 'Mute Hold' },
				],
				default: 'KEYNOTE',
			}],
			callback: (feedback) => self.pa2State.activeScene === feedback.options.scene,
		},

		// ── METER-BASED FEEDBACKS ──
		meter_clip: {
			name: 'Input Clipping (>-3dB)',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => {
				const m = self.pa2State.meters
				return m && (m.inputL > -3 || m.inputR > -3)
			},
		},

		meter_gr_active: {
			name: 'Gain Reduction Active',
			type: 'boolean',
			defaultStyle: { bgcolor: ORANGE, color: BLACK },
			options: [],
			callback: () => {
				const m = self.pa2State.meters
				return m && (m.compGR > 1 || m.limGR > 1)
			},
		},

		meter_signal_present: {
			name: 'Signal Present (input >-60dB)',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => {
				const m = self.pa2State.meters
				return m && (m.inputL > -60 || m.inputR > -60)
			},
		},

		rta_peak_alert: {
			name: 'RTA Peak Alert (feedback warning)',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{ id: 'threshold', type: 'number', label: 'Alert threshold (dB)', default: -25, min: -40, max: -10 },
			],
			callback: (feedback) => {
				const rta = self.pa2State.meters?.rta
				if (!rta) return false
				const thresh = feedback.options.threshold || -25
				return rta.some(v => v > thresh)
			},
		},
	})
}
