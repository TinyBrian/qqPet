import assert from 'node:assert/strict'
import test from 'node:test'
import { abortReason, cloneJson, findLast, withTimeoutSignal } from '../../src/shared/compat.ts'
import { createPetInput } from '../../src/renderer/pet/input.ts'
import { visibleContent } from '../../src/mobile/visibility.ts'

test('JSON bridge clones remain independent and greeting search preserves its source', () => {
  const original = { pet: { name: '企鹅' }, goods: [1, 2] }
  const copy = cloneJson(original)
  copy.pet.name = 'new'
  copy.goods.push(3)
  assert.deepEqual(original, { pet: { name: '企鹅' }, goods: [1, 2] })
  const hours = [0, 6, 12, 18]
  assert.equal(findLast(hours, value => value <= 15), 12)
  assert.equal(findLast(hours, value => value < 0), undefined)
  assert.deepEqual(hours, [0, 6, 12, 18])
  assert.equal(abortReason({}).name, 'AbortError')
})

test('network deadline aborts decoding and is disposed after completion', async () => {
  let completedSignal
  assert.equal(await withTimeoutSignal(5, async signal => { completedSignal = signal; return 7 }), 7)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(completedSignal.aborted, false)
  await assert.rejects(withTimeoutSignal(5, signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(abortReason(signal)))
  })), { name: 'AbortError' })
})

test('native and DOM drag use one anchor/velocity path and cancellation cannot fling', () => {
  let now = 0
  let box = { x: 20, y: 30, size: 100 }
  const releases = []
  let lifts = 0
  const input = createPetInput({
    position: () => box, begin() {}, hold() {}, active() {}, clock: () => now,
    lift: size => { lifts++; return { dx: size * .73, dy: size * .14 } },
    move: (x, y) => { box = { ...box, x, y } },
    end: (...args) => releases.push(args),
  })
  input.send({ phase: 'begin', id: 1, x: 50, y: 60, source: 'native' })
  now = 20
  input.send({ phase: 'move', id: 1, x: 70, y: 80, source: 'dom' })
  assert.equal(lifts, 0, 'another route must not duplicate a native gesture')
  input.send({ phase: 'move', id: 1, x: 70, y: 80, source: 'native' })
  assert.deepEqual(box, { x: -3, y: 66, size: 100 })
  assert.equal(lifts, 1)
  input.send({ phase: 'end', id: 1, x: 70, y: 80, source: 'native' })
  assert.deepEqual(releases[0], [true, 1000, 1000, false])
  input.send({ phase: 'begin', id: 2, x: 0, y: 0, source: 'dom' })
  now = 40
  input.send({ phase: 'move', id: 2, x: 20, y: 20, source: 'dom' })
  input.cancel()
  assert.deepEqual(releases[1], [true, 0, 0, true])
  assert.equal(input.active, false)
})

test('young pet keeps its grab point and long press is cancelled by movement', async () => {
  let box = { x: 10, y: 10, size: 100 }, held = 0
  const input = createPetInput({
    position: () => box, begin() {}, active() {}, lift: () => null,
    move: (x, y) => { box = { ...box, x, y } }, end() {}, hold: () => held++,
  }, 5)
  input.send({ phase: 'begin', id: 1, x: 25, y: 25 })
  input.send({ phase: 'move', id: 1, x: 45, y: 45 })
  assert.deepEqual(box, { x: 30, y: 30, size: 100 })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(held, 0)
  input.cancel()
})

test('overlay visibility honors ancestor opacity and an explicitly visible child', () => {
  const view = { getComputedStyle: el => el.style }
  const el = { ownerDocument: { defaultView: view }, parentElement: null, getRootNode: () => ({}), getBoundingClientRect: () => ({ width: 10, height: 10 }), style: { opacity: '1', display: 'block', visibility: 'visible' } }
  assert.equal(visibleContent(el), true)
  el.parentElement = { ...el, style: { opacity: '0', display: 'block', visibility: 'visible' } }
  assert.equal(visibleContent(el), false)
  el.parentElement.style = { opacity: '1', display: 'block', visibility: 'hidden' }
  assert.equal(visibleContent(el), true, 'CSS permits a child to override inherited visibility')
  el.style.visibility = 'hidden'
  assert.equal(visibleContent(el), false)
})

