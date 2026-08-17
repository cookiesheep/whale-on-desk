#!/usr/bin/env node
/**
 * Pixel-level audit for an AI-generated sprite sheet, run BEFORE processing.
 * Reports, per frame: distinct colors, off-palette pixels, semi-alpha,
 * green-foliage hits, whale-pixel count (volume stability), plus frame-1 vs
 * frame-last identity for loop checks. Read-only: writes nothing.
 *
 * Usage: node tools/scan-sheet.mjs <sheet.png> [--cell 320] [--frames 8]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const file = args[0]
if (!file) {
  console.error('usage: node tools/scan-sheet.mjs <sheet.png> [--cell 320] [--frames 8]')
  process.exit(1)
}
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const CELL = opt('--cell', 320)
const FRAMES = opt('--frames', 8)

const PALETTE = [
  [0x1a, 0x10, 0x30], [0x23, 0x32, 0x4d], [0x17, 0x23, 0x3a], [0x3c, 0x5a, 0x86],
  [0xf2, 0xf5, 0xf9], [0x10, 0x16, 0x23], [0xe5, 0x8f, 0xa2], [0xbf, 0xe3, 0xff],
]
const MAGENTA = [0xfd, 0x00, 0xfd]
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const nearest = (px) => {
  let best = Infinity
  for (const c of PALETTE) best = Math.min(best, dist2(px, c))
  return best
}

const png = readFileSync(file)
const width = png.readUInt32BE(16)
const height = png.readUInt32BE(20)
if ((width / FRAMES) % 1 !== 0 || height !== width / FRAMES) {
  console.error(`sheet ${width}x${height} is not ${FRAMES} square cells of one size`)
  process.exit(1)
}

const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 })
if (raw.length !== width * height * 4) {
  console.error(`raw size mismatch: got ${raw.length}, want ${width * height * 4}`)
  process.exit(1)
}

const cellW = width / FRAMES
const report = []
let f1 = null
let lastBody = null
for (let f = 0; f < FRAMES; f++) {
  const colors = new Map()
  let offPalette = 0
  let semiAlpha = 0
  let green = 0
  let body = 0
  const bodyMask = new Uint8Array(cellW * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < cellW; x++) {
      const i = (y * width + f * cellW + x) * 4
      const [r, g, b, a] = [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]
      if (a === 0) continue
      if (a < 255) semiAlpha++
      if (a < 128) continue
      if (dist2([r, g, b], MAGENTA) < 3000) continue
      if (g > 140 && g > r + 60 && g > b + 60) { green++; continue }
      body++
      bodyMask[y * cellW + x] = 1
      const key = `${r},${g},${b}`
      colors.set(key, (colors.get(key) ?? 0) + 1)
      if (nearest([r, g, b]) > 900) offPalette++
    }
  }
  if (f === 0) f1 = bodyMask
  lastBody = body
  report.push({
    frame: f + 1,
    colors: colors.size,
    top: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([c, n]) => `#${c.split(',').map((v) => Number(v).toString(16).padStart(2, '0')).join('')}(${n})`),
    offPalette, semiAlpha, green, body,
  })
}

let f1fLastDiff = 0
if (FRAMES > 1) {
  const last = report[FRAMES - 1]
  // Compare frame 1 vs frame last masks by re-scanning the last frame.
  const lastMask = new Uint8Array(cellW * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < cellW; x++) {
    const i = (y * width + (FRAMES - 1) * cellW + x) * 4
    const [r, g, b, a] = [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]
    const isBody = a >= 128 && dist2([r, g, b], MAGENTA) >= 3000 && !(g > 140 && g > r + 60 && g > b + 60)
    lastMask[y * cellW + x] = isBody ? 1 : 0
  }
  for (let i = 0; i < f1.length; i++) if (f1[i] !== lastMask[i]) f1fLastDiff++
}

console.log(`sheet: ${path.basename(file)} ${width}x${height}, ${FRAMES} cells of ${cellW}`)
for (const r of report) {
  console.log(`F${r.frame}: colors=${r.colors} off=${r.offPalette} semiA=${r.semiAlpha} green=${r.green} body=${r.body}  top:${r.top.join(' ')}`)
}
const bodies = report.map((r) => r.body)
const min = Math.min(...bodies), max = Math.max(...bodies)
console.log(`body volume: min=${min} max=${max} spread=${((max - min) / min * 100).toFixed(1)}%`)
console.log(`F1 vs F${FRAMES} mask diff: ${f1fLastDiff}px ${f1fLastDiff === 0 ? '(identical — clean loop)' : '(DIFFERENT — loop will pop)'}`)
const totalGreen = report.reduce((s, r) => s + r.green, 0)
const totalOff = report.reduce((s, r) => s + r.offPalette, 0)
const totalSemi = report.reduce((s, r) => s + r.semiAlpha, 0)
console.log(`totals: green=${totalGreen} offPalette=${totalOff} semiAlpha=${totalSemi}`)
