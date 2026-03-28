// Converts markdown files to DOCX with full fidelity
// Handles: headings, paragraphs, code blocks, tables, bullet lists, numbered lists, bold, inline code, horizontal rules
const fs = require('fs')
const {
	Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
	Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
	ShadingType, PageNumber, PageBreak, LevelFormat,
} = require('docx')

const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
const CW = 9360

const STYLES = {
	default: { document: { run: { font: 'Arial', size: 22, color: '000000' } } },
	paragraphStyles: [
		{ id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 36, bold: true, font: 'Arial' }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
		{ id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: 'Arial' }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
		{ id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, font: 'Arial', color: '333333' }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
	],
}

const NUMBERING = {
	config: [
		{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
		{ reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
	],
}

// Parse inline formatting: **bold**, `code`, [text](url)
function parseInline(text) {
	const runs = []
	let remaining = text
	while (remaining.length > 0) {
		// Bold
		const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
		if (boldMatch) {
			if (boldMatch[1]) runs.push(...parseInline(boldMatch[1]))
			runs.push(new TextRun({ text: boldMatch[2], bold: true }))
			remaining = remaining.slice(boldMatch[0].length)
			continue
		}
		// Inline code
		const codeMatch = remaining.match(/^(.*?)`([^`]+)`/)
		if (codeMatch) {
			if (codeMatch[1]) runs.push(new TextRun(codeMatch[1]))
			runs.push(new TextRun({ text: codeMatch[2], font: 'Consolas', size: 20 }))
			remaining = remaining.slice(codeMatch[0].length)
			continue
		}
		// Plain text
		runs.push(new TextRun(remaining))
		break
	}
	return runs
}

function parseMarkdown(md, title) {
	const lines = md.split('\n')
	const children = []
	let i = 0
	let numCounter = 0

	while (i < lines.length) {
		const line = lines[i]

		// Code block
		if (line.startsWith('```')) {
			const codeLines = []
			i++
			while (i < lines.length && !lines[i].startsWith('```')) {
				codeLines.push(lines[i])
				i++
			}
			i++ // skip closing ```
			for (const cl of codeLines) {
				children.push(new Paragraph({
					spacing: { after: 40 },
					shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
					indent: { left: 200, right: 200 },
					children: [new TextRun({ text: cl || ' ', font: 'Consolas', size: 18 })],
				}))
			}
			children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
			continue
		}

		// Heading
		const hMatch = line.match(/^(#{1,3})\s+(.+)/)
		if (hMatch) {
			const level = hMatch[1].length
			const heading = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
			children.push(new Paragraph({ heading, children: [new TextRun(hMatch[2])] }))
			i++
			continue
		}

		// Table
		if (line.startsWith('|')) {
			const tableLines = []
			while (i < lines.length && lines[i].startsWith('|')) {
				if (!lines[i].match(/^\|[\s-:|]+\|$/)) { // skip separator rows
					tableLines.push(lines[i])
				}
				i++
			}
			if (tableLines.length > 0) {
				const rows = tableLines.map(tl => tl.split('|').slice(1, -1).map(c => c.trim()))
				const numCols = rows[0].length
				const colW = Math.floor(CW / numCols)
				const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' }
				const borders = { top: border, bottom: border, left: border, right: border }

				const tblRows = rows.map((row, ri) => new TableRow({
					children: row.map(cell => new TableCell({
						borders,
						width: { size: colW, type: WidthType.DXA },
						margins: { top: 50, bottom: 50, left: 80, right: 80 },
						shading: ri === 0 ? { fill: 'E0E0E0', type: ShadingType.CLEAR } : undefined,
						children: [new Paragraph({ children: parseInline(cell), ...(ri === 0 ? {} : {}) })],
					})),
				}))
				children.push(new Table({
					width: { size: CW, type: WidthType.DXA },
					columnWidths: Array(numCols).fill(colW),
					rows: tblRows,
				}))
				children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
			}
			continue
		}

		// Bullet list
		if (line.match(/^[-*]\s/)) {
			const text = line.replace(/^[-*]\s+/, '')
			children.push(new Paragraph({
				numbering: { reference: 'bullets', level: 0 },
				children: parseInline(text),
			}))
			i++
			continue
		}

		// Numbered list
		if (line.match(/^\d+\.\s/)) {
			const text = line.replace(/^\d+\.\s+/, '')
			children.push(new Paragraph({
				numbering: { reference: 'numbers', level: 0 },
				children: parseInline(text),
			}))
			i++
			continue
		}

		// Horizontal rule
		if (line.match(/^---+$/)) {
			children.push(new Paragraph({
				border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } },
				spacing: { after: 200 },
				children: [],
			}))
			i++
			continue
		}

		// Empty line
		if (line.trim() === '') {
			i++
			continue
		}

		// Regular paragraph
		children.push(new Paragraph({ spacing: { after: 120 }, children: parseInline(line) }))
		i++
	}

	return new Document({
		styles: STYLES,
		numbering: NUMBERING,
		sections: [{
			properties: { page: PAGE },
			headers: {
				default: new Header({
					children: [new Paragraph({
						border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 } },
						children: [new TextRun({ text: title, font: 'Arial', size: 16, color: '666666' })],
					})],
				}),
			},
			footers: {
				default: new Footer({
					children: [new Paragraph({
						border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 } },
						alignment: AlignmentType.CENTER,
						children: [
							new TextRun({ text: 'Page ', font: 'Arial', size: 16, color: '666666' }),
							new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '666666' }),
						],
					})],
				}),
			},
			children,
		}],
	})
}

async function main() {
	const files = [
		{ md: 'companion/HELP.md', out: 'docs/PA2-User-Guide.docx', title: 'dbx DriveRack PA2 \u2014 User Guide' },
		{ md: 'docs/DSP-METERS.md', out: 'docs/PA2-DSP-Meters-Discovery.docx', title: 'dbx DriveRack PA2 \u2014 DSP Meter Interface Discovery' },
		{ md: 'docs/HTTP-API.md', out: 'docs/PA2-HTTP-API-Reference.docx', title: 'dbx DriveRack PA2 \u2014 HTTP API Reference' },
		{ md: 'docs/ARCHITECTURE.md', out: 'docs/PA2-Architecture-Guide.docx', title: 'dbx DriveRack PA2 \u2014 Module Architecture' },
	]

	for (const f of files) {
		const md = fs.readFileSync(f.md, 'utf8')
		const doc = parseMarkdown(md, f.title)
		const buffer = await Packer.toBuffer(doc)
		fs.writeFileSync(f.out, buffer)
		console.log(`${f.out} — ${Math.round(buffer.length / 1024)}KB (${md.split('\n').length} lines)`)
	}
}

main().catch(console.error)
