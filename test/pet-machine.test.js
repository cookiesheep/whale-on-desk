import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PetMachine } from '../lib/pet-machine.mjs'

test('idle by default', () => {
  assert.equal(new PetMachine().snapshot.state, 'idle')
})

test('approval waits outrank work states', () => {
  const m = new PetMachine()
  m.push({ type: 'turn/start', turn: 1 })
  m.push({ type: 'tool/call', turn: 1, step: 1, name: 'bash' })
  m.push({ type: 'approval/asked' })
  assert.equal(m.snapshot.state, 'glass-tap')
  m.push({ type: 'approval/decided', outcome: 'allow' })
  assert.equal(m.snapshot.state, 'tool-run')
})

test('successful turn celebrates then settles', () => {
  const m = new PetMachine()
  m.push({ type: 'turn/start', turn: 1 })
  m.push({ type: 'turn/end', turn: 1, reason: 'complete' })
  assert.equal(m.snapshot.state, 'celebrate')
  assert.equal(m.clearTransient().state, 'idle')
})

test('failed turn sinks', () => {
  const m = new PetMachine()
  m.push({ type: 'turn/end', turn: 1, reason: 'error' })
  assert.equal(m.snapshot.state, 'sink')
})

test('writing text swims fast; silent reasoning thinks', () => {
  const m = new PetMachine()
  m.push({ type: 'turn/start', turn: 1 })
  m.push({ type: 'assistant/chunk', turn: 1, step: 1, chunkType: 'text-delta' })
  assert.equal(m.snapshot.state, 'swim-fast')
  m.push({ type: 'assistant/chunk', turn: 1, step: 1, chunkType: 'reasoning-delta' })
  assert.equal(m.snapshot.state, 'think')
})

test('live work states survive the idle tick', () => {
  const m = new PetMachine()
  m.push({ type: 'tool/call', turn: 1, step: 1, name: 'bash' })
  m.push({ type: 'session/idle', idleMs: 1000 })
  assert.equal(m.snapshot.state, 'tool-run')
})

test('deep-night idleness sleeps in the nightcap; a step wakes it', () => {
  const m = new PetMachine()
  m.push({ type: 'session/idle', idleMs: 11 * 60 * 1000, hour: 3 })
  assert.equal(m.snapshot.state, 'nightcap')
  m.push({ type: 'step/start' })
  assert.equal(m.snapshot.state, 'swim-fast')
})

test('night hours do not interrupt active work', () => {
  const m = new PetMachine()
  m.push({ type: 'tool/call', turn: 1, step: 1, name: 'read' })
  m.push({ type: 'clock/tick', hour: 2 })
  assert.equal(m.snapshot.state, 'tool-run')
})

test('poking a nightcapped whale wakes it for good', () => {
  const m = new PetMachine()
  m.push({ type: 'session/idle', idleMs: 11 * 60 * 1000, hour: 3 })
  m.push({ type: 'user/poke', doubleClick: true })
  assert.equal(m.snapshot.state, 'startled')
  assert.equal(m.clearTransient().state, 'idle')
})

test('force pins a state until cleared', () => {
  const m = new PetMachine()
  m.push({ type: 'turn/start', turn: 1 })
  m.force('glass-tap')
  m.push({ type: 'assistant/chunk', turn: 1, step: 1, chunkType: 'text-delta' })
  assert.equal(m.snapshot.state, 'glass-tap')
  m.force(null)
  assert.equal(m.snapshot.state, 'swim-fast')
})

test('long idle sleeps; poking startles awake and stays awake', () => {
  const m = new PetMachine()
  m.push({ type: 'session/idle', idleMs: 11 * 60 * 1000 })
  assert.equal(m.snapshot.state, 'sleep')
  m.push({ type: 'user/poke', doubleClick: false })
  assert.equal(m.snapshot.state, 'startled')
  assert.equal(m.clearTransient().state, 'idle')
})

test('pending approval survives idle ticks and stream events', () => {
  const m = new PetMachine()
  m.push({ type: 'approval/asked' })
  m.push({ type: 'session/idle', idleMs: 60 * 1000 })
  m.push({ type: 'assistant/chunk', turn: 1, step: 1, chunkType: 'text-delta' })
  m.push({ type: 'tool/call', turn: 1, step: 1, name: 'bash' })
  assert.equal(m.snapshot.state, 'glass-tap')
  m.push({ type: 'approval/decided', outcome: 'allow' })
  assert.equal(m.snapshot.state, 'tool-run')
})

test('pokes do not displace a pending approval', () => {
  const m = new PetMachine()
  m.push({ type: 'approval/asked' })
  m.push({ type: 'user/poke', doubleClick: true })
  assert.equal(m.snapshot.state, 'glass-tap')
})

test('morning removes the nightcap', () => {
  const m = new PetMachine()
  m.push({ type: 'session/idle', idleMs: 11 * 60 * 1000, hour: 3 })
  m.push({ type: 'clock/tick', hour: 7 })
  assert.equal(m.snapshot.state, 'idle')
})

test('context feed fires on threshold crossings, not bands', () => {
  const m = new PetMachine()
  m.push({ type: 'clock/tick', hour: 14, contextUsedPct: 61 })
  assert.notEqual(m.snapshot.state, 'eat')
  m.push({ type: 'clock/tick', hour: 14, contextUsedPct: 65 })
  assert.equal(m.snapshot.state, 'eat')
  assert.deepEqual(m.snapshot.hint, { kind: 'context', pct: 65 })
  assert.equal(m.clearTransient().hint.kind, 'none')
  m.push({ type: 'clock/tick', hour: 14, contextUsedPct: 66 })
  assert.notEqual(m.snapshot.state, 'eat')
  m.push({ type: 'clock/tick', hour: 14, contextUsedPct: 90 })
  assert.equal(m.snapshot.state, 'sink')
})
