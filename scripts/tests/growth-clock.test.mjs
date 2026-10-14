import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const machineSource = readFileSync(new URL('../../src/renderer/pet/machine.ts', import.meta.url), 'utf8')
const petSource = readFileSync(new URL('../../src/renderer/pet/pet.ts', import.meta.url), 'utf8')

// Exercise the real startup and pose scheduling; stub the unrelated DOM and growth arithmetic.
function startup({ paused = false, failLoad = false, buried = false } = {}) {
  const intervals = []
  const loads = []
  const transitions = []
  const info = { health: 5, growth: 80, sex: 'GG', onlineDataTime: 71 }
  const save = { isBury: buried, settings: { paused: false } }
  let now = 0
  let lastTick = null
  let growCalls = 0
  const interval = (callback, delay) => {
    intervals.push({ callback, delay })
    return intervals.length
  }
  const context = vm.createContext({
    window: { __qqpetHostPaused: paused, setInterval: interval },
    setInterval: interval,
    info, save,
    route: (_sex, _stage, action) => ({ url: `${action}.swf`, opt: {} }),
    applyEdge: () => null,
    stage: () => 'Kid',
    mood: () => 'happy',
    grow() {
      growCalls++
      if (lastTick !== null) info.onlineDataTime += (now - lastTick) / 60_000
      lastTick = now
    },
    advanceTask() {}, refreshTray() {}, bury() {}, setTray() {}, speak() {},
    greeting: () => null, daily() {}, weatherTalk() {},
    DEAD: { tolk: 'dead' },
    addInfo: (key, value) => { info[key] += value },
  })
  const machineScript = machineSource.replace(/^import[^\n]*\n/gm, '').replace('export class Machine', 'class Machine')
  vm.runInContext(stripTypeScriptTypes(machineScript, { mode: 'transform' }) + '\nthis.Machine = Machine', context)
  const swf = {
    front: { currentFrame: 0, totalFrames: 2, isPlaying: true, stop() {} },
    async load(url) {
      loads.push(url)
      if (failLoad) throw new Error('Animation unavailable')
      this.front.currentFrame = 0
    },
  }
  context.machine = new context.Machine(swf, (over, next) => { transitions.push(next.a); over.e?.(); next.s?.() })
  const start = petSource.indexOf('let growthTimer')
  assert.notEqual(start, -1, 'load the real growth timer declaration and startup functions')
  const startupScript = petSource.slice(start).replace('export function startPet', 'function startPet')
  vm.runInContext(stripTypeScriptTypes(startupScript) + '\nthis.startPet = startPet', context)
  return {
    context, info, loads, swf, transitions,
    growthTimers: () => intervals.filter(({ delay }) => delay === 60_000),
    growCalls: () => growCalls,
    async poseTick() {
      intervals.find(({ delay }) => delay === 1000 / 12).callback()
      // Finish both the load promise and Machine's rejection recovery.
      for (let i = 0; i < 4; i++) await Promise.resolve()
    },
    minute() {
      now += 60_000
      const timers = intervals.filter(({ delay }) => delay === 60_000)
      assert.equal(timers.length, 1, 'exactly one game clock must own the minute tick')
      timers[0].callback()
    },
  }
}

test('growth starts while the host is paused and survives presence replacing an unstarted entrance', async () => {
  const app = startup({ paused: true })
  app.context.startPet()
  await app.poseTick()
  assert.deepEqual(app.loads, [], 'the paused host has not played the entrance')
  assert.equal(app.growthTimers().length, 1)
  app.context.window.__qqpetHostPaused = false
  app.context.machine.play({ a: 'appear' })
  await app.poseTick()
  assert.deepEqual(app.loads, ['appear.swf'], 'presence preempted the entrance before it could own a completion hook')
  app.minute()
  assert.equal(app.info.onlineDataTime, 72)
})

test('an entrance load failure does not prevent the online clock from advancing', async () => {
  const app = startup({ failLoad: true })
  app.context.startPet()
  await app.poseTick()
  assert.deepEqual(app.loads, ['enter.swf'])
  assert.deepEqual(app.transitions, [], 'the failed animation never fired its pose callbacks')
  await app.poseTick()
  assert.deepEqual(app.loads, ['enter.swf', 'normal.swf'], 'the real machine attempted its normal-pose recovery')
  app.minute()
  assert.equal(app.info.onlineDataTime, 72)
})

test('repeated startup and a completed entrance keep one growth interval', async () => {
  const app = startup()
  app.context.startPet()
  await app.poseTick()
  app.swf.front.currentFrame = 1
  await app.poseTick()
  app.context.startPet()
  await app.poseTick()
  app.swf.front.currentFrame = 1
  await app.poseTick()
  assert.equal(app.growthTimers().length, 1)
  assert.equal(app.growCalls(), 1, 'startup only initializes the clock once')
  app.minute()
  assert.equal(app.info.onlineDataTime, 72)
  assert.equal(app.growCalls(), 2)
})

test('a buried pet does not start a growth interval', () => {
  const app = startup({ buried: true })
  app.context.startPet()
  assert.equal(app.growthTimers().length, 0)
  assert.equal(app.growCalls(), 0)
})
