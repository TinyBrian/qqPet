import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { rubberBand, snapPage } from '../../src/renderer/ui/swipe.ts'

const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')

test('a slow drag turns the page after a third of its width, either way', () => {
  assert.equal(snapPage(-60, 282, 0.05, 2, 9), 2)
  assert.equal(snapPage(-90, 282, 0.05, 2, 9), 3)
  assert.equal(snapPage(90, 282, -0.05, 2, 9), 1)
  // One page at a time: the strip only holds the pages either side.
  assert.equal(snapPage(-564, 282, 0.05, 3, 9), 4)
})

test('a flick turns one page even when the finger barely moved', () => {
  assert.equal(snapPage(-8, 282, -0.6, 2, 9), 3)
  assert.equal(snapPage(8, 282, 0.6, 2, 9), 1)
  assert.equal(snapPage(-8, 282, -0.2, 2, 9), 2)
})

test('the first and last page clamp, and a zero-width row does not divide by zero', () => {
  assert.equal(snapPage(600, 282, 0, 1, 9), 1)
  assert.equal(snapPage(-600, 282, 0, 9, 9), 9)
  assert.equal(snapPage(-600, 0, 0, 4, 9), 4)
  assert.equal(snapPage(-600, 282, 0, 3, 1), 1)
})

test('dragging past the first or last page only moves a third of the way', () => {
  assert.equal(rubberBand(-60, false, false), -60)
  assert.equal(rubberBand(60, true, false), 21)
  assert.equal(rubberBand(-60, false, true), -21)
  assert.equal(rubberBand(-60, true, false), -60)
})

test('the previous and next pages are built with the current one and slide with the finger', () => {
  // Three pages in the strip, placed a page apart, so a drag pulls the neighbours in instead of jumping a page.
  assert.match(control, /const pages = \[page - 1, page, page \+ 1\]\.filter\(\(n\) => n >= 1 && n <= totalPage\)/)
  assert.match(control, /el\.style\.left = `\$\{\(i - shown\) \* 100\}%`/)
  assert.match(control, /const pager = swipePages\(goodsBox, track, \{ pages, page, total: totalPage, go: \(n\) => openPanel\(p, n\) \}\)/)
  // The bar is scaled on a small screen, so viewport pixels are divided back into element pixels: the strip keeps up
  // with the finger instead of drifting behind it.
  assert.match(control, /const scaled = \(\): number => \{/)
  // Pointer and page width must share a unit: clientWidth is element pixels, which scale on a phone.\n  assert.match(control, /const width = \(\): number => goods\\.getBoundingClientRect\\(\\)\\.width \\|\\| 1/)
  assert.match(control, /rubberBand\(dx, view\.page === 1, view\.page === view\.total\) \/ scaled\(\)/)
  // A rebuild mid-drag would replace the strip and drop the gesture.
  assert.match(control, /if \(open\?\.type === type && !pageBusy\(\)\)/)
  // Release: nearest page, then a slide and a rebuild on that page.
  assert.match(control, /const target = snapPage\(dx, width\(\), vx, view\.page, view\.total\)/)
  assert.match(control, /track\.style\.transform = `translateX\(\$\{index > shown \? -100 : 100\}%\)`/)
  assert.match(control, /view\.go\(target\)/)
  // The triangles use the same path.
  assert.match(control, /const slide = \(dir: number\): void => settle\(shown \+ dir\)/)
  assert.match(control, /button\('toLeft', \(\) => pager\.slide\(-1\)\)/)
  assert.match(control, /button\('toRight', \(\) => pager\.slide\(1\)\)/)
})

test('a tap still presses the item, and a drag does not', () => {
  assert.match(control, /goods\.setPointerCapture\(event\.pointerId\)/)
  // Capture happens only after the move is clearly a drag; capturing on the press retargets click to the strip.
  const capture = control.indexOf('goods.setPointerCapture')
  const guard = control.indexOf('if (Math.abs(movedX) <= 6')
  assert.ok(guard >= 0 && guard < capture)
  assert.match(control, /event\.stopPropagation\(\)\s*event\.preventDefault\(\)/)
})

test('the stage strip scrolls with a finger as well', () => {
  assert.match(control, /strip\.addEventListener\('pointermove', \(event\) => \{\s*if \(from\) strip\.scrollLeft = from\.left - \(event\.clientX - from\.x\)/)
})

test('pages stack a page apart, hidden until dragged, and only then does the row clip', () => {
  assert.match(css, /\.ui-control \.goods \{[^}]*touch-action: pan-y/)
  assert.match(css, /\.ui-control \.goodsTrack \{\s*position: relative;/)
  assert.match(css, /\.ui-control \.goodPage \{\s*position: absolute;[\s\S]*?visibility: hidden;/)
  assert.match(css, /\.ui-control \.goodPage\.on,\s*\.ui-control \.goods\.swiping \.goodPage \{\s*visibility: visible;/)
  assert.match(css, /\.ui-control \.goods\.swiping \{\s*overflow: hidden/)
  assert.doesNotMatch(css, /\.ui-control \.goods \{[^}]*overflow: hidden/)
  assert.match(css, /\.ui-control \.tabStrip \{[^}]*touch-action: pan-y/)
})
