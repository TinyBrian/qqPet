import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MAX_FLING, rubberBand, snapStep } from '../../src/renderer/ui/swipe.ts'

const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')
const pitch = 282 / 4

test('a release snaps to the nearest option, one option per step', () => {
  // Dragging left reveals the options after it; a little over half an option is enough.
  assert.equal(snapStep(-35, pitch, 0.05), 0)
  assert.equal(snapStep(-36, pitch, 0.05), 1)
  assert.equal(snapStep(-141, pitch, 0.05), 2)
  assert.equal(snapStep(36, pitch, -0.05), -1)
  assert.equal(snapStep(141, pitch, -0.05), -2)
})

test('a flick carries up to three options, and nothing moves without one', () => {
  assert.equal(snapStep(-10, pitch, 0.1), 0)
  assert.equal(snapStep(-10, pitch, -0.6), 2)
  assert.equal(snapStep(-10, pitch, -0.9), 3)
  assert.equal(snapStep(-10, pitch, 0.9), -3)
  // Even a huge throw stops at the cap: the row only holds the neighbouring pages.
  assert.equal(snapStep(-700, pitch, 0.05), MAX_FLING)
  assert.equal(snapStep(700, pitch, -0.05), -MAX_FLING)
})

test('dragging past the first or last option only moves a third of the way', () => {
  assert.equal(rubberBand(-60, false, false), -60)
  assert.equal(rubberBand(60, true, false), 21)
  assert.equal(rubberBand(-60, false, true), -21)
  assert.equal(rubberBand(-60, true, false), -60)
})

test('the panel is one continuous row: the previous and next pages are in it too', () => {
  assert.match(control, /const first = page > 1 \? page - 1 : page/)
  assert.match(control, /for \(let n = first; n <= Math\.min\(page \+ 1, totalPage\); n\+\+\) row\.push\(\.\.\.options\(n\)\)/)
  assert.match(control, /const start = \(page - first\) \* PAGE \+ offset/)
  assert.match(control, /track\.style\.marginLeft = `\$\{\(-start \/ PAGE\) \* 100\}%`/)
})

test('the row follows the finger and snaps by option, in the same pixels the pointer reports', () => {
  assert.match(control, /const pitch = \(\): number => goods\.getBoundingClientRect\(\)\.width \/ PAGE \|\| 1/)
  assert.match(control, /translateX\(\$\{rubberBand\(dx, atStart, atEnd\) \/ scaled\(\)\}px\)/)
  assert.match(control, /const step = snapStep\(dx, pitch\(\), vx\)/)
  assert.match(control, /const target = Math\.min\(Math\.max\(shown \+ step, 0\), Math\.max\(view\.count - 1, 0\)\)/)
  // The triangles still turn whole pages, through the same settle path.
  assert.match(control, /const page = \(dir: number\): void => \{\s*const index = Math\.min\(Math\.max\(shown \+ dir \* PAGE, 0\), Math\.max\(view\.count - 1, 0\)\)/)
  assert.match(control, /button\('toLeft', \(\) => pager\.page\(-1\)\)/)
  assert.match(control, /button\('toRight', \(\) => pager\.page\(1\)\)/)
})

test('the edge fades follow how much is left on either side', () => {
  assert.match(control, /goods\.classList\.toggle\('moreLeft', index > 0\)/)
  assert.match(control, /goods\.classList\.toggle\('moreRight', index \+ PAGE < view\.count\)/)
})

test('a tap still presses the option, and a drag does not', () => {
  assert.match(control, /goods\.setPointerCapture\(event\.pointerId\)/)
  // Capture happens only after the move is clearly a drag; capturing on the press retargets click to the list.
  const capture = control.indexOf('goods.setPointerCapture')
  const guard = control.indexOf('if (Math.abs(movedX) <= 6')
  assert.ok(guard >= 0 && guard < capture)
  assert.match(control, /event\.stopPropagation\(\)\s*event\.preventDefault\(\)/)
})

test('the stage strip scrolls with a finger as well', () => {
  assert.match(control, /strip\.addEventListener\('pointermove', \(event\) => \{\s*if \(from\) strip\.scrollLeft = from\.left - \(event\.clientX - from\.x\)/)
})

test('the list is a flat row of options that clips only while dragged, with fades on the edges', () => {
  assert.match(css, /\.ui-control \.goods \{[^}]*touch-action: pan-y/)
  assert.match(css, /\.ui-control \.goodsTrack \{\s*display: flex;/)
  assert.match(css, /\.ui-control \.goodsTrack > \* \{\s*flex: 0 0 auto;/)
  // The list is wider than the window at all times, so it is always clipped.
  assert.match(css, /\.ui-control \.goods \{[^}]*overflow: hidden/)
  assert.doesNotMatch(css, /\.ui-control \.goods\.swiping \{\s*overflow: hidden/)
  // A tip that would run past the right edge opens to the left instead of being cut.
  assert.match(control, /el\.classList\.toggle\('flip', el\.getBoundingClientRect\(\)\.right \+ 110 > box\.right\)/)
  assert.match(css, /\.ui-control \.goodItem\.flip \.goodInfo \{[^}]*left: auto;/)
  assert.doesNotMatch(css, /\.ui-control \.goodPage\b/)
  assert.match(css, /\.ui-control \.goods\.moreLeft::before,\s*\.ui-control \.goods\.moreRight::after \{\s*opacity: 1;/)
})
