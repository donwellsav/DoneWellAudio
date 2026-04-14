// Minimal OSC (Open Sound Control) message parser.
// Parses a raw UDP buffer into { address, args } without any external
// dependencies. Handles types: i (int32), f (float32), s (string),
// T (true), F (false). Also unpacks #bundle envelopes.
//
// OSC 1.0 spec: http://opensoundcontrol.org/spec-1_0
// - Address pattern: null-terminated, padded to 4-byte boundary
// - Type tag string: starts with ',', null-terminated, 4-byte padded
// - Arguments: each 4-byte aligned per their type
// - Bundles: start with "#bundle\0", contain size-prefixed sub-messages

'use strict'

// Read a null-terminated string from buffer at offset, return [string, nextOffset].
// OSC strings are padded to 4-byte boundaries with null bytes.
function readOscString(buf, offset) {
	const end = buf.indexOf(0, offset)
	if (end === -1) return [null, buf.length]
	const str = buf.toString('ascii', offset, end)
	// Advance past the string + null + padding to next 4-byte boundary
	const nextOffset = (end + 4) & ~3
	return [str, nextOffset]
}

function parseOscMessage(buf) {
	if (!Buffer.isBuffer(buf) || buf.length < 4) return null
	// First byte must be '/' for a valid OSC address
	if (buf[0] !== 0x2f) return null

	let offset = 0

	// Read address
	const [address, afterAddr] = readOscString(buf, offset)
	if (!address) return null
	offset = afterAddr

	// Read type tag string (starts with ',')
	if (offset >= buf.length) return { address, args: [] }
	const [typeTag, afterType] = readOscString(buf, offset)
	if (!typeTag || typeTag[0] !== ',') return { address, args: [] }
	offset = afterType

	// Parse arguments based on type tags (skip the leading ',')
	const args = []
	for (let i = 1; i < typeTag.length; i++) {
		const tag = typeTag[i]
		switch (tag) {
			case 'i': // int32 big-endian
				if (offset + 4 > buf.length) return { address, args }
				args.push({ type: 'i', value: buf.readInt32BE(offset) })
				offset += 4
				break

			case 'f': // float32 big-endian
				if (offset + 4 > buf.length) return { address, args }
				args.push({ type: 'f', value: buf.readFloatBE(offset) })
				offset += 4
				break

			case 's': { // string (null-terminated, 4-byte padded)
				const [str, next] = readOscString(buf, offset)
				args.push({ type: 's', value: str || '' })
				offset = next
				break
			}

			case 'T': // True — no argument bytes
				args.push({ type: 'T', value: true })
				break

			case 'F': // False — no argument bytes
				args.push({ type: 'F', value: false })
				break

			default:
				// Unknown type tag — stop parsing (don't corrupt remaining args)
				return { address, args }
		}
	}

	return { address, args }
}

// Parse a raw UDP packet that may be a single OSC message or a #bundle.
// Always returns an array of { address, args } objects (possibly empty).
function parseOscPacket(buf) {
	if (!Buffer.isBuffer(buf) || buf.length < 4) return []

	// Single message — starts with '/'
	if (buf[0] === 0x2f) {
		const msg = parseOscMessage(buf)
		return msg ? [msg] : []
	}

	// Bundle — starts with "#bundle\0" (8 bytes) + 8-byte timetag = 16-byte header
	if (buf.length >= 16 && buf.toString('ascii', 0, 7) === '#bundle' && buf[7] === 0) {
		const messages = []
		let offset = 16 // skip "#bundle\0" + timetag
		while (offset + 4 <= buf.length) {
			const size = buf.readUInt32BE(offset)
			offset += 4
			if (size === 0 || offset + size > buf.length) break
			const element = buf.subarray(offset, offset + size)
			// Recurse — bundles can nest
			const sub = parseOscPacket(element)
			messages.push(...sub)
			offset += size
		}
		return messages
	}

	return []
}

module.exports = { parseOscMessage, parseOscPacket }
