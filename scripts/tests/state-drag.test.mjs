import assert from 'node:assert/strict'
import test from 'node:test'
import { mouseDrag } from '../../src/renderer/ui/drag.ts'

function fake() {
  const on = (map) => (type, fn) => { (map[type] ??= []).push(fn) }
  const el = { listeners: {}, style: {} }
  el.addEventListener = on(el.listeners)
  const doc = { listeners: {} }
  doc.addEventListener = on(doc.listeners)
  doc.removeEventListener = (type, fn) => { doc.listeners[type] = (doc.listeners[type] ?? []).filter((f) => f !== fn) }
  const fire = (map, type, e) => [...(map[type] ?? [])].forEach((fn) => fn(e))
  const target = (inField = false) => ({ closest: () => (inField ? {} : null) })
  return {
    el, doc,
    down: (x, y, opts = {}) => fire(el.listeners, 'pointerdown', { clientX: x, clientY: y, button: 0, target: target(), ...opts }),
    move: (x, y) => fire(doc.listeners, 'pointermove', { clientX: x, clientY: y }),
    up: () => fire(doc.listeners, 'pointerup', {}),
    target,
  }
}

test('the pet status panel follows a mouse drag and stays where it was dropped (#53)', () => {
  const f = fake()
  mouseDrag(f.el, false, f.doc)
  f.down(100, 100)
  f.move(130, 90)
  assert.equal(f.el.style.translate, '30px -10px')
  f.up()
  f.move(500, 500)
  assert.equal(f.el.style.translate, '30px -10px')
  // A second drag continues from there.
  f.down(10, 10)
  f.move(20, 30)
  assert.equal(f.el.style.translate, '40px 10px')
  f.up()
})

test('text fields, other buttons and touch screens do not start a drag', () => {
  const f = fake()
  mouseDrag(f.el, false, f.doc)
  f.down(0, 0, { target: f.target(true) })
  f.down(0, 0, { button: 2 })
  f.move(50, 50)
  assert.equal(f.el.style.translate, undefined)
  const t = fake()
  mouseDrag(t.el, true, t.doc)
  assert.deepEqual(t.el.listeners, {})
})
