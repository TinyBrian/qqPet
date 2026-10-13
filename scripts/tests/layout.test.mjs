import assert from 'node:assert/strict'
import test from 'node:test'
import { petSizeFor, resizePetPosition, toolbarScaleFor } from '../../src/shared/layout.ts'

const fit = width => (width - 20) / 314

test('native tablets retain asset dimensions across viewports, rotations and pointer types', () => {
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1366, height: 1024 }, { width: 320, height: 1024 }]) {
    for (const touch of [true, false]) {
      assert.equal(petSizeFor(1, viewport, touch, 'tablet'), 146)
      assert.equal(petSizeFor(10, viewport, touch, 'tablet'), 164)
      assert.equal(petSizeFor(20, viewport, touch, 'tablet'), 164)
    }
  }
  assert.equal(toolbarScaleFor(146, fit(768), true, 'tablet'), 1)
  assert.equal(toolbarScaleFor(164, fit(1366), false, 'tablet'), 1)
  assert.equal(toolbarScaleFor(146, fit(320), true, 'tablet'), 300 / 314)
})

test('a large touch viewport alone cannot select tablet layout', () => {
  const viewport = { width: 768, height: 1024 }
  for (const kind of [undefined, 'phone', 'other']) {
    assert.ok(Math.abs(petSizeFor(1, viewport, true, kind) - 311.46666666666664) < 1e-9)
    assert.ok(toolbarScaleFor(311.46666666666664, fit(768), true, kind) > 2)
  }
})

test('phone sizing remains invariant under rotation and its toolbar still fits narrow screens', () => {
  const portrait = petSizeFor(1, { width: 360, height: 780 }, true, 'phone')
  const landscape = petSizeFor(1, { width: 780, height: 360 }, true, 'phone')
  assert.equal(portrait, 146)
  assert.equal(landscape, portrait)
  assert.equal(toolbarScaleFor(portrait, fit(360), true, 'phone'), 146 / 150)
  const grown = petSizeFor(10, { width: 320, height: 640 }, true, 'phone')
  assert.equal(toolbarScaleFor(grown, fit(320), true, 'phone'), 300 / 314)
})

test('desktop and existing mobile hosts retain their established display scaling', () => {
  assert.equal(petSizeFor(1, { width: 1920, height: 1080 }, false), 146)
  assert.equal(petSizeFor(10, { width: 3840, height: 2160 }, false), 328)
  assert.equal(petSizeFor(1, { width: 1280, height: 984 }, false), 146 * 1280 / 1920)
  assert.equal(toolbarScaleFor(328, fit(3840), false), 1)
  assert.equal(petSizeFor(1, { width: 360, height: 780 }, true), 146)
  assert.equal(toolbarScaleFor(146, fit(360), true), 146 / 150)
})

test('rotation preserves left/right peeking and the relative height along either edge', () => {
  const portrait = { width: 834, height: 1194, size: 146 }
  const landscape = { width: 1194, height: 834, size: 146 }
  for (const edge of ['hideleft', 'hideright']) {
    const initial = { x: edge === 'hideleft' ? 0 : 688, y: 524 }
    const turned = resizePetPosition(initial, portrait, landscape, edge)
    assert.deepEqual(turned, { x: edge === 'hideleft' ? 0 : 1048, y: 344 })
    assert.deepEqual(resizePetPosition(turned, landscape, portrait, edge), initial)
  }
})

test('mobile viewport changes preserve free movement ratios and account for pet resizing', () => {
  assert.deepEqual(resizePetPosition(
    { x: 344, y: 786 },
    { width: 834, height: 1194, size: 146 },
    { width: 1194, height: 834, size: 146 },
  ), { x: 524, y: 516 })
  assert.deepEqual(resizePetPosition(
    { x: 100, y: 250 },
    { width: 360, height: 660, size: 160 },
    { width: 660, height: 360, size: 180 },
  ), { x: 240, y: 90 })
})

test('a held peeking pose repairs an old off-edge position and collapsed ranges stay finite', () => {
  assert.deepEqual(resizePetPosition(
    { x: 400, y: 1048 },
    { width: 834, height: 1194, size: 146 },
    { width: 1194, height: 834, size: 146 },
    'hideright',
  ), { x: 1048, y: 688 })
  assert.deepEqual(resizePetPosition(
    { x: 0, y: 0 },
    { width: 100, height: 100, size: 100 },
    { width: 200, height: 100, size: 120 },
  ), { x: 40, y: 0 })
})
