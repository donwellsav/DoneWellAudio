const { GEQ_BANDS } = require('./pa2-protocol')

// Short frequency labels for formatted GEQ variables
const GEQ_SHORT_LABELS = {
	1: '20', 2: '25', 3: '31', 4: '40', 5: '50', 6: '63', 7: '80', 8: '100',
	9: '125', 10: '160', 11: '200', 12: '250', 13: '315', 14: '400', 15: '500',
	16: '630', 17: '800', 18: '1k', 19: '1.2k', 20: '1.6k', 21: '2k', 22: '2.5k',
	23: '3.1k', 24: '4k', 25: '5k', 26: '6.3k', 27: '8k', 28: '10k', 29: '12k',
	30: '16k', 31: '20k',
}

module.exports = function (self) {
	const defs = []

	// ── Device ──
	defs.push({ variableId: 'device_model', name: 'Device Model' })
	defs.push({ variableId: 'device_name', name: 'Device Name' })
	defs.push({ variableId: 'device_version', name: 'Firmware Version' })

	// ── Preset ──
	defs.push({ variableId: 'preset_current', name: 'Current Preset' })
	defs.push({ variableId: 'preset_changed', name: 'Preset Changed' })

	// ── GEQ ──
	defs.push({ variableId: 'geq_enabled', name: 'GEQ Enabled' })
	defs.push({ variableId: 'geq_mode', name: 'GEQ Mode' })
	for (let b = 1; b <= 31; b++) {
		defs.push({ variableId: `geq_band_${b}`, name: `GEQ Band ${b} (${GEQ_BANDS[b]})` })
		defs.push({ variableId: `geq_${GEQ_SHORT_LABELS[b]}_fmt`, name: `GEQ ${GEQ_SHORT_LABELS[b]} Formatted` })
	}

	// ── PEQ (per output) ──
	for (const out of ['high', 'mid', 'low']) {
		defs.push({ variableId: `peq_${out}_enabled`, name: `PEQ ${out} Enabled` })
		for (let f = 1; f <= 8; f++) {
			for (const field of ['type', 'frequency', 'gain', 'q', 'slope']) {
				defs.push({ variableId: `peq_${out}_${f}_${field}`, name: `PEQ ${out} Band ${f} ${field}` })
			}
		}
	}

	// ── AutoEQ / Room EQ ──
	defs.push({ variableId: 'autoeq_enabled', name: 'Room EQ Enabled' })
	defs.push({ variableId: 'autoeq_mode', name: 'Room EQ Mode' })

	// ── AFS ──
	defs.push({ variableId: 'afs_afs', name: 'AFS Enabled' })
	defs.push({ variableId: 'afs_filtermode', name: 'AFS Filter Mode' })
	defs.push({ variableId: 'afs_contentmode', name: 'AFS Content Mode' })
	defs.push({ variableId: 'afs_maxfixedfilters', name: 'AFS Max Fixed Filters' })
	defs.push({ variableId: 'afs_lifttime', name: 'AFS Lift Time' })

	// ── Compressor ──
	defs.push({ variableId: 'comp_compressor', name: 'Compressor Enabled' })
	defs.push({ variableId: 'comp_threshold', name: 'Compressor Threshold' })
	defs.push({ variableId: 'comp_gain', name: 'Compressor Gain' })
	defs.push({ variableId: 'comp_ratio', name: 'Compressor Ratio' })
	defs.push({ variableId: 'comp_overeasy', name: 'Compressor OverEasy' })

	// ── Limiters (per band) ──
	for (const band of ['high', 'mid', 'low']) {
		defs.push({ variableId: `lim_${band}_limiter`, name: `Limiter ${band} Enabled` })
		defs.push({ variableId: `lim_${band}_threshold`, name: `Limiter ${band} Threshold` })
		defs.push({ variableId: `lim_${band}_overeasy`, name: `Limiter ${band} OverEasy` })
	}

	// ── Mutes ──
	for (const out of ['highleft', 'highright', 'midleft', 'midright', 'lowleft', 'lowright']) {
		defs.push({ variableId: `mute_${out}`, name: `Mute ${out}` })
	}

	// ── Subharmonic ──
	defs.push({ variableId: 'sub_enabled', name: 'Subharmonic Enabled' })
	defs.push({ variableId: 'sub_master', name: 'Subharmonic Master' })
	defs.push({ variableId: 'sub_lows', name: 'Subharmonic Lows' })
	defs.push({ variableId: 'sub_highs', name: 'Subharmonic Highs' })

	// ── Generator ──
	defs.push({ variableId: 'gen_mode', name: 'Generator Mode' })
	defs.push({ variableId: 'gen_level', name: 'Generator Level' })

	// ── Input Delay ──
	defs.push({ variableId: 'input_delay_enabled', name: 'Input Delay Enabled' })
	defs.push({ variableId: 'input_delay_ms', name: 'Input Delay (ms)' })

	// ── Output Delays ──
	for (const band of ['high', 'mid', 'low']) {
		defs.push({ variableId: `output_delay_${band}_enabled`, name: `Output Delay ${band} Enabled` })
		defs.push({ variableId: `output_delay_${band}_ms`, name: `Output Delay ${band} (ms)` })
	}

	// ── RTA ──
	defs.push({ variableId: 'rta_rate', name: 'RTA Rate' })
	defs.push({ variableId: 'rta_offset', name: 'RTA Offset' })

	// ── Crossover ──
	for (const band of ['band1', 'band2', 'band3', 'monosub']) {
		for (const p of ['hp_type', 'lp_type', 'hp_freq', 'lp_freq', 'gain', 'polarity']) {
			defs.push({ variableId: `xover_${band}_${p}`, name: `Crossover ${band} ${p}` })
		}
	}

	// ── Topology ──
	defs.push({ variableId: 'topology_geq_mode', name: 'GEQ Topology (stereo/dual-mono)' })
	defs.push({ variableId: 'topology_outputs', name: 'Output Bands' })

	// ── Smart Formatted Variables ──
	defs.push({ variableId: 'comp_thr_fmt', name: 'Compressor Threshold (formatted)' })
	defs.push({ variableId: 'comp_ratio_fmt', name: 'Compressor Ratio (formatted)' })
	defs.push({ variableId: 'afs_status_fmt', name: 'AFS Status (formatted)' })
	defs.push({ variableId: 'gen_status_fmt', name: 'Generator Status (formatted)' })
	defs.push({ variableId: 'input_delay_fmt', name: 'Input Delay (formatted)' })
	defs.push({ variableId: 'conn_status_fmt', name: 'Connection Status (formatted)' })
	defs.push({ variableId: 'preset_fmt', name: 'Preset (formatted)' })
	for (const out of ['high_l', 'high_r', 'mid_l', 'mid_r', 'low_l', 'low_r']) {
		defs.push({ variableId: `mute_${out}_fmt`, name: `Mute ${out} (formatted)` })
	}

	// ── DSP METERS (port 19274) ──
	// RTA 31-band spectrum
	for (let b = 1; b <= 31; b++) {
		defs.push({ variableId: `rta_band_${b}`, name: `RTA Band ${b} (${GEQ_BANDS[b]}) dB` })
	}
	// Input meters
	defs.push({ variableId: 'meter_input_l', name: 'Input Level L (dB)' })
	defs.push({ variableId: 'meter_input_r', name: 'Input Level R (dB)' })
	// Compressor meters
	defs.push({ variableId: 'meter_comp_input', name: 'Compressor Input Level (dB)' })
	defs.push({ variableId: 'meter_comp_gr', name: 'Compressor Gain Reduction (dB)' })
	defs.push({ variableId: 'meter_comp_gr_fmt', name: 'Compressor GR (formatted)' })
	// Limiter meters
	defs.push({ variableId: 'meter_lim_input', name: 'Limiter Input Level (dB)' })
	defs.push({ variableId: 'meter_lim_gr', name: 'Limiter Gain Reduction (dB)' })
	defs.push({ variableId: 'meter_lim_gr_fmt', name: 'Limiter GR (formatted)' })
	// Output meters
	defs.push({ variableId: 'meter_output_hl', name: 'Output High L Level (dB)' })
	defs.push({ variableId: 'meter_output_hr', name: 'Output High R Level (dB)' })

	// ── VISUAL METERS (computed from DSP data) ──
	// RTA visual bars (unicode block characters)
	defs.push({ variableId: 'rta_visual', name: 'RTA Full Spectrum (31-char bar graph)' })
	defs.push({ variableId: 'rta_vis_lows', name: 'RTA Lows Visual (20-100Hz)' })
	defs.push({ variableId: 'rta_vis_lowmids', name: 'RTA Low-Mids Visual (125-630Hz)' })
	defs.push({ variableId: 'rta_vis_himids', name: 'RTA Hi-Mids Visual (800-4kHz)' })
	defs.push({ variableId: 'rta_vis_highs', name: 'RTA Highs Visual (5k-20kHz)' })
	// Peak tracker
	defs.push({ variableId: 'rta_peak_freq', name: 'RTA Peak Frequency' })
	defs.push({ variableId: 'rta_peak_db', name: 'RTA Peak Level (dB)' })
	defs.push({ variableId: 'rta_peak_band', name: 'RTA Peak Band Number' })
	defs.push({ variableId: 'rta_peak_fmt', name: 'RTA Peak (formatted)' })
	// Level bars
	defs.push({ variableId: 'meter_input_l_bar', name: 'Input L Level Bar' })
	defs.push({ variableId: 'meter_input_r_bar', name: 'Input R Level Bar' })
	defs.push({ variableId: 'meter_input_fmt', name: 'Input Levels (formatted)' })
	defs.push({ variableId: 'meter_output_hl_bar', name: 'Output High L Level Bar' })
	defs.push({ variableId: 'meter_output_hr_bar', name: 'Output High R Level Bar' })
	defs.push({ variableId: 'meter_comp_gr_bar', name: 'Compressor GR Bar' })
	defs.push({ variableId: 'meter_lim_gr_bar', name: 'Limiter GR Bar' })
	// RTA snapshot/compare
	defs.push({ variableId: 'rta_flat_score', name: 'RTA Flatness Score (lower=flatter)' })
	defs.push({ variableId: 'rta_snapshot_status', name: 'RTA Snapshot Status' })
	for (let b = 1; b <= 31; b++) {
		defs.push({ variableId: `rta_diff_${b}`, name: `RTA Diff Band ${b} (dB vs snapshot)` })
	}

	// ── Active Scene ──
	defs.push({ variableId: 'active_scene', name: 'Active Scene Name' })

	// ── DoneWellAudio detection ──
	defs.push({ variableId: 'detect_last_freq', name: 'Last Detected Frequency' })
	defs.push({ variableId: 'detect_last_action', name: 'Last Detection Action' })
	defs.push({ variableId: 'detect_slots_used', name: 'Auto-notch Slots Used' })
	defs.push({ variableId: 'detect_active', name: 'Detection Active' })

	self.setVariableDefinitions(defs)

	// Set initial defaults so variables aren't empty before state loads
	const defaults = {
		device_model: '', device_name: '', device_version: '',
		preset_current: '', preset_changed: '',
		geq_enabled: 'Off', geq_mode: '',
		autoeq_enabled: 'Off', autoeq_mode: '',
		afs_afs: '', afs_filtermode: '', afs_contentmode: '', afs_maxfixedfilters: '', afs_lifttime: '',
		comp_compressor: '', comp_threshold: '', comp_gain: '', comp_ratio: '', comp_overeasy: '',
		sub_enabled: '', sub_master: '', sub_lows: '', sub_highs: '',
		gen_mode: 'Off', gen_level: '-60',
		input_delay_enabled: '', input_delay_ms: '0',
		rta_rate: 'Slow', rta_offset: '0',
		topology_geq_mode: '', topology_outputs: '',
		comp_thr_fmt: '', comp_ratio_fmt: '', afs_status_fmt: '', gen_status_fmt: 'OFF',
		input_delay_fmt: '0ms', conn_status_fmt: 'DISCONNECTED', preset_fmt: '',
		rta_flat_score: '--',
		active_scene: '--',
		detect_last_freq: '', detect_last_action: 'IDLE', detect_slots_used: '0/8', detect_active: 'OFF',
	}
	// Mute defaults
	for (const out of ['highleft', 'highright', 'midleft', 'midright', 'lowleft', 'lowright']) {
		defaults[`mute_${out}`] = 'LIVE'
	}
	for (const out of ['high_l', 'high_r', 'mid_l', 'mid_r', 'low_l', 'low_r']) {
		defaults[`mute_${out}_fmt`] = 'LIVE'
	}
	// GEQ band defaults
	for (let b = 1; b <= 31; b++) {
		defaults[`geq_band_${b}`] = 0
		defaults[`geq_${GEQ_SHORT_LABELS[b]}_fmt`] = '0dB'
	}
	// Limiter defaults
	for (const band of ['high', 'mid', 'low']) {
		defaults[`lim_${band}_limiter`] = ''
		defaults[`lim_${band}_threshold`] = ''
		defaults[`lim_${band}_overeasy`] = ''
	}

	self.setVariableValues(defaults)
}