test('Ruffle wrapper freezes its frame clock, keeps first-load callbacks, and cancels destroyed waits', async () => {
  const saved = Object.fromEntries(['window', 'document', 'location', 'MutationObserver', 'performance'].map(key => [key, globalThis[key]]))
  let now = 0
  const styles = []
  const doc = { documentElement: {}, createElement: () => ({}) }
  const api = { metadata: null, load: async () => { api.metadata = { width: 100, height: 100, frameRate: 10, numFrames: 100 }; element.initial = () => 1 }, suspend() {}, resume() {}, isPlaying: true }
  const element = { style: {}, dataset: {}, ownerDocument: doc, isConnected: true, shadowRoot: { getElementById: () => null, appendChild: style => styles.push(style) }, ruffle: () => api, remove() { this.isConnected = false } }
  doc.defaultView = { RufflePlayer: { newest: () => ({ createPlayer: () => element }) } }
  globalThis.window = {}
  globalThis.document = doc
  globalThis.location = { href: 'http://127.0.0.1/index.html' }
  globalThis.MutationObserver = class { observe() {} }
  globalThis.performance = { now: () => now }
  try {
    const { SwfPlayer, setHostPaused } = await import('../../src/renderer/swf/player.ts')
    const player = new SwfPlayer({ ownerDocument: doc, appendChild() {} })
    const initial = player.callback('initial')
    await player.load('test.swf')
    assert.equal((await initial)(), 1)
    assert.match(styles[0].textContent, /top:0;right:0;bottom:0;left:0/)
    assert.match(styles[0].textContent, /#panic-details-modal/)
    now = 1000
    assert.equal(player.currentFrame, 10)
    setHostPaused(true)
    now = 6000
    assert.equal(player.currentFrame, 10)
    setHostPaused(false)
    assert.equal(player.currentFrame, 10)
    now = 6500
    assert.equal(player.currentFrame, 15)
    const pending = player.callback('neverRegistered')
    player.destroy()
    await assert.rejects(pending, /destroyed/)
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})

test('timed-out Ruffle generation is retired and a late build cannot replace its retry', async () => {
  const saved = Object.fromEntries(['window', 'document', 'location', 'MutationObserver', 'performance', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]))
  const deadlines = new Set()
  globalThis.setTimeout = (run, milliseconds, ...args) => {
    if (milliseconds !== 30_000) return saved.setTimeout(run, milliseconds, ...args)
    const timer = { run }
    deadlines.add(timer)
    return timer
  }
  globalThis.clearTimeout = timer => {
    if (!deadlines.delete(timer)) saved.clearTimeout(timer)
  }
  let completeOld
  const oldOperation = new Promise(resolve => { completeOld = resolve })
  const elements = []
  const errors = []
  const doc = { documentElement: {}, createElement: () => ({}) }
  const createPlayer = () => {
    const index = elements.length
    const api = {
      metadata: null, options: null, suspended: false,
      load(options) {
        this.options = options
        if (!index) return oldOperation
        this.metadata = { width: 120, height: 100, frameRate: 20, numFrames: 80 }
        return Promise.resolve()
      },
      suspend() { this.suspended = true }, resume() { this.suspended = false }, isPlaying: true,
    }
    const element = {
      style: {}, dataset: {}, ownerDocument: doc, isConnected: true, volume: 1, released: 0,
      shadowRoot: { getElementById: () => null, appendChild() {} },
      ruffle: () => api,
      disconnectedCallback() { this.released++ },
      remove() { this.isConnected = false; this.disconnectedCallback() },
    }
    elements.push(element)
    return element
  }
  doc.defaultView = { RufflePlayer: { newest: () => ({ createPlayer }) } }
  globalThis.window = { dispatchEvent: event => errors.push(event) }
  globalThis.document = doc
  globalThis.location = { href: 'http://127.0.0.1/index.html' }
  globalThis.MutationObserver = class { observe() {} }
  globalThis.performance = { now: () => 0 }
  const parent = { ownerDocument: doc, appendChild() {} }
  let retry
  try {
    const { SwfPlayer } = await import('../../src/renderer/swf/player.ts')
    const original = new SwfPlayer(parent)
    const failed = original.load('old.swf')
    const rejected = assert.rejects(failed, /timed out/)
    deadlines.values().next().value.run()
    await rejected
    assert.equal(original.el.isConnected, false)
    assert.equal(errors[0].type, 'qqpet-swf-error')
    assert.deepEqual(errors[0].detail, { url: 'old.swf', message: 'SWF load timed out' })
    await assert.rejects(original.load('new.swf'), /destroyed/)

    retry = new SwfPlayer(parent)
    await retry.load('new.swf', './replacement/', { wmode: 'opaque', parameters: { mode: 'new' } })
    const active = retry.el
    assert.notEqual(active, original.el)
    assert.equal(active.ruffle().options.wmode, 'opaque')
    assert.deepEqual(active.ruffle().options.parameters, { mode: 'new' })
    assert.equal(active.ruffle().options.base, 'http://127.0.0.1/replacement/')
    assert.equal(active.ruffle().options.fontSources[0], 'http://127.0.0.1/pet/qqfont.ttf')

    original.el.ruffle().metadata = { width: 1, height: 1, frameRate: 1, numFrames: 1 }
    completeOld()
    await oldOperation
    await Promise.resolve()
    assert.equal(original.el.volume, 0)
    assert.equal(original.el.ruffle().suspended, true)
    assert.equal(original.el.released, 2, 'release the instance created after its first disconnect')
    assert.equal(retry.el, active)
    assert.equal(retry.totalFrames, 80)
    assert.equal(active.isConnected, true)
  } finally {
    completeOld()
    retry?.destroy()
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})
