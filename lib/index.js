/**
 * whale-on-desk host half.
 *
 * Owns the pet state machine, folds every session event (turns, chunks,
 * tool calls, approvals — all durable session events, including
 * approval/asked) into it, and exposes two small HTTP surfaces on the
 * DSH web server for the browser half:
 *
 *   GET  /whale/state   -> { state, hint } snapshot
 *   POST /whale/poke    -> { doubleClick } user interaction
 *   GET  /whale/assets/ -> sprite files from the package assets dir
 *
 * Zero intrusion: read-only on sessions, no writes anywhere.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { PetMachine, STATE_PRIORITY } from './pet-machine.mjs'

export const name = 'whale-on-desk'
export const inject = ['webServer', 'agents', 'commands']

const MIME = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.apng': 'image/apng',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

export function apply(ctx, config = {}) {
  // Kill switch for admins: nothing is served, and the client unmounts on 404.
  if (config.enabled === false) return
  const machine = new PetMachine({ sleepAfterMs: (config.sleepAfterMinutes ?? 10) * 60_000 })
  let lastEventAt = Date.now()
  let lastSessionId = null
  // Context fill approximation: last advertised window vs last usage total.
  let contextWindow = 0
  let lastUsageTotal = 0
  // Live turn accounting for the completion report and hover card.
  let turnStartedAt = 0
  let turnTools = 0
  let turnEdits = 0

  /** Map one durable session event onto the machine's input vocabulary. */
  const fold = (event) => {
    const data = event.data ?? {}
    switch (event.type) {
      case 'turn/start':
        turnStartedAt = Date.now()
        turnTools = 0
        turnEdits = 0
        return machine.push({ type: 'turn/start', turn: data.turn })
      case 'turn/end': {
        const secs = turnStartedAt ? Math.max(1, Math.round((Date.now() - turnStartedAt) / 1000)) : 0
        const done = { type: 'turn/end', turn: data.turn, reason: data.reason, secs, tools: turnTools, edits: turnEdits }
        turnStartedAt = 0
        return machine.push(done)
      }
      case 'step/start':
        return machine.push({ type: 'step/start', turn: data.turn, step: data.step })
      case 'request/context':
        if (typeof data.contextWindow === 'number' && data.contextWindow > 0) contextWindow = data.contextWindow
        return undefined
      case 'assistant/message':
        if (data.usage && typeof data.usage.total_tokens === 'number') lastUsageTotal = data.usage.total_tokens
        return undefined
      case 'assistant/chunk':
        return machine.push({ type: 'assistant/chunk', turn: data.turn, step: data.step, chunkType: data.chunk?.type })
      case 'tool/call': {
        turnTools++
        if (/(?:write|edit|patch|str_replace)/.test(String(data.name ?? ''))) turnEdits++
        return machine.push({ type: 'tool/call', turn: data.turn, step: data.step, name: data.name })
      }
      case 'tool/result':
        return machine.push({ type: 'tool/result', turn: data.turn, step: data.step, ok: true })
      case 'approval/asked':
        return machine.push({ type: 'approval/asked' })
      case 'approval/decided':
        return machine.push({ type: 'approval/decided', outcome: data.outcome })
      default:
        return undefined
    }
  }

  // Transient animations (celebrate/sink/poke reactions) return to the
  // durable state after their stage time; durable states run until replaced.
  let stageTimer = null
  const STAGED_STATES = new Set(['celebrate', 'sink', 'poked-flail', 'startled', 'eat'])
  const restage = () => {
    if (stageTimer !== null) clearTimeout(stageTimer)
    stageTimer = null
    if (STAGED_STATES.has(machine.snapshot.state)) {
      stageTimer = setTimeout(() => {
        stageTimer = null
        machine.clearTransient()
      }, 3000)
    }
  }
  ctx.on('session/event', (session, event) => {
    lastEventAt = Date.now()
    if (session && session.id) lastSessionId = session.id
    fold(event)
    restage()
  })

  // The whale's own slash command: dogfoods the palette it launches from.
  ctx.effect(() => ctx.commands.register({
    name: 'whale',
    description: '戳一下桌宠 (poke the whale)',
    handler: async () => {
      machine.push({ type: 'user/poke', doubleClick: true })
      restage()
      return { kind: 'success', text: '鲸鱼被戳了一下 🐳' }
    },
  }))

  const commandAgent = () => (lastSessionId ? ctx.agents.get(lastSessionId) : undefined)

  const timer = setInterval(() => {
    const now = new Date()
    const contextUsedPct = contextWindow > 0 && lastUsageTotal > 0
      ? Math.min(100, Math.round((100 * lastUsageTotal) / contextWindow))
      : undefined
    machine.push({ type: 'clock/tick', hour: now.getHours(), contextUsedPct })
    machine.push({ type: 'session/idle', idleMs: Date.now() - lastEventAt, hour: now.getHours() })
    restage()
  }, 15_000)

  const sendJson = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const BODY_LIMIT = 16 * 1024

  /** Read one small JSON body; responds 413 itself and resolves null when oversized. */
  const readBody = (req, res) =>
    new Promise((resolve) => {
      if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) {
        sendJson(res, 413, { error: 'body too large' })
        resolve(null)
        return
      }
      let raw = ''
      let overflow = false
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > BODY_LIMIT) {
          overflow = true
          raw = ''
        }
      })
      req.on('end', () => {
        if (overflow) {
          sendJson(res, 413, { error: 'body too large' })
          resolve(null)
          return
        }
        try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
      })
    })

  const assetsDir = fileURLToPath(new URL('../assets/', import.meta.url))

  // Custom pets: drop-in sprite packs that override the bundled whale.
  const petsDir = config.petsDir ?? path.join(os.homedir(), '.dsh', 'whale-on-desk', 'pets')
  const activePetFile = path.join(path.dirname(petsDir), 'active-pet')
  const PET_NAME = /^[a-z0-9_-]{1,32}$/
  let activePet = 'whale'
  try {
    const saved = fs.readFileSync(activePetFile, 'utf8').trim()
    if (saved === 'whale' || (PET_NAME.test(saved) && fs.existsSync(path.join(petsDir, saved, 'manifest.json')))) activePet = saved
  } catch { /* no active-pet file: bundled whale */ }

  const listPets = () => {
    const names = ['whale']
    try {
      for (const entry of fs.readdirSync(petsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && PET_NAME.test(entry.name)
          && fs.existsSync(path.join(petsDir, entry.name, 'manifest.json'))) names.push(entry.name)
      }
    } catch { /* pets dir absent: bundled only */ }
    return [...new Set(names)]
  }
  const petDir = (name) => (name === 'whale' ? assetsDir : path.join(petsDir, name))

  const streamAsset = (resolved, stat, res) => {
    res.writeHead(200, {
      'content-type': MIME[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream',
      'content-length': stat.size,
      // Sprites are content-stable per install; the manifest routes states
      // and must never serve a pre-upgrade copy.
      'cache-control': path.extname(resolved).toLowerCase() === '.json' ? 'no-store' : 'public, max-age=3600',
    })
    fs.createReadStream(resolved).pipe(res)
  }
  const statIn = (dir, rel, cb) => {
    const base = dir.endsWith(path.sep) ? dir : dir + path.sep
    const resolved = path.normalize(path.join(dir, rel))
    if (!resolved.startsWith(base)) return cb(null)
    fs.stat(resolved, (err, stat) => cb(!err && stat.isFile() ? { resolved, stat } : null))
  }

  const serveAsset = (req, res) => {
    const prefix = '/whale/assets/'
    if (!req.url || !req.url.startsWith(prefix)) return sendJson(res, 400, { error: 'bad path' })
    let rel
    try {
      rel = decodeURIComponent(req.url.slice(prefix.length).split('?')[0])
    } catch {
      return sendJson(res, 400, { error: 'bad path encoding' })
    }
    // Active pet sprites win; the bundled whale fills any gap.
    statIn(petDir(activePet), rel, (hit) => {
      if (hit) return streamAsset(hit.resolved, hit.stat, res)
      statIn(assetsDir, rel, (fallback) => {
        if (fallback) return streamAsset(fallback.resolved, fallback.stat, res)
        sendJson(res, 404, { error: 'not found' })
      })
    })
  }

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/state',
        handler: (_req, res) => {
          // The active manifest's mtime fingerprints the asset table: clients
          // refetch it when this changes, so swapped pets appear without a reload.
          let v = 0
          try { v = fs.statSync(path.join(petDir(activePet), 'manifest.json')).mtimeMs } catch { /* missing manifest keeps v=0 */ }
          const stats = turnStartedAt
            ? { secs: Math.round((Date.now() - turnStartedAt) / 1000), tools: turnTools }
            : undefined
          sendJson(res, 200, { ...machine.snapshot, pet: activePet, v: activePet + ':' + v, stats, t: Date.now() })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/pets',
        handler: (_req, res) => sendJson(res, 200, { pets: listPets(), active: activePet }),
      }),
      // The first command launcher in the DSH web client: lists and runs
      // registered slash commands without spending a model turn.
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/commands',
        handler: (_req, res) => {
          const agent = commandAgent()
          const commands = agent ? ctx.commands.list(agent) : []
          sendJson(res, 200, {
            commands: commands.map((c) => ({ name: c.name, description: c.description })),
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/command',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
          const body = await readBody(req, res)
          if (body === null) return
          const line = typeof body.line === 'string' ? body.line.trim() : ''
          if (!line.startsWith('/') || line.length > 200) {
            return sendJson(res, 400, { error: 'line must be a short /command' })
          }
          const agent = commandAgent()
          if (!agent) return sendJson(res, 409, { error: 'no active session yet' })
          try {
            const settled = await ctx.commands.execute(agent, line, AbortSignal.timeout(10_000))
            if (!settled) return sendJson(res, 404, { error: 'unknown command' })
            const r = settled.result
            sendJson(res, 200, r.kind === 'success'
              ? { ok: true, text: r.text ?? '' }
              : { ok: false, text: r.text })
          } catch (error) {
            sendJson(res, 500, { error: String(error?.message ?? error) })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/pet',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
          const body = await readBody(req, res)
          if (body === null) return
          const name = typeof body.name === 'string' ? body.name : ''
          if (name !== 'whale' && !(PET_NAME.test(name) && fs.existsSync(path.join(petsDir, name, 'manifest.json')))) {
            return sendJson(res, 400, { error: 'unknown pet', pets: listPets() })
          }
          activePet = name
          try { fs.mkdirSync(path.dirname(activePetFile), { recursive: true }); fs.writeFileSync(activePetFile, name) } catch { /* persistence failure keeps the switch session-local */ }
          let v = 0
          try { v = fs.statSync(path.join(petDir(activePet), 'manifest.json')).mtimeMs } catch { /* missing manifest keeps v=0 */ }
          sendJson(res, 200, { pet: activePet, v: activePet + ':' + v })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/poke',
        handler: async (req, res) => {
          const body = req.method === 'POST' ? await readBody(req, res) : {}
          if (body === null) return
          lastEventAt = Date.now()
          machine.push({ type: 'user/poke', doubleClick: Boolean(body.doubleClick) })
          restage()
          sendJson(res, 200, machine.snapshot)
        },
      }),
      ctx.webServer.register({ kind: 'prefix', path: '/whale/assets', handler: serveAsset }),
      // Demo/storyboard aid, off by default: pin the whale in any state.
      ...(config.allowPreview
        ? [ctx.webServer.register({
            kind: 'exact',
            path: '/whale/preview',
            handler: async (req, res) => {
              if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
              const body = await readBody(req, res)
              if (body === null) return
              const state = body.state ?? null
              if (state !== null && !Object.prototype.hasOwnProperty.call(STATE_PRIORITY, state)) {
                return sendJson(res, 400, { error: 'unknown state', states: Object.keys(STATE_PRIORITY) })
              }
              sendJson(res, 200, machine.force(state))
            },
          })]
        : []),
    ]
    return () => disposers.forEach((dispose) => dispose())
  })

  ctx.effect(() => () => {
    clearInterval(timer)
    if (stageTimer !== null) clearTimeout(stageTimer)
  })
}
