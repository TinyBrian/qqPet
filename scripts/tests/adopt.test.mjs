import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = stripTypeScriptTypes(readFileSync(new URL('../../src/renderer/ui/adopt.ts', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')

function fixture() {
  const host = { isConnected: true }, tasks = [], writes = []
  let inFlash = false, started = 0, close
  const scope = {
    window: {}, div: () => host, button: () => ({}), windowView() {},
    SwfPlayer: class { load() { return Promise.resolve() } },
    setInfo: (key, value) => writes.push([key, value]),
    update: (key, value) => writes.push([key, value]),
    setTimeout: callback => tasks.push(callback),
    openBox(_host, options) {
      close = () => {
        assert.equal(inFlash, false, 'the calling Flash instance must not destroy itself')
        host.isConnected = false
        options.onClose()
      }
      return close
    },
  }
  runInNewContext(source + '\nthis.adopt = adopt', scope)
  scope.adopt(() => { assert.equal(inFlash, false); started++ })
  return {
    writes, host,
    choose(value) { inFlash = true; try { scope.window.ChooseAPI.ChooseSex(value) } finally { inFlash = false } },
    finish() { for (const task of tasks.splice(0)) task() },
    close() { close() },
    started: () => started,
  }
}

test('adoption leaves the Flash call before disposing its player and starting the pet', () => {
  const f = fixture()
  f.choose(0)
  assert.equal(f.host.isConnected, true)
  assert.equal(f.started(), 0)
  f.finish()
  assert.equal(f.host.isConnected, false)
  assert.deepEqual(f.writes, [['sex', 'GG'], ['havePet', true]])
  assert.equal(f.started(), 1)
})

test('repeated Flash callbacks commit only the first choice', () => {
  const f = fixture()
  f.choose(1)
  f.choose(0)
  f.finish()
  assert.deepEqual(f.writes, [['sex', 'MM'], ['havePet', true]])
  assert.equal(f.started(), 1)
})

test('closing the adoption window cancels a queued choice', () => {
  const f = fixture()
  f.choose(0)
  f.close()
  f.finish()
  assert.deepEqual(f.writes, [])
  assert.equal(f.started(), 0)
})
