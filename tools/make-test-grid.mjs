/**
 * Generate a synthetic 8-frame sprite grid (magenta background) shaped like
 * the real GPT output, so tools/process-sprites.mjs can be tested end-to-end
 * before the real art lands. Zero dependencies: writes PNG via node:zlib.
 *
 * Usage: node tools/make-test-grid.mjs out.png
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CELLS = 8
const CELL = 96

// Same pixel map as the client placeholder whale (16x11).
const ROWS = [
  '................',
  '.....FF.........',
  '.....FF.........',
  '....OOOOOO......',
  '...OBBBBHHO.....',
  '..OBBBBBBHBO....',
  '.TDBBBBBBBBWO...',
  'TTDBBBBBBBBWPO..',
  '.TDBBWWWWBBO....',
  '..TTOWWWWOO.....',
  '...TTOOOO.......',
]
const COLORS = {
  O: [0x1a, 0x10, 0x30], B: [0x23, 0x32, 0x4d], D: [0x17, 0x23, 0x3a],
  H: [0x3c, 0x5a, 0x86], W: [0xf2, 0xf5, 0xf9], P: [0x10, 0x16, 0x23],
  F: [0xbf, 0xe3, 0xff], T: [0x17, 0x23, 0x3a],
}
const MAGENTA = [0xff, 0x00, 0xff]

const width = CELLS * CELL
const height = CELL
const rgb = new Uint8Array(width * height * 3)
rgb.fill(0)
for (let i = 0; i < width * height; i++) {
  rgb.set(MAGENTA, i * 3)
}

const draw = (cell, px, py, color) => {
  const scale = 6
  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      const x = cell * CELL + px * scale + dx
      const y = py * scale + dy
      if (x >= (cell + 1) * CELL || y >= height) continue
      rgb.set(color, (y * width + x) * 3)
    }
  }
}

for (let cell = 0; cell < CELLS; cell++) {
  // Sine bob: ±2 logical pixels, frame 8 == frame 1.
  const bob = Math.round(Math.sin((cell / CELLS) * Math.PI * 2) * 2)
  // Blink on frames 5-6 (index 4-5).
  const blink = cell === 4 || cell === 5
  for (let py = 0; py < ROWS.length; py++) {
    for (let px = 0; px < ROWS[py].length; px++) {
      let ch = ROWS[py][px]
      if (blink && (ch === 'W' || ch === 'P') && px >= 10) continue // eyes vanish
      if (ch === '.') continue
      draw(cell, px + 6, py + 2 + bob, COLORS[ch])
    }
  }
  // One deliberately off-palette pixel (frame 3) to prove palette snapping.
  if (cell === 2) draw(cell, 8, 6, [0x33, 0x50, 0x6e])
}

/* --- Minimal PNG writer (truecolor, 8-bit) --- */
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(width, 0)
ihdr.writeUInt32BE(height, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // truecolor
const raw = Buffer.alloc((width * 3 + 1) * height)
for (let y = 0; y < height; y++) {
  raw[y * (width * 3 + 1)] = 0 // filter: none
  Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = process.argv[2] ?? 'test-grid.png'
writeFileSync(out, png)
console.log(`wrote ${out} (${width}x${height}, ${CELLS} cells)`)
