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

test('the stage strip scrolls with a finger as well, without eating the button clicks', () => {
  assert.match(control, /if \(Math\.abs\(moved\) <= 6\) return\s*dragging = true\s*strip\.setPointerCapture\(event\.pointerId\)/)
  assert.match(control, /strip\.scrollLeft = from\.left - moved/)
})

test('the list is a flat row of options that clips only while dragged, with fades on the edges', () => {
  assert.match(css, /\.ui-control \.goods \{[^}]*touch-action: pan-y/)
  assert.doesNotMatch(css, /\.ui-control \.goodPage\b/)
})

test('only the row window clips and fades, so the status bar and the tips stay whole', () => {
  // The clip belongs to the row window inside `.goods`: the bar below it must not be cut or faded.
  assert.match(css, /\.ui-control \.goodsRow \{[^}]*overflow: hidden/)
  assert.doesNotMatch(css, /\.ui-control \.goods \{[^}]*overflow: hidden/)
  assert.match(css, /\.ui-control \.goodsRow\.moreLeft::before,\s*\.ui-control \.goodsRow\.moreRight::after \{\s*opacity: 1;/)
  assert.match(control, /const listBox = div\('goodsRow', track\)/)
  assert.match(control, /const goodsBox = div\(\s*'goods f1 fC h100',\s*listBox,/)
})

test('the item tip lives at panel level so the clipping cannot cut it', () => {
  assert.match(control, /const tip = div\('goodTip'\)/)
  assert.match(control, /tip\.replaceChildren\(div\('goodName', good\.name\)/)
  // Placed beside the option, flipped to the other side when it would leave the panel.
  assert.match(control, /if \(left \+ width > panel\.width - 4\) left = box\.left - panel\.left - width - 6/)
  assert.match(control, /tip\.style\.top = `\$\{Math\.max\(2, Math\.min\(box\.top - panel\.top, panel\.height - tip\.offsetHeight - 2\)\)\}px`/)
  assert.match(css, /\.ui-control \.goodTip \{\s*position: absolute;/)
  assert.doesNotMatch(css, /\.ui-control \.goodInfo \{/)
})

test('the row keeps one option per slot and never shrinks them', () => {
  assert.match(css, /\.ui-control \.goodsTrack \{\s*display: flex;/)
  assert.match(css, /\.ui-control \.goodsTrack > \* \{\s*flex: 0 0 auto;/)
})

test('using an option rebuilds the panel where it was scrolled to, not back at the page start', () => {
  // The item offset lives in the open panel state and is handed back on a goods-change rebuild.
  assert.match(control, /let open: \(Panel & \{ page: number; offset: number; ids: string \}\) \| null = null/)
  assert.match(control, /open = \{ \.\.\.p, page, offset, ids: panelIds\(p, page, totalPage\) \}/)
  assert.match(control, /openPanel\(open, page, page === open\.page \? open\.offset : 0\)/)
})

test('eating changes only a count: the panel is not rebuilt, so the menu cannot jump', () => {
  // The rendered option ids are remembered, and a goods change with the same ids returns without rebuilding.
  assert.match(control, /function panelIds\(p: Panel, page: number, total: number\): string \{/)
  assert.match(control, /open = \{ \.\.\.p, page, offset, ids: panelIds\(p, page, totalPage\) \}/)
  assert.match(control, /if \(panelIds\(open, Math\.min\(open\.page, total\), total\) === open\.ids\) return/)
  // Tips are built on hover from the good as it is then, so a count change needs no rebuild to show.
  assert.match(control, /const lines = p\.lines\(good\)\.map/)
  assert.doesNotMatch(control, /tips\.set\(el, \{ name: g\.name, lines \}\)/)
})
