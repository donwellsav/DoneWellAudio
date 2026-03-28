#!/usr/bin/env node
// test/test-protocol.js
// Run: node test/test-protocol.js
// Tests pa2-protocol.js parseResponse against sample PA2 data.
// Exit code 0 = all pass, 1 = failures.

const samples = require('./sample-responses')

let protocol
try {
	protocol = require('../src/pa2-protocol')
} catch (e) {
	console.error('ERROR: Cannot load src/pa2-protocol.js')
	console.error(e.message)
	console.error('')
	console.error('Run this after Phase 1 (creating pa2-protocol.js)')
	process.exit(1)
}

const { parseResponse, GEQ_BANDS, GEQ_LABELS_TO_NUM, buildCommand } = protocol

let pass = 0
let fail = 0
let skip = 0

function test(name, input, check) {
	const result = parseResponse(input)
	const ok = check(result)
	if (ok) {
		pass++
	} else {
		fail++
		console.log(`FAIL: ${name}`)
		console.log(`  Input:  ${JSON.stringify(input)}`)
		console.log(`  Result: ${JSON.stringify(result)}`)
	}
}

// ── Exports exist ──
console.log('=== Checking exports ===')
for (const name of ['parseResponse', 'GEQ_BANDS', 'buildCommand']) {
	if (typeof protocol[name] !== 'undefined') {
		console.log(`  ✓ ${name} exported`)
		pass++
	} else {
		console.log(`  ✗ ${name} NOT exported`)
		fail++
	}
}
if (typeof GEQ_LABELS_TO_NUM !== 'undefined') {
	console.log('  ✓ GEQ_LABELS_TO_NUM exported')
	pass++
} else {
	console.log('  ⚠ GEQ_LABELS_TO_NUM not exported (Claude Code should add this)')
	skip++
}
console.log('')

// ── GEQ bands ──
console.log('=== GEQ band table ===')
if (GEQ_BANDS) {
	test('Band 1 = 20 Hz', '', () => GEQ_BANDS[1] === '20 Hz')
	test('Band 18 = 1.0 kHz', '', () => GEQ_BANDS[18] === '1.0 kHz')
	test('Band 31 = 20.0 kHz', '', () => GEQ_BANDS[31] === '20.0 kHz')
	test('31 bands total', '', () => Object.keys(GEQ_BANDS).length === 31)
} else {
	console.log('  SKIP: GEQ_BANDS not available')
	skip += 4
}
console.log('')

// ── Parse all sample categories ──
console.log('=== Response parsing ===')
const categories = ['device', 'geq', 'peq', 'autoeq', 'afs', 'compressor', 'limiter', 'mutes', 'subharmonic', 'generator', 'inputDelay', 'outputDelay', 'rta', 'preset']
for (const cat of categories) {
	const lines = samples[cat]
	if (!lines) continue
	let catPass = 0
	for (const line of lines) {
		const result = parseResponse(line)
		if (result !== null && result !== undefined) {
			catPass++
			pass++
		} else {
			fail++
			console.log(`  FAIL [${cat}]: parseResponse returned null for: ${line}`)
		}
	}
	console.log(`  ${cat}: ${catPass}/${lines.length} parsed`)
}
console.log('')

// ── Edge cases ──
console.log('=== Edge cases ===')
const edgeCases = samples.edgeCases
for (const line of edgeCases) {
	const result = parseResponse(line)
	// Error and non-response lines should return null
	const isResponseLine = line.startsWith('get ') || line.startsWith('subr ')
	if (!isResponseLine) {
		if (result === null || result === undefined) {
			pass++
		} else {
			fail++
			console.log(`  FAIL: Should be null for non-response: ${JSON.stringify(line)}`)
			console.log(`    Got: ${JSON.stringify(result)}`)
		}
	} else {
		// OverEasy Off and Inf:1 are valid responses
		if (result !== null) {
			pass++
		} else {
			fail++
			console.log(`  FAIL: Should parse: ${line}`)
		}
	}
}
console.log('')

// ── Specific expected values ──
console.log('=== Value accuracy ===')

