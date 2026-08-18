#!/usr/bin/env node
/**
 * Measure each state sheet's drawn BODY (excluding floating marks above a
 * clear gap) and emit assets/scale.json: per-state { s, dyf } so the client
 * can render every state at one visual body size.
 *
 *   s   — dimensionless scale factor (target body height / measured)
 *   dyf — vertical shift as a fraction of the cell, body-center relative
 *
 * Usage: node tools/measure-scales.mjs [--target 144]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? Number(argv[i + 1]) : fallback
}
const TARGET = opt('target', 144) // px of body height inside a 320 cell

const STATES = {
  idle: 'idle-v2.png', celebrate: 'celebrate.png', 'glass-tap': 'glass-tap-v2.png',
  'swim-fast': 'swim-fast.png', think: 'think.png', 'tool-run': 'tool-run.png',
  eat: 'eat.png', sink: 'sink.png', sleep: 'sleep.png', nightcap: 'nightcap.png',
  startled: 'startled.png', 'poked-flail': 'poked-flail.png', greet: 'greet.png',
  compact: 'compact.png',
  proud: 'proud.png', shy: 'shy.png', suspicious: 'suspicious.png',
  excited: 'excited.png', 'sad-puppy': 'sad-puppy.png',
}

const out = {}
for (const [state, file] of Object.entries(STATES)) {
  const p = path.join('art', file)
  const png = readFileSync(p)
  const W = png.readUInt32BE(16), H = png.readUInt32BE(20)
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 })
  const CW = W / (file === 'startled.png' ? 6 : file === 'glass-tap-v2.png' ? 12 : 8)
  const isMagenta = (r, g, b) => (r - 0xfd) ** 2 + g * g + (b - 0xfd) ** 2 < 3000
  const rowHas = new Array(H).fill(false)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < CW; x++) {
      const i = (y * W + x) * 4
      const [r, g, b, a] = [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]
      if (a < 128 || isMagenta(r, g, b)) continue
      if (g > 140 && g > r + 60 && g > b + 60) continue
      rowHas[y] = true
      break
    }
  }
  // Body = the content block containing the bottom-most row, walking up
  // with a small hole tolerance (floating marks above a real gap stay out).
  let bodyBottom = -1
  for (let y = H - 1; y >= 0; y--) { if (rowHas[y]) { bodyBottom = y; break } }
  let bodyTop = bodyBottom
  let holes = 0
  for (let y = bodyBottom; y >= 0; y--) {
    if (rowHas[y]) { bodyTop = y; holes = 0 } else if (++holes > 14) break
  }
  const bodyHeight = Math.max(40, bodyBottom - bodyTop + 1)
  const s = Math.round((TARGET / bodyHeight) * 1000) / 1000
  const dyf = Math.round((((bodyTop + bodyBottom) / 2 - H / 2) / H) * 1000) / 1000
  out[state] = { s: Math.min(1.4, Math.max(0.7, s)), dyf }
  console.log(`${state.padEnd(12)} body ${bodyTop}-${bodyBottom} (${bodyHeight}px) → s=${out[state].s} dyf=${dyf}`)
}
writeFileSync('assets/scale.json', JSON.stringify(out, null, 2) + '\n')
console.log('wrote assets/scale.json')
