import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  xpForLevel, levelForXp, xpToNext, levelProgress, TITLES, applyGrowth, freshGrowth, growthView,
} from '../lib/growth.mjs'

test('level curve and inverse are consistent', () => {
  assert.equal(xpForLevel(1), 0)
  assert.equal(xpForLevel(2), 50)
  assert.equal(xpForLevel(3), 150)
  assert.equal(levelForXp(0), 1)
  assert.equal(levelForXp(49), 1)
  assert.equal(levelForXp(50), 2)
  assert.equal(levelForXp(149), 2)
  assert.equal(levelForXp(150), 3)
  assert.equal(xpToNext(0), 50)
  assert.equal(xpToNext(50), 100)
  assert.equal(levelProgress(0), 0)
  assert.equal(levelProgress(25), 0.5)
  assert.equal(levelProgress(50), 0)
})

test('task completion grants XP, memory, and eventually first title', () => {
  const g = freshGrowth()
  const s = applyGrowth(g, { kind: 'task-done', label: 'fix bug' })
  assert.equal(s.xpGained, 10)
  assert.ok(g.memory.some((m) => m.includes('fix bug')))
  assert.deepEqual(s.newTitles.map((t) => t.id), ['first-task'])
  assert.equal(g.stats.tasksDone, 1)
})

test('failures are silent until the resilient title threshold', () => {
  const g = freshGrowth()
  for (let i = 0; i < 4; i++) applyGrowth(g, { kind: 'task-failed' })
  assert.equal(g.titles.length, 0)
  const s = applyGrowth(g, { kind: 'task-failed' })
  assert.ok(s.newTitles.some((t) => t.id === 'resilient'))
})

test('level-up fires once at the boundary', () => {
  const g = freshGrowth()
  for (let i = 0; i < 4; i++) applyGrowth(g, { kind: 'task-done' })
  assert.equal(g.xp, 40)
  assert.equal(levelForXp(g.xp), 1)
  const s = applyGrowth(g, { kind: 'task-done' })
  assert.equal(s.leveledUpTo, 2)
  assert.ok(s.memory.includes('Lv.2'))
})

test('titles are idempotent — no duplicate unlocks', () => {
  const g = freshGrowth()
  const s1 = applyGrowth(g, { kind: 'task-done' })
  assert.equal(s1.newTitles.length, 1)
  const s2 = applyGrowth(g, { kind: 'task-done' })
  assert.equal(s2.newTitles.length, 0)
  assert.equal(g.titles.filter((t) => t === 'first-task').length, 1)
})

test('active time caps at 5 minutes per tick', () => {
  const g = freshGrowth()
  applyGrowth(g, { kind: 'active-time', ms: 20 * 60_000 })
  assert.equal(g.stats.activeMs, 5 * 60_000)
  applyGrowth(g, { kind: 'active-time', ms: 60_000, night: true })
  assert.equal(g.stats.nightMs, 60_000)
})

test('memory ring holds at most 8 entries', () => {
  const g = freshGrowth()
  for (let i = 0; i < 12; i++) applyGrowth(g, { kind: 'task-done', label: `t${i}` })
  assert.equal(g.memory.length, 8)
  assert.ok(g.memory[g.memory.length - 1].includes('t11'))
})

test('growth view exposes client-ready fields', () => {
  const g = freshGrowth()
  applyGrowth(g, { kind: 'task-done' })
  applyGrowth(g, { kind: 'session-new' })
  const v = growthView(g)
  assert.equal(v.level, 1)
  assert.equal(v.xp, 15)
  assert.equal(v.toNext, 35)
  assert.deepEqual(v.titles, ['初次协作'])
  assert.equal(v.stats.tasks, 1)
  assert.ok(v.memory.length >= 1)
})
