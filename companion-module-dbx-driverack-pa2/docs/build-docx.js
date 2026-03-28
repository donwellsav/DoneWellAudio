const fs = require('fs')
const {
	Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
	Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
	ShadingType, PageNumber, PageBreak, LevelFormat,
} = require('docx')

// ═══ SHARED STYLES ═══
const PAGE = {
	size: { width: 12240, height: 15840 },
	margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
}
const CONTENT_WIDTH = 9360 // 12240 - 2*1440

const STYLES = {
	default: { document: { run: { font: 'Arial', size: 22, color: '000000' } } },
	paragraphStyles: [
		{
			id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
			run: { size: 36, bold: true, font: 'Arial', color: '000000' },
			paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
		},
		{
			id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
			run: { size: 28, bold: true, font: 'Arial', color: '000000' },
			paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
		},
		{
			id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
			run: { size: 24, bold: true, font: 'Arial', color: '333333' },
			paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
		},
	],
}

const BULLETS = {
	reference: 'bullets',
	levels: [{
		level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
		style: { paragraph: { indent: { left: 720, hanging: 360 } } },
	}, {
		level: 1, format: LevelFormat.BULLET, text: '\u2013', alignment: AlignmentType.LEFT,
		style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
	}],
}

const NUMBERS = {
	reference: 'numbers',
	levels: [{
		level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
		style: { paragraph: { indent: { left: 720, hanging: 360 } } },
	}],
}

// Helpers
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] })
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] })
const p = (text, opts) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })], ...(opts?.align ? { alignment: opts.align } : {}) })
const bold = (text) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, bold: true })] })
const code = (text) => new Paragraph({
	spacing: { after: 80 },
	indent: { left: 360 },
	children: [new TextRun({ text, font: 'Consolas', size: 18 })],
})
const bullet = (text, level = 0) => new Paragraph({
	numbering: { reference: 'bullets', level },
	children: [new TextRun(text)],
})
const numbered = (text) => new Paragraph({
	numbering: { reference: 'numbers', level: 0 },
	children: [new TextRun(text)],
})
const spacer = () => new Paragraph({ spacing: { after: 200 }, children: [] })

const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' }
const borders = { top: border, bottom: border, left: border, right: border }
const cellPad = { top: 60, bottom: 60, left: 100, right: 100 }

function tableRow(cells, header = false) {
	return new TableRow({
		children: cells.map((c, i) => new TableCell({
			borders,
			width: { size: c.width || Math.floor(CONTENT_WIDTH / cells.length), type: WidthType.DXA },
			margins: cellPad,
			shading: header ? { fill: 'E0E0E0', type: ShadingType.CLEAR } : undefined,
			children: [new Paragraph({
				children: [new TextRun({ text: c.text || c, bold: header, size: header ? 20 : 20, font: 'Arial' })],
			})],
		})),
	})
}

function simpleTable(headers, rows, colWidths) {
	const widths = colWidths || headers.map(() => Math.floor(CONTENT_WIDTH / headers.length))
	return new Table({
		width: { size: CONTENT_WIDTH, type: WidthType.DXA },
		columnWidths: widths,
		rows: [
			tableRow(headers.map((h, i) => ({ text: h, width: widths[i] })), true),
			...rows.map(row => tableRow(row.map((c, i) => ({ text: c, width: widths[i] })))),
		],
	})
}

function makeHeader(title) {
	return new Header({
		children: [new Paragraph({
			border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 } },
			children: [
				new TextRun({ text: title, font: 'Arial', size: 16, color: '666666' }),
			],
		})],
	})
}

function makeFooter() {
	return new Footer({
		children: [new Paragraph({
			border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 } },
			alignment: AlignmentType.CENTER,
			children: [
				new TextRun({ text: 'Page ', font: 'Arial', size: 16, color: '666666' }),
				new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '666666' }),
			],
		})],
	})
}

function section(title, children) {
	return {
		properties: { page: PAGE },
		headers: { default: makeHeader(title) },
		footers: { default: makeFooter() },
		children,
	}
}

