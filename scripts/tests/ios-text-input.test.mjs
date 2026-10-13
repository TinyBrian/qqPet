import test from 'node:test'
import assert from 'node:assert/strict'
import { installTextInput } from '../../src/ios/text-input.ts'

test('system editing commits CJK once and ignores canceled, detached, or disposed fields', async () => {
  const names = ['document', 'HTMLInputElement', 'HTMLTextAreaElement', 'InputEvent']
  const saved = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  let focus
  const events = []
  class Input extends EventTarget {
    type = 'text'; id = ''; value = ''; placeholder = ''; maxLength = 200; isConnected = true
    focus() { focus({ composedPath: () => [this] }) }
    blur() {}
  }
  globalThis.HTMLInputElement = Input
  globalThis.HTMLTextAreaElement = class extends Input {}
  globalThis.InputEvent = class extends Event { constructor(type, options) { super(type, options); this.data = options.data; this.inputType = options.inputType } }
  globalThis.document = { addEventListener(type, listener) { focus = listener }, removeEventListener() { focus = null } }
  const requests = []
  let resolve
  const stop = installTextInput({ request(op, args, options) { requests.push({ op, args, options }); return new Promise(done => { resolve = done }) } }, async () => {}, error => { throw error })
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  try {
    const input = new Input()
    input.addEventListener('input', event => events.push({ data: event.data, type: event.inputType, value: input.value }))
    input.focus(); input.focus()
    await settle()
    assert.equal(requests.length, 1)
    assert.equal(requests[0].op, 'editText')
    assert.equal(requests[0].options.timeout, 0, 'native UI owns its lifetime')
    resolve('中文输入🙂'); await settle()
    assert.equal(input.value, '中文输入🙂')
    assert.deepEqual(events, [{ data: '中文输入🙂', type: 'insertText', value: '中文输入🙂' }])
    input.focus(); await settle(); resolve(null); await settle()
    assert.equal(input.value, '中文输入🙂')
    input.focus(); await settle(); input.isConnected = false; resolve('late'); await settle()
    assert.equal(input.value, '中文输入🙂')
    assert.equal(events.length, 1)
    input.isConnected = true; input.focus(); await settle()
    const pending = requests.at(-1)
    stop()
    assert.equal(pending.options.signal.aborted, true, 'page teardown cancels the native editor')
    resolve('after disposal'); await settle()
    assert.equal(input.value, '中文输入🙂')
    assert.equal(events.length, 1)
  } finally {
    stop()
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value }
  }
})
