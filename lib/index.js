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
import { PetMachine, STATE_PRIORITY } from './pet-machine.mjs'

export const name = 'whale-on-desk'
export const inject = ['webServer']

const MIME = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.apng': 'image/apng',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

export function apply(ctx, config = {}) {
  const machine = new PetMachine({ sleepAfterMs: (config.sleepAfterMinutes ?? 10) * 60_000 })
  let lastEventAt = Date.now()
  // Context fill approximation: last advertised window vs last usage total.
  let contextWindow = 0
  let lastUsageTotal = 0

  /** Map one durable session event onto the machine's input vocabulary. */
  const fold = (event) => {
    const data = event.data ?? {}
    switch (event.type) {
      case 'turn/start':
        return machine.push({ type: 'turn/start', turn: data.turn })
      case 'turn/end':
        return machine.push({ type: 'turn/end', turn: data.turn, reason: data.reason })
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
      case 'tool/call':
        return machine.push({ type: 'tool/call', turn: data.turn, step: data.step, name: data.name })
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
  ctx.on('session/event', (_session, event) => {
    lastEventAt = Date.now()
    fold(event)
    restage()
  })

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

  const serveAsset = (req, res) => {
    const prefix = '/whale/assets/'
    if (!req.url || !req.url.startsWith(prefix)) return sendJson(res, 400, { error: 'bad path' })
    let rel
    try {
      rel = decodeURIComponent(req.url.slice(prefix.length).split('?')[0])
    } catch {
      return sendJson(res, 400, { error: 'bad path encoding' })
    }
    const resolved = path.normalize(path.join(assetsDir, rel))
    if (!resolved.startsWith(assetsDir)) return sendJson(res, 403, { error: 'forbidden' })
    fs.stat(resolved, (err, stat) => {
      if (err || !stat.isFile()) return sendJson(res, 404, { error: 'not found' })
      res.writeHead(200, {
        'content-type': MIME[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': 'public, max-age=3600',
      })
      fs.createReadStream(resolved).pipe(res)
    })
  }

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: '/whale/state',
        handler: (_req, res) => sendJson(res, 200, { ...machine.snapshot, t: Date.now() }),
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
