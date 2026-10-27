import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const player = read('src/renderer/swf/player.ts')
const bridge = read('src/android/bridge.ts')

test('a host can name a cheaper renderer for the small stages the page rebuilds while the user waits', () => {
  // Building Ruffle's default renderer takes ~450 ms in the Android WebView, once per movie load.
  assert.match(bridge, /swfRenderer: 'canvas'/)
  assert.match(player, /export function smallStageOptions\(\)/)
  assert.match(player, /window\.qqpet\.capabilities\?\.swfRenderer/)
  // No capability keeps Ruffle's own choice, so every other host and desktop are unchanged.
  assert.match(player, /return renderer \? \{ preferredRenderer: renderer \} : \{\}/)
  for (const source of ['src/renderer/swf/pet-swf.ts', 'src/renderer/ui/talk.ts', 'src/renderer/ui/float.ts']) {
    assert.match(read(source), /smallStageOptions\(\)/, source)
  }
  // Games keep the Ruffle default: they load once, into a window of their own.
  assert.doesNotMatch(read('src/renderer/ui/smallgame.ts'), /smallStageOptions/)
  assert.doesNotMatch(read('src/renderer/game.ts'), /smallStageOptions/)
})

test('a movie is only swapped in once it has drawn, so a fresh canvas cannot flash the pet away', () => {
  assert.match(player, /for \(let attempt = 0; attempt < FIRST_PAINT_FRAMES && !hasPixels\(this\.canvas\); attempt\+\+\)/)
  // An unreadable canvas (other hosts, lost context) counts as painted instead of stalling the swap.
  assert.match(player, /function hasPixels\(canvas: HTMLCanvasElement \| null\): boolean \{\s*if \(!canvas\) return true/)
  assert.match(player, /catch \{\s*return true\s*\}/)
})