// ═══════════════════════════════════════════
// DOCUMENT 1: User Guide
// ═══════════════════════════════════════════
function buildUserGuide() {
	return new Document({
		styles: STYLES,
		numbering: { config: [BULLETS, NUMBERS] },
		sections: [section('dbx DriveRack PA2 Companion Module \u2014 User Guide', [
			// Title page
			spacer(), spacer(), spacer(), spacer(),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'dbx DriveRack PA2', bold: true, size: 56, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'Bitfocus Companion Module', size: 36, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: 'User Guide', size: 28, font: 'Arial', color: '666666' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Version 0.1.0 \u2014 March 2026', size: 22, color: '999999' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DoneWellAudio / killthering.com', size: 22, color: '999999' })] }),

			new Paragraph({ children: [new PageBreak()] }),

			// Setup
			h1('Setup'),
			numbered('Connect PA2 to your network via Ethernet cable'),
			numbered('Find the IP address on the PA2 front panel: Utility > System Info'),
			numbered('In the Companion launcher, set Developer modules path to C:\\projects'),
			numbered('In Companion web UI, go to Connections, search for "dbx DriveRack PA2"'),
			numbered('Add the module. Enter IP address, port 19272, password "administrator"'),
			numbered('Module auto-connects, discovers topology, reads all parameters'),
			spacer(),
			p('The module maintains two connections to your PA2:'),
			bullet('Port 19272 \u2014 Control (read/write all parameters)'),
			bullet('Port 19274 \u2014 DSP Meters (live RTA spectrum, input/output levels)'),

			new Paragraph({ children: [new PageBreak()] }),

			// Actions
			h1('Actions'),
			p('Every PA2 parameter is available as a Companion action. Actions are organized by category:'),
			spacer(),
			simpleTable(['Category', 'Actions', 'Description'], [
				['Mutes', '4', 'Toggle, set, mute all, unmute all (6 output channels)'],
				['GEQ', '6', 'Enable, flat, quick curve, band gain, increment, decrement'],
				['PEQ', '4', 'Enable, flatten, restore, filter (per output, 8 bands)'],
				['Room EQ', '3', 'Enable, mode (Flat/Manual/AutoEQ), filter'],
				['AFS', '7', 'Enable, mode, content, fixed filters, lift time, clear live/all'],
				['Compressor', '5', 'Enable, threshold, gain, ratio, OverEasy'],
				['Limiters', '3', 'Enable, threshold, OverEasy (per output band)'],
				['Crossover', '6', 'HP/LP type, HP/LP frequency, gain, polarity'],
				['Delays', '4', 'Input delay on/off/time, output delay on/off/time'],
				['Subharmonic', '4', 'Enable, master, lows, highs'],
				['Generator', '2', 'Mode (Off/Pink/White), level'],
				['RTA', '2', 'Rate (Slow/Fast), offset'],
				['Preset', '1', 'Recall preset 1-75'],
				['Smart Macros', '12', 'Speech, Music, DJ, Changeover, Monitor Check, etc.'],
				['RTA Macros', '5', 'Auto-EQ, Cut Peak, Boost Weak, Snapshot, Compare'],
				['Utility', '2', 'Raw command, network scan'],
			], [3400, 800, 5160]),

			new Paragraph({ children: [new PageBreak()] }),

			// Smart Macros
			h1('Smart Macros'),
			p('One-press buttons that change multiple PA2 parameters at once:'),
			spacer(),
			h2('Scene Macros'),
			simpleTable(['Macro', 'What It Does'], [
				['Show Open', 'Unmute all, AFS Live on, compressor on, generator off'],
				['Show Close', 'Mute all, generator off, clear AFS live filters'],
				['Soundcheck', 'Unmute, enable AFS + compressor, flatten GEQ'],
				['Ring Out', 'AFS Fixed mode, 12 filters, clear all'],
				['Panic Mute', 'Instant silence: mute all + generator off'],
				['Safe Unmute', 'Unmute only if generator is off (safety check)'],
				['Speech Mode', 'AFS Live/Speech, compressor -24dB/3:1, unmute'],
				['Music Mode', 'AFS Live/Music, compressor -18dB/2:1, unmute'],
				['DJ Mode', 'DJ GEQ curve, AFS off, subharmonic 75%, unmute'],
				['Intermission', 'AFS Fixed/Music, heavy compression, unmute'],
				['Changeover', 'Mute, flatten GEQ+PEQ, clear AFS, comp off'],
				['Monitor Check', 'Mute all, pink noise -20dB, limiter on at -6dB'],
				['Full Reset', 'Everything to safe defaults (nuclear option)'],
			], [2400, 6960]),
			spacer(),
			h2('EQ Sculpting Macros'),
			simpleTable(['Macro', 'Bands Affected', 'Purpose'], [
				['Vocal Focus', '250, 400, 1.6k, 2.5k, 8k', 'Cut mud, boost presence, tame sibilance'],
				['De-Mud', '160-400 Hz', 'Cut 3-5dB across mud frequencies'],
				['De-Ess', '4-10 kHz', 'Cut 2-4dB across sibilant frequencies'],
				['Low Cut', '20-63 Hz', 'Roll off rumble (stage noise, HVAC, wind)'],
				['Loudness', '31, 50, 80, 2.5k, 4k, 10k', 'Fletcher-Munson compensation for low volume'],
			], [2000, 3000, 4360]),

			new Paragraph({ children: [new PageBreak()] }),

			// Live Meters
			h1('Live DSP Meters'),
			p('The module reads real-time meter data from the PA2\u2019s DSP processor. This data was previously inaccessible \u2014 no other PA2 tool provides it.'),
			spacer(),
			simpleTable(['Meter', 'Update Rate', 'Range', 'Description'], [
				['RTA Spectrum (31 bands)', '5 Hz', '-90 to +10 dB', 'From PA2\u2019s measurement mic'],
				['Input Level L/R', '5 Hz', '-120 to 0 dB', 'Signal entering the PA2'],
				['Output Level HL/HR', '5 Hz', '-120 to 0 dB', 'Signal leaving to amps'],
				['Compressor GR', '5 Hz', '0 to 96 dB', 'Gain reduction amount'],
				['Limiter GR', '5 Hz', '0 to 96 dB', 'Gain reduction amount'],
			], [2800, 1200, 2000, 3360]),
			spacer(),
			p('Meter data drives visual displays on Stream Deck buttons:'),
			bullet('Unicode bar graphs showing level visually'),
			bullet('Peak frequency tracker (shows hottest RTA band)'),
			bullet('Signal present / clipping indicators (color-changing feedbacks)'),
			bullet('Compressor/limiter GR bars'),

			new Paragraph({ children: [new PageBreak()] }),

			// Stream Deck Layout
			h1('Stream Deck XL Layout'),
			p('Recommended page layout for the 4x8 grid:'),
			spacer(),
			h2('Page 1: Show Control'),
			p('Row 1: HIGH L, HIGH R, MID L, MID R, LOW L, LOW R, MUTE ALL, SAFE UNMUTE'),
			p('Row 2: SHOW OPEN, SHOW CLOSE, SOUNDCHECK, RING OUT, PANIC, GEN OFF, PRESET, STATUS'),
			p('Row 3: AFS, AFS MODE, CLR LIVE, CLR ALL, COMP, LIMITER, PEQ, ROOM EQ'),
			p('Row 4: Input meter, Output meter, Comp GR, Lim GR, Signal, RTA Peak, Scan, Raw'),
			spacer(),
			h2('Page 2: RTA + GEQ'),
			p('Row 1: RTA Lows, RTA Lo-Mid, RTA Hi-Mid, RTA Highs, Peak, Auto EQ, Cut Peak, GEQ Flat'),
			p('Row 2-4: GEQ increment/decrement for 125, 250, 500, 1k, 2k, 4k, 8k'),
			spacer(),
			h2('Page 3: Smart Macros'),
			p('Row 1: Speech, Music, DJ, Intermission, Changeover, Monitor, Full Reset'),
			p('Row 2: Vocal Focus, De-Mud, De-Ess, Low Cut, Loudness, GEQ Flat'),
			p('Row 3: Presets 1-8'),
			p('Row 4: Presets 9-10, RTA Snapshot, RTA Compare'),

			new Paragraph({ children: [new PageBreak()] }),

			// HTTP Bridge
			h1('HTTP Bridge'),
			p('External web apps can control the PA2 through Companion\u2019s HTTP API.'),
			spacer(),
			h2('Setup'),
			numbered('Enable HTTP API in Companion Settings > Network'),
			numbered('Note your port (default 8000) and instance label'),
			numbered('URL format: http://<companion-ip>:<port>/instance/<label>/<endpoint>'),
			spacer(),
			h2('Key Endpoints'),
			simpleTable(['Endpoint', 'Method', 'Purpose'], [
				['/ping', 'GET', 'Connection status'],
				['/loop', 'GET', 'Everything: RTA + GEQ + meters + mutes (for polling)'],
				['/rta', 'GET', 'Live 31-band RTA spectrum'],
				['/geq', 'GET', 'Current GEQ state'],
				['/geq', 'POST', 'Set GEQ bands (burst mode, <1ms)'],
				['/eq/auto', 'POST', 'Auto-EQ from current RTA'],
				['/meters', 'GET', 'All live level meters'],
				['/app', 'GET', 'Self-hosted control page (no mixed content)'],
				['/command', 'POST', 'Send any action by name'],
			], [2000, 1200, 6160]),

			new Paragraph({ children: [new PageBreak()] }),

			// Troubleshooting
			h1('Troubleshooting'),
			simpleTable(['Problem', 'Solution'], [
				['Can\u2019t connect', 'Check IP on PA2 front panel (Utility > System Info). PA2 needs DHCP or static IP.'],
				['Auth failed', 'Default password is "administrator". Check PA2 Utility > System Settings.'],
				['No RTA data', 'Connect RTA mic to PA2 front XLR input. Check meters in Companion logs.'],
				['HTTP bridge dead', 'Enable HTTP API in Companion Settings > Network.'],
				['GEQ affects both channels', 'Normal for dual-mono. Module sends to both Left and Right GEQ.'],
				['Missing Mid/Low', 'Normal for full-range (High-only) config. Module adapts.'],
				['Handshake timeout', 'PA2 didn\u2019t respond in 10s. Check network. Module retries automatically.'],
				['Meters not updating', 'DSP port (19274) starts after auth. Check Companion logs.'],
			], [2800, 6560]),
		])],
	})
}

