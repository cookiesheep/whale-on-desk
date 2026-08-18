/**
 * Pet state machine: folds DSH session/approval events into whale states.
 * Pure logic — no DOM, no Node APIs. Mirrors the design validated in
 * test/pet-machine.test.js. State priorities and transient/durable split
 * live here so the renderer stays dumb.
 */

export const STATE_PRIORITY = {
  'glass-tap': 100,
  'poked-flail': 90,
  'hide-and-seek': 86,
  startled: 85,
  'error-spiral': 70,
  push: 68,
  compact: 65,
  excited: 62,
  'success-streak': 61,
  celebrate: 60,
  proud: 58,
  shy: 57,
  'sad-puppy': 56,
  sink: 55,
  'tool-run': 50,
  review: 48,
  think: 45,
  'swim-fast': 40,
  'token-fountain': 44,
  greet: 38,
  'chase-fish': 36,
  eat: 30,
  shrimp: 29,
  birthday: 26,
  nightcap: 20,
  'bubble-ring': 12,
  sleep: 10,
  idle: 0,
}

const TRANSIENT = new Set(['celebrate', 'sink', 'poked-flail', 'startled', 'eat', 'greet', 'shrimp',
  'proud', 'shy', 'sad-puppy', 'excited', 'success-streak', 'push', 'error-spiral',
  'token-fountain', 'chase-fish', 'hide-and-seek', 'bubble-ring'])

const READ_TOOLS = new Set(['read', 'grep', 'glob', 'search'])

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
    // Performance counters: success/error streaks, read runs, push flags.
    this.winStreak = 0
    this.errorStreak = 0
    this.recentTools = []
    this.pushPending = false
    this.chunkTimes = []
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
        this.setTransient(this.winStreak >= 2 ? 'excited' : 'greet')
        this.durable = 'swim-fast'
        this.hint = { kind: 'none' }
        this.greeted = false
        break
      case 'step/start':
        if (this.durable === 'idle' || this.durable === 'sleep' || this.durable === 'nightcap' || this.durable === 'review' || this.durable === 'birthday') this.durable = 'swim-fast'
        break
      case 'assistant/chunk':
        this.setTransient(null)
        this.chunkTimes.push(Date.now())
        if (this.chunkTimes.length > 60) this.chunkTimes.splice(0, this.chunkTimes.length - 60)
        const now = Date.now()
        while (this.chunkTimes.length && now - this.chunkTimes[0] > 2000) this.chunkTimes.shift()
        if (this.chunkTimes.length >= 20) this.setTransient('token-fountain')
        // Writing text is busy swimming; silent reasoning is concentration.
        this.durable = event.chunkType === 'text-delta' ? 'swim-fast' : 'think'
        break
      case 'tool/call': {
        this.setTransient(null)
        const name = String(event.name ?? 'tool')
        this.recentTools.push(name)
        if (this.recentTools.length > 6) this.recentTools.shift()
        const last4 = this.recentTools.slice(-4)
        this.durable = last4.length === 4 && last4.every((t) => READ_TOOLS.has(t)) ? 'review' : 'tool-run'
        if (name === 'bash' && String(event.args ?? '').includes('git push')) this.pushPending = true
        this.hint = { kind: 'tool', name }
        break
      }
      case 'tool/result':
        if (this.pushPending && event.ok !== false) {
          this.pushPending = false
          this.setTransient('push')
        }
        if (this.durable === 'review' && !READ_TOOLS.has(this.recentTools[this.recentTools.length - 1] ?? '')) this.durable = 'think'
        else if (this.durable !== 'review') this.durable = 'think'
        this.hint = { kind: 'none' }
        break
      case 'turn/end': {
        const failed = event.reason === 'error' || event.reason === 'cancelled'
        this.setTransient(failed ? (++this.errorStreak >= 3 ? 'error-spiral' : 'sink') : (++this.winStreak >= 3 ? 'success-streak' : 'celebrate'))
        if (!failed) this.errorStreak = 0
        this.durable = 'idle'
        this.recentTools = []
        this.pushPending = false
        // A finished turn reports what it did; failed ones stay quiet.
        this.hint = failed
          ? { kind: 'none' }
          : { kind: 'done', secs: event.secs ?? 0, tools: event.tools ?? 0, edits: event.edits ?? 0 }
        break
      }
      case 'approval/asked':
        this.approvalPending = true
        this.setTransient('glass-tap')
        break
      case 'approval/decided':
        this.approvalPending = false
        // The tap is over; let the reaction replace it outright.
        this.transient = null
        this.setTransient(event.outcome !== 'allow' && event.outcome !== 'accepted' ? 'sad-puppy' : null)
        break
      case 'compaction/start':
        this.compacting = true
        this.setTransient('compact')
        break
      case 'compaction/end':
        this.compacting = false
        this.setTransient(null)
        break
      case 'user/pet':
        // Petting after a win streak earns pride; otherwise sometimes shyness.
        this.setTransient(this.winStreak >= 2 ? 'proud' : (Math.random() < 0.25 ? 'shy' : null))
        break
      case 'user/antics':
        this.setTransient(event.kind === 'bubble-ring' ? 'bubble-ring' : 'chase-fish')
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
        // A configured birthday ('MM-DD') crowns the whole day.
        if (event.today && event.birthday === event.today && this.durable === 'idle') this.durable = 'birthday'
        else if (this.durable === 'birthday' && event.birthday !== event.today) this.durable = 'idle'
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
      this.setTransient(level === 3 ? 'sink' : (Math.random() < 0.25 ? 'shrimp' : 'eat'))
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
