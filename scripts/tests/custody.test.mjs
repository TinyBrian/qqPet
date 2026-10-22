import assert from 'node:assert/strict'
import test from 'node:test'
import * as C from '../../src/renderer/pet/custody-core.ts'

const trip = { kind: 'trip', target: '' }
const chinese = { kind: 'study', target: 'chinese' }
const math = { kind: 'study', target: 'mathematics' }
const q3 = () => [trip, chinese, math].reduce((c, i) => C.addItem(c, i), C.emptyCustody())

test('editing the queue pauses custody', () => {
  let c = C.start(q3())
  assert.equal(c.running, true)
  c = C.addItem(c, trip)
  assert.equal(c.running, false)
  c = C.moveItem(C.start(c), 0, 1)
  assert.equal(c.running, false)
  c = C.removeItem(C.start(c), 3)
  assert.equal(c.running, false)
  assert.equal(c.queue.length, 3)
})

test('the current marker follows moves and removals', () => {
  let c = { ...q3(), cur: 1 }
  c = C.moveItem(c, 1, 1)
  assert.equal(c.cur, 2)
  assert.deepEqual(c.queue[2], chinese)
  c = C.removeItem(c, 0)
  assert.equal(c.cur, 1)
  assert.deepEqual(c.queue[c.cur], chinese)
  assert.equal(C.moveItem(c, 0, -1), c, 'out of range is a no-op')
})

test('advance loops and counts rounds, or stops at the end', () => {
  let c = C.start(q3())
  c = C.advance(C.advance(c))
  assert.equal(c.cur, 2)
  c = C.advance(c)
  assert.deepEqual([c.cur, c.rounds, c.running], [0, 1, true])
  c = C.advance(C.advance(C.advance({ ...c, loop: false })))
  assert.deepEqual([c.cur, c.rounds, c.running], [0, 2, false])
})

test('step: launches when idle, waits while busy, advances after the activity ends', () => {
  let c = C.start(q3())
  assert.equal(C.step(c, false, true, 0), 'launch')
  assert.equal(C.step(c, false, false, 0), 'idle', 'paused growth or no sweetheart: nothing')
  c = { ...c, launched: true, tried: 0 }
  assert.equal(C.step(c, false, true, 1000), 'wait', 'just launched')
  assert.equal(C.step(c, false, true, 10 * 60_000), 'launch', 'retry a launch that never started')
  c = { ...c, seen: true }
  assert.equal(C.step(c, true, true, 0), 'wait')
  assert.equal(C.step(c, false, true, 0), 'advance')
  assert.equal(C.step({ ...c, running: false }, false, true, 0), 'advance', 'a paused queue still finishes the current item')
})

test('reset starts over; pause keeps the place', () => {
  const c = { ...C.start(q3()), cur: 2, rounds: 4 }
  assert.deepEqual([C.pause(c).cur, C.pause(c).running], [2, false])
  assert.deepEqual([C.reset(c).cur, C.reset(c).rounds], [0, 0])
})

test('parse survives garbage and drops bad items', () => {
  assert.deepEqual(C.parseCustody('nope'), C.emptyCustody())
  const c = C.parseCustody(JSON.stringify({ queue: [trip, { kind: 'x' }, chinese], cur: 9, running: true, rounds: 3 }))
  assert.equal(c.queue.length, 2)
  assert.equal(c.cur, 1)
  assert.equal(c.rounds, 3)
  assert.equal(C.parseCustody(JSON.stringify({ running: true })).running, false, 'empty queue never runs')
})

test('position shows current/next', () => {
  const c = q3()
  assert.deepEqual(C.position(c), { cur: 1, next: 2, total: 3 })
  assert.deepEqual(C.position({ ...c, cur: 2 }), { cur: 3, next: 1, total: 3 })
  assert.deepEqual(C.position({ ...c, cur: 2, loop: false }), { cur: 3, next: 0, total: 3 })
})

test('auto-care config: thresholds clamp, chosen good wins while owned (#116)', async () => {
  const { parseCare, chooseCare } = await import('../../src/renderer/pet/care.ts')
  assert.deepEqual(parseCare('bad'), parseCare(''))
  const c = parseCare(JSON.stringify({ hunger: 150, clean: -3, mood: 42.4, food: 'x' }))
  assert.deepEqual([c.hunger, c.clean, c.mood, c.food, c.on], [100, 0, 42, 'x', true])
  const goods = [{ id: 'a', hunger: 100 }, { id: 'b', hunger: 900 }, { id: 't', mood: 50 }]
  assert.equal(chooseCare(goods, 'hunger', 950, 'a').id, 'a')
  assert.equal(chooseCare(goods, 'hunger', 950, '').id, 'b')
  assert.equal(chooseCare(goods, 'hunger', 950, 'gone').id, 'b', 'a used-up choice falls back to auto')
  assert.equal(chooseCare(goods, 'hunger', 950, 't').id, 'b', 'a choice that does nothing for the stat is ignored')
})