// First test: verify the regex captures values correctly (CRITICAL - round 9 fix)
const RE_QUOTED = /^(get|subr)\s+"([^"]+)"\s+"([^"]*)"/
const RE_UNQUOTED = /^(get|subr)\s+(\S+)\s+(\S+)/
function splitLine(line) {
	let m = line.match(RE_QUOTED)
	if (m) return { cmd: m[1], path: m[2], value: m[3] }
	m = line.match(RE_UNQUOTED)
	if (m) return { cmd: m[1], path: m[2], value: m[3] }
	return null
}

const regexTests = [
	['get "\\\\Preset\\Afs\\SV\\AFS" "On"', 'On'],
	['get "\\\\Preset\\Compressor\\SV\\Threshold" "-20.0 dB"', '-20.0 dB'],
	['get "\\\\Preset\\Afs\\SV\\ContentMode" "Speech Music"', 'Speech Music'],
	['subr "\\\\Preset\\OutputGains\\SV\\HighLeftOutputMute\\*" "Off" "0" "0%" "0"', 'Off'],
]
for (const [input, expectedVal] of regexTests) {
	const r = splitLine(input)
	if (r && r.value === expectedVal) { pass++ }
	else {
		fail++
		console.log(`  FAIL regex: expected value="${expectedVal}" got="${r ? r.value : 'null'}" for: ${input.substring(0,50)}`)
	}
}
console.log(`  Regex value capture: ${regexTests.length} tested`)
console.log('')

for (const [input, expected] of Object.entries(samples.expected)) {
	const result = parseResponse(input)
	if (expected === null) {
		test(`null: ${input.substring(0, 40)}...`, input, (r) => r === null || r === undefined)
	} else {
		test(`${expected.module}.${expected.param}: ${input.substring(0, 50)}`, input, (r) => {
			if (!r) return false
			if (r.module !== expected.module) return false
			// Check key fields that exist in expected
			for (const [k, v] of Object.entries(expected)) {
				if (r[k] !== v) return false
			}
			return true
		})
	}
}
console.log('')

// ── Build command (basic smoke test) ──
console.log('=== Command building ===')
if (buildCommand) {
	const topology = { stereoGeq: false, leftGeq: true, rightGeq: true, hasHigh: true, hasMid: false, hasLow: false }
	try {
		const muteCmd = buildCommand('mute', { output: 'HighLeft', value: true }, topology)
		if (Array.isArray(muteCmd) && muteCmd.length > 0) {
			console.log(`  ✓ mute command: ${muteCmd[0]}`)
			pass++
		} else {
			console.log(`  ✗ mute command returned empty`)
			fail++
		}
	} catch (e) {
		console.log(`  ✗ mute command threw: ${e.message}`)
		fail++
	}

	try {
		const geqCmd = buildCommand('geq_band', { band: 18, gain: -6 }, topology)
		if (Array.isArray(geqCmd) && geqCmd.length === 2) {
			console.log(`  ✓ geq_band dual-mono: ${geqCmd.length} commands (L+R)`)
			pass++
		} else if (Array.isArray(geqCmd) && geqCmd.length === 1) {
			console.log(`  ⚠ geq_band: only 1 command (should be 2 for dual-mono)`)
			fail++
		} else {
			console.log(`  ✗ geq_band returned: ${JSON.stringify(geqCmd)}`)
			fail++
		}
	} catch (e) {
		console.log(`  ✗ geq_band threw: ${e.message}`)
		fail++
	}
} else {
	console.log('  SKIP: buildCommand not exported')
	skip += 2
}

// ═══ MACRO PARAM KEY TESTS (audit fixes B11) ═══
console.log('\n── Macro param key tests ──')
const testTopo = { stereoGeq: true, leftGeq: false, rightGeq: false, hasHigh: true, hasMid: false, hasLow: false }

try {
	const subCheckCmds = buildCommand('macro_sub_check', {}, testTopo)
	const hasUndefined = subCheckCmds.some(c => c.includes('undefined'))
	if (!hasUndefined && subCheckCmds.length > 0) {
		console.log(`  ✓ macro_sub_check: ${subCheckCmds.length} commands, no undefined`)
		pass++
	} else {
		console.log(`  ✗ macro_sub_check contains undefined: ${JSON.stringify(subCheckCmds)}`)
		fail++
	}
} catch (e) {
	console.log(`  ✗ macro_sub_check threw: ${e.message}`)
	fail++
}

try {
	const walkCmds = buildCommand('macro_walk_music', {}, testTopo)
	const hasUndefined = walkCmds.some(c => c.includes('undefined'))
	if (!hasUndefined && walkCmds.length > 0) {
		console.log(`  ✓ macro_walk_music: ${walkCmds.length} commands, no undefined`)
		pass++
	} else {
		console.log(`  ✗ macro_walk_music contains undefined: ${JSON.stringify(walkCmds)}`)
		fail++
	}
} catch (e) {
	console.log(`  ✗ macro_walk_music threw: ${e.message}`)
	fail++
}

console.log('')
console.log('════════════════════')
console.log(`Results: ${pass} pass, ${fail} fail, ${skip} skip`)
console.log('════════════════════')
process.exit(fail > 0 ? 1 : 0)
