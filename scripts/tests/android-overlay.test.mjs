import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nextBounds } from '../../src/mobile/bounds.ts'

const service = readFileSync(new URL('../../android/app/src/main/java/net/ankio/qqpet/PetService.kt', import.meta.url), 'utf8')
const setBounds = service.slice(service.indexOf('private fun setBounds('), service.indexOf('private fun http('))
const place = setBounds.slice(setBounds.indexOf('private fun place('))

test('a far window move hides only the page, never the window (#18: the pet blanked on every tap or menu)', () => {
  assert.ok(place.includes('wm.updateViewLayout(root, params)'))
  assert.doesNotMatch(setBounds, /params\.alpha\s*=/)
  assert.match(setBounds, /web\.alpha = 0f[\s\S]*registerFrameCommitCallback/)
  // The window moves only after the transparent frame is committed, and the page shows again once it is there.
  assert.match(service, /reveal\?\.let \{ if \(it\[0\] == at\[0\] && it\[1\] == at\[1\]\)[^\n]*web\.alpha = 1f/)
  assert.match(place, /postDelayed\(\{[^\n]*web\.alpha = 1f/)
})

test('the page offset is applied in the same layout as the window move', () => {
  const offset = place.indexOf('web.translationX = -to[0]')
  assert.ok(offset >= 0 && offset < place.indexOf('wm.updateViewLayout(root, params)'))
})

const box = (left, top, right, bottom) => ({ left, top, right, bottom })

test('the window stays put while the animation draws a little wider or narrower (#18: left-right shaking)', () => {
  let cur = nextBounds({ x: 0, y: 0, w: 0, h: 0 }, box(200.4, 300.6, 346.2, 446.9), 400, 800)
  assert.deepEqual(cur, { x: 176, y: 276, w: 195, h: 195 })
  for (const need of [box(198, 302, 350, 440), box(205, 296, 340, 450), box(185, 290, 360, 460)]) {
    assert.deepEqual(nextBounds(cur, need, 400, 800), cur)
  }
})

test('content leaving the window or leaving it mostly empty moves it with a margin', () => {
  const cur = { x: 176, y: 276, w: 195, h: 195 }
  assert.deepEqual(nextBounds(cur, box(200, 300, 346, 480), 400, 800), { x: 176, y: 276, w: 194, h: 228 })
  assert.deepEqual(nextBounds(cur, box(260, 360, 300, 400), 400, 800), { x: 236, y: 336, w: 88, h: 88 })
})

test('page edges clamp the window; a full-page drag window shrinks back afterwards', () => {
  const full = nextBounds({ x: 0, y: 0, w: 0, h: 0 }, box(0, 0, 400, 800), 400, 800)
  assert.deepEqual(full, { x: 0, y: 0, w: 400, h: 800 })
  const edge = nextBounds({ x: 0, y: 0, w: 0, h: 0 }, box(300, 10, 420, 120), 400, 800)
  assert.deepEqual(edge, { x: 276, y: 0, w: 124, h: 144 })
  assert.deepEqual(nextBounds(edge, box(310, 0, 400, 118), 400, 800), edge)
  assert.deepEqual(nextBounds(full, box(200, 300, 346, 446), 400, 800), { x: 176, y: 276, w: 194, h: 194 })
})

test('nothing to show empties the window', () => {
  assert.deepEqual(nextBounds({ x: 5, y: 5, w: 50, h: 50 }, null, 400, 800), { x: 0, y: 0, w: 0, h: 0 })
  assert.deepEqual(nextBounds({ x: 5, y: 5, w: 50, h: 50 }, box(10, 10, 10, 30), 400, 800), { x: 0, y: 0, w: 0, h: 0 })
})
