import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { guardRuffleSystemAudio, patchRuffleAudio } from '../patch-ruffle-audio.mjs'

// Model the two unmute workaround branches independently from real WebAudio resume.
const player = `class Player {
  unmuteAudioContext(){
    if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
    else this.container.addEventListener('click', () => new Audio().play(), { once: true });
  }
  resumeAudioContext(){ this.instance.audio_context().resume(); }
}; new Player()`

function fixture(flag, modern) {
  const calls = { dummyAudio: 0, resumed: 0, clicks: [] }
  const window = flag === undefined ? {} : { __qqpetRespectSystemAudio: flag }
  const navigator = modern ? { audioSession: { type: 'ambient' } } : {}
  const instance = runInNewContext(guardRuffleSystemAudio(player), {
    window, navigator, Audio: class { play() { calls.dummyAudio++ } },
  })
  instance.container = { addEventListener: (type, listener, options) => calls.clicks.push({ type, listener, options }) }
  instance.instance = { audio_context: () => ({ resume: () => calls.resumed++ }) }
  return { instance, navigator, calls }
}

test('native system-audio policy suppresses both unmute hacks and preserves WebAudio', () => {
  for (const modern of [true, false]) {
    const { instance, navigator, calls } = fixture(true, modern)
    instance.unmuteAudioContext()
    instance.resumeAudioContext()
    if (modern) assert.equal(navigator.audioSession.type, 'ambient')
    assert.equal(calls.clicks.length, 0)
    assert.equal(calls.dummyAudio, 0)
    assert.equal(calls.resumed, 1)
  }
})

test('without the strict native flag Ruffle keeps both browser unmute paths', () => {
  for (const flag of [undefined, false, 'true']) {
    const modern = fixture(flag, true)
    modern.instance.unmuteAudioContext()
    assert.equal(modern.navigator.audioSession.type, 'playback')
    const legacy = fixture(flag, false)
    legacy.instance.unmuteAudioContext()
    assert.equal(legacy.calls.clicks.length, 1)
    assert.equal(legacy.calls.clicks[0].type, 'click')
    assert.equal(legacy.calls.clicks[0].options.once, true)
    legacy.calls.clicks[0].listener()
    assert.equal(legacy.calls.dummyAudio, 1)
  }
})

test('audio patch fails when its method is missing or ambiguous', () => {
  assert.throws(() => guardRuffleSystemAudio(''), /exactly once/)
  assert.throws(() => guardRuffleSystemAudio(player + player), /exactly once/)
})

test('audio recipe rejects a different package version or loader hash', () => {
  assert.throws(() => patchRuffleAudio(Buffer.from(player), '0.6.1'), /pinned 0.6.0/)
  assert.throws(() => patchRuffleAudio(Buffer.from(player), '0.6.0'), /loader changed/)
})
