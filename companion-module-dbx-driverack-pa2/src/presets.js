const { combineRgb } = require('@companion-module/base')

// Color language — consistent across all presets
const RED = combineRgb(204, 0, 0)
const GREEN = combineRgb(0, 204, 0)
const YELLOW = combineRgb(204, 204, 0)
const BLUE = combineRgb(0, 100, 204)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const ORANGE = combineRgb(255, 140, 0)
const DARK = combineRgb(40, 40, 40)
const CYAN = combineRgb(0, 180, 200)
const PURPLE = combineRgb(140, 0, 200)
const DKRED = combineRgb(100, 0, 0)
const DKGREEN = combineRgb(0, 80, 0)
const DKBLUE = combineRgb(0, 40, 120)
const TEAL = combineRgb(0, 160, 160)
const GOLD = combineRgb(200, 160, 0)
const LIME = combineRgb(100, 200, 0)
const PINK = combineRgb(200, 50, 100)

// Helper to build a simple button preset
function btn(category, name, text, size, color, bgcolor, actionId, options, feedbacks) {
	return {
		type: 'button', category, name,
		style: { text, size: String(size), color, bgcolor },
		steps: [{ down: [{ actionId, options: options || {} }], up: [] }],
		feedbacks: feedbacks || [],
	}
}

// Helper for multi-action button
function btnMulti(category, name, text, size, color, bgcolor, actions, feedbacks) {
	return {
		type: 'button', category, name,
		style: { text, size: String(size), color, bgcolor },
		steps: [{ down: actions.map(a => ({ actionId: a[0], options: a[1] || {} })), up: [] }],
		feedbacks: feedbacks || [],
	}
}

