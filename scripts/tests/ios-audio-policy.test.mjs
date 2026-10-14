import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const policy = readFileSync(new URL('../../ios/audio-policy.js', import.meta.url), 'utf8')
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

function fixture(defer) {
  const calls = [], timers = []
  let finishSuspend
  class NativeAudioContext {
    static marker = 'native'
    constructor(options) { this.options = options; calls.push('create') }
    suspend() { calls.push('suspend'); return new Promise(resolve => { finishSuspend = resolve }) }
    resume() { calls.push('resume'); return Promise.resolve('resumed') }
  }
  const window = { AudioContext: NativeAudioContext, webkitAudioContext: NativeAudioContext, __qqpetDeferAudioStart: defer }
  runInNewContext(policy, { window, setTimeout: (run, milliseconds) => timers.push({ run, milliseconds }) })
  return { window, calls, timers, NativeAudioContext, finishSuspend: () => finishSuspend() }
}

test('iOS 15 pauses synchronously and waits for category update before any initial resume', async () => {
  const { window, calls, timers, finishSuspend } = fixture(true)
  const context = new window.AudioContext({ sampleRate: 44100 })
  const first = context.resume(), second = context.resume()
  assert.deepEqual(calls, ['create', 'suspend'])
  await settle()
  assert.equal(timers.length, 0, 'the native suspension must complete first')
  finishSuspend()
  await settle()
  assert.deepEqual(calls, ['create', 'suspend'])
  assert.equal(timers.length, 1)
  assert.equal(timers[0].milliseconds, 200)
  timers[0].run()
  assert.equal(await first, 'resumed')
  assert.equal(await second, 'resumed')
  assert.deepEqual(calls, ['create', 'suspend', 'resume', 'resume'])
})

test('a pause during startup cancels the queued resume without restarting audio', async () => {
  const { window, calls, timers, finishSuspend } = fixture(true)
  const context = new window.AudioContext()
  const resume = context.resume()
  finishSuspend()
  await settle()
  context.suspend()
  timers[0].run()
  await resume
  assert.deepEqual(calls, ['create', 'suspend', 'suspend'])
  assert.equal(await context.resume(), 'resumed')
})

test('the constructor preserves native options, static properties, aliases and subclasses', () => {
  const { window, NativeAudioContext } = fixture(true)
  class Extended extends window.AudioContext {}
  const context = new Extended({ sampleRate: 48000 })
  assert.equal(context instanceof Extended, true)
  assert.equal(context instanceof NativeAudioContext, true)
  assert.equal(context.options.sampleRate, 48000)
  assert.equal(window.AudioContext.marker, 'native')
  assert.equal(window.AudioContext, window.webkitAudioContext)
  assert.throws(() => window.AudioContext(), TypeError)
})

test('other iOS releases keep their AudioContext constructor and still disable the unmute hack', () => {
  for (const defer of [false, undefined]) {
    const { window, calls, NativeAudioContext } = fixture(defer)
    assert.equal(window.__qqpetRespectSystemAudio, true)
    assert.equal(window.AudioContext, NativeAudioContext)
    new window.AudioContext()
    assert.deepEqual(calls, ['create'])
  }
  const window = { __qqpetDeferAudioStart: true }
  runInNewContext(policy, { window })
  assert.equal(window.__qqpetRespectSystemAudio, true)
})