// ═══════════════════════════════════════════
// DOCUMENT 2: DSP Meters Discovery
// ═══════════════════════════════════════════
function buildDspMeters() {
	return new Document({
		styles: STYLES,
		numbering: { config: [BULLETS, NUMBERS] },
		sections: [section('dbx DriveRack PA2 \u2014 DSP Meter Interface Discovery', [
			spacer(), spacer(), spacer(),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'dbx DriveRack PA2', bold: true, size: 56, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'DSP Meter Interface', size: 36, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'Port 19274 \u2014 First Public Documentation', size: 28, font: 'Arial', color: '666666' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: 'Discovered 2026-03-26', size: 22, color: '999999' })] }),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Overview'),
			p('The PA2 exposes a second TCP interface on port 19274 \u2014 a DSP debug console called dspcmd, built on the Stockbridge framework. This provides access to real-time meter data including the 31-band RTA spectrum, input/output levels, and compressor/limiter gain reduction.'),
			spacer(),
			p('This data is NOT available through the standard control protocol on port 19272. No other PA2 tool, library, or community project has documented this interface.'),

			h1('Open Ports'),
			simpleTable(['Port', 'Protocol', 'Purpose'], [
				['21', 'TCP', 'FTP (firmware/presets)'],
				['22', 'TCP', 'SSH'],
				['23', 'TCP', 'Telnet'],
				['19272', 'TCP text', 'HiQnet control (get/set/ls/sub) \u2014 documented'],
				['19274', 'TCP text', 'DSP command interface (meters, RTA) \u2014 NEW'],
				['19276', 'TCP binary', 'Display stream (opens on demand)'],
			], [1500, 1800, 6060]),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Connection'),
			p('Connect via raw TCP to port 19274. No authentication required.'),
			code('TCP connect to <PA2_IP>:19274'),
			code('RECEIVE: "Started Dspcmd processor"'),
			spacer(),
			h1('Command Syntax'),
			code('dspcmd [context] [command] [options]'),
			spacer(),
			h2('Context'),
			simpleTable(['Context', 'Syntax', 'Example'], [
				['Module', 'module "path"', 'module "OA/da_RTA01000064"'],
				['Meter by ID', 'meterid <hex>', 'meterid 00002d0e1f'],
				['Matrix cell', 'at <row> <col>', 'at 0 15'],
			], [2000, 3500, 3860]),
			spacer(),
			h2('Commands'),
			simpleTable(['Command', 'Purpose'], [
				['modules', 'List submodules'],
				['params', 'List parameters'],
				['meters', 'List meters'],
				['meterids', 'Get hex IDs for all meters'],
				['get', 'Read current value'],
				['info', 'Get metadata (name, min, max, units, dimensions)'],
				['--info (ls)', 'Full module info dump'],
			], [2500, 6860]),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Complete Meter Map'),
			spacer(),
			h2('RTA Spectrum'),
			simpleTable(['Module', 'Meter', 'ID', 'Range', 'Dims'], [
				['da_RTA01000064', 'Level', '00002d0e1f', '-90 to +10 dB', '1x31'],
			], [2200, 1000, 2000, 2200, 1960]),
			spacer(),
			p('Reading all 31 bands:'),
			code('meterid 00002d0e1f at 0 0 get    \u2192 band 1 (20 Hz)'),
			code('meterid 00002d0e1f at 0 1 get    \u2192 band 2 (25 Hz)'),
			code('...'),
			code('meterid 00002d0e1f at 0 30 get   \u2192 band 31 (20 kHz)'),
			spacer(),

			h2('Input Meters'),
			simpleTable(['Module', 'ID', 'Range'], [
				['da_InputMeterL01000066', '00002d1b3c', '-120 to 0 dB'],
				['da_InputMeterR01000066', '00002d1d06', '-120 to 0 dB'],
			], [3800, 2500, 3060]),
			spacer(),

			h2('Compressor Meters'),
			simpleTable(['Meter', 'ID', 'Range', 'Dims'], [
				['Input Level', '00002d5f52', '-120 to +20 dB', '1x2'],
				['Gain Reduction', '00002d5f5a', '0 to 96 dB', '1x2'],
				['Threshold', '00002d5f62', '0 to 2', '1x2'],
			], [2500, 2200, 2500, 2160]),
			spacer(),

			h2('Limiter Meters'),
			simpleTable(['Meter', 'ID', 'Range', 'Dims'], [
				['Input Level', '00002d7938', '-120 to +20 dB', '1x2'],
				['Gain Reduction', '00002d7940', '0 to 96 dB', '1x2'],
				['Threshold', '00002d7948', '0 to 2', '1x2'],
				['PeakStop+', '00002d7950', '0 to 2', '1x2'],
			], [2500, 2200, 2500, 2160]),
			spacer(),

			h2('Output Meters'),
			simpleTable(['Module', 'ID', 'Range'], [
				['da_HighLeftMeter01000579', '00002e0460', '-120 to 0 dB'],
				['da_HighRightMeter01000579', '00002e062a', '-120 to 0 dB'],
			], [3800, 2500, 3060]),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Performance'),
			simpleTable(['Operation', 'Time'], [
				['Single meter read', '<5ms round trip'],
				['All 31 RTA bands', '~50ms at 0ms spacing'],
				['Full poll (31 RTA + 8 meters)', '~80ms'],
				['Sustainable poll rate', '5 Hz (200ms interval)'],
			], [5000, 4360]),
			spacer(),

			h1('Limitations'),
			bullet('Meter IDs may be firmware-specific (tested on v1.2.0.1 only)'),
			bullet('No authentication on port 19274 \u2014 anyone on the network can read'),
			bullet('No subscription/push model \u2014 polling required'),
			bullet('Port 19276 streams binary data (likely LCD bitmap) \u2014 not yet decoded'),
		])],
	})
}

