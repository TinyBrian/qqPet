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

test('switching to another action button hides the previous submenu at once (#108)', () => {
  const other = rule('.ui-control:has(.menuItem:hover) .menuItem:not(:hover) .childrenMenu')
  assert.match(other, /visibility:\s*hidden/)
  assert.match(other, /opacity:\s*0/)
  assert.match(other, /transition:\s*none/)
})

test('menu intro and hover scale icons without animating layout dimensions', () => {
  const item = rule('.ui-control .menuItem')
  const icon = rule('.ui-control .menuItemIconBox')
  const hover = rule('.ui-control .menuItem:hover .menuItemIconBox')
  assert.doesNotMatch(item, /transition:\s*all/)
  assert.match(icon, /transition:\s*transform\s+0\.2s/)
  assert.match(hover, /transform:\s*rotate\(45deg\)\s+scale\(1\.333333\)/)
  for (const block of [hover, icon]) assert.doesNotMatch(block, /(?:height|width):\s*40px/)
})

test('the opening wave is a compositor animation, not a timer chain that a loading SWF can stall', () => {
  const wave = rule('.ui-control .showControl .menuItemIconBox')
  const glow = rule('.ui-control .showControl .menuItemIconBox:before')
  assert.match(wave, /animation:\s*menuIntroScale/)
  assert.match(wave, /var\(--menu-delay/)
  assert.match(glow, /animation:\s*menuIntroGlow/)
  assert.match(glow, /var\(--menu-delay/)
  // Only transform and opacity animate, so the wave never forces layout or a repaint of its own.
  for (const name of ['menuIntroScale', 'menuIntroGlow']) {
    const frames = css.slice(css.indexOf(`@keyframes ${name}`))
    const block = frames.slice(0, frames.indexOf('\n}'))
    assert.match(block, /transform:\s*scale\(|opacity:\s*[01]/)
    assert.doesNotMatch(block, /(?:height|width|left|top|background)/)
  }
  assert.doesNotMatch(css, /\.ui-control \.hoverMenuItemIcon/)
})

test('the opening glow sits under the artwork, so a hovered item keeps its icon', () => {
  // bk/8 is a filled disc: painted over the icon (:after), it hides the icon of the item whose submenu just opened.
  assert.doesNotMatch(rule('.ui-control .menuItemIconBox:after'), /8\.svg/)
  assert.doesNotMatch(css, /\.ui-control \.showControl \.menuItemIconBox:after/)
  const before = rule('.ui-control .menuItemIconBox:before')
  assert.match(before, /background[^;]*bk\/8\.svg/)
  assert.match(before, /opacity:\s*0/)
  // The icon artwork is a child of the box, so :before paints below it.
  assert.match(readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8'), /div\('menuItemIconBox', img\('menuItemIcon'/)
})
