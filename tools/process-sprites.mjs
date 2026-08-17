/**
 * Sprite-grid -> looping GIF pipeline for whale-on-desk.
 *
 * Input: one horizontal sprite sheet from the GPT workflow (flat magenta
 * #FF00FF background). Steps:
 *   1. ffmpeg: slice each cell + nearest-neighbor normalize to --cell px
 *   2. Node:   palette-snap to the locked 8 whale colors and key magenta
 *              out — pure nearest-color math, no colorspace roundtrips
 *   3. ffmpeg: compose a seamless looping GIF (reserved transparency)
 *   4. update assets/manifest.json
 *
 * Usage: node tools/process-sprites.mjs <state> <grid.png> [--frames 8] [--fps 8] [--cell 192] [--no-snap]
 * Requires ffmpeg on PATH.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PALETTE = [
  [0x1a, 0x10, 0x30], [0x23, 0x32, 0x4d], [0x17, 0x23, 0x3a], [0x3c, 0x5a, 0x86],
  [0xf2, 0xf5, 0xf9], [0x10, 0x16, 0x23], [0xe5, 0x8f, 0xa2], [0xbf, 0xe3, 0xff],
]
const MAGENTA = [0xff, 0x00, 0xff]
const SNAP_SET = [...PALETTE, MAGENTA]

const argv = process.argv.slice(2)
const state = argv[0]
const gridPath = argv[1]
if (!state || !gridPath) {
  console.error('usage: node tools/process-sprites.mjs <state> <grid.png> [--frames N] [--fps N] [--cell N] [--no-snap]')
  process.exit(1)
}
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? Number(argv[i + 1]) : fallback
}
const frames = opt('frames', 8)
const fps = opt('fps', 8)
const cell = opt('cell', 192)
const snap = !argv.includes('--no-snap')

const root = fileURLToPath(new URL('../', import.meta.url))
// --out <dir> redirects the gif + manifest (custom pet packs)
const outIdx = argv.indexOf('--out')
const assetsDir = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(root, 'assets')
mkdirSync(assetsDir, { recursive: true })
const workDir = path.join(assetsDir, '.build', state)
rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const nearest = (r, g, b) => {
  let best = null
  let bestDist = Infinity
  for (const c of SNAP_SET) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}

/* --- minimal RGBA PNG writer --- */
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
const writePng = (file, width, height, rgba) => {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

/* --- 1+2: slice via ffmpeg, snap + key in Node --- */
for (let i = 0; i < frames; i++) {
  const res = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', gridPath,
    '-vf', `crop=iw/${frames}:ih:${i}*iw/${frames}:0,scale=${cell}:${cell}:flags=neighbor`,
    '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-',
  ], { maxBuffer: 1 << 28 })
  if (res.status !== 0) {
    console.error('ffmpeg slice failed:', res.stderr)
    process.exit(1)
  }
  const rgba = res.stdout
  for (let p = 0; p < cell * cell; p++) {
    const o = p * 4
    // Source alpha below half is already background (GPT exports partial alpha).
    if (rgba[o + 3] < 128) { rgba[o + 3] = 0; continue }
    const r = rgba[o]
    const g = rgba[o + 1]
    const b = rgba[o + 2]
    // Green foliage (seaweed) flickers frame-to-frame: key it out with the
    // background instead of keeping decoration the loop cannot hold steady.
    if (snap && g > 140 && g > r + 60 && g > b + 60) { rgba[o + 3] = 0; continue }
    const [nr, ng, nb] = nearest(r, g, b)
    if (nr === 0xff && ng === 0x00 && nb === 0xff) {
      rgba[o + 3] = 0
    } else {
      rgba[o] = nr; rgba[o + 1] = ng; rgba[o + 2] = nb; rgba[o + 3] = 255
    }
  }
  writePng(path.join(workDir, `frame_${String(i).padStart(2, '0')}.png`), cell, cell, rgba)
}

/* --- 3: looping GIF --- */
const gif = path.join(assetsDir, `${state}.gif`)
const gifRes = spawnSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-framerate', String(fps),
  '-i', path.join(workDir, 'frame_%02d.png'),
  '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1:max_colors=9[p];[b][p]paletteuse=dither=none:alpha_threshold=128',
  '-loop', '0',
  gif,
])
if (gifRes.status !== 0) {
  console.error('ffmpeg gif failed:', gifRes.stderr)
  process.exit(1)
}

/* --- 4: manifest --- */
const manifestPath = path.join(assetsDir, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
manifest[state] = `${state}.gif`
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

rmSync(workDir, { recursive: true, force: true })
console.log(`OK ${state}: ${gif} (${frames} frames @ ${fps}fps, cell ${cell}px${snap ? ', palette-snapped' : ''}) — manifest: ${JSON.stringify(manifest)}`)