// ═══════════════════════════════════════════
// DOCUMENT 3: HTTP API Reference
// ═══════════════════════════════════════════
function buildHttpApi() {
	return new Document({
		styles: STYLES,
		numbering: { config: [BULLETS, NUMBERS] },
		sections: [section('dbx DriveRack PA2 \u2014 HTTP API Reference', [
			spacer(), spacer(), spacer(),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'dbx DriveRack PA2', bold: true, size: 56, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'HTTP API Reference', size: 36, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: 'For donewellaudio.com Integration', size: 28, color: '666666' })] }),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Base URL'),
			code('http://<companion-ip>:<port>/instance/<label>/<endpoint>'),
			spacer(),
			bullet('companion-ip: Machine running Companion'),
			bullet('port: HTTP port (default 8000, Settings > Network)'),
			bullet('label: Instance label (default "pa2", shown in Connections)'),
			spacer(),

			h1('Authentication'),
			p('If an API key is configured in module settings, include it as:'),
			code('Header: X-Api-Key: <your-key>'),
			code('Or query: ?key=<your-key>'),
			p('If no key is configured, all requests are accepted.'),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Endpoint Reference'),
			spacer(),
			simpleTable(['Endpoint', 'Method', 'Purpose'], [
				['/ping', 'GET', 'Connection status check'],
				['/state', 'GET', 'Full PA2 state object'],
				['/topology', 'GET', 'Discovered module topology'],
				['/rta', 'GET', 'Live 31-band RTA spectrum'],
				['/geq', 'GET', 'Current GEQ state'],
				['/geq', 'POST', 'Set GEQ bands (burst mode)'],
				['/meters', 'GET', 'All live level meters'],
				['/eq/auto', 'POST', 'Auto-EQ from current RTA'],
				['/eq/curve', 'POST', 'Apply target GEQ curve'],
				['/loop', 'GET', 'Everything in one call (main polling endpoint)'],
				['/command', 'POST', 'Send any action by name'],
				['/detect', 'POST', 'Submit feedback detection results'],
				['/recommendations', 'GET', 'Pending notch suggestions'],
				['/approve', 'POST', 'Approve/reject pending notches'],
				['/notches', 'DELETE', 'Clear auto-placed PEQ notches'],
				['/app', 'GET', 'Self-hosted HTML control page'],
			], [2200, 1200, 5960]),

			new Paragraph({ children: [new PageBreak()] }),

			h2('POST /geq \u2014 Set GEQ Bands'),
			p('Three input formats accepted:'),
			spacer(),
			bold('Specific bands (object):'),
			code('{ "bands": { "12": -4, "18": -2, "22": 3 } }'),
			spacer(),
			bold('All 31 bands (array):'),
			code('{ "bands": [0, 0, 0, -3, -6, ...31 values...] }'),
			spacer(),
			bold('Flatten:'),
			code('{ "flat": true }'),
			spacer(),
			p('Response:'),
			code('{ "ok": true, "commands": 62, "timestamp": 1711468800000 }'),
			spacer(),

			h2('POST /eq/auto \u2014 Auto-EQ from RTA'),
			p('Reads live RTA spectrum, computes inverse GEQ corrections.'),
			code('{ "target": -50, "maxCut": -12, "maxBoost": 6 }'),
			spacer(),
			p('Response includes per-band corrections applied:'),
			code('{ "ok": true, "corrections": { "1": -6, "2": -4, ... }, "commands": 62 }'),
			spacer(),

			h2('GET /loop \u2014 Main Polling Endpoint'),
			p('Returns everything donewellaudio.com needs in a single call:'),
			bullet('connected \u2014 boolean'),
			bullet('rta \u2014 31-band spectrum with frequency keys'),
			bullet('geq \u2014 enabled, mode, all band gains'),
			bullet('meters \u2014 input L/R, output HL/HR, comp GR, limiter GR'),
			bullet('afs \u2014 enabled, mode'),
			bullet('mutes \u2014 all 6 output channels'),
			bullet('timestamp \u2014 milliseconds'),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Closed-Loop Control Flow'),
			spacer(),
			code('donewellaudio.com          Companion           PA2'),
			code('     |                        |                  |'),
			code('     | GET /loop (200ms)       |                  |'),
			code('     |<-- RTA+GEQ+meters ------|<-- DSP meters ---|'),
			code('     |                        |                  |'),
			code('     | [compute corrections]   |                  |'),
			code('     |                        |                  |'),
			code('     | POST /geq {bands}       |                  |'),
			code('     |--- burst write -------->|-- TCP burst ---->|'),
			code('     |                        |                  |'),
			code('     | GET /loop (next poll)   |                  |'),
			code('     |<-- updated RTA ---------|<-- updated ------|'),
			spacer(),
			p('Round-trip latency: 200-500ms (poll interval + TCP + DSP meter cycle).'),
			spacer(),

			h1('Mixed Content'),
			p('donewellaudio.com runs on HTTPS. Companion runs HTTP. Browsers block mixed content.'),
			spacer(),
			simpleTable(['Solution', 'Browser Support', 'Notes'], [
				['localhost exempt', 'Chrome, Firefox', 'Works when Companion is on same machine'],
				['GET /app', 'All', 'Self-hosted page from Companion (same-origin)'],
				['Companion HTTPS', 'All', 'Configure SSL cert in Companion Settings'],
				['targetAddressSpace', 'Chrome 142+', 'fetch option, user permission prompt'],
			], [2800, 2200, 4360]),
		])],
	})
}

