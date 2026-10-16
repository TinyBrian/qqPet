import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`)
  assert.ok(at >= 0, `missing ${selector}`)
  return css.slice(at, css.indexOf('}', at))
}
const seconds = (value) => Number.parseFloat(value) * (value.endsWith('ms') ? 0.001 : 1)
/** Delay of `property` in a `transition` shorthand list. */
const delay = (block, property) => {
  const list = /transition:\s*([^;]+);/.exec(block)?.[1] ?? ''
  const part = list.split(',').map((s) => s.trim().split(/\s+/)).find(([name]) => name === property)
  assert.ok(part, `no ${property} transition`)
  return part[2] ? seconds(part[2]) : 0
}

test('an action submenu stays hittable for a moment after its button loses hover (#52)', () => {
  const closed = rule('.ui-control .childrenMenu')
  const open = rule('.ui-control .menuItem:hover .childrenMenu')
  // Hidden by visibility, which hit testing honours, not by pointer-events that flip with :hover at once.
  assert.doesNotMatch(closed, /pointer-events/)
  assert.doesNotMatch(open, /pointer-events/)
  assert.match(closed, /visibility:\s*hidden/)
  assert.match(open, /visibility:\s*visible/)
  // Losing hover keeps it hittable for longer than a few cursor polls (33 ms) ...
  assert.ok(delay(closed, 'visibility') >= 0.3)
  // ... and it is not hittable once it has faded out of sight.
  assert.ok(delay(closed, 'visibility') >= delay(closed, 'opacity'))
  // Hover shows it at once, above a neighbour's lingering submenu.
  assert.equal(delay(open, 'visibility'), 0)
  assert.match(open, /z-index:\s*1/)
})
