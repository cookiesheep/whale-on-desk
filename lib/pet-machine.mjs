/**
 * Pet state machine: folds DSH session/approval events into whale states.
 * Pure logic — no DOM, no Node APIs. Mirrors the design validated in
 * test/pet-machine.test.js. State priorities and transient/durable split
 * live here so the renderer stays dumb.
 */

export const STATE_PRIORITY = {
  'glass-tap': 100,
  'poked-flail': 90,
  startled: 85,
  celebrate: 60,
  sink: 55,
  'tool-run': 50,
  think: 45,
  'swim-fast': 40,
  eat: 30,
  nightcap: 20,
  sleep: 10,
  idle: 0,
}

const TRANSIENT = new Set(['celebrate', 'sink', 'poked-flail', 'startled', 'eat'])

export class PetMachine {
  /** @param {{ sleepAfterMs?: number }} [options] */
  constructor(options = {}) {
    this.sleepAfterMs = options.sleepAfterMs ?? 10 * 60 * 1000
    this.durable = 'idle'
    this.transient = null
    this.forced = null
    this.hint = { kind: 'none' }
  }

  get snapshot() {
    return { state: this.forced ?? this.transient ?? this.durable, hint: this.hint }
  }

  /** @param {{ type: string, [key: string]: any }} event */
  push(event) {
    switch (event.type) {
      case 'turn/start':
        this.transient = null
        this.durable = 'swim-fast'
        break
      case 'step/start':
        if (this.durable === 'idle' || this.durable === 'sleep' || this.durable === 'nightcap') this.durable = 'swim-fast'
        break
      case 'assistant/chunk':
        this.transient = null
        // Writing text is busy swimming; silent reasoning is concentration.
        this.durable = event.chunkType === 'text-delta' ? 'swim-fast' : 'think'
        break
      case 'tool/call':
        this.transient = null
        this.durable = 'tool-run'
        this.hint = { kind: 'tool', name: event.name ?? 'tool' }
        break
      case 'tool/result':
        this.durable = 'think'
        this.hint = { kind: 'none' }
        break
      case 'turn/end':
        this.transient = event.reason === 'error' || event.reason === 'cancelled' ? 'sink' : 'celebrate'
        this.durable = 'idle'
        this.hint = { kind: 'none' }
        break
      case 'approval/asked':
        this.transient = 'glass-tap'
        break
      case 'approval/decided':
        this.transient = null
        break
      case 'session/idle':
        // Only real idleness demotes; live work states must survive the tick.
        this.transient = null
        if (event.idleMs >= this.sleepAfterMs) this.durable = 'sleep'
        else if (this.durable === 'sleep') this.durable = 'idle'
        break
      case 'user/poke':
        this.transient = this.durable === 'sleep' || this.durable === 'nightcap'
          ? 'startled'
          : event.doubleClick
            ? 'poked-flail'
            : this.transient
        break
      case 'clock/tick': {
        const night = event.hour >= 0 && event.hour < 6
        if (night && this.durable === 'idle') this.durable = 'nightcap'
        else if (!night && this.durable === 'nightcap') this.durable = 'idle'
        if (this.contextFeed(event.contextUsedPct)) {
          this.hint = { kind: 'context', pct: event.contextUsedPct }
        }
        break
      }
    }
    return this.snapshot
  }

  contextFeed(pct) {
    if ((pct >= 62 && pct < 64) || (pct >= 82 && pct < 84)) {
      this.transient = 'eat'
      return true
    }
    return false
  }

  /** Renderer calls this when a transient animation finished playing. */
  clearTransient() {
    if (this.transient && TRANSIENT.has(this.transient)) this.transient = null
    return this.snapshot
  }

  /** Demo/storyboard aid: pin any state on screen until cleared with null. */
  force(state) {
    this.forced = state ?? null
    return this.snapshot
  }
}
