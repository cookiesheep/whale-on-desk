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

test('streaming chunks mean thinking', () => {
  const m = new PetMachine()
  m.push({ type: 'turn/start', turn: 1 })
  m.push({ type: 'assistant/chunk', turn: 1, step: 1, chunkType: 'text-delta' })
  assert.equal(m.snapshot.state, 'think')
})

test('long idle sleeps; poking startles awake', () => {
  const m = new PetMachine()
  m.push({ type: 'session/idle', idleMs: 11 * 60 * 1000 })
  assert.equal(m.snapshot.state, 'sleep')
  m.push({ type: 'user/poke', doubleClick: false })
  assert.equal(m.snapshot.state, 'startled')
})

test('night hours wear the nightcap', () => {
  const m = new PetMachine()
  m.push({ type: 'clock/tick', hour: 3 })
  assert.equal(m.snapshot.state, 'nightcap')
  m.push({ type: 'clock/tick', hour: 9 })
  assert.equal(m.snapshot.state, 'idle')
})

test('context thresholds trigger feeding hint', () => {
  const m = new PetMachine()
  m.push({ type: 'clock/tick', hour: 14, contextUsedPct: 63 })
  assert.equal(m.snapshot.state, 'eat')
  assert.deepEqual(m.snapshot.hint, { kind: 'context', pct: 63 })
})
