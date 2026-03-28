// test/sample-responses.js
// These are PA2 response lines based on actual wire traffic patterns.
// Use to validate parseResponse() without a live PA2.

module.exports = {
	// ── Device info ──
	device: [
		'get "\\\\Node\\AT\\Class_Name" "dbxDriveRackPA2"',
		'get "\\\\Node\\AT\\Instance_Name" "driverack"',
		'get "\\\\Node\\AT\\Software_Version" "1.2.0.1"',
	],

	// ── GEQ (dual-mono) ──
	geq: [
		'get "\\\\Preset\\LeftGEQ\\SV\\GraphicEQ" "On"',
		'get "\\\\Preset\\LeftGEQ\\SV\\QuickCurve" "Manual"',
		'get "\\\\Preset\\LeftGEQ\\SV\\20 Hz" "0.0 dB"',
		'get "\\\\Preset\\LeftGEQ\\SV\\1.0 kHz" "-3.0 dB"',
		'get "\\\\Preset\\LeftGEQ\\SV\\20.0 kHz" "2.0 dB"',
		'get "\\\\Preset\\RightGEQ\\SV\\GraphicEQ" "On"',
		'get "\\\\Preset\\RightGEQ\\SV\\1.0 kHz" "-3.0 dB"',
		// Stereo variant (different topology)
		'get "\\\\Preset\\StereoGEQ\\SV\\GraphicEQ" "Off"',
		'get "\\\\Preset\\StereoGEQ\\SV\\1.0 kHz" "0.0 dB"',
	],

	// ── PEQ ──
	peq: [
		'get "\\\\Preset\\High Outputs PEQ\\SV\\ParametricEQ" "On"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Type" "Bell"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Frequency" "2.50 kHz"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Gain" "-6.0 dB"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Q" "4.0"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_2_Type" "Low Shelf"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_2_Frequency" "250 Hz"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_2_Gain" "3.0 dB"',
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_2_Slope" "6.0"',
	],

	// ── Room EQ / AutoEQ ──
	autoeq: [
		'get "\\\\Preset\\RoomEQ\\SV\\ParametricEQ" "On"',
		'get "\\\\Preset\\RoomEQ\\SV\\Flatten" "AutoEQ"',
		'get "\\\\Preset\\RoomEQ\\SV\\Band_1_Type" "Bell"',
		'get "\\\\Preset\\RoomEQ\\SV\\Band_1_Frequency" "800 Hz"',
		'get "\\\\Preset\\RoomEQ\\SV\\Band_1_Gain" "-4.0 dB"',
		'get "\\\\Preset\\RoomEQ\\SV\\Band_1_Q" "2.0"',
	],

	// ── AFS ──
	afs: [
		'get "\\\\Preset\\Afs\\SV\\AFS" "On"',
		'get "\\\\Preset\\Afs\\SV\\FilterMode" "Live"',
		'get "\\\\Preset\\Afs\\SV\\ContentMode" "Speech Music"',
		'get "\\\\Preset\\Afs\\SV\\MaxFixedFilters" "6"',
		'get "\\\\Preset\\Afs\\SV\\LiftTime" "300"',
	],

	// ── Compressor ──
	compressor: [
		'get "\\\\Preset\\Compressor\\SV\\Compressor" "On"',
		'get "\\\\Preset\\Compressor\\SV\\Threshold" "-20.0 dB"',
		'get "\\\\Preset\\Compressor\\SV\\Gain" "5.0 dB"',
		'get "\\\\Preset\\Compressor\\SV\\Ratio" "4.0:1"',
		'get "\\\\Preset\\Compressor\\SV\\OverEasy" "3"',
	],

	// ── Limiters ──
	limiter: [
		'get "\\\\Preset\\High Outputs Limiter\\SV\\Limiter" "On"',
		'get "\\\\Preset\\High Outputs Limiter\\SV\\Threshold" "-6.00 dB"',
		'get "\\\\Preset\\High Outputs Limiter\\SV\\OverEasy" "Off"',
	],

	// ── Mutes ──
	mutes: [
		'get "\\\\Preset\\OutputGains\\SV\\HighLeftOutputMute" "Off"',
		'get "\\\\Preset\\OutputGains\\SV\\HighRightOutputMute" "Off"',
		'get "\\\\Preset\\OutputGains\\SV\\MidLeftOutputMute" "On"',
		'get "\\\\Preset\\OutputGains\\SV\\LowRightOutputMute" "Off"',
	],

	// ── Subharmonic ──
	subharmonic: [
		'get "\\\\Preset\\SubharmonicSynth\\SV\\SubharmonicSynth" "On"',
		'get "\\\\Preset\\SubharmonicSynth\\SV\\Subharmonics" "50 %"',
		'get "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 24-36Hz" "75 %"',
		'get "\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 36-56Hz" "60 %"',
	],

	// ── Generator ──
	generator: [
		'get "\\\\Preset\\SignalGenerator\\SV\\Signal Generator" "Off"',
		'get "\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude" "-60.0 dB"',
	],

	// ── Input Delay ──
	inputDelay: [
		'get "\\\\Preset\\Back Line Delay\\SV\\Delay" "On"',
		'get "\\\\Preset\\Back Line Delay\\SV\\Amount" "25.0 ms"',
	],

	// ── Output Delay ──
	outputDelay: [
		'get "\\\\Preset\\High Outputs Delay\\SV\\Delay" "Off"',
		'get "\\\\Preset\\High Outputs Delay\\SV\\Amount" "0.0 ms"',
	],

	// ── RTA ──
	rta: [
		'get "\\\\Preset\\RTA\\SV\\Rate" "Slow"',
		'get "\\\\Preset\\RTA\\SV\\Gain" "0 dB"',
	],

	// ── Preset ──
	preset: [
		'get "\\\\Storage\\Presets\\SV\\CurrentPreset" "1"',
		'get "\\\\Storage\\Presets\\SV\\Changed" "Unchanged"',
	],

	// ── Edge cases ──
	edgeCases: [
		// OverEasy = 0 returns "Off"
		'get "\\\\Preset\\Compressor\\SV\\OverEasy" "Off"',
		// Frequency in Hz vs kHz
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_3_Frequency" "125 Hz"',
		// Ratio infinity
		'get "\\\\Preset\\Compressor\\SV\\Ratio" "Inf:1"',
		// Error response
		'error "\\\\Preset\\StereoGEQ\\SV\\GraphicEQ"',
		// Empty/garbage
		'',
		'HiQnet Console',
		'connect logged in as administrator',
		'endls',
	],

	// ── Expected parse results (subset for validation) ──
	expected: {
		'get "\\\\Node\\AT\\Class_Name" "dbxDriveRackPA2"':
			{ module: 'device', param: 'model', value: 'dbxDriveRackPA2' },
		'get "\\\\Preset\\LeftGEQ\\SV\\1.0 kHz" "-3.0 dB"':
			{ module: 'geq', param: 'band', band: 18, value: -3.0 },
		'get "\\\\Preset\\Afs\\SV\\AFS" "On"':
			{ module: 'afs', param: 'AFS', value: true },
		'get "\\\\Preset\\OutputGains\\SV\\HighLeftOutputMute" "Off"':
			{ module: 'mute', output: 'HighLeft', value: false },
		'get "\\\\Preset\\Compressor\\SV\\OverEasy" "Off"':
			{ module: 'compressor', param: 'OverEasy', value: 0 },
		'get "\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Frequency" "2.50 kHz"':
			{ module: 'peq', output: 'High', param: 'filter', filter: 1, field: 'Frequency', value: 2500 },
		'error "\\\\Preset\\StereoGEQ\\SV\\GraphicEQ"':
			null,
		'':
			null,
		'HiQnet Console':
			null,
	},
}