// ═══════════════════════════════════════════
// DOCUMENT 4: Architecture Guide
// ═══════════════════════════════════════════
function buildArchitecture() {
	return new Document({
		styles: STYLES,
		numbering: { config: [BULLETS, NUMBERS] },
		sections: [section('dbx DriveRack PA2 \u2014 Module Architecture', [
			spacer(), spacer(), spacer(),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'dbx DriveRack PA2', bold: true, size: 56, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'Module Architecture', size: 36, font: 'Arial' })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: 'Contributor Guide', size: 28, color: '666666' })] }),

			new Paragraph({ children: [new PageBreak()] }),

			h1('System Overview'),
			p('The module maintains two simultaneous TCP connections to the PA2:'),
			bullet('Port 19272 \u2014 HiQnet text protocol for reading/writing all parameters'),
			bullet('Port 19274 \u2014 DSP command interface for real-time meter data'),
			spacer(),
			p('External access is provided via Companion\u2019s HTTP bridge, enabling web apps to control the PA2 and read live meters.'),

			h1('File Map'),
			simpleTable(['File', 'Lines', 'Purpose'], [
				['src/main.js', '~1200', 'InstanceBase: TCP, state machine, HTTP bridge, DSP meters'],
				['src/pa2-protocol.js', '~620', 'Protocol: response parser, command builder, constants'],
				['src/actions.js', '~850', 'All actions: mutes, GEQ, PEQ, AFS, macros, RTA-driven'],
				['src/feedbacks.js', '~150', 'Boolean feedbacks: mute state, enabled, meter thresholds'],
				['src/variables.js', '~200', 'Variable definitions + initial defaults (200+)'],
				['src/presets.js', '~500', 'Stream Deck button templates (200+ presets)'],
				['src/upgrades.js', '3', 'Version migration scripts'],
			], [2800, 800, 5760]),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Connection Lifecycle'),
			spacer(),
			h2('Control Port (19272)'),
			code('init() \u2192 _initTcp()'),
			code('  TCPHelper auto-connects'),
			code('  WAIT_HELLO \u2190 "HiQnet Console"'),
			code('    send: connect administrator <password>'),
			code('  AUTHENTICATING \u2190 "connect logged in as administrator"'),
			code('    send: ls "\\\\Preset"'),
			code('  DISCOVERING \u2190 module names until "endls"'),
			code('    _finalizeTopology()'),
			code('    updateActions/Feedbacks/Variables'),
			code('    _readAllState() \u2192 ~176 get commands at 5ms spacing'),
			code('    _initDspMeters() \u2192 start port 19274'),
			code('  READY \u2190 parse responses, update state'),
			code('    _subscribeAll() \u2192 real-time push notifications'),
			code('    _startKeepalive() \u2192 ping every 30s'),
			spacer(),

			h2('DSP Meter Port (19274)'),
			code('_initDspMeters()'),
			code('  Raw TCP socket (no auto-reconnect)'),
			code('  "Started Dspcmd processor" \u2192 ready'),
			code('  _discoverMeterIds() \u2192 7 modules'),
			code('  _startMeterPoll() \u2192 200ms interval'),
			code('    _pollMeters() \u2192 39 reads per cycle'),
			code('    _computeMeterVisuals() \u2192 unicode bars, peak tracker'),

			new Paragraph({ children: [new PageBreak()] }),

			h1('Data Flow'),
			code('PA2 response line'),
			code('  \u2192 parseResponse(line)  [pure function]'),
			code('  \u2192 _updateStateFromParsed(result)'),
			code('      updates pa2State'),
			code('      computes formatted variables (*_fmt)'),
			code('      pushes: setVariableValues(vars)'),
			code('      triggers: checkFeedbacks()'),
			code('  \u2192 Stream Deck buttons update via $(pa2:variable)'),

			h1('Command Modes'),
			simpleTable(['Mode', 'Spacing', 'Use Case'], [
				['sendCommands()', '5ms', 'General operations, ordered sequences'],
				['sendCommandsBurst()', '0ms', 'GEQ updates, time-critical (all in one TCP write)'],
			], [3000, 1500, 4860]),
			spacer(),
			p('Burst mode tested: 62 commands in 1ms, zero drops. PA2 handles burst writes perfectly.'),

			h1('Subscription System'),
			p('After initial state load, the module subscribes to critical parameters. PA2 pushes subr notifications on change \u2014 no polling needed:'),
			bullet('All 6 output mutes'),
			bullet('Preset current/changed'),
			bullet('AFS enable/mode, Compressor enable/threshold'),
			bullet('Generator mode/level (safety critical)'),
			bullet('GEQ enable/mode, Room EQ, Subharmonic, Limiter, PEQ'),
			bullet('Wizard state (detects front-panel AutoEQ runs)'),

			h1('Wizard Monitoring'),
			p('When a PA2 wizard becomes active (e.g., front-panel AutoEQ):'),
			numbered('Module receives subr notification: WizardState changes to "Active"'),
			numbered('Logs a warning to the operator'),
			numbered('When wizard finishes (state returns to "Inactive"), calls _readAllState() to re-sync'),
		])],
	})
}

// ═══ BUILD ALL ═══
async function main() {
	const docs = [
		{ name: 'PA2-User-Guide.docx', builder: buildUserGuide },
		{ name: 'PA2-DSP-Meters-Discovery.docx', builder: buildDspMeters },
		{ name: 'PA2-HTTP-API-Reference.docx', builder: buildHttpApi },
		{ name: 'PA2-Architecture-Guide.docx', builder: buildArchitecture },
	]

	for (const { name, builder } of docs) {
		const doc = builder()
		const buffer = await Packer.toBuffer(doc)
		const outPath = `docs/${name}`
		fs.writeFileSync(outPath, buffer)
		console.log(`Created: ${outPath} (${Math.round(buffer.length / 1024)}KB)`)
	}
}

main().catch(console.error)
