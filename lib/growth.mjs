/**
 * Growth ledger: XP, levels, titles, memories — the accumulation layer.
 * Pure functions, no I/O. Host half persists and wires events; the client
 * renders level/title/memories on hover.
 *
 * Design principle (adapted from the "accumulation-only companion" school):
 * zero negative feedback — no decay, no penalty, no demands. Failures only
 * count toward the "resilient" title; everything else accrues upward.
 */

/** Level from XP: L requires 50·L·(L−1)/2 total (L2=50, L3=150, L4=300…). */
export const xpForLevel = (level) => (50 * level * (level - 1)) / 2

/** Inverse: the level a given total XP earns (closed-form, O(1)). */
export function levelForXp(xp) {
  if (xp < 0) return 1
  // 25·L² − 25·L − xp ≤ 0 → L ≤ (25 + sqrt(625 + 100·xp)) / 50
  return Math.max(1, Math.floor((25 + Math.sqrt(625 + 100 * xp)) / 50))
}

/** XP still needed to reach the next level from current total. */
export const xpToNext = (xp) => {
  const level = levelForXp(xp)
  return Math.max(0, xpForLevel(level + 1) - xp)
}

/** Progress within the current level, 0..1 for bar rendering. */
export const levelProgress = (xp) => {
  const level = levelForXp(xp)
  const floorXp = xpForLevel(level)
  const ceilXp = xpForLevel(level + 1)
  return Math.min(1, Math.max(0, (xp - floorXp) / (ceilXp - floorXp)))
}

/**
 * Closed title set — every member is an idempotent predicate over stats.
 * Adding a title means editing this table AND the host's unlock handler.
 */
export const TITLES = [
  { id: 'first-task', name: '初次协作', test: (s) => s.tasksDone >= 1 },
  { id: 'helper', name: '勤劳伙伴', test: (s) => s.tasksDone >= 20 },
  { id: 'veteran', name: '百炼成钢', test: (s) => s.tasksDone >= 100 },
  { id: 'regular', name: '常驻伙伴', test: (s) => s.activeMs >= 6 * 3600_000 },
  { id: 'resilient', name: '越挫越勇', test: (s) => s.failures >= 5 },
  { id: 'social', name: '广结善缘', test: (s) => s.sessions >= 10 },
  { id: 'streak-master', name: '连胜大师', test: (s) => s.bestStreak >= 5 },
  { id: 'night-owl', name: '夜猫子', test: (s) => s.nightMs >= 3600_000 },
]

export const XP_REWARDS = {
  TASK_DONE: 10,
  SESSION_NEW: 5,
  SESSION_RESUME: 2,
}

export const MEMORY_MAX = 8

/**
 * Apply a growth event to the ledger, returning the mutations to signal.
 * @param {object} g — the mutable ledger state.
 * @param {{kind: string, [key: string]: any}} event — growth input event.
 * @returns {{xpGained: number, leveledUpTo: number|null, newTitles: Array<{id,name}>, memory: string|null}}
 */
export function applyGrowth(g, event) {
  const before = { xp: g.xp, titles: [...g.titles] }
  const signal = { xpGained: 0, leveledUpTo: null, newTitles: [], memory: null }
  const addMemory = (text) => {
    const ts = new Date()
    const entry = `[${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}] ${text}`
    g.memory.push(entry)
    if (g.memory.length > MEMORY_MAX) g.memory.splice(0, g.memory.length - MEMORY_MAX)
    signal.memory = entry
  }

  switch (event.kind) {
    case 'task-done':
      g.stats.tasksDone++
      g.xp += XP_REWARDS.TASK_DONE
      signal.xpGained = XP_REWARDS.TASK_DONE
      addMemory(`完成任务「${event.label || 'task'}」(第 ${g.stats.tasksDone} 个)`)
      break
    case 'task-failed':
      g.stats.failures++
      // No XP, no memory entry: failures stay quiet unless a title fires.
      break
    case 'session-new':
      g.stats.sessions++
      g.xp += XP_REWARDS.SESSION_NEW
      signal.xpGained = XP_REWARDS.SESSION_NEW
      addMemory(`开启新会话(第 ${g.stats.sessions} 个)`)
      break
    case 'session-resume':
      g.stats.sessions++
      g.xp += XP_REWARDS.SESSION_RESUME
      signal.xpGained = XP_REWARDS.SESSION_RESUME
      break
    case 'active-time': {
      const ms = Math.min(event.ms, 5 * 60_000)
      g.stats.activeMs += ms
      if (event.night) g.stats.nightMs += ms
      break
    }
    case 'streak':
      g.stats.bestStreak = Math.max(g.stats.bestStreak, event.count)
      break
  }

  const oldLevel = levelForXp(before.xp)
  const newLevel = levelForXp(g.xp)
  if (newLevel > oldLevel) {
    signal.leveledUpTo = newLevel
    addMemory(`升到 Lv.${newLevel}`)
  }

  for (const t of TITLES) {
    if (!g.titles.includes(t.id) && t.test(g.stats)) {
      g.titles.push(t.id)
      signal.newTitles.push({ id: t.id, name: t.name })
      addMemory(`解锁称号「${t.name}」`)
    }
  }

  return signal
}

/** A fresh ledger for first run. */
export function freshGrowth() {
  return {
    xp: 0,
    stats: { tasksDone: 0, failures: 0, sessions: 0, activeMs: 0, nightMs: 0, bestStreak: 0 },
    titles: [],
    memory: [],
    firstSeenAt: new Date().toISOString(),
  }
}

/** Public view for the client. */
export function growthView(g) {
  return {
    level: levelForXp(g.xp),
    xp: g.xp,
    toNext: xpToNext(g.xp),
    progress: Math.round(levelProgress(g.xp) * 100) / 100,
    titles: g.titles.map((id) => TITLES.find((t) => t.id === id)?.name).filter(Boolean),
    latestTitle: g.titles.length ? TITLES.find((t) => t.id === g.titles[g.titles.length - 1])?.name : null,
    memory: g.memory.slice(-3),
    stats: { tasks: g.stats.tasksDone, sessions: g.stats.sessions },
  }
}
