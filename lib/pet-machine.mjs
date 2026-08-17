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
  compact: 65,
  'tool-run': 50,
  think: 45,
  'swim-fast': 40,
  greet: 38,
  eat: 30,
  nightcap: 20,
  sleep: 10,
  idle: 0,
}

const TRANSIENT = new Set(['celebrate', 'sink', 'poked-flail', 'startled', 'eat', 'greet'])

const isNight = (hour) => hour >= 0 && hour < 6

export class PetMachine {
  /** @param {{ sleepAfterMs?: number }} [options] */
  constructor(options = {}) {
    this.sleepAfterMs = options.sleepAfterMs ?? 10 * 60 * 1000
    this.durable = 'idle'
    this.transient = null
    this.forced = null
    this.approvalPending = false
    this.compacting = false
    this.eatLevel = 0
    this.greeted = false
    this.hint = { kind: 'none' }
  }

  get snapshot() {
    return { state: this.forced ?? this.transient ?? this.durable, hint: this.hint }
  }

  /** Transient writes are priority-arbitrated; a pending approval outranks everything. */
  setTransient(state) {
    if (this.approvalPending && state !== 'glass-tap') return
    if (this.compacting && state !== 'compact') return
    if (state !== null && this.transient !== null && STATE_PRIORITY[state] < STATE_PRIORITY[this.transient]) return
    this.transient = state
  }

  /** @param {{ type: string, [key: string]: any }} event */
  push(event) {
    switch (event.type) {
      case 'turn/start':
        this.setTransient('greet')
        this.durable = 'swim-fast'
        this.hint = { kind: 'none' }
        this.greeted = false
        break
      case 'step/start':
        if (this.durable === 'idle' || this.durable === 'sleep' || this.durable === 'nightcap') this.durable = 'swim-fast'
        break
      case 'assistant/chunk':
        this.setTransient(null)
        // Writing text is busy swimming; silent reasoning is concentration.
        this.durable = event.chunkType === 'text-delta' ? 'swim-fast' : 'think'
        break
      case 'tool/call':
        this.setTransient(null)
        this.durable = 'tool-run'
        this.hint = { kind: 'tool', name: event.name ?? 'tool' }
        break
      case 'tool/result':
        this.durable = 'think'
        this.hint = { kind: 'none' }
        break
      case 'turn/end':
        this.setTransient(event.reason === 'error' || event.reason === 'cancelled' ? 'sink' : 'celebrate')
        this.durable = 'idle'
        // A finished turn reports what it did; failed ones stay quiet.
        this.hint = event.reason === 'error' || event.reason === 'cancelled'
          ? { kind: 'none' }
          : { kind: 'done', secs: event.secs ?? 0, tools: event.tools ?? 0, edits: event.edits ?? 0 }
        break
      case 'approval/asked':
        this.approvalPending = true
        this.setTransient('glass-tap')
        break
      case 'approval/decided':
        this.approvalPending = false
        this.setTransient(null)
        break
      case 'compaction/start':
        this.compacting = true
        this.setTransient('compact')
        break
      case 'compaction/end':
        this.compacting = false
        this.setTransient(null)
        break
      case 'session/idle':
        // Only real idleness demotes; live work states must survive the tick.
        this.setTransient(null)
        if (event.idleMs >= this.sleepAfterMs) this.durable = isNight(event.hour) ? 'nightcap' : 'sleep'
        else {
          if (this.durable === 'sleep' || this.durable === 'nightcap') this.durable = 'idle'
          // Halfway to sleep the whale asks for work — once per idle stretch.
          if (this.durable === 'idle' && !this.greeted && event.idleMs >= this.sleepAfterMs / 2) {
            this.greeted = true
            this.hint = { kind: 'bored' }
          }
        }
        break
      case 'user/poke': {
        const dozing = this.durable === 'sleep' || this.durable === 'nightcap'
        if (dozing) this.durable = 'idle'
        this.setTransient(dozing || !event.doubleClick ? 'startled' : 'poked-flail')
        break
      }
      case 'clock/tick':
        if (!isNight(event.hour) && this.durable === 'nightcap') this.durable = 'idle'
        if (this.contextFeed(event.contextUsedPct)) {
          this.hint = { kind: 'context', pct: event.contextUsedPct }
        }
        break
    }
    return this.snapshot
  }

  contextFeed(pct) {
    if (typeof pct !== 'number') return false
    const level = pct >= 84 ? 3 : pct >= 82 ? 2 : pct >= 62 ? 1 : 0
    const crossed = level > this.eatLevel
    this.eatLevel = level
    if (crossed && level > 0) {
      this.setTransient(level === 3 ? 'sink' : 'eat')
      return true
    }
    return false
  }

  /** Renderer calls this when a transient animation finished playing. */
  clearTransient() {
    if (this.transient && TRANSIENT.has(this.transient)) {
      this.transient = null
      if (this.hint.kind === 'context') this.hint = { kind: 'none' }
    }
    return this.snapshot
  }

  /** Demo/storyboard aid: pin any state on screen until cleared with null. */
  force(state) {
    this.forced = state ?? null
    return this.snapshot
  }
}
