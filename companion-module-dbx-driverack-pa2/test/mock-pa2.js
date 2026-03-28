#!/usr/bin/env node
// test/mock-pa2.js
// Simulates a PA2 on port 19272 for testing the Companion module without real hardware.
// Run: node test/mock-pa2.js [port]
// Then point the module at localhost.

const net = require('net')
const port = parseInt(process.argv[2]) || 19272

// Simulated module list (dual-mono, high-only)
const MODULES = [
	'LeftGEQ', 'RightGEQ', 'High Outputs PEQ', 'RoomEQ', 'Afs',
	'Compressor', 'High Outputs Limiter', 'Crossover', 'OutputGains',
	'SubharmonicSynth', 'SignalGenerator', 'Back Line Delay',
	'High Outputs Delay', 'RTA',
]

// Simulated state (subset)
const STATE = {
	'\\\\Node\\AT\\Class_Name': 'dbxDriveRackPA2',
	'\\\\Node\\AT\\Instance_Name': 'driverack',
	'\\\\Node\\AT\\Software_Version': '1.2.0.1',
	'\\\\Preset\\LeftGEQ\\SV\\GraphicEQ': 'On',
	'\\\\Preset\\LeftGEQ\\SV\\QuickCurve': 'Manual',
	'\\\\Preset\\LeftGEQ\\SV\\1.0 kHz': '-3.0 dB',
	'\\\\Preset\\LeftGEQ\\SV\\20 Hz': '0.0 dB',
	'\\\\Preset\\RightGEQ\\SV\\GraphicEQ': 'On',
	'\\\\Preset\\RightGEQ\\SV\\1.0 kHz': '-3.0 dB',
	'\\\\Preset\\High Outputs PEQ\\SV\\ParametricEQ': 'On',
	'\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Type': 'Bell',
	'\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Frequency': '2.50 kHz',
	'\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Gain': '-6.0 dB',
	'\\\\Preset\\High Outputs PEQ\\SV\\Band_1_Q': '4.0',
	'\\\\Preset\\Afs\\SV\\AFS': 'On',
	'\\\\Preset\\Afs\\SV\\FilterMode': 'Live',
	'\\\\Preset\\Afs\\SV\\ContentMode': 'Speech Music',
	'\\\\Preset\\Afs\\SV\\MaxFixedFilters': '6',
	'\\\\Preset\\Afs\\SV\\LiftTime': '300',
	'\\\\Preset\\Compressor\\SV\\Compressor': 'On',
	'\\\\Preset\\Compressor\\SV\\Threshold': '-20.0 dB',
	'\\\\Preset\\Compressor\\SV\\Gain': '5.0 dB',
	'\\\\Preset\\Compressor\\SV\\Ratio': '4.0:1',
	'\\\\Preset\\Compressor\\SV\\OverEasy': '3',
	'\\\\Preset\\High Outputs Limiter\\SV\\Limiter': 'On',
	'\\\\Preset\\High Outputs Limiter\\SV\\Threshold': '-6.00 dB',
	'\\\\Preset\\High Outputs Limiter\\SV\\OverEasy': 'Off',
	'\\\\Preset\\OutputGains\\SV\\HighLeftOutputMute': 'Off',
	'\\\\Preset\\OutputGains\\SV\\HighRightOutputMute': 'Off',
	'\\\\Preset\\SubharmonicSynth\\SV\\SubharmonicSynth': 'Off',
	'\\\\Preset\\SubharmonicSynth\\SV\\Subharmonics': '50 %',
	'\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 24-36Hz': '50 %',
	'\\\\Preset\\SubharmonicSynth\\SV\\Synthesis Level 36-56Hz': '50 %',
	'\\\\Preset\\SignalGenerator\\SV\\Signal Generator': 'Off',
	'\\\\Preset\\SignalGenerator\\SV\\Signal Amplitude': '-60.0 dB',
	'\\\\Preset\\Back Line Delay\\SV\\Delay': 'Off',
	'\\\\Preset\\Back Line Delay\\SV\\Amount': '0.0 ms',
	'\\\\Preset\\High Outputs Delay\\SV\\Delay': 'Off',
	'\\\\Preset\\High Outputs Delay\\SV\\Amount': '0.0 ms',
	'\\\\Preset\\RTA\\SV\\Rate': 'Slow',
	'\\\\Preset\\RTA\\SV\\Gain': '0 dB',
	'\\\\Storage\\Presets\\SV\\CurrentPreset': '1',
	'\\\\Storage\\Presets\\SV\\Changed': 'Unchanged',
}

const server = net.createServer((socket) => {
	console.log(`Client connected: ${socket.remoteAddress}`)
	let buffer = ''
	let authenticated = false

	// Send handshake
	socket.write('HiQnet Console\n')

	socket.on('data', (data) => {
		buffer += data.toString()
		const lines = buffer.split('\n')
		buffer = lines.pop() || ''

		for (const raw of lines) {
			const line = raw.trim()
			if (!line) continue

			console.log(`< ${line}`)

			// Auth
			if (line.startsWith('connect ')) {
				// Expected: connect administrator administrator
				// (or connect administrator <password>)
				const parts = line.split(' ')
				if (parts.length >= 3 && parts[1] === 'administrator' && parts[2] === 'administrator') {
					const resp = 'connect logged in as administrator\n'
					socket.write(resp)
					console.log(`> ${resp.trim()}`)
					authenticated = true
				} else {
					socket.write('error "authentication failed"\n')
					console.log(`> error (bad credentials: ${parts[1]}/${parts[2]})`)
				}
				continue
			}

			if (!authenticated) {
				socket.write('error "not authenticated"\n')
				continue
			}

			// ls
			if (line.startsWith('ls ')) {
				const path = line.replace(/^ls\s+/, '').replace(/"/g, '')
				if (path === '\\\\Preset') {
					for (const m of MODULES) {
						const resp = `  ${m} :\n`
						socket.write(resp)
					}
					socket.write('endls\n')
					console.log(`> (listed ${MODULES.length} modules + endls)`)
				} else {
					socket.write(`error "${path}"\n`)
				}
				continue
			}

			// get
			if (line.startsWith('get ')) {
				const path = line.replace(/^get\s+/, '').replace(/"/g, '')
				const value = STATE[path]
				if (value !== undefined) {
					const resp = `get "${path}" "${value}"\n`
					socket.write(resp)
					console.log(`> ${resp.trim()}`)
				} else {
					socket.write(`error "${path}"\n`)
					console.log(`> error (unknown path: ${path})`)
				}
				continue
			}

			// set
			if (line.startsWith('set ')) {
				// Parse: set "path" value OR set path value
				const setMatch = line.match(/^set\s+"?([^"]+?)"?\s+"?([^"]*?)"?\s*$/)
				if (setMatch) {
					const [, path, value] = setMatch
					STATE[path] = value
					// Echo back as get response (PA2 behavior)
					const resp = `get "${path}" "${value}"\n`
					socket.write(resp)
					console.log(`> SET ${path} = ${value}`)
				} else {
					socket.write('error "parse error"\n')
				}
				continue
			}

			socket.write(`error "unknown command"\n`)
		}
	})

	socket.on('end', () => console.log('Client disconnected'))
	socket.on('error', (e) => console.log(`Socket error: ${e.message}`))
})

server.listen(port, () => {
	console.log(`Mock PA2 listening on port ${port}`)
	console.log(`Modules: ${MODULES.join(', ')}`)
	console.log(`State entries: ${Object.keys(STATE).length}`)
	console.log(``)
	console.log(`Point the Companion module at localhost:${port}`)
	console.log(`Press Ctrl+C to stop`)
})
