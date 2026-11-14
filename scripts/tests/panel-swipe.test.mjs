import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { rubberBand, swipePage } from '../../src/renderer/ui/swipe.ts'

const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')

test('a slow drag turns the page once it passes the travel threshold', () => {
  // 28px minimum, or 16% of the row (a 200px row asks for 32px).
  assert.equal(swipePage(-10, 200, 0), 0)
  assert.equal(swipePage(-27, 200, 0), 0)
  assert.equal(swipePage(-33, 200, 0), 1)
  assert.equal(swipePage(33, 200, 0), -1)
  // A wide row needs a wider swipe, but never more than the ratio allows.
  assert.equal(swipePage(-40, 400, 0), 0)
  assert.equal(swipePage(-65, 400, 0), 1)
})

test('a flick turns the page even when the finger barely moved', () => {
  assert.equal(swipePage(-8, 200, -0.6), 1)
  assert.equal(swipePage(8, 200, 0.6), -1)
  assert.equal(swipePage(-8, 200, -0.2), 0)
  // The release speed decides on its own: a leftward flick is the next page whatever the offset.\n  assert.equal(swipePage(-8, 200, 0.6), -1)
})

test('dragging past the first or last page only moves a third of the way', () => {
  assert.equal(rubberBand(-60, false, false), -60)
  assert.equal(rubberBand(60, true, false), 21)
  assert.equal(rubberBand(-60, false, true), -21)
  assert.equal(rubberBand(-60, true, false), -60)
})

test('the panel row follows the finger and turns through the same path as the triangles', () => {
  assert.match(control, /swipePanel\(goodsBox, row, \{ prev: turn\(-1\), next: turn\(1\), canPrev: page > 1, canNext: page < totalPage \}\)/)
  assert.match(control, /goods\.addEventListener\('pointerdown'/)
  assert.match(control, /goods\.setPointerCapture\(event\.pointerId\)/)
  assert.match(control, /translateX\(\$\{rubberBand\(dx, !turn\.canPrev, !turn\.canNext\)\}px\)/)
  // The page turn happens after the row slides out, so the rebuild never jumps.
  assert.match(control, /translateX\(\$\{dir > 0 \? -width\(\) : width\(\)\}px\)/)
  assert.match(control, /row\.addEventListener\('transitionend', \(\) => \(dir > 0 \? turn\.next\(\) : turn\.prev\(\)\), \{ once: true \}\)/)
  // A drag must not also press the item it started on.
  assert.match(control, /event\.stopPropagation\(\)\s*event\.preventDefault\(\)/)
})

test('the stage strip scrolls with a finger as well', () => {
  assert.match(control, /strip\.addEventListener\('pointermove', \(event\) => \{\s*if \(from\) strip\.scrollLeft = from\.left - \(event\.clientX - from\.x\)/)
})

test('the row only clips while it is dragged, so item tips still show above it', () => {
  assert.match(css, /\.ui-control \.goods \{[^}]*touch-action: pan-y/)
  assert.match(css, /\.ui-control \.goods\.swiping \{\s*overflow: hidden/)
  assert.doesNotMatch(css, /\.ui-control \.goods \{[^}]*overflow: hidden/)
  assert.match(css, /\.ui-control \.tabStrip \{[^}]*touch-action: pan-y/)
})