module.exports = function (self) {
	const presets = {}

	// ═══════════════════════════════════════════════════════════
	// 1. SHOW CONTROL — The main page a sound engineer lives on
	// ═══════════════════════════════════════════════════════════

	// Row 1: Mute toggles (all 6 outputs)
	const muteOutputs = [
		{ id: 'HighLeft', short: 'HIGH L', fmt: 'mute_high_l_fmt' },
		{ id: 'HighRight', short: 'HIGH R', fmt: 'mute_high_r_fmt' },
		{ id: 'MidLeft', short: 'MID L', fmt: 'mute_mid_l_fmt' },
		{ id: 'MidRight', short: 'MID R', fmt: 'mute_mid_r_fmt' },
		{ id: 'LowLeft', short: 'LOW L', fmt: 'mute_low_l_fmt' },
		{ id: 'LowRight', short: 'LOW R', fmt: 'mute_low_r_fmt' },
	]
	for (const m of muteOutputs) {
		presets[`mute_${m.id}`] = {
			type: 'button', category: 'Show Control', name: `Mute ${m.short}`,
			style: { text: `${m.short}\\n$(pa2:${m.fmt})`, size: '14', color: WHITE, bgcolor: DKGREEN },
			steps: [{ down: [{ actionId: 'mute_toggle', options: { output: m.id } }], up: [] }],
			feedbacks: [{ feedbackId: 'mute_state', options: { output: m.id }, style: { bgcolor: RED, color: WHITE } }],
		}
	}

	// Row 2: Bulk mute controls + status
	presets['mute_all'] = btn('Show Control', 'Mute All', 'MUTE\\nALL', 18, WHITE, RED, 'mute_all')
	presets['unmute_all'] = btn('Show Control', 'Safe Unmute', 'SAFE\\nUNMUTE', 14, BLACK, GREEN, 'safe_unmute')
	presets['conn_status'] = {
		type: 'button', category: 'Show Control', name: 'Connection Status',
		style: { text: '$(pa2:device_name)\\n$(pa2:conn_status_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'connected', style: { bgcolor: DKGREEN } }],
	}
	presets['preset_display'] = {
		type: 'button', category: 'Show Control', name: 'Current Preset',
		style: { text: 'PRESET\\n$(pa2:preset_fmt)', size: '14', color: WHITE, bgcolor: DKBLUE },
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}

	// ═══════════════════════════════════════════════════════════
	// 2. SHOW MACROS — One-press workflow buttons
	// ═══════════════════════════════════════════════════════════

	presets['show_open'] = btn('Show Macros', 'Show Open', 'SHOW\\nOPEN', 18, BLACK, GREEN, 'show_open')
	presets['show_close'] = btn('Show Macros', 'Show Close', 'SHOW\\nCLOSE', 18, WHITE, RED, 'show_close')
	presets['soundcheck'] = btn('Show Macros', 'Soundcheck', 'SOUND\\nCHECK', 14, WHITE, BLUE, 'soundcheck_start')
	presets['ring_out'] = btn('Show Macros', 'Ring Out', 'RING\\nOUT', 18, BLACK, YELLOW, 'ring_out')
	presets['panic_mute'] = btn('Show Macros', 'PANIC MUTE', 'PANIC\\nMUTE', 24, WHITE, RED, 'panic_mute')

	// Generator controls for soundcheck
	presets['gen_pink'] = btn('Show Macros', 'Pink Noise', 'GEN\\nPINK', 18, BLACK, ORANGE, 'gen_mode', { mode: 'Pink' }, [
		{ feedbackId: 'gen_active', style: { bgcolor: RED, color: WHITE } },
	])
	presets['gen_white'] = btn('Show Macros', 'White Noise', 'GEN\\nWHITE', 18, BLACK, ORANGE, 'gen_mode', { mode: 'White' }, [
		{ feedbackId: 'gen_active', style: { bgcolor: RED, color: WHITE } },
	])
	presets['gen_off'] = btn('Show Macros', 'Generator Off', 'GEN\\nOFF', 18, WHITE, DKRED, 'gen_mode', { mode: 'Off' }, [
		{ feedbackId: 'gen_active', style: { bgcolor: YELLOW, color: BLACK } },
	])

	// Generator level presets
	for (const lvl of [-60, -40, -20, -10]) {
		presets[`gen_level_${Math.abs(lvl)}`] = btn('Show Macros', `Gen ${lvl}dB`, `GEN LVL\\n${lvl}dB`, 14, WHITE, DARK, 'gen_level', { value: lvl })
	}

	// ═══════════════════════════════════════════════════════════
	// 3. AFS (Advanced Feedback Suppression) — Full control page
	// ═══════════════════════════════════════════════════════════

	presets['afs_on'] = btn('AFS Control', 'AFS On', 'AFS\\nON', 18, BLACK, GREEN, 'afs_enable', { value: 'true' }, [
		{ feedbackId: 'afs_enabled', style: { bgcolor: GREEN, color: BLACK } },
	])
	presets['afs_off'] = btn('AFS Control', 'AFS Off', 'AFS\\nOFF', 18, WHITE, RED, 'afs_enable', { value: 'false' })
	presets['afs_status'] = {
		type: 'button', category: 'AFS Control', name: 'AFS Status',
		style: { text: 'AFS\\n$(pa2:afs_status_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{ feedbackId: 'afs_enabled', style: { bgcolor: GREEN, color: BLACK } },
			{ feedbackId: 'afs_mode_live', style: { bgcolor: YELLOW, color: BLACK } },
		],
	}
	presets['afs_mode_live'] = btn('AFS Control', 'AFS Live', 'MODE\\nLIVE', 14, BLACK, YELLOW, 'afs_mode', { mode: 'Live' }, [
		{ feedbackId: 'afs_mode_live', style: { bgcolor: YELLOW, color: BLACK } },
	])
	presets['afs_mode_fixed'] = btn('AFS Control', 'AFS Fixed', 'MODE\\nFIXED', 14, WHITE, BLUE, 'afs_mode', { mode: 'Fixed' })
	presets['afs_content_speech'] = btn('AFS Control', 'AFS Speech', 'CONTENT\\nSPEECH', 14, WHITE, DARK, 'afs_content', { content: 'Speech' })
	presets['afs_content_music'] = btn('AFS Control', 'AFS Music', 'CONTENT\\nMUSIC', 14, WHITE, DARK, 'afs_content', { content: 'Music' })
	presets['afs_content_both'] = btn('AFS Control', 'AFS Speech+Music', 'CONTENT\\nSP+MU', 14, WHITE, DARK, 'afs_content', { content: 'Speech Music' })
	presets['afs_clear_live'] = btn('AFS Control', 'Clear Live', 'CLR\\nLIVE', 18, BLACK, YELLOW, 'afs_clear_live')
	presets['afs_clear_all'] = btn('AFS Control', 'Clear All', 'CLR\\nALL', 18, WHITE, RED, 'afs_clear_all')

	// Fixed filter count presets
	for (const n of [0, 3, 6, 9, 12]) {
		presets[`afs_fixed_${n}`] = btn('AFS Control', `${n} Fixed`, `FIXED\\n${n}`, 18, WHITE, DARK, 'afs_fixed_filters', { count: n })
	}

	// Lift time presets
	for (const t of [5, 10, 30, 60, 300]) {
		const label = t >= 60 ? `${t / 60}m` : `${t}s`
		presets[`afs_lift_${t}`] = btn('AFS Control', `Lift ${label}`, `LIFT\\n${label}`, 14, WHITE, DARK, 'afs_lift_time', { seconds: t })
	}

	// ═══════════════════════════════════════════════════════════
	// 4. COMPRESSOR — Full control
	// ═══════════════════════════════════════════════════════════

	presets['comp_on'] = btn('Compressor', 'Comp On', 'COMP\\nON', 18, BLACK, ORANGE, 'comp_enable', { value: 'true' }, [
		{ feedbackId: 'comp_enabled', style: { bgcolor: ORANGE, color: BLACK } },
	])
	presets['comp_off'] = btn('Compressor', 'Comp Off', 'COMP\\nOFF', 18, WHITE, DARK, 'comp_enable', { value: 'false' })
	presets['comp_status'] = {
		type: 'button', category: 'Compressor', name: 'Comp Status',
		style: { text: 'COMP\\n$(pa2:comp_thr_fmt)\\n$(pa2:comp_ratio_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'comp_enabled', style: { bgcolor: ORANGE, color: BLACK } }],
	}

	// Threshold presets
	for (const thr of [0, -6, -12, -18, -24, -30, -40]) {
		presets[`comp_thr_${Math.abs(thr)}`] = btn('Compressor', `Thresh ${thr}dB`, `THR\\n${thr}dB`, 14, WHITE, DARK, 'comp_threshold', { value: thr })
	}

	// Ratio presets
	for (const r of ['2.0:1', '3.0:1', '4.0:1', '6.0:1', '8.0:1', 'Inf:1']) {
		const label = r.replace('.0:1', ':1')
		presets[`comp_ratio_${label.replace(':1', '').replace('.', '')}`] = btn('Compressor', `Ratio ${label}`, `RATIO\\n${label}`, 14, WHITE, DARK, 'comp_ratio', { value: r })
	}

	// Gain presets
	for (const g of [-6, 0, 3, 6, 10, 15]) {
		presets[`comp_gain_${g >= 0 ? 'p' : 'n'}${Math.abs(g)}`] = btn('Compressor', `Gain ${g > 0 ? '+' : ''}${g}dB`, `GAIN\\n${g > 0 ? '+' : ''}${g}dB`, 14, WHITE, DARK, 'comp_gain', { value: g })
	}

	// OverEasy presets
	for (const oe of [0, 2, 5, 8, 10]) {
		presets[`comp_oe_${oe}`] = btn('Compressor', `OE ${oe}`, `O-EASY\\n${oe}`, 14, WHITE, DARK, 'comp_overeasy', { value: oe })
	}

	// ═══════════════════════════════════════════════════════════
	// 5. LIMITER — High output (your topology)
	// ═══════════════════════════════════════════════════════════

	presets['lim_on'] = btn('Limiter', 'Limiter On', 'LIM\\nON', 18, BLACK, ORANGE, 'lim_enable', { band: 'High', value: 'true' }, [
		{ feedbackId: 'lim_enabled', options: { band: 'High' }, style: { bgcolor: ORANGE, color: BLACK } },
	])
	presets['lim_off'] = btn('Limiter', 'Limiter Off', 'LIM\\nOFF', 18, WHITE, DARK, 'lim_enable', { band: 'High', value: 'false' })

	for (const thr of [0, -3, -6, -10, -15, -20]) {
		presets[`lim_thr_${Math.abs(thr)}`] = btn('Limiter', `Lim ${thr}dB`, `LIM THR\\n${thr}dB`, 14, WHITE, DARK, 'lim_threshold', { band: 'High', value: thr })
	}

	for (const oe of [0, 3, 5, 8, 10]) {
		presets[`lim_oe_${oe}`] = btn('Limiter', `Lim OE ${oe}`, `LIM OE\\n${oe}`, 14, WHITE, DARK, 'lim_overeasy', { band: 'High', value: oe })
	}

	// ═══════════════════════════════════════════════════════════
	// 6. ROOM EQ / AUTO EQ
	// ═══════════════════════════════════════════════════════════

	presets['autoeq_on'] = btn('Room EQ', 'Room EQ On', 'ROOM\\nEQ ON', 14, BLACK, GREEN, 'autoeq_enable', { value: 'true' }, [
		{ feedbackId: 'autoeq_enabled', style: { bgcolor: GREEN, color: BLACK } },
	])
	presets['autoeq_off'] = btn('Room EQ', 'Room EQ Off', 'ROOM\\nEQ OFF', 14, WHITE, DARK, 'autoeq_enable', { value: 'false' })
	presets['autoeq_flat'] = btn('Room EQ', 'Room EQ Flat', 'ROOM\\nFLAT', 14, BLACK, YELLOW, 'autoeq_mode', { mode: 'Flat' })
	presets['autoeq_manual'] = btn('Room EQ', 'Room EQ Manual', 'ROOM\\nMANUAL', 14, WHITE, BLUE, 'autoeq_mode', { mode: 'Manual' })
	presets['autoeq_auto'] = btn('Room EQ', 'Room EQ AutoEQ', 'ROOM\\nAUTO', 14, BLACK, CYAN, 'autoeq_mode', { mode: 'AutoEQ' })

	// ═══════════════════════════════════════════════════════════
	// 7. PEQ — High output (8 bands)
	// ═══════════════════════════════════════════════════════════

	presets['peq_on'] = btn('PEQ High', 'PEQ On', 'PEQ\\nON', 18, BLACK, GREEN, 'peq_enable', { output: 'High', value: 'true' }, [
		{ feedbackId: 'peq_enabled', options: { output: 'High' }, style: { bgcolor: GREEN, color: BLACK } },
	])
	presets['peq_off'] = btn('PEQ High', 'PEQ Off', 'PEQ\\nOFF', 18, WHITE, DARK, 'peq_enable', { output: 'High', value: 'false' })
	presets['peq_flatten'] = btn('PEQ High', 'PEQ Flatten', 'PEQ\\nFLATTEN', 14, BLACK, YELLOW, 'peq_flatten', { output: 'High' })
	presets['peq_restore'] = btn('PEQ High', 'PEQ Restore', 'PEQ\\nRESTORE', 14, WHITE, BLUE, 'peq_restore', { output: 'High' })

	// Quick notch filters at common feedback frequencies
	const notchFreqs = [
		{ hz: 250, label: '250' }, { hz: 500, label: '500' }, { hz: 800, label: '800' },
		{ hz: 1000, label: '1k' }, { hz: 1600, label: '1.6k' }, { hz: 2500, label: '2.5k' },
		{ hz: 3150, label: '3.1k' }, { hz: 4000, label: '4k' },
	]
	for (let i = 0; i < notchFreqs.length; i++) {
		const f = notchFreqs[i]
		presets[`peq_notch_${f.hz}`] = btn('PEQ High', `Notch ${f.label}`, `NOTCH\\n${f.label}\\n-6dB`, 14, WHITE, PURPLE, 'peq_filter', {
			output: 'High', filter: i + 1, type: 'Bell', freq: f.hz, gain: -6, q: 10, slope: 6,
		})
	}

	// ═══════════════════════════════════════════════════════════
	// 8. SUBHARMONIC SYNTH
	// ═══════════════════════════════════════════════════════════

	presets['sub_on'] = btn('Subharmonic', 'Sub On', 'SUB\\nON', 18, BLACK, GREEN, 'sub_enable', { value: 'true' }, [
		{ feedbackId: 'sub_enabled', style: { bgcolor: GREEN, color: BLACK } },
	])
	presets['sub_off'] = btn('Subharmonic', 'Sub Off', 'SUB\\nOFF', 18, WHITE, DARK, 'sub_enable', { value: 'false' })

	for (const lvl of [0, 25, 50, 75, 100]) {
		presets[`sub_master_${lvl}`] = btn('Subharmonic', `Sub ${lvl}%`, `SUB\\n${lvl}%`, 14, WHITE, DARK, 'sub_master', { value: lvl })
	}
	for (const lvl of [0, 50, 100]) {
		presets[`sub_lows_${lvl}`] = btn('Subharmonic', `24-36Hz ${lvl}%`, `24-36\\n${lvl}%`, 14, WHITE, DARK, 'sub_lows', { value: lvl })
		presets[`sub_highs_${lvl}`] = btn('Subharmonic', `36-56Hz ${lvl}%`, `36-56\\n${lvl}%`, 14, WHITE, DARK, 'sub_highs', { value: lvl })
	}

	// ═══════════════════════════════════════════════════════════
	// 9. DELAYS
	// ═══════════════════════════════════════════════════════════

	presets['idelay_on'] = btn('Delays', 'Input Delay On', 'IN DLY\\nON', 14, BLACK, GREEN, 'input_delay_enable', { value: 'true' })
	presets['idelay_off'] = btn('Delays', 'Input Delay Off', 'IN DLY\\nOFF', 14, WHITE, DARK, 'input_delay_enable', { value: 'false' })
	presets['idelay_status'] = {
		type: 'button', category: 'Delays', name: 'Input Delay Status',
		style: { text: 'IN DLY\\n$(pa2:input_delay_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}

	// Common delay values for back line
	for (const ms of [0, 5, 10, 15, 20, 25, 30, 50, 75, 100]) {
		presets[`idelay_${ms}`] = btn('Delays', `In Dly ${ms}ms`, `IN DLY\\n${ms}ms`, 14, WHITE, DARK, 'input_delay_time', { ms })
	}

	// Output delay
	presets['odelay_on'] = btn('Delays', 'Out Delay On', 'OUT DLY\\nON', 14, BLACK, GREEN, 'output_delay_enable', { band: 'High', value: 'true' })
	presets['odelay_off'] = btn('Delays', 'Out Delay Off', 'OUT DLY\\nOFF', 14, WHITE, DARK, 'output_delay_enable', { band: 'High', value: 'false' })
	for (const ms of [0, 1, 2, 3, 5, 7, 10]) {
		presets[`odelay_${ms}`] = btn('Delays', `Out ${ms}ms`, `OUT DLY\\n${ms}ms`, 14, WHITE, DARK, 'output_delay_time', { band: 'High', ms })
	}

	// ═══════════════════════════════════════════════════════════
	// 10. RTA
	// ═══════════════════════════════════════════════════════════

	presets['rta_slow'] = btn('RTA', 'RTA Slow', 'RTA\\nSLOW', 14, WHITE, BLUE, 'rta_rate', { value: 'Slow' })
	presets['rta_fast'] = btn('RTA', 'RTA Fast', 'RTA\\nFAST', 14, WHITE, CYAN, 'rta_rate', { value: 'Fast' })
	for (const offset of [0, 10, 20, 30, 40]) {
		presets[`rta_offset_${offset}`] = btn('RTA', `RTA +${offset}dB`, `RTA OFS\\n${offset}dB`, 14, WHITE, DARK, 'rta_offset', { value: offset })
	}

	// ═══════════════════════════════════════════════════════════
	// 11. GEQ QUICK CURVES
	// ═══════════════════════════════════════════════════════════

	presets['geq_on'] = btn('GEQ Control', 'GEQ On', 'GEQ\\nON', 18, BLACK, GREEN, 'geq_enable', { value: 'true' }, [
		{ feedbackId: 'geq_enabled', style: { bgcolor: GREEN, color: BLACK } },
	])
	presets['geq_off'] = btn('GEQ Control', 'GEQ Off', 'GEQ\\nOFF', 18, WHITE, DARK, 'geq_enable', { value: 'false' })
	presets['geq_flat'] = btn('GEQ Control', 'GEQ Flat', 'GEQ\\nFLAT', 18, BLACK, YELLOW, 'geq_flat')

	const curves = [
		{ id: 'MyBand', label: 'MY\\nBAND', color: BLUE },
		{ id: 'Speech', label: 'GEQ\\nSPEECH', color: CYAN },
		{ id: 'PerformanceVenue', label: 'PERF\\nVENUE', color: PURPLE },
		{ id: 'DJ', label: 'GEQ\\nDJ', color: ORANGE },
	]
	for (const c of curves) {
		presets[`geq_curve_${c.id}`] = btn('GEQ Control', `GEQ ${c.id}`, c.label, 14, WHITE, c.color, 'geq_quick_curve', { mode: c.id })
	}

	// ═══════════════════════════════════════════════════════════
	// 12-15. GEQ BANDS — All 31 bands across 4 pages
	// Each band shows current gain and frequency label
	// ═══════════════════════════════════════════════════════════

	const shortLabels = {
		1: '20', 2: '25', 3: '31', 4: '40', 5: '50', 6: '63', 7: '80', 8: '100',
		9: '125', 10: '160', 11: '200', 12: '250', 13: '315', 14: '400', 15: '500', 16: '630',
		17: '800', 18: '1k', 19: '1.2k', 20: '1.6k', 21: '2k', 22: '2.5k', 23: '3.1k', 24: '4k',
		25: '5k', 26: '6.3k', 27: '8k', 28: '10k', 29: '12k', 30: '16k', 31: '20k',
	}

	// GEQ gain step presets: for each band, buttons to cut/boost by steps
	const geqPages = [
		{ name: 'GEQ Lows (20-100)', start: 1, end: 8 },
		{ name: 'GEQ Low-Mids (125-630)', start: 9, end: 16 },
		{ name: 'GEQ Hi-Mids (800-4k)', start: 17, end: 24 },
		{ name: 'GEQ Highs (5k-20k)', start: 25, end: 31 },
	]

	for (const page of geqPages) {
		for (let b = page.start; b <= page.end; b++) {
			const sl = shortLabels[b]

			// Display button (shows current value)
			presets[`geq_show_${b}`] = {
				type: 'button', category: page.name, name: `GEQ ${sl} Display`,
				style: { text: `${sl}\\n$(pa2:geq_${sl}_fmt)`, size: '14', color: WHITE, bgcolor: DARK },
				steps: [{ down: [{ actionId: 'geq_band', options: { band: b, gain: 0 } }], up: [] }],
				feedbacks: [],
			}

			// Cut buttons
			presets[`geq_${b}_cut3`] = btn(page.name, `${sl} -3dB`, `${sl}\\n-3dB`, 14, WHITE, combineRgb(0, 60, 120), 'geq_band', { band: b, gain: -3 })
			presets[`geq_${b}_cut6`] = btn(page.name, `${sl} -6dB`, `${sl}\\n-6dB`, 14, WHITE, combineRgb(0, 40, 100), 'geq_band', { band: b, gain: -6 })
			presets[`geq_${b}_cut12`] = btn(page.name, `${sl} -12dB`, `${sl}\\n-12`, 14, WHITE, combineRgb(0, 20, 80), 'geq_band', { band: b, gain: -12 })

			// Boost buttons
			presets[`geq_${b}_boost3`] = btn(page.name, `${sl} +3dB`, `${sl}\\n+3dB`, 14, BLACK, combineRgb(120, 100, 0), 'geq_band', { band: b, gain: 3 })
			presets[`geq_${b}_boost6`] = btn(page.name, `${sl} +6dB`, `${sl}\\n+6dB`, 14, BLACK, combineRgb(160, 120, 0), 'geq_band', { band: b, gain: 6 })
		}
	}

	// ═══════════════════════════════════════════════════════════
	// 16. CROSSOVER
	// ═══════════════════════════════════════════════════════════

	const xoverBands = [
		{ id: 'Band_1', label: 'HIGH' },
		{ id: 'Band_2', label: 'MID' },
		{ id: 'Band_3', label: 'LOW' },
	]
	for (const xb of xoverBands) {
		presets[`xover_${xb.id}_polnorm`] = btn('Crossover', `${xb.label} Normal`, `${xb.label}\\nNORMAL`, 14, WHITE, DARK, 'xover_polarity', { band: xb.id, value: 'Normal' })
		presets[`xover_${xb.id}_polinv`] = btn('Crossover', `${xb.label} Invert`, `${xb.label}\\nINVERT`, 14, WHITE, RED, 'xover_polarity', { band: xb.id, value: 'Inverted' })
	}

	// Common crossover filter types
	for (const ft of ['BW 24', 'BW 48', 'LR 24', 'LR 48']) {
		const ftShort = ft.replace(' ', '')
		presets[`xover_hp_${ftShort}`] = btn('Crossover', `HP ${ft}`, `HP\\n${ft}`, 14, WHITE, DARK, 'xover_hp_type', { band: 'Band_1', value: ft })
		presets[`xover_lp_${ftShort}`] = btn('Crossover', `LP ${ft}`, `LP\\n${ft}`, 14, WHITE, DARK, 'xover_lp_type', { band: 'Band_1', value: ft })
	}

	// ═══════════════════════════════════════════════════════════
	// 17. PANIC — Emergency row (big, obvious, hard to miss)
	// ═══════════════════════════════════════════════════════════

	presets['panic_main'] = btn('PANIC', 'PANIC MUTE', 'PANIC\\nMUTE', 24, WHITE, RED, 'panic_mute')
	presets['panic_gen'] = btn('PANIC', 'Kill Generator', 'KILL\\nGEN', 18, WHITE, RED, 'gen_mode', { mode: 'Off' }, [
		{ feedbackId: 'gen_active', style: { bgcolor: YELLOW, color: BLACK } },
	])
	presets['panic_afs_clr'] = btn('PANIC', 'AFS Clear All', 'AFS\\nCLR ALL', 14, WHITE, RED, 'afs_clear_all')
	presets['panic_geq_flat'] = btn('PANIC', 'GEQ Flat', 'GEQ\\nFLAT', 18, BLACK, YELLOW, 'geq_flat')
	presets['panic_peq_flat'] = btn('PANIC', 'PEQ Flatten', 'PEQ\\nFLAT', 18, BLACK, YELLOW, 'peq_flatten', { output: 'High' })

	// ═══════════════════════════════════════════════════════════
	// 18. RAW COMMAND
	// ═══════════════════════════════════════════════════════════

	presets['raw_cmd'] = {
		type: 'button', category: 'Utility', name: 'Raw Command',
		style: { text: 'RAW\\nCMD', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'raw_command', options: { command: 'get \\\\\\\\Node\\\\AT\\\\Class_Name' } }], up: [] }],
		feedbacks: [],
	}
	presets['scan_network'] = btn('Utility', 'Scan Network', 'SCAN\\nNETWORK', 14, WHITE, BLUE, 'scan_network')

	// ═══════════════════════════════════════════════════════════
	// 19. PRESET RECALL — Quick buttons for presets 1-10
	// ═══════════════════════════════════════════════════════════

	for (let p = 1; p <= 10; p++) {
		presets[`preset_${p}`] = btn('Presets', `Preset ${p}`, `PRESET\\n${p}`, 18, WHITE, DKBLUE, 'preset_recall', { number: p })
	}

	// ═══════════════════════════════════════════════════════════
	// 20. GEQ INCREMENT/DECREMENT — per common feedback band
	// ═══════════════════════════════════════════════════════════

	const incBands = [
		{ band: 9, label: '125' }, { band: 12, label: '250' }, { band: 15, label: '500' },
		{ band: 18, label: '1k' }, { band: 21, label: '2k' }, { band: 24, label: '4k' },
		{ band: 27, label: '8k' },
	]
	for (const ib of incBands) {
		presets[`geq_inc_${ib.band}`] = btn('GEQ +/- Faders', `${ib.label} +1dB`, `${ib.label}\\n+1dB`, 14, BLACK, combineRgb(120, 100, 0), 'geq_increment', { band: ib.band, step: 1 })
		presets[`geq_dec_${ib.band}`] = btn('GEQ +/- Faders', `${ib.label} -1dB`, `${ib.label}\\n-1dB`, 14, WHITE, combineRgb(0, 40, 100), 'geq_decrement', { band: ib.band, step: 1 })
		presets[`geq_show2_${ib.band}`] = {
			type: 'button', category: 'GEQ +/- Faders', name: `${ib.label} Display`,
			style: { text: `${ib.label}\\n$(pa2:geq_${ib.label}_fmt)`, size: '14', color: WHITE, bgcolor: DARK },
			steps: [{ down: [{ actionId: 'geq_band', options: { band: ib.band, gain: 0 } }], up: [] }],
			feedbacks: [],
		}
	}

	// ═══════════════════════════════════════════════════════════
	// 21. SMART MACROS — One-press workflow transformations
	// ═══════════════════════════════════════════════════════════

	// Scene macros — these change the entire PA2 personality
	const TEAL = combineRgb(0, 160, 160)
	const LIME = combineRgb(100, 200, 0)
	const PINK = combineRgb(200, 50, 100)
	const GOLD = combineRgb(200, 160, 0)

	presets['m_speech'] = btn('Smart Macros', 'Speech Mode', 'SPEECH\\nMODE', 14, BLACK, TEAL, 'macro_speech')
	presets['m_music'] = btn('Smart Macros', 'Music Mode', 'MUSIC\\nMODE', 14, WHITE, PURPLE, 'macro_music')
	presets['m_intermission'] = btn('Smart Macros', 'Intermission', 'INTER\\nMISSION', 14, BLACK, GOLD, 'macro_intermission')
	presets['m_dj'] = btn('Smart Macros', 'DJ Handoff', 'DJ\\nMODE', 18, BLACK, ORANGE, 'macro_dj')
	presets['m_changeover'] = btn('Smart Macros', 'Band Changeover', 'CHANGE\\nOVER', 14, WHITE, BLUE, 'macro_changeover')
	presets['m_monitor'] = btn('Smart Macros', 'Monitor Check', 'MONITOR\\nCHECK', 14, BLACK, LIME, 'macro_monitor_check')
	presets['m_full_reset'] = btn('Smart Macros', 'Full Reset', 'FULL\\nRESET', 18, WHITE, RED, 'macro_full_reset')

	// EQ sculpting macros — surgical sound shaping
	presets['m_vocal'] = btn('EQ Sculpt', 'Vocal Focus', 'VOCAL\\nFOCUS', 14, WHITE, combineRgb(80, 0, 160), 'macro_vocal_focus')
	presets['m_demud'] = btn('EQ Sculpt', 'De-Mud', 'DE-MUD\\n160-400', 14, BLACK, combineRgb(160, 120, 60), 'macro_de_mud')
	presets['m_deess'] = btn('EQ Sculpt', 'De-Ess', 'DE-ESS\\n4k-10k', 14, WHITE, combineRgb(60, 80, 140), 'macro_de_ess')
	presets['m_lowcut'] = btn('EQ Sculpt', 'Low Cut', 'LOW CUT\\nRUMBLE', 14, WHITE, combineRgb(80, 40, 0), 'macro_low_cut')
	presets['m_loudness'] = btn('EQ Sculpt', 'Loudness Contour', 'LOUD\\nCONTOUR', 14, BLACK, combineRgb(200, 100, 0), 'macro_loudness')
	presets['m_geq_flat'] = btn('EQ Sculpt', 'GEQ Flat (undo)', 'GEQ\\nFLAT', 18, BLACK, YELLOW, 'geq_flat')

	// ═══════════════════════════════════════════════════════════
	// 22. LIVE METERS — Real-time level displays for Stream Deck
	// ═══════════════════════════════════════════════════════════

	// Input meters
	presets['meter_in_l'] = {
		type: 'button', category: 'Live Meters', name: 'Input L',
		style: { text: 'IN L\\n$(pa2:meter_input_l)dB', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['meter_in_r'] = {
		type: 'button', category: 'Live Meters', name: 'Input R',
		style: { text: 'IN R\\n$(pa2:meter_input_r)dB', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// Output meters
	presets['meter_out_hl'] = {
		type: 'button', category: 'Live Meters', name: 'Output High L',
		style: { text: 'OUT HL\\n$(pa2:meter_output_hl)dB', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['meter_out_hr'] = {
		type: 'button', category: 'Live Meters', name: 'Output High R',
		style: { text: 'OUT HR\\n$(pa2:meter_output_hr)dB', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// Compressor meters
	presets['meter_comp_gr'] = {
		type: 'button', category: 'Live Meters', name: 'Compressor GR',
		style: { text: 'COMP GR\\n$(pa2:meter_comp_gr_fmt)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['meter_lim_gr'] = {
		type: 'button', category: 'Live Meters', name: 'Limiter GR',
		style: { text: 'LIM GR\\n$(pa2:meter_lim_gr_fmt)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// RTA bands — key frequencies
	const rtaFreqs = [
		{ band: 1, label: '20' }, { band: 5, label: '50' }, { band: 8, label: '100' },
		{ band: 12, label: '250' }, { band: 15, label: '500' }, { band: 18, label: '1k' },
		{ band: 21, label: '2k' }, { band: 24, label: '4k' }, { band: 27, label: '8k' },
		{ band: 30, label: '16k' },
	]
	for (const rf of rtaFreqs) {
		presets[`rta_band_${rf.band}`] = {
			type: 'button', category: 'Live RTA', name: `RTA ${rf.label}`,
			style: { text: `${rf.label}\\n$(pa2:rta_band_${rf.band})dB`, size: '14', color: CYAN, bgcolor: BLACK },
			steps: [{ down: [], up: [] }], feedbacks: [],
		}
	}

	// ═══════════════════════════════════════════════════════════
	// 23. RTA VISUAL PAGE — Unicode bar spectrum on Stream Deck
	// Designed for XL: row of 8 spectrum group buttons + tools
	// ═══════════════════════════════════════════════════════════

	// 4 spectrum group buttons showing live unicode bars
	presets['rta_vis_lows'] = {
		type: 'button', category: 'RTA Spectrum', name: 'RTA Lows',
		style: { text: 'LOWS\\n$(pa2:rta_vis_lows)', size: '14', color: combineRgb(255, 80, 80), bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['rta_vis_lowmids'] = {
		type: 'button', category: 'RTA Spectrum', name: 'RTA Low-Mids',
		style: { text: 'LO-MID\\n$(pa2:rta_vis_lowmids)', size: '14', color: combineRgb(255, 200, 50), bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['rta_vis_himids'] = {
		type: 'button', category: 'RTA Spectrum', name: 'RTA Hi-Mids',
		style: { text: 'HI-MID\\n$(pa2:rta_vis_himids)', size: '14', color: combineRgb(50, 255, 50), bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['rta_vis_highs'] = {
		type: 'button', category: 'RTA Spectrum', name: 'RTA Highs',
		style: { text: 'HIGHS\\n$(pa2:rta_vis_highs)', size: '14', color: combineRgb(80, 150, 255), bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// Peak tracker — shows hottest frequency live
	presets['rta_peak'] = {
		type: 'button', category: 'RTA Spectrum', name: 'RTA Peak',
		style: { text: 'PEAK\\n$(pa2:rta_peak_freq)\\n$(pa2:rta_peak_db)dB', size: '14', color: RED, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// RTA tools
	presets['rta_auto_eq'] = btn('RTA Spectrum', 'Auto-EQ from RTA', 'AUTO\\nEQ', 18, BLACK, combineRgb(0, 200, 100), 'macro_auto_eq_from_rta', { target: -50, maxCut: -12, maxBoost: 6 })
	presets['rta_cut_peak'] = btn('RTA Spectrum', 'Cut Peak -3dB', 'CUT\\nPEAK', 18, WHITE, combineRgb(180, 0, 60), 'macro_cut_peak', { depth: -3 })
	presets['rta_boost_weak'] = btn('RTA Spectrum', 'Boost Weak +2dB', 'BOOST\\nWEAK', 18, BLACK, combineRgb(60, 120, 200), 'macro_boost_weak', { amount: 2 })
	presets['rta_snapshot'] = btn('RTA Spectrum', 'RTA Snapshot', 'RTA\\nSNAP', 14, WHITE, DARK, 'macro_rta_snapshot')
	presets['rta_compare'] = btn('RTA Spectrum', 'RTA Compare', 'RTA\\nCOMPARE', 14, WHITE, DARK, 'macro_rta_compare')

	// ═══════════════════════════════════════════════════════════
	// 24. ENHANCED METERS — Visual bars + clip/signal indicators
	// ═══════════════════════════════════════════════════════════

	presets['meter_input_visual'] = {
		type: 'button', category: 'Visual Meters', name: 'Input Levels',
		style: { text: 'INPUT\\nL$(pa2:meter_input_l_bar)\\nR$(pa2:meter_input_r_bar)', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{ feedbackId: 'meter_clip', style: { color: RED } },
			{ feedbackId: 'meter_signal_present', style: { color: GREEN } },
		],
	}

	presets['meter_output_visual'] = {
		type: 'button', category: 'Visual Meters', name: 'Output Levels',
		style: { text: 'OUTPUT\\nL$(pa2:meter_output_hl_bar)\\nR$(pa2:meter_output_hr_bar)', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	presets['meter_comp_visual'] = {
		type: 'button', category: 'Visual Meters', name: 'Compressor GR',
		style: { text: 'COMP GR\\n$(pa2:meter_comp_gr_bar)\\n$(pa2:meter_comp_gr_fmt)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'meter_gr_active', style: { color: RED } }],
	}

	presets['meter_lim_visual'] = {
		type: 'button', category: 'Visual Meters', name: 'Limiter GR',
		style: { text: 'LIM GR\\n$(pa2:meter_lim_gr_bar)\\n$(pa2:meter_lim_gr_fmt)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'meter_gr_active', style: { color: RED } }],
	}

	presets['meter_signal_indicator'] = {
		type: 'button', category: 'Visual Meters', name: 'Signal Indicator',
		style: { text: 'SIGNAL\\n$(pa2:meter_input_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{ feedbackId: 'meter_signal_present', style: { bgcolor: DKGREEN, color: GREEN } },
			{ feedbackId: 'meter_clip', style: { bgcolor: RED, color: WHITE } },
		],
	}

	// ═══════════════════════════════════════════════════════════
	// 25. FULL 31-BAND RTA PAGE — One button per band for Stream Deck XL
	// Layout: Row 1 = strips + tools, Rows 2-4 = all 31 bands
	// ═══════════════════════════════════════════════════════════

	const RTA_LABELS = ['20','25','31','40','50','63','80','100','125','160','200','250','315','400','500','630','800','1k','1.25k','1.6k','2k','2.5k','3.15k','4k','5k','6.3k','8k','10k','12.5k','16k','20k']
	const RTA_COLORS = [
		// Lows (1-8): warm red/orange
		combineRgb(255, 80, 80), combineRgb(255, 80, 80), combineRgb(255, 100, 60), combineRgb(255, 100, 60),
		combineRgb(255, 120, 40), combineRgb(255, 120, 40), combineRgb(255, 140, 30), combineRgb(255, 140, 30),
		// Low-mids (9-16): yellow/gold
		combineRgb(255, 200, 50), combineRgb(255, 200, 50), combineRgb(255, 200, 50), combineRgb(255, 200, 50),
		combineRgb(240, 220, 60), combineRgb(240, 220, 60), combineRgb(240, 220, 60), combineRgb(240, 220, 60),
		// Hi-mids (17-24): green
		combineRgb(50, 255, 50), combineRgb(50, 255, 50), combineRgb(50, 255, 50), combineRgb(50, 255, 50),
		combineRgb(80, 230, 80), combineRgb(80, 230, 80), combineRgb(80, 230, 80), combineRgb(80, 230, 80),
		// Highs (25-31): blue/cyan
		combineRgb(80, 150, 255), combineRgb(80, 150, 255), combineRgb(80, 150, 255), combineRgb(80, 150, 255),
		combineRgb(100, 180, 255), combineRgb(100, 180, 255), combineRgb(100, 180, 255),
	]

	for (let b = 1; b <= 31; b++) {
		presets[`rta_full_${b}`] = {
			type: 'button', category: 'RTA Full Spectrum', name: `RTA ${RTA_LABELS[b-1]}`,
			style: { text: `${RTA_LABELS[b-1]}\\n$(pa2:rta_band_${b})dB`, size: '14', color: RTA_COLORS[b-1], bgcolor: BLACK },
			steps: [{ down: [], up: [] }],
			feedbacks: [{ feedbackId: 'rta_peak_alert', options: { threshold: -25 } }],
		}
	}

	// Flatness score button
	presets['rta_flat_score'] = {
		type: 'button', category: 'RTA Full Spectrum', name: 'Flatness Score',
		style: { text: 'FLAT\\n$(pa2:rta_flat_score)', size: '18', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// ═══════════════════════════════════════════════════════════
	// 26. FULL 31-BAND GEQ FADERS — +1/-1/display per band
	// 4 pages: Lows (1-8), Low-Mids (9-16), Hi-Mids (17-24), Highs (25-31)
	// ═══════════════════════════════════════════════════════════

	const GEQ_LABELS = ['20','25','31','40','50','63','80','100','125','160','200','250','315','400','500','630','800','1k','1.2k','1.6k','2k','2.5k','3.1k','4k','5k','6.3k','8k','10k','12k','16k','20k']
	const GEQ_PAGES = [
		{ cat: 'GEQ Faders: Lows', start: 1, end: 8 },
		{ cat: 'GEQ Faders: Low-Mids', start: 9, end: 16 },
		{ cat: 'GEQ Faders: Hi-Mids', start: 17, end: 24 },
		{ cat: 'GEQ Faders: Highs', start: 25, end: 31 },
	]

	for (const page of GEQ_PAGES) {
		for (let b = page.start; b <= page.end; b++) {
			const lbl = GEQ_LABELS[b-1]
			// Display button — shows current gain
			presets[`geq_fader_${b}_display`] = {
				type: 'button', category: page.cat, name: `GEQ ${lbl} Display`,
				style: { text: `${lbl}\\n$(pa2:geq_${lbl}_fmt)`, size: '14', color: GREEN, bgcolor: BLACK },
				steps: [{ down: [], up: [] }], feedbacks: [],
			}
			// +1dB button
			presets[`geq_fader_${b}_up`] = btn(page.cat, `GEQ ${lbl} +1`, `${lbl}\\n+1`, 14, BLACK, combineRgb(0, 160, 0), 'geq_increment', { band: b, step: 1 })
			// -1dB button
			presets[`geq_fader_${b}_down`] = btn(page.cat, `GEQ ${lbl} -1`, `${lbl}\\n-1`, 14, WHITE, combineRgb(160, 0, 0), 'geq_decrement', { band: b, step: 1 })
		}
	}

	// ═══════════════════════════════════════════════════════════
	// 27. NEW LIVE SOUND MACROS
	// ═══════════════════════════════════════════════════════════

	presets['macro_outdoor'] = btn('Scene Macros', 'Outdoor Venue', 'OUTDOOR\\nVENUE', 18, WHITE, combineRgb(50, 120, 50), 'macro_outdoor')
	presets['macro_feedback_emergency'] = btn('Scene Macros', 'Feedback Emergency', 'FEEDBACK\\nEMERG', 18, WHITE, RED, 'macro_feedback_emergency')
	presets['macro_sub_check'] = btn('Scene Macros', 'Sub Check', 'SUB\\nCHECK', 18, BLACK, combineRgb(180, 0, 180), 'macro_sub_check')
	presets['macro_walk_music'] = btn('Scene Macros', 'Walk Music', 'WALK\\nMUSIC', 18, BLACK, GOLD, 'macro_walk_music')
	presets['macro_prayer'] = btn('Scene Macros', 'Prayer / Spoken', 'PRAYER\\nSPOKEN', 18, WHITE, TEAL, 'macro_prayer')
	presets['macro_worship'] = btn('Scene Macros', 'Worship Band', 'WORSHIP\\nBAND', 18, WHITE, combineRgb(120, 0, 180), 'macro_worship')
	presets['macro_ab_compare'] = btn('Scene Macros', 'A/B EQ Compare', 'A/B\\nCOMPARE', 18, BLACK, YELLOW, 'macro_ab_compare')

	// ═══════════════════════════════════════════════════════════
	// 28. STEREO METER COMBOS — Two meters on one button
	// ═══════════════════════════════════════════════════════════

	presets['meter_input_stereo'] = {
		type: 'button', category: 'Combo Meters', name: 'Input Stereo',
		style: { text: 'IN L$(pa2:meter_input_l_bar)\\nIN R$(pa2:meter_input_r_bar)\\n$(pa2:meter_input_fmt)', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{ feedbackId: 'meter_clip', style: { color: RED } },
			{ feedbackId: 'meter_signal_present', style: { color: GREEN } },
		],
	}
	presets['meter_output_stereo'] = {
		type: 'button', category: 'Combo Meters', name: 'Output Stereo',
		style: { text: 'OUT L$(pa2:meter_output_hl_bar)\\nOUT R$(pa2:meter_output_hr_bar)', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['meter_processing'] = {
		type: 'button', category: 'Combo Meters', name: 'Processing GR',
		style: { text: 'CMP$(pa2:meter_comp_gr_bar)\\nLIM$(pa2:meter_lim_gr_bar)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'meter_gr_active', style: { color: RED } }],
	}
	presets['meter_signal_chain'] = {
		type: 'button', category: 'Combo Meters', name: 'Signal Chain',
		style: { text: 'IN $(pa2:meter_input_l_bar)\\nGR$(pa2:meter_comp_gr_bar)\\nOUT$(pa2:meter_output_hl_bar)', size: '14', color: CYAN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{ feedbackId: 'meter_clip', style: { color: RED } },
		],
	}

	// ═══════════════════════════════════════════════════════════
	// 29. CORPORATE AV — Complete event control on one XL page
	// Row 1: Scene selectors (one-press, entire PA2 config)
	// Row 2: Safety + status
	// Row 3: Meters + processing status
	// Row 4: Quick tools
	// ═══════════════════════════════════════════════════════════

	const CORP_BLUE = combineRgb(0, 80, 180)
	const CORP_TEAL = combineRgb(0, 140, 140)
	const CORP_STEEL = combineRgb(70, 90, 110)
	const CORP_SLATE = combineRgb(50, 60, 80)

	// Row 1: Scene selectors — each shows active state
	const corpScenes = [
		{ id: 'scene_keynote', scene: 'KEYNOTE', label: 'KEY\\nNOTE', color: WHITE, bg: CORP_BLUE },
		{ id: 'scene_panel', scene: 'PANEL', label: 'PANEL', color: WHITE, bg: CORP_TEAL },
		{ id: 'scene_qa', scene: 'Q&A', label: 'Q & A', color: BLACK, bg: YELLOW },
		{ id: 'scene_video', scene: 'VIDEO', label: 'VIDEO', color: WHITE, bg: PURPLE },
		{ id: 'scene_break', scene: 'BREAK', label: 'BREAK\\nMUSIC', color: BLACK, bg: GOLD },
		{ id: 'scene_hybrid', scene: 'HYBRID', label: 'HYBRID\\nMEET', color: WHITE, bg: combineRgb(0, 120, 80) },
		{ id: 'scene_awards', scene: 'AWARDS', label: 'AWARDS', color: BLACK, bg: combineRgb(200, 170, 0) },
		{ id: 'scene_announce', scene: 'ANNOUNCE', label: 'EMERG\\nANNC', color: WHITE, bg: combineRgb(200, 0, 0) },
	]
	for (const s of corpScenes) {
		presets[`corp_${s.scene.toLowerCase()}`] = {
			type: 'button', category: 'Corporate AV', name: `Scene: ${s.scene}`,
			style: { text: s.label, size: '14', color: s.color, bgcolor: s.bg },
			steps: [{ down: [{ actionId: s.id, options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'active_scene', options: { scene: s.scene }, style: { bgcolor: GREEN, color: BLACK } }],
		}
	}

	// Row 2: Safety + status
	presets['corp_mute_l'] = {
		type: 'button', category: 'Corporate AV', name: 'Mute High L',
		style: { text: 'HIGH L\\n$(pa2:mute_high_l_fmt)', size: '14', color: WHITE, bgcolor: DKGREEN },
		steps: [{ down: [{ actionId: 'mute_toggle', options: { output: 'HighLeft' } }], up: [] }],
		feedbacks: [{ feedbackId: 'mute_state', options: { output: 'HighLeft' }, style: { bgcolor: RED, color: WHITE } }],
	}
	presets['corp_mute_r'] = {
		type: 'button', category: 'Corporate AV', name: 'Mute High R',
		style: { text: 'HIGH R\\n$(pa2:mute_high_r_fmt)', size: '14', color: WHITE, bgcolor: DKGREEN },
		steps: [{ down: [{ actionId: 'mute_toggle', options: { output: 'HighRight' } }], up: [] }],
		feedbacks: [{ feedbackId: 'mute_state', options: { output: 'HighRight' }, style: { bgcolor: RED, color: WHITE } }],
	}
	presets['corp_mute_all'] = btn('Corporate AV', 'Mute All', 'MUTE\\nALL', 18, WHITE, RED, 'mute_all')
	presets['corp_unmute'] = btn('Corporate AV', 'Safe Unmute', 'SAFE\\nUNMUTE', 14, BLACK, GREEN, 'safe_unmute')
	presets['corp_panic'] = btn('Corporate AV', 'PANIC', 'PANIC\\nMUTE', 24, WHITE, RED, 'panic_mute')
	presets['corp_gen_off'] = btn('Corporate AV', 'Gen Off', 'GEN\\nOFF', 18, WHITE, DKRED, 'gen_mode', { mode: 'Off' }, [
		{ feedbackId: 'gen_active', style: { bgcolor: YELLOW, color: BLACK } },
	])
	presets['corp_scene_status'] = {
		type: 'button', category: 'Corporate AV', name: 'Active Scene',
		style: { text: 'SCENE\\n$(pa2:active_scene)', size: '14', color: WHITE, bgcolor: CORP_SLATE },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['corp_preset'] = {
		type: 'button', category: 'Corporate AV', name: 'Preset',
		style: { text: 'PRESET\\n$(pa2:preset_fmt)', size: '14', color: WHITE, bgcolor: DKBLUE },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// Row 3: Live meters + processing
	presets['corp_input_meter'] = {
		type: 'button', category: 'Corporate AV', name: 'Input Level',
		style: { text: 'INPUT\\nL$(pa2:meter_input_l_bar)\\nR$(pa2:meter_input_r_bar)', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{ feedbackId: 'meter_clip', style: { color: RED } },
			{ feedbackId: 'meter_signal_present', style: { color: GREEN } },
		],
	}
	presets['corp_output_meter'] = {
		type: 'button', category: 'Corporate AV', name: 'Output Level',
		style: { text: 'OUTPUT\\nL$(pa2:meter_output_hl_bar)\\nR$(pa2:meter_output_hr_bar)', size: '14', color: GREEN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}
	presets['corp_comp_gr'] = {
		type: 'button', category: 'Corporate AV', name: 'Comp GR',
		style: { text: 'COMP GR\\n$(pa2:meter_comp_gr_bar)\\n$(pa2:meter_comp_gr_fmt)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'meter_gr_active', style: { color: RED } }],
	}
	presets['corp_lim_gr'] = {
		type: 'button', category: 'Corporate AV', name: 'Lim GR',
		style: { text: 'LIM GR\\n$(pa2:meter_lim_gr_bar)\\n$(pa2:meter_lim_gr_fmt)', size: '14', color: ORANGE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'meter_gr_active', style: { color: RED } }],
	}
	presets['corp_afs'] = {
		type: 'button', category: 'Corporate AV', name: 'AFS Status',
		style: { text: 'AFS\\n$(pa2:afs_status_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'afs_enable', options: { value: 'true' } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'afs_enabled', style: { bgcolor: GREEN, color: BLACK } },
			{ feedbackId: 'afs_mode_live', style: { bgcolor: YELLOW, color: BLACK } },
		],
	}
	presets['corp_comp_status'] = {
		type: 'button', category: 'Corporate AV', name: 'Comp Status',
		style: { text: 'COMP\\n$(pa2:comp_thr_fmt)\\n$(pa2:comp_ratio_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'comp_enable', options: { value: 'true' } }], up: [] }],
		feedbacks: [{ feedbackId: 'comp_enabled', style: { bgcolor: ORANGE, color: BLACK } }],
	}
	presets['corp_conn'] = {
		type: 'button', category: 'Corporate AV', name: 'Connection',
		style: { text: '$(pa2:device_name)\\n$(pa2:conn_status_fmt)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'connected', style: { bgcolor: DKGREEN } }],
	}
	presets['corp_rta_peak'] = {
		type: 'button', category: 'Corporate AV', name: 'RTA Peak',
		style: { text: 'PEAK\\n$(pa2:rta_peak_freq)\\n$(pa2:rta_peak_db)dB', size: '14', color: RED, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	// Row 4: Quick tools
	presets['corp_lectern'] = {
		type: 'button', category: 'Corporate AV', name: 'Lectern Ring-out',
		style: { text: 'LECTERN\\nRING OUT', size: '14', color: WHITE, bgcolor: CORP_STEEL },
		steps: [{ down: [{ actionId: 'scene_lectern', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'active_scene', options: { scene: 'LECTERN' }, style: { bgcolor: GREEN, color: BLACK } }],
	}
	presets['corp_hold'] = {
		type: 'button', category: 'Corporate AV', name: 'Mute Hold',
		style: { text: 'MUTE\\nHOLD', size: '18', color: WHITE, bgcolor: combineRgb(80, 0, 0) },
		steps: [{ down: [{ actionId: 'scene_mute_hold', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'active_scene', options: { scene: 'HOLD' }, style: { bgcolor: RED, color: WHITE } }],
	}
	presets['corp_ab'] = btn('Corporate AV', 'A/B Compare', 'A/B\\nEQ', 18, BLACK, YELLOW, 'macro_ab_compare')
	presets['corp_flat'] = btn('Corporate AV', 'GEQ Flat', 'GEQ\\nFLAT', 18, BLACK, YELLOW, 'geq_flat')
	presets['corp_rta_flatten'] = btn('Corporate AV', 'Auto-EQ from RTA', 'AUTO\\nEQ', 18, BLACK, combineRgb(0, 200, 100), 'macro_auto_eq_from_rta', { target: -50, maxCut: -12, maxBoost: 6 })
	presets['corp_afs_clear'] = btn('Corporate AV', 'AFS Clear Live', 'CLR\\nLIVE', 18, BLACK, YELLOW, 'afs_clear_live')
	presets['corp_soundcheck'] = btn('Corporate AV', 'Soundcheck', 'SOUND\\nCHECK', 14, WHITE, BLUE, 'soundcheck_start')
	presets['corp_detect'] = {
		type: 'button', category: 'Corporate AV', name: 'Detection Status',
		style: { text: 'DETECT\\n$(pa2:detect_last_freq)\\n$(pa2:detect_last_action)', size: '14', color: CYAN, bgcolor: BLACK },
		steps: [{ down: [], up: [] }], feedbacks: [],
	}

	self.setPresetDefinitions(presets)
}
